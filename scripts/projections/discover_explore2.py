#!/usr/bin/env python3
"""Discover Explore2 / DRIAS-Eau datasets and resources on data.gouv.fr.

Runs inside GitHub Actions (full network access). Produces:
  - data/explore2_catalog.json : datasets + resources (title, format, size, url)
    plus, for small CSV resources, the first bytes (header line) so the
    extraction step can be written against real formats.
  - stdout: a human-readable summary.

Stdlib only (no pip install needed for the discovery phase).
"""

from __future__ import annotations

import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://www.data.gouv.fr/api/1"
UA = {"User-Agent": "hydrovigie-discovery/1.0 (github actions; water-risk-saas)"}

QUERIES = [
    "explore2 indicateurs",
    "explore2 hydrologie",
    "explore2 projections",
    "explore2 debit",
    "explore2",
    "drias eau indicateurs",
]

RELEVANT = re.compile(r"explore\s*2|drias", re.I)
INDICATOR_HINT = re.compile(r"indicateur|qmna|vcn|debit|étiage|etiage|recharge|projection", re.I)


def get_json(url: str, timeout: int = 60):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def head_bytes(url: str, n: int = 4096, timeout: int = 60) -> str | None:
    try:
        req = urllib.request.Request(url, headers={**UA, "Range": f"bytes=0-{n - 1}"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = r.read(n)
        for enc in ("utf-8", "latin-1"):
            try:
                return data.decode(enc, errors="replace")
            except Exception:
                continue
    except Exception as e:  # noqa: BLE001
        return f"<probe failed: {e}>"
    return None


def main() -> None:
    seen: dict[str, dict] = {}
    for q in QUERIES:
        url = f"{API}/datasets/?q={urllib.parse.quote(q)}&page_size=30"
        try:
            page = get_json(url)
        except Exception as e:  # noqa: BLE001
            print(f"!! search failed for {q!r}: {e}", file=sys.stderr)
            continue
        for ds in page.get("data", []):
            title = ds.get("title") or ""
            if not RELEVANT.search(title):
                continue
            seen.setdefault(ds["id"], {"id": ds["id"], "title": title, "page": ds.get("page")})

    print(f"== {len(seen)} candidate datasets")
    catalog = []
    for ds in seen.values():
        try:
            full = get_json(f"{API}/datasets/{ds['id']}/")
        except Exception as e:  # noqa: BLE001
            print(f"!! dataset fetch failed {ds['title']!r}: {e}", file=sys.stderr)
            continue
        resources = []
        for r in full.get("resources", []):
            resources.append({
                "title": r.get("title"),
                "format": (r.get("format") or "").lower(),
                "filesize": r.get("filesize"),
                "url": r.get("latest") or r.get("url"),
                "mime": (r.get("mime") or ""),
            })
        catalog.append({**ds, "resources": resources})
        print(f"\n### {ds['title']}  ({len(resources)} resources)  {ds.get('page')}")
        for r in resources[:40]:
            size = r["filesize"]
            size_h = f"{size / 1e6:.1f} MB" if isinstance(size, (int, float)) and size else "?"
            print(f"  - [{r['format'] or '?':>7}] {size_h:>9}  {r['title']}")

    # Probe headers of the most promising small CSVs (indicator-like, < 200 MB)
    probes = []
    for ds in catalog:
        for r in ds["resources"]:
            if r["format"] not in ("csv", "txt", "zip", "parquet"):
                continue
            title = f"{ds['title']} / {r['title']}"
            if not INDICATOR_HINT.search(title):
                continue
            size = r["filesize"] or 0
            if r["format"] in ("csv", "txt") and size < 200e6 and r["url"]:
                probes.append((title, r["url"]))
    print(f"\n== probing {min(len(probes), 12)} CSV headers")
    probed = []
    for title, url in probes[:12]:
        head = head_bytes(url)
        first_lines = "\n".join((head or "").splitlines()[:3])
        probed.append({"title": title, "url": url, "head": first_lines})
        print(f"\n--- {title}\n{first_lines}")

    out = Path("data/explore2_catalog.json")
    out.parent.mkdir(exist_ok=True)
    out.write_text(
        json.dumps({"datasets": catalog, "probes": probed}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    print(f"\n== catalog written to {out} ({len(catalog)} datasets, {len(probed)} probes)")


if __name__ == "__main__":
    main()

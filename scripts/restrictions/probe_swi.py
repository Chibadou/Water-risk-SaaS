#!/usr/bin/env python3
"""Probe the Météo-France SWI (soil wetness index) as a precursor for the
anticipation index. Runs on a GitHub runner (full network).

Questions this must answer before any code is written:
  1. Does the CatNat monthly SWI dataset exist and what are its columns?
  2. Does the file carry the SAFRAN cell coordinates itself (PLAN.md says
     X/Y Lambert-93), or would a separate grid be needed to place a site?
  3. How big is the history, and how many cells — i.e. can a per-cell monthly
     climatology be precomputed offline and embedded, the way the projections
     are, or is this another recurring-freshness problem like MétéEAU?

Output: data/restrictions/swi-probe.json
"""

from __future__ import annotations

import csv
import io
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "restrictions"
OUT.mkdir(parents=True, exist_ok=True)
UA = {"User-Agent": "hydrovigie-swi-probe/1.0 (github actions; water-risk-saas)"}

report: dict = {
    "generated": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    "datasets": [],
    "schema": {},
    "errors": [],
}


def is_html(b: bytes) -> bool:
    return b.lstrip()[:1] == b"<"


try:
    found = []
    for q in ["indice humidite des sols catnat", "SWI humidite sols mensuel", "humidite des sols SAFRAN"]:
        cat = requests.get(
            "https://www.data.gouv.fr/api/1/datasets/?q=" + requests.utils.quote(q) + "&page_size=10",
            headers=UA, timeout=120,
        ).json()
        for d in cat.get("data", []):
            title = d.get("title") or ""
            if "humidit" not in title.lower() and "swi" not in title.lower():
                continue
            entry = {
                "title": title,
                "slug": d.get("slug"),
                "resources": [
                    {"title": r.get("title"), "format": r.get("format"),
                     "filesize": r.get("filesize"), "url": r.get("url")}
                    for r in d.get("resources", [])
                ],
            }
            if entry["slug"] not in [f.get("slug") for f in found]:
                found.append(entry)
    report["datasets"] = found

    # The data files are gzipped CSVs named swi.<from>-<to>.csv; the plain-CSV
    # resource is a documentation stub, which an earlier pass mistook for data.
    # Take the most recent decade file instead.
    target = None
    for d in found:
        for r in d["resources"]:
            title = (r.get("title") or "")
            if not title.startswith("swi."):
                continue
            if target is None or title > (target.get("title") or ""):
                target = {**r, "dataset": d["title"]}
    if target:
        resp = requests.get(target["url"], headers=UA, timeout=300, stream=True, allow_redirects=True)
        buf = io.BytesIO()
        for chunk in resp.iter_content(1 << 16):
            buf.write(chunk)
            if buf.tell() > 120_000_000:
                break
        data = buf.getvalue()
        resp.close()
        # Resources are served gzipped (format csv.gz).
        if data[:2] == b"\x1f\x8b":
            import gzip
            data = gzip.decompress(data)
        sch: dict = {"dataset": target["dataset"], "title": target["title"],
                     "bytes": len(data), "url": target["url"]}
        if is_html(data):
            sch["verdict"] = "REJECTED: portal HTML, not the file"
        else:
            text = data.decode("utf-8", "replace")
            # Leading lines are '#'-prefixed documentation, not data.
            lines = text.splitlines()
            sch["header_comments"] = [l for l in lines[:15] if l.startswith("#")]
            body = "\n".join(l for l in lines if not l.startswith("#"))
            delim = max([";", ",", "\t"], key=lambda d: body[:8192].count(d))
            rows = list(csv.DictReader(io.StringIO(body), delimiter=delim))
            sch["delimiter"] = delim
            sch["columns"] = list(rows[0].keys()) if rows else []
            sch["rows"] = len(rows)
            sch["sample"] = rows[:2]
            cols = [c.lower() for c in (rows[0].keys() if rows else [])]
            sch["has_coords"] = any("x" == c or "lambert" in c or "lat" in c for c in cols)
            # How many distinct cells and months — sizes the embedded climatology.
            cell_col = next((c for c in (rows[0].keys() if rows else []) if "maille" in c.lower() or "num" in c.lower()), None)
            date_col = next((c for c in (rows[0].keys() if rows else []) if "date" in c.lower() or "mois" in c.lower()), None)
            if cell_col:
                sch["cell_column"] = cell_col
                sch["distinct_cells"] = len({r.get(cell_col) for r in rows})
            if date_col:
                sch["date_column"] = date_col
                dates = Counter(str(r.get(date_col))[:4] for r in rows)
                sch["years"] = dict(sorted(dates.items()))
            sch["verdict"] = "USABLE" if sch.get("distinct_cells") else "schema unclear"
        report["schema"] = sch
except Exception as e:  # noqa: BLE001
    report["errors"].append(repr(e)[:300])

(OUT / "swi-probe.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=1, default=str) + "\n", encoding="utf-8"
)
print("datasets:", [d["title"][:70] for d in report["datasets"]])
s = report.get("schema", {})
print("verdict :", s.get("verdict"), "| bytes:", s.get("bytes"), "| rows:", s.get("rows"))
print("columns :", s.get("columns"))
print("cells   :", s.get("distinct_cells"), "| years:", list((s.get("years") or {}).keys())[:5], "...")
print("errors  :", report["errors"])

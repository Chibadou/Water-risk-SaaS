#!/usr/bin/env python3
"""Build the embedded restriction reference data for HydroVigie, on a GitHub
runner (full network, unlike the dev sandbox).

Two outputs, both small enough to ship in the repo so the product keeps working
with zero runtime egress — consistent with the local-first decision:

  data/restrictions/guide.json      — the national "Restriction Guide Sécheresse"
                                       (20 usages x 4 levels x 4 audiences). The
                                       official reference matrix, used as the
                                       fallback when a zone has no published
                                       restrictions of its own, and as the basis
                                       of the "who is restricted before whom"
                                       panel.
  data/restrictions/zones/<dep>.json — per department: the restricted usages
                                       actually published for each
                                       (zone type, gravity level), deduplicated.
  data/restrictions/meta.json        — provenance, counts, sizes.

Deliberately NOT reimplemented here: the severity classifier. Scoring the
measures in Python would duplicate lib/restrictions.ts and let the two drift
apart silently. This script only *reduces* the 23 MB source to the distinct
(usage, measure, audience) tuples; the single tested TypeScript classifier turns
them into coefficients at read time.

Run in Actions with: pip install requests
"""

from __future__ import annotations

import csv
import io
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "restrictions"
ZONES_OUT = OUT / "zones"
OUT.mkdir(parents=True, exist_ok=True)
ZONES_OUT.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "hydrovigie-restrictions/1.0 (github actions; water-risk-saas)"}
DATASET = "https://www.data.gouv.fr/api/1/datasets/donnee-secheresse-vigieau/"

LEVELS = ("vigilance", "alerte", "alerte_renforcee", "crise")
AUDIENCES = (
    "concerne_particulier",
    "concerne_entreprise",
    "concerne_collectivite",
    "concerne_exploitation",
)

meta: dict = {
    "generated": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    "source": (
        "VigiEau / RegleAU — dataset « Donnée Sécheresse - VigiEau » (data.gouv.fr, "
        "Licence Ouverte 2.0). Ressources « Restrictions » et « Restriction Guide Sécheresse »."
    ),
    "errors": [],
}


def is_html(data: bytes) -> bool:
    """data.gouv /datasets/r/<id> URLs often serve a portal page, not the file."""
    return data.lstrip()[:1] == b"<"


def fetch(url: str) -> bytes:
    r = requests.get(url, headers=UA, timeout=300)
    r.raise_for_status()
    return r.content


def read_csv(data: bytes) -> list[dict]:
    if is_html(data):
        raise ValueError("got HTML instead of the CSV file")
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            text = data.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    sample = text[:8192]
    delim = max([",", ";", "\t"], key=lambda d: sample.count(d))
    return list(csv.DictReader(io.StringIO(text), delimiter=delim))


def truthy(v: str | None) -> bool:
    return (v or "").strip().lower() in {"true", "1", "oui", "yes"}


# --- resource discovery ------------------------------------------------------
resources: dict[str, str] = {}
ds = requests.get(DATASET, headers=UA, timeout=120).json()
for res in ds.get("resources", []):
    title = (res.get("title") or "").strip()
    if title and res.get("url"):
        resources.setdefault(title, res["url"])

# --- 1. National reference guide --------------------------------------------
try:
    rows = read_csv(fetch(resources["Restriction Guide Sécheresse"]))
    guide = []
    for r in rows:
        usage = (r.get("usage") or "").strip()
        if not usage:
            continue
        guide.append({
            "usage": usage,
            "thematique": (r.get("thematique") or "").strip() or None,
            "mesures": {lvl: (r.get(lvl) or "").strip() or None for lvl in LEVELS},
            "concerne": {a: truthy(r.get(a)) for a in AUDIENCES},
        })
    (OUT / "guide.json").write_text(
        json.dumps(guide, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    meta["guide"] = {"usages": len(guide), "bytes": (OUT / "guide.json").stat().st_size}
    print(f"guide: {len(guide)} usages")
except Exception as e:  # noqa: BLE001
    meta["errors"].append({"target": "guide", "error": repr(e)[:300]})

# --- 2. Published restrictions, reduced per department -----------------------
try:
    raw = fetch(resources["Restrictions"])
    rows = read_csv(raw)
    meta["restrictions_rows"] = len(rows)

    # dep -> zone type -> level -> {(usage, description): audience flags}
    tree: dict = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))
    skipped = 0
    for r in rows:
        dep = (r.get("zone.departement") or "").strip()
        ztype = (r.get("zone.type") or "").strip().upper()
        level = (r.get("niveau_gravite") or "").strip().lower()
        usage = (r.get("usage.u.nom") or "").strip()
        if not dep or ztype not in {"SUP", "SOU", "AEP"} or level not in LEVELS or not usage:
            skipped += 1
            continue
        desc = (r.get("usage.u.description") or "").strip()
        key = (usage, desc)
        tree[dep][ztype][level][key] = {
            "thematique": (r.get("usage.u.thematique") or "").strip() or None,
            "concerne": {a: truthy(r.get(f"usage.u.{a}")) for a in AUDIENCES},
        }
    meta["skipped_rows"] = skipped

    total_entries = 0
    for dep, by_type in tree.items():
        payload: dict = {}
        for ztype, by_level in by_type.items():
            payload[ztype] = {}
            for level, entries in by_level.items():
                items = []
                for (usage, desc), extra in entries.items():
                    items.append({
                        "usage": usage,
                        "thematique": extra["thematique"],
                        "description": desc or None,
                        "concerne": extra["concerne"],
                    })
                items.sort(key=lambda x: x["usage"])
                payload[ztype][level] = items
                total_entries += len(items)
        (ZONES_OUT / f"{dep}.json").write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )

    sizes = sorted((p.stat().st_size for p in ZONES_OUT.glob("*.json")), reverse=True)
    meta["zones"] = {
        "departments": len(tree),
        "distinct_entries": total_entries,
        "total_bytes": sum(sizes),
        "largest_shard_bytes": sizes[0] if sizes else 0,
    }
    print(f"zones: {len(tree)} departments, {total_entries} entries, {sum(sizes)} bytes")
except Exception as e:  # noqa: BLE001
    meta["errors"].append({"target": "zones", "error": repr(e)[:300]})

(OUT / "meta.json").write_text(
    json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
)
print("errors:", meta["errors"])

# --- 3. Sanity floors -------------------------------------------------------
# Both stages above catch every exception into meta["errors"] so one failing
# stage does not lose the other. That is deliberate — but the script then always
# exited 0, so the workflow went straight to `git add data/restrictions` and
# committed with a green check. A schema change upstream (a renamed
# `zone.departement`, `niveau_gravite`, `usage.u.nom`) makes EVERY row hit the
# `skipped` branch: the reduction produces nothing, no shard is rewritten, the
# stale files stay in place, and the failure only surfaces weeks later as zones
# that look unrestricted. An empty build must fail loudly instead.
rows_read = meta.get("restrictions_rows", 0)
skipped = meta.get("skipped_rows", 0)
failures: list[str] = []
if meta["errors"]:
    failures.append(f"{len(meta['errors'])} étape(s) en échec: {meta['errors']}")
if not meta.get("guide", {}).get("usages"):
    failures.append("guide.json vide — aucun usage lu dans le guide national")
if not meta.get("zones", {}).get("departments"):
    failures.append("aucun département produit — rien n'a été réduit")
if rows_read and skipped == rows_read:
    failures.append(
        f"100 % des lignes écartées ({skipped}/{rows_read}) — "
        "colonnes attendues absentes, le schéma amont a probablement changé"
    )
if failures:
    print("ÉCHEC:", " | ".join(failures), file=sys.stderr)
    sys.exit(1)
# Not fatal, but worth seeing in the log: a partial schema drift.
if rows_read and skipped > rows_read * 0.5:
    print(f"ATTENTION: {skipped}/{rows_read} lignes écartées (>50 %)", file=sys.stderr)

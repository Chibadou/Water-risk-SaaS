#!/usr/bin/env python3
"""Probe the remaining backlog questions on a GitHub runner (full network).

One run, three independent questions, so the sandbox does not have to guess:

  A. How far back does the master "Arrêtés" CSV actually reach, and how many
     arrêtés does it carry per year? lib/history.ts clamps aggregation to
     WINDOW_YEARS = 5. Widening that is only safe if the file really covers the
     older years — otherwise empty years would be averaged in as "0 days of
     restriction" and understate the risk. Also compares against the per-year
     archives, which may be the better source.
  B. Which Explore2 / DRIAS-Eau indicators exist beyond the three already
     extracted (VCN10_ete, QA_yr, dtBE_yr) — QMNA5 and groundwater recharge in
     particular. Recharge is the right predictor for SOU zones, which are
     currently projected with a surface-flow indicator.
  C. Whether a ZRE layer covering Corsica and the overseas départements exists;
     the embedded one is mainland-only.

Output: data/restrictions/backlog-probe.json

Run in Actions with: pip install requests
"""

from __future__ import annotations

import csv
import io
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "restrictions"
OUT.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "hydrovigie-backlog-probe/1.0 (github actions; water-risk-saas)"}
VIGIEAU_DATASET = "https://www.data.gouv.fr/api/1/datasets/donnee-secheresse-vigieau/"

report: dict = {
    "generated": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    "a_history_depth": {},
    "b_explore2_indicators": {},
    "c_zre_coverage": {},
    "errors": [],
}


def is_html(data: bytes) -> bool:
    return data.lstrip()[:1] == b"<"


def fetch(url: str, timeout: int = 300) -> bytes:
    r = requests.get(url, headers=UA, timeout=timeout)
    r.raise_for_status()
    return r.content


def read_csv(data: bytes) -> list[dict]:
    if is_html(data):
        raise ValueError("got HTML instead of a CSV file")
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            text = data.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    sample = text[:8192]
    delim = max([",", ";", "\t"], key=lambda d: sample.count(d))
    return list(csv.DictReader(io.StringIO(text), delimiter=delim))


def year_of(v: str | None) -> int | None:
    m = re.match(r"\s*(\d{4})-", v or "")
    if not m:
        return None
    y = int(m.group(1))
    # lib/history.ts drops start dates before 2005 as corrupt (e.g. year 0022).
    return y if 2005 <= y <= 2100 else None


# --- resource discovery ------------------------------------------------------
try:
    ds = requests.get(VIGIEAU_DATASET, headers=UA, timeout=120).json()
    resources = {(r.get("title") or "").strip(): r.get("url") for r in ds.get("resources", []) if r.get("url")}
except Exception as e:  # noqa: BLE001
    resources = {}
    report["errors"].append({"target": "discovery", "error": repr(e)[:300]})

# --- A. real depth of the master file ---------------------------------------
try:
    a: dict = {}
    master_url = resources.get("arretes.csv")
    if master_url:
        rows = read_csv(fetch(master_url))
        a["master_rows"] = len(rows)
        starts = Counter()
        # An arrêté spans a period: count the years it actually covers, not just
        # the year it starts, since that is what the aggregation walks.
        covered = Counter()
        for r in rows:
            ys = year_of(r.get("date_debut"))
            if ys is None:
                continue
            starts[ys] += 1
            ye = year_of(r.get("date_fin")) or ys
            for y in range(ys, min(ye, 2026) + 1):
                covered[y] += 1
        a["master_arretes_by_start_year"] = dict(sorted(starts.items()))
        a["master_years_covered"] = dict(sorted(covered.items()))
        a["master_min_year"] = min(starts) if starts else None
        # The question that decides the sprint: are the older years populated
        # enough to average, or would widening the window invent quiet years?
        recent = [y for y in covered if y >= 2021]
        old = [y for y in covered if y < 2021]
        a["verdict"] = (
            "MASTER COVERS OLD YEARS — widening WINDOW_YEARS is safe"
            if old and covered and min(covered[y] for y in old) > 0.2 * max(covered[y] for y in recent)
            else "MASTER IS THIN ON OLD YEARS — prefer the per-year archives"
        )
    else:
        a["verdict"] = "master resource not found"

    # Per-year archives, as the alternative source.
    per_year = {}
    for title, url in resources.items():
        m = re.match(r"^Arrêtés (\d{4})$", title)
        if not m:
            continue
        try:
            rows = read_csv(fetch(url))
            per_year[m.group(1)] = {"rows": len(rows), "url": url}
        except Exception as e:  # noqa: BLE001
            per_year[m.group(1)] = {"error": repr(e)[:160]}
    a["per_year_archives"] = dict(sorted(per_year.items()))
    report["a_history_depth"] = a
except Exception as e:  # noqa: BLE001
    report["errors"].append({"target": "A", "error": repr(e)[:300]})

# --- B. Explore2 indicators beyond the three extracted -----------------------
try:
    b: dict = {"datasets": []}
    cat = requests.get(
        "https://www.data.gouv.fr/api/1/datasets/?q=" + requests.utils.quote("Explore2 indicateurs"),
        headers=UA, timeout=120,
    ).json()
    for d in cat.get("data", [])[:12]:
        title = d.get("title") or ""
        if "explore2" not in title.lower():
            continue
        entry = {"title": title, "resources": []}
        for r in d.get("resources", []):
            entry["resources"].append({
                "title": r.get("title"),
                "format": r.get("format"),
                "filesize": r.get("filesize"),
                "url": r.get("url"),
            })
        b["datasets"].append(entry)
    # Which indicator codes appear in the resource titles.
    blob = json.dumps(b, ensure_ascii=False).lower()
    b["mentions"] = {
        k: (k.lower() in blob)
        for k in ["QMNA5", "recharge", "VCN10", "QA", "QJXA", "dtBE", "nappe", "piezo"]
    }
    report["b_explore2_indicators"] = b
except Exception as e:  # noqa: BLE001
    report["errors"].append({"target": "B", "error": repr(e)[:300]})

# --- C. ZRE beyond mainland --------------------------------------------------
try:
    c: dict = {}
    caps = requests.get(
        "https://services.sandre.eaufrance.fr/geo/sandre?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities",
        headers=UA, timeout=120,
    ).text
    names = re.findall(r"<(?:wfs:)?Name>([^<]*)</(?:wfs:)?Name>", caps)
    c["zre_typenames"] = sorted({n for n in names if "zre" in n.lower()})
    c["all_matching_repartition"] = sorted({n for n in names if "repartition" in n.lower()})[:20]
    c["verdict"] = (
        "OVERSEAS/CORSICA LAYER FOUND" if any(
            n.lower().endswith(("_glp", "_mtq", "_guf", "_reu", "_myt", "_spm")) or "cor" in n.lower()
            for n in c["zre_typenames"]
        ) else "ONLY FXX (mainland) — no separate overseas layer exposed"
    )
    report["c_zre_coverage"] = c
except Exception as e:  # noqa: BLE001
    report["errors"].append({"target": "C", "error": repr(e)[:300]})

(OUT / "backlog-probe.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=1, default=str) + "\n", encoding="utf-8"
)

print("=== BACKLOG PROBE ===")
print("A history depth :", report["a_history_depth"].get("verdict"))
print("  master min year:", report["a_history_depth"].get("master_min_year"))
print("  archives       :", list(report["a_history_depth"].get("per_year_archives", {}).keys()))
print("B explore2      :", report["b_explore2_indicators"].get("mentions"))
print("C zre           :", report["c_zre_coverage"].get("verdict"), report["c_zre_coverage"].get("zre_typenames"))
print("errors          :", report["errors"])

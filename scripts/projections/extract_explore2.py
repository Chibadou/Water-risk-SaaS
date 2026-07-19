#!/usr/bin/env python3
"""Extract the real Explore2 TRACC hydrological projections into the sharded
JSON consumed by the app (data/projections/…).

Source (discovered via scripts/projections/discover_explore2.py, catalog in
data/explore2_catalog.json): dataset « Indicateurs de débits futurs Explore2
TRACC agrégés par territoire » on data.gouv.fr — multi-model statistics of the
change vs the 1976-2005 reference, per warming level (TRACC: +2 °C, +2.7 °C,
+4 °C France), aggregated per COMMUNE on the commune's watershed. Long format:

  nom_territoire, type_territoire, code_territoire, rechauffement_france,
  nom_indicateur, code_indicateur, type_indicateur, periode_calcul_indicateur,
  donnees_issues_territoire, statistique, resultat

Extracted themes (quantity-focused):
  - debit_etiage_VCN10_été   → summer low flow, % change
  - debit_moyen_annuel_QA_yr → mean annual flow, % change
  - duree_etiages_dtBE_yr    → duration of summer low-flow periods, change in days

Output:
  data/projections/meta.json           — provenance, warming levels, indicator
                                          dictionary, statistic mapping
  data/projections/communes/{dd}.json  — {insee: {warming: {indic: [lo, med, hi]}}}
                                          sharded by department prefix

Run inside GitHub Actions (network access): pip install pandas requests.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = REPO_ROOT / "data" / "projections"

# COMMUNE-level STATISTIQUES_MULTIMODELES resources (stable data.gouv redirects),
# from data/explore2_catalog.json.
SOURCES = {
    "VCN10_ete": {
        "url": "https://www.data.gouv.fr/api/1/datasets/r/2d847dcc-26fb-4dbe-ad6c-5fb9e90b7cec",
        "label": "Étiage estival (VCN10)",
        "unit": "%",
    },
    "QA_yr": {
        "url": "https://www.data.gouv.fr/api/1/datasets/r/a1dec0ea-218f-4b18-a21e-958533df2d82",
        "label": "Débit moyen annuel (QA)",
        "unit": "%",
    },
    "dtBE_yr": {
        "url": "https://www.data.gouv.fr/api/1/datasets/r/c6a35c98-6d1a-4468-b40d-67fc21de89ea",
        "label": "Durée des basses eaux",
        "unit": "jours",
    },
}

REFERENCE_LABEL = "1976-2005"

# Preferred statistic names for the central value and the uncertainty band,
# tried in order against what the file actually contains.
MEDIAN_PREFS = ["mediane", "médiane", "q50", "moyenne"]
LO_PREFS = ["q10", "q05", "q25", "min"]
HI_PREFS = ["q90", "q95", "q75", "max"]


def norm(s: str) -> str:
    return s.strip().lower().replace("é", "e").replace("è", "e")


def pick(prefs: list[str], available: set[str]) -> str | None:
    normalized = {norm(a): a for a in available}
    for p in prefs:
        if norm(p) in normalized:
            return normalized[norm(p)]
    return None


def shard_key(insee: str) -> str:
    return insee[:3] if insee.startswith("97") else insee[:2]


def main() -> None:
    try:
        import pandas as pd
        import requests
    except ImportError:
        sys.exit("pip install pandas requests")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "communes").mkdir(exist_ok=True)

    # communes[insee][warming][indic] = [lo, med, hi]
    communes: dict[str, dict[str, dict[str, list[float | None]]]] = {}
    warming_levels: list[str] = []
    stat_mapping: dict[str, dict[str, str]] = {}
    indicator_names: dict[str, str] = {}

    for indic_key, src in SOURCES.items():
        print(f"\n=== downloading {indic_key} …", flush=True)
        with requests.get(src["url"], stream=True, timeout=120) as r:
            r.raise_for_status()
            tmp = OUT_DIR / f"_tmp_{indic_key}.csv"
            with open(tmp, "wb") as f:
                for chunk in r.iter_content(1 << 20):
                    f.write(chunk)
        print(f"    {tmp.stat().st_size / 1e6:.0f} MB", flush=True)

        usecols = [
            "code_territoire", "type_territoire", "rechauffement_france",
            "nom_indicateur", "code_indicateur", "type_indicateur", "statistique", "resultat",
        ]
        df = pd.read_csv(
            tmp, usecols=usecols,
            dtype={c: "category" for c in usecols if c != "resultat"},
        )
        tmp.unlink()

        print("    inventaire:")
        print("      rechauffement :", sorted(df["rechauffement_france"].cat.categories))
        print("      statistique   :", sorted(df["statistique"].cat.categories))
        print("      indicateurs   :", sorted(df["code_indicateur"].cat.categories))
        print("      type_indic    :", sorted(df["type_indicateur"].cat.categories))
        print("      territoires   :", sorted(df["type_territoire"].cat.categories))

        df = df[df["type_territoire"].astype(str).str.lower() == "commune"]
        df = df[df["rechauffement_france"].astype(str) != REFERENCE_LABEL]
        # keep only "change vs reference" rows (relative % or absolute duration)
        df = df[df["type_indicateur"].astype(str).str.contains("hangement")]
        df = df.dropna(subset=["resultat"])

        stats_available = set(df["statistique"].astype(str).unique())
        med = pick(MEDIAN_PREFS, stats_available)
        lo = pick(LO_PREFS, stats_available)
        hi = pick(HI_PREFS, stats_available)
        if med is None:
            sys.exit(f"!! no usable central statistic among {stats_available}")
        stat_mapping[indic_key] = {"median": med, "lo": lo or "", "hi": hi or ""}
        print(f"    stats retenues: med={med} lo={lo} hi={hi}")

        indic_codes = df["code_indicateur"].astype(str).unique()
        indicator_names[indic_key] = str(df["nom_indicateur"].astype(str).iloc[0]) if len(df) else src["label"]
        if len(indic_codes) > 1:
            print(f"    ! plusieurs code_indicateur {indic_codes}, tous conservés confondus")

        df = df[df["statistique"].astype(str).isin([s for s in (med, lo, hi) if s])]
        pivot = df.pivot_table(
            index=["code_territoire", "rechauffement_france"],
            columns="statistique",
            values="resultat",
            aggfunc="first",
            observed=True,
        )
        count = 0
        for (insee, warming), row in pivot.iterrows():
            insee = str(insee).zfill(5)
            warming = str(warming)
            if warming not in warming_levels:
                warming_levels.append(warming)
            entry = communes.setdefault(insee, {}).setdefault(warming, {})
            def val(name: str | None):
                if not name or name not in row or pd.isna(row[name]):
                    return None
                return round(float(row[name]), 1)
            entry[indic_key] = [val(lo), val(med), val(hi)]
            count += 1
        print(f"    {count} lignes commune×niveau agrégées", flush=True)

    # order warming levels by their numeric degree
    def deg(w: str) -> float:
        try:
            return float(w.replace("+", "").split("°")[0].replace(",", "."))
        except ValueError:
            return 99
    warming_levels.sort(key=deg)

    shards: dict[str, dict] = {}
    for insee, payload in communes.items():
        shards.setdefault(shard_key(insee), {})[insee] = payload
    for key, content in shards.items():
        (OUT_DIR / "communes" / f"{key}.json").write_text(
            json.dumps(content, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )

    meta = {
        "demo": False,
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source":
            "Explore2 / DRIAS-Eau — « Indicateurs de débits futurs Explore2 TRACC agrégés par "
            "territoire » (data.gouv.fr, Licence Ouverte). Statistiques multi-modèles du changement "
            "par rapport à la référence 1976-2005, agrégées par commune sur le bassin versant du territoire.",
        "reference": REFERENCE_LABEL,
        "aggregation": "commune (bassin versant du territoire)",
        "warming_levels": warming_levels,
        "indicators": {
            k: {"label": SOURCES[k]["label"], "unit": SOURCES[k]["unit"], "source_name": indicator_names.get(k)}
            for k in SOURCES
        },
        "stats": stat_mapping,
        "communes": len(communes),
        "shards": sorted(shards),
    }
    (OUT_DIR / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    total_kb = sum(f.stat().st_size for f in (OUT_DIR / "communes").glob("*.json")) // 1024
    print(f"\n== {len(communes)} communes → {len(shards)} shards ({total_kb} KB) + meta.json")


if __name__ == "__main__":
    main()

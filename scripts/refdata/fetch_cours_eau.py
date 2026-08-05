#!/usr/bin/env python3
"""Build an embeddable watercourse layer for the /carte page, on a GitHub runner.

WHY THIS LAYER AND NOT ANOTHER (diag mode `carte2` enumerated 699 Sandre layers):

  sa:TronconHydrographique_*_Topage*  the full hydrographic network — hundreds of
                                      thousands of segments, unusable whole
  sa:CoursEau_classe1..7_Carthage     ready-made hierarchy, but on the RETIRED
                                      Carthage referential
  sa:MasseDEauRiviere_VRAP2022_FXX    ← retained

The retained layer is the exact surface counterpart of the groundwater one this
repo already embeds (`sa:MasseDEauSouterraine_VRAP2022_FXX`): same referential,
same reporting version, same regulatory object. Measured on the 2010 edition of
the same layer: 9 799 entities over metropolitan France, LineString geometry,
`NomMasseDEau` for the name and **`StrahlMax` (Strahler order) for hierarchy** —
which is what makes "keep the main network" a criterion rather than a guess.

Volumetry expectation, from that same measurement: ~29 KB per feature, so ~285 MB
raw — the same order as the groundwater layer, and the same lesson applies (the
WFS filters WHICH features it returns, never their resolution). Hence the same
two-dimensional search below: raise the Strahler threshold, then coarsen the
tolerance, until the output fits a byte budget.

⚠️ Column names are DISCOVERED, not assumed: the 2022 edition was never read
directly, and a hard-coded `StrahlMax` that turned out to be `StrahlerMax` would
silently produce an unfiltered 200 MB file. Whatever is found is written to the
manifest.

Outputs:
  data/refdata/cours-eau.geojson        — simplified LineStrings, WGS84
  data/refdata/cours-eau-manifest.json  — provenance, columns found, thresholds

Run in Actions with: pip install requests geopandas shapely
"""

from __future__ import annotations

import json
import tempfile
import traceback
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
import requests

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "refdata"
OUT.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "hydrovigie-cours-eau/1.0 (github actions; water-risk-saas)"}

LAYER = "sa:MasseDEauRiviere_VRAP2022_FXX"
WFS = (
    "https://services.sandre.eaufrance.fr/geo/sandre?SERVICE=WFS&VERSION=2.0.0"
    "&REQUEST=GetFeature&TYPENAMES=" + LAYER.replace(":", "%3A") +
    "&OUTPUTFORMAT=geojson&SRSNAME=EPSG:4326"
)

# The page already ships 2,35 MB of aquifers; rivers get a smaller allowance.
BYTE_BUDGET = 2_000_000
# Searched in order: keep as many rivers as the budget allows, and only then
# start dropping the smallest ones. 0 = no hierarchy filter at all.
STRAHLER_MIN = [0, 2, 3, 4, 5]
TOLERANCES_M = [150, 300, 600, 1200]
COORD_DIGITS = 3

# Candidate column names, most likely first. The one that exists wins.
NAME_COLUMNS = ["NomMasseDEau", "NomMasseDeau", "NomEntiteHydro", "NomCoursEau", "TopoOfficiel"]
CODE_COLUMNS = ["CdMasseDEau", "CdEuMasseDEau", "CdEntiteHydro", "CdCoursEau"]
STRAHLER_COLUMNS = ["StrahlMax", "StrahlerMax", "StrahlMin", "Strahler", "OrdreStrahler"]
LENGTH_COLUMNS = ["LongueurTotKm", "LongueurKm", "Longueur"]

manifest: dict = {
    "generated": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    "layer": LAYER,
    "source": "Sandre — masses d'eau cours d'eau, version rapportage 2022 (WFS eaufrance).",
    "steps": [],
    "errors": [],
}


def first_present(columns, candidates):
    for c in candidates:
        if c in columns:
            return c
    return None


def round_coords(obj, ndigits=COORD_DIGITS):
    if isinstance(obj, (int, float)):
        return round(obj, ndigits)
    if isinstance(obj, list):
        if obj and isinstance(obj[0], (int, float)):
            return [round(x, ndigits) for x in obj]
        return [round_coords(x, ndigits) for x in obj]
    return obj


def serialize(gdf: gpd.GeoDataFrame) -> str:
    raw = json.loads(gdf.to_json())
    features = []
    for f in raw.get("features", []):
        geom = f.get("geometry")
        if not geom or not geom.get("coordinates"):
            continue
        features.append(
            {
                "type": "Feature",
                "properties": {k: v for k, v in (f.get("properties") or {}).items() if v is not None},
                "geometry": {"type": geom["type"], "coordinates": round_coords(geom["coordinates"])},
            }
        )
    return json.dumps(
        {"type": "FeatureCollection", "features": features},
        ensure_ascii=False,
        separators=(",", ":"),
    )


try:
    # --- 1. Download once -----------------------------------------------------
    tmp = Path(tempfile.mkdtemp()) / "rivieres.geojson"
    with requests.get(WFS, headers=UA, timeout=1200, stream=True) as r:
        r.raise_for_status()
        size = 0
        with tmp.open("wb") as fh:
            for chunk in r.iter_content(1 << 20):
                fh.write(chunk)
                size += len(chunk)
    manifest["steps"].append({"download_bytes": size})
    print(f"downloaded {size/1e6:.1f} MB")

    gdf = gpd.read_file(tmp)
    cols = list(gdf.columns)
    name_col = first_present(cols, NAME_COLUMNS)
    code_col = first_present(cols, CODE_COLUMNS)
    strahler_col = first_present(cols, STRAHLER_COLUMNS)
    length_col = first_present(cols, LENGTH_COLUMNS)
    manifest.update(
        {
            "entities_total": int(len(gdf)),
            "columns_available": cols,
            "column_name": name_col,
            "column_code": code_col,
            "column_strahler": strahler_col,
            "column_length": length_col,
        }
    )
    print(f"read {len(gdf)} entities; name={name_col} code={code_col} strahler={strahler_col}")
    if name_col is None:
        raise RuntimeError(f"no name column among {NAME_COLUMNS}; available: {cols}")

    gdf = gdf.to_crs(4326)
    strahler = (
        gpd.pd.to_numeric(gdf[strahler_col], errors="coerce") if strahler_col else None
    )
    if strahler is not None:
        manifest["strahler_distribution"] = {
            str(k): int(v) for k, v in strahler.value_counts().sort_index().items()
        }

    # --- 2. Search (hierarchy × tolerance) until the budget is met ------------
    # Rivers are dropped only as a last resort: a map missing the local stream a
    # site sits on is worth less than a slightly coarser drawing of it.
    chosen = None
    for smin in STRAHLER_MIN:
        subset = gdf
        if smin > 0:
            if strahler is None:
                # No hierarchy attribute: named watercourses are the only filter
                # available, and the name is itself a notoriety filter.
                subset = gdf[gdf[name_col].notna()]
            else:
                subset = gdf[strahler >= smin]
        if len(subset) == 0:
            continue
        projected = subset.to_crs(2154)
        for tol in TOLERANCES_M:
            trial = projected.copy()
            trial["geometry"] = trial.geometry.simplify(tol, preserve_topology=True)
            trial = trial.to_crs(4326)
            keep = {name_col: "nom"}
            if code_col:
                keep[code_col] = "code"
            if length_col:
                keep[length_col] = "longueurKm"
            if strahler_col:
                keep[strahler_col] = "strahler"
            trial = trial[[*keep.keys(), "geometry"]].rename(columns=keep)
            payload = serialize(trial)
            n = len(payload.encode("utf-8"))
            manifest["steps"].append(
                {"strahler_min": smin, "tolerance_m": tol, "features": int(len(trial)), "bytes": n}
            )
            print(f"strahler>={smin} tol={tol}m → {len(trial)} features, {n/1e6:.2f} MB")
            if n <= BYTE_BUDGET:
                chosen = (smin, tol, payload, n, len(trial))
                break
        if chosen:
            break

    if chosen is None:
        raise RuntimeError(f"no (strahler, tolerance) combination fit {BYTE_BUDGET} bytes")

    smin, tol, payload, n, count = chosen
    (OUT / "cours-eau.geojson").write_text(payload + "\n", encoding="utf-8")
    manifest.update(
        {
            "strahler_min": smin,
            "tolerance_m": tol,
            "coord_digits": COORD_DIGITS,
            "bytes": n,
            "features": count,
            "note": (
                f"Masses d'eau cours d'eau (rapportage 2022), simplifiées à {tol} m en Lambert-93 "
                f"puis arrondies à ~100 m"
                + (f", limitées à l'ordre de Strahler ≥ {smin}." if smin else ", réseau complet.")
                + " Une masse d'eau cours d'eau est un tronçon de rivière au sens de la directive "
                "cadre sur l'eau : le tracé est indicatif et n'est pas le lit exact du cours d'eau."
            ),
        }
    )
    print(f"cours-eau: {count} features, {n/1e6:.2f} MB (strahler>={smin}, tol={tol} m)")
except Exception as e:  # noqa: BLE001
    manifest["errors"].append(f"cours-eau: {e}")
    traceback.print_exc()

(OUT / "cours-eau-manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
)
print("manifest:", json.dumps(manifest.get("errors", []), ensure_ascii=False))

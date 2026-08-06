#!/usr/bin/env python3
"""Build an embeddable surface-water-body layer (lakes, ponds, reservoirs) for
the /carte page, on a GitHub runner.

MEASURED FIRST (diag mode `carte3`), then written:

  sa:PlanEau_FXX_Topage2026   34 513 entities, national GeoJSON = 205 MB
  name attribute              `TopoOH` — a toponym, and OFTEN EMPTY
  nature attribute            `NaturePE` — "Plan d'eau - retenue",
                              "Plan d'eau - gravière", …

Two consequences the river script did not have to face:

1. **Three and a half times more entities than the river layer** (34 513 against
   9 746), and the river run proved simplification barely helps once coordinates
   are rounded (‑26 % across an 8× tolerance range). So the lever here cannot be
   tolerance alone.
2. **The referential publishes no area**, yet a farm pond of half a hectare is
   noise on a map about where a site's water comes from, while a reservoir is
   the answer. Area is therefore COMPUTED here (Lambert-93, real m²) and used as
   the first filter — a threshold on a measured quantity rather than an
   arbitrary cut in the entity list.

Search order is deliberate: keep every water body and coarsen the drawing first;
start dropping the smallest ones only when the budget still does not fit. The
retained threshold is written to the manifest and surfaced in the app, because
"the small ponds are missing" is a fact the reader must be able to learn.

Outputs:
  data/refdata/plans-eau.geojson        — simplified polygons, WGS84
  data/refdata/plans-eau-manifest.json  — provenance, columns, thresholds

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

UA = {"User-Agent": "hydrovigie-plans-eau/1.0 (github actions; water-risk-saas)"}

LAYER = "sa:PlanEau_FXX_Topage2026"
WFS = (
    "https://services.sandre.eaufrance.fr/geo/sandre?SERVICE=WFS&VERSION=2.0.0"
    "&REQUEST=GetFeature&TYPENAMES=" + LAYER.replace(":", "%3A") +
    "&OUTPUTFORMAT=geojson&SRSNAME=EPSG:4326"
)

# Served through a bbox filter like the rivers, so this is a disk cost.
BYTE_BUDGET = 6_000_000
# Minimum area in HECTARES. 0 = keep everything, then progressively drop the
# smallest. 1 ha ≈ a large farm pond; 10 ha ≈ a small lake.
MIN_AREA_HA = [0, 0.5, 1, 5, 10]
TOLERANCES_M = [20, 50, 100, 200]
COORD_DIGITS = 4  # ~10 m: a pond is small, 100 m rounding would deform it

NAME_COLUMNS = ["TopoOH", "NomOH", "TopoOfficiel", "NomPlanEau"]
CODE_COLUMNS = ["CdOH", "CdPlanEau"]
NATURE_COLUMNS = ["NaturePE", "NatureOH", "TypePE"]

manifest: dict = {
    "generated": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    "layer": LAYER,
    "source": "Sandre — plans d'eau, BD Topage 2026 (WFS eaufrance).",
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
        props = {k: v for k, v in (f.get("properties") or {}).items() if v not in (None, "")}
        features.append(
            {
                "type": "Feature",
                "properties": props,
                "geometry": {"type": geom["type"], "coordinates": round_coords(geom["coordinates"])},
            }
        )
    return json.dumps(
        {"type": "FeatureCollection", "features": features},
        ensure_ascii=False,
        separators=(",", ":"),
    )


try:
    tmp = Path(tempfile.mkdtemp()) / "plans.geojson"
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
    nature_col = first_present(cols, NATURE_COLUMNS)
    manifest.update(
        {
            "entities_total": int(len(gdf)),
            "columns_available": cols,
            "column_name": name_col,
            "column_code": code_col,
            "column_nature": nature_col,
        }
    )
    print(f"read {len(gdf)} entities; name={name_col} code={code_col} nature={nature_col}")

    gdf = gdf.to_crs(4326)
    projected = gdf.to_crs(2154)
    area_ha = projected.geometry.area / 10_000.0
    gdf = gdf.assign(_area_ha=area_ha.values)
    manifest["area_ha_quantiles"] = {
        q: round(float(area_ha.quantile(v)), 3) for q, v in
        {"p10": 0.1, "median": 0.5, "p90": 0.9, "max": 1.0}.items()
    }
    # How many named bodies there are decides whether clicking one teaches
    # anything — the probe showed `TopoOH` is often empty.
    if name_col:
        named = int(gdf[name_col].notna().sum() - (gdf[name_col] == "").sum())
        manifest["entities_named"] = named
        print(f"named: {named}/{len(gdf)}")

    chosen = None
    for min_ha in MIN_AREA_HA:
        subset = gdf[gdf["_area_ha"] >= min_ha] if min_ha > 0 else gdf
        if len(subset) == 0:
            continue
        proj = subset.to_crs(2154)
        for tol in TOLERANCES_M:
            trial = proj.copy()
            trial["geometry"] = trial.geometry.simplify(tol, preserve_topology=True).buffer(0)
            trial = trial.to_crs(4326)
            keep = {}
            if name_col:
                keep[name_col] = "nom"
            if code_col:
                keep[code_col] = "code"
            if nature_col:
                keep[nature_col] = "nature"
            trial = trial.assign(surfaceHa=trial["_area_ha"].round(2))
            trial = trial[[*keep.keys(), "surfaceHa", "geometry"]].rename(columns=keep)
            payload = serialize(trial)
            n = len(payload.encode("utf-8"))
            manifest["steps"].append(
                {"min_area_ha": min_ha, "tolerance_m": tol, "features": int(len(trial)), "bytes": n}
            )
            print(f"min={min_ha} ha tol={tol} m → {len(trial)} features, {n/1e6:.2f} MB")
            if n <= BYTE_BUDGET:
                chosen = (min_ha, tol, payload, n, len(trial))
                break
        if chosen:
            break

    if chosen is None:
        raise RuntimeError(f"no (area, tolerance) combination fit {BYTE_BUDGET} bytes")

    min_ha, tol, payload, n, count = chosen
    (OUT / "plans-eau.geojson").write_text(payload + "\n", encoding="utf-8")
    manifest.update(
        {
            "min_area_ha": min_ha,
            "tolerance_m": tol,
            "coord_digits": COORD_DIGITS,
            "bytes": n,
            "features": count,
            "note": (
                f"Plans d'eau BD Topage simplifiés à {tol} m en Lambert-93"
                + (f", limités à {min_ha} ha et plus." if min_ha else ", tous conservés.")
                + " La surface est calculée ici (Lambert-93), le référentiel ne la publie pas. "
                "Beaucoup de plans d'eau n'ont pas de toponyme : leur popup affiche alors leur nature."
            ),
        }
    )
    print(f"plans-eau: {count} features, {n/1e6:.2f} MB (min {min_ha} ha, tol {tol} m)")
except Exception as e:  # noqa: BLE001
    manifest["errors"].append(f"plans-eau: {e}")
    traceback.print_exc()

(OUT / "plans-eau-manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
)
print("manifest:", json.dumps(manifest.get("errors", []), ensure_ascii=False))

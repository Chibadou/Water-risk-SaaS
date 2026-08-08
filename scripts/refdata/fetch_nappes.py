#!/usr/bin/env python3
"""Build an embeddable groundwater-body layer (masses d'eau souterraines) for the
/carte page, on a GitHub runner.

WHY THIS SCRIPT EXISTS — measured, not assumed (diag mode `carte`, run 31):

  sa:MasseDEauSouterraine_VRAP2022_FXX   639 entities, national GeoJSON = 237 MB
  one single feature                     108 KB
  a 0.5° × 0.8° viewport BBOX query      19.5 MB in 13.6 s

Both options written into the sprint plan therefore failed on contact with the
real service. The national layer is far too heavy to embed, AND fetching it live
per viewport is worse than useless: the WFS filters WHICH features it returns,
never their resolution, so panning would cost ~20 MB a move. The blocker is
geometry precision, not feature count — which is exactly what simplification
fixes, once, offline, here.

Approach: download the national layer once, keep the bodies that OUTCROP
(SurfaceAffKm > 0 — a map of the surface should not be covered by a body lying
2 000 m below another), simplify in Lambert-93 so the tolerance is in real
metres, and walk a ladder of tolerances until the output fits a byte budget. The
budget is enforced, not hoped for: an oversized file would only be discovered in
production, where it would blow up the serverless bundle.

Outputs:
  data/refdata/nappes.geojson        — simplified polygons, WGS84
  data/refdata/nappes-manifest.json  — provenance, tolerance retained, sizes

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

UA = {"User-Agent": "hydrovigie-nappes/1.0 (github actions; water-risk-saas)"}

LAYER = "sa:MasseDEauSouterraine_VRAP2022_FXX"
WFS = (
    "https://services.sandre.eaufrance.fr/geo/sandre?SERVICE=WFS&VERSION=2.0.0"
    "&REQUEST=GetFeature&TYPENAMES=" + LAYER.replace(":", "%3A") +
    "&OUTPUTFORMAT=geojson&SRSNAME=EPSG:4326"
)

# The map has to stay loadable on a phone. departements.geojson is 226 KB for 96
# polygons; groundwater bodies are more sinuous, so the budget is larger — but
# it is a budget, and the ladder below is walked until it is met.
BYTE_BUDGET = 3_000_000
# Simplification tolerances in METRES (geometry is projected to Lambert-93
# first, so these are real distances and not degrees).
TOLERANCES_M = [200, 400, 800, 1500, 3000]
# Coordinate rounding: 3 decimals ≈ 100 m, the same call made for departements.
COORD_DIGITS = 3

# Properties worth keeping. Everything else is referential noise for a map.
KEEP = {
    "CdMasseDEau": "code",
    "NomMasseDEau": "nom",
    "SurfaceTotaleKm": "surfaceKm2",
    "SurfaceAffKm": "surfaceAffleuranteKm2",
    "Karstique": "karstique",
    "MultiCouches": "multiCouches",
}

manifest: dict = {
    "generated": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    "layer": LAYER,
    "source": "Sandre — masses d'eau souterraines, version SDAGE 2022-2027 (WFS eaufrance).",
    "steps": [],
    "errors": [],
}


def round_coords(obj, ndigits=COORD_DIGITS):
    """Round every coordinate in a nested GeoJSON coordinate array."""
    if isinstance(obj, (int, float)):
        return round(obj, ndigits)
    if isinstance(obj, list):
        if obj and isinstance(obj[0], (int, float)):
            return [round(x, ndigits) for x in obj]
        return [round_coords(x, ndigits) for x in obj]
    return obj


def serialize(gdf: gpd.GeoDataFrame) -> str:
    """GeoDataFrame → compact GeoJSON string with rounded coordinates."""
    raw = json.loads(gdf.to_json())
    features = []
    for f in raw.get("features", []):
        geom = f.get("geometry")
        if not geom or not geom.get("coordinates"):
            continue
        features.append(
            {
                "type": "Feature",
                "properties": f.get("properties", {}),
                "geometry": {
                    "type": geom["type"],
                    "coordinates": round_coords(geom["coordinates"]),
                },
            }
        )
    return json.dumps(
        {"type": "FeatureCollection", "features": features},
        ensure_ascii=False,
        separators=(",", ":"),
    )


try:
    # --- 1. Download the national layer (measured: ~237 MB, ~110 s) ----------
    tmp = Path(tempfile.mkdtemp()) / "meso.geojson"
    with requests.get(WFS, headers=UA, timeout=900, stream=True) as r:
        r.raise_for_status()
        size = 0
        with tmp.open("wb") as fh:
            for chunk in r.iter_content(1 << 20):
                fh.write(chunk)
                size += len(chunk)
    manifest["steps"].append({"download_bytes": size})
    print(f"downloaded {size/1e6:.1f} MB")

    gdf = gpd.read_file(tmp)
    manifest["steps"].append({"entities_total": int(len(gdf))})
    print(f"read {len(gdf)} entities, columns: {list(gdf.columns)}")

    # --- 2. Keep the bodies that reach the surface --------------------------
    # A groundwater body under cover ("sous couverture") is real, but drawing its
    # full extent on top of the one that actually outcrops there would tell the
    # reader that the water is where it is not. SurfaceAffKm is the outcropping
    # area published by the referential itself — no threshold of our own.
    before = len(gdf)
    if "SurfaceAffKm" in gdf.columns:
        aff = gpd.pd.to_numeric(gdf["SurfaceAffKm"], errors="coerce").fillna(0)
        gdf = gdf[aff > 0].copy()
    manifest["steps"].append({"entities_outcropping": int(len(gdf)), "entities_dropped": before - len(gdf)})
    print(f"kept {len(gdf)} outcropping bodies (dropped {before - len(gdf)})")

    # --- 3. Simplify until the output fits the budget ------------------------
    gdf = gdf.to_crs(4326)
    # Lambert-93: tolerances below are then genuine metres.
    projected = gdf.to_crs(2154)

    chosen = None
    for tol in TOLERANCES_M:
        trial = projected.copy()
        trial["geometry"] = trial.geometry.simplify(tol, preserve_topology=True).buffer(0)
        trial = trial.to_crs(4326)
        cols = {src: dst for src, dst in KEEP.items() if src in trial.columns}
        trial = trial[[*cols.keys(), "geometry"]].rename(columns=cols)
        payload = serialize(trial)
        n = len(payload.encode("utf-8"))
        manifest["steps"].append({"tolerance_m": tol, "bytes": n})
        print(f"tolerance {tol} m → {n/1e6:.2f} MB")
        if n <= BYTE_BUDGET:
            chosen = (tol, payload, n, len(trial))
            break

    if chosen is None:
        raise RuntimeError(
            f"no tolerance in {TOLERANCES_M} brought the layer under {BYTE_BUDGET} bytes"
        )

    tol, payload, n, count = chosen
    (OUT / "nappes.geojson").write_text(payload + "\n", encoding="utf-8")
    manifest.update(
        {
            "tolerance_m": tol,
            "coord_digits": COORD_DIGITS,
            "bytes": n,
            "features": count,
            "note": (
                "Masses d'eau souterraines affleurantes (SurfaceAffKm > 0), simplifiées à "
                f"{tol} m en Lambert-93 puis arrondies à ~100 m. Les masses d'eau profondes, "
                "sous couverture, ne sont PAS représentées : leur emprise recouvrirait celle "
                "qui affleure réellement. Les contours sont indicatifs — le référentiel fait foi."
            ),
        }
    )
    print(f"nappes: {count} features, {n/1e6:.2f} MB at {tol} m")
except Exception as e:  # noqa: BLE001
    manifest["errors"].append(f"nappes: {e}")
    traceback.print_exc()

(OUT / "nappes-manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
)
print("manifest:", json.dumps(manifest.get("errors", []), ensure_ascii=False))

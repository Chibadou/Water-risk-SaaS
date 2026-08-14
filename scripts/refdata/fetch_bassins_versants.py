#!/usr/bin/env python3
"""Build the two watershed layers of the /carte page, on a GitHub runner.

WHAT A WATERSHED ADDS TO THIS MAP. The « Où est l'eau » group shows the water
itself — aquifers, rivers, lakes. None of them says which TERRITORY produces
that water. A watershed is exactly that: the area whose every drop converges on
one outlet. Two scales are built here because they answer two different
questions:

  fine   → « d'où vient l'eau qui arrive ici »          (BD Topage)
  coarse → « qui décide et qui finance sur ce bassin »  (circonscriptions DCE,
           already mapped to the six agences de l'eau by lib/bassins.ts)

PROBE BEFORE DOWNLOAD. Measured on this same WFS: the groundwater layer is
237 MB nationally and the lake layer 205 MB — the service filters WHICH
entities it returns, never their resolution. Downloading three candidates to
find out which one is usable would blow the 30-minute workflow timeout. So each
candidate is first asked for `RESULTTYPE=hits` (how many entities) and a
20-feature sample (real column names, bytes per entity); only the retained one
is downloaded whole.

⚠️ EVERY CANDIDATE IS RECORDED, retained or not. A probe that returns a false
negative is worse than a probe that fails: it closes an open road (idiom n°15,
sprint 51). The manifest keeps the measurement of each one.

⚠️ Column names are DISCOVERED, not assumed. `TopoOfficiel` on one Sandre layer
is `NomEntiteHydro` on the next, and a hard-coded name that turns out wrong
would silently produce a layer of unnamed polygons.

Outputs:
  data/refdata/bassins-versants.geojson        — fine watersheds, WGS84
  data/refdata/grands-bassins.geojson          — the DCE basin circumscriptions
  data/refdata/bassins-versants-manifest.json  — provenance, every probe, ladder

Run in Actions with: pip install requests geopandas shapely
"""

from __future__ import annotations

import json
import re
import sys
import tempfile
import traceback
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
import requests

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "refdata"
OUT.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "hydrovigie-bassins-versants/1.0 (github actions; water-risk-saas)"}
BASE = "https://services.sandre.eaufrance.fr/geo/sandre"

# Fine watersheds, most preferred first. All three names come from the
# GetCapabilities listing already recorded in data/refdata/bassins-manifest.json,
# so they exist — what is unknown is their volumetry and their columns.
#
#   BassinVersantTopographique_*_Topage*  the BD Topage topographic watersheds,
#                                         the modern national referential
#   BVSpeMasseDEauSurface_VEDL2019_FXX    the catchment of each surface water
#                                         body; pairs 1:1 with the 9 746 river
#                                         water bodies already embedded, and is
#                                         the lead HANDBOOK §2 kept open for
#                                         lib/ressource.ts
FINE_CANDIDATES = [
    "sa:BassinVersantTopographique_FXX_Topage2026",
    "sa:BassinVersantTopographique_FXX_Topage2025",
    "sa:BVSpeMasseDEauSurface_VEDL2019_FXX",
]
# The 14 DCE basin circumscriptions. Same layer fetch_bassins.py reads for the
# commune → basin join; that script is NOT touched here (its 35 186-commune join
# is shipped), only the geometry is taken.
COARSE_LAYER = "sa:BassinDCE"

# Estimated full-download ceiling, from hits × bytes-per-feature. A layer above
# this is skipped rather than tried: the runner has 30 minutes for everything,
# and a candidate that cannot be downloaded is a measurement, not a failure.
DOWNLOAD_ESTIMATE_CAP = 400_000_000

# ⚠️ This budget is the FILE on disk, not what a browser downloads:
# /api/bassins-versants filters by bounding box, so a client only ever receives
# the watersheds in view. Same reasoning as cours-eau.geojson (5,8 MB on disk,
# ~50 KB on the wire).
BYTE_BUDGET = 6_000_000
COARSE_BYTE_BUDGET = 400_000

# Searched in this order: coarsen the outline first, and only start dropping the
# smallest watersheds once no tolerance fits. Dropping a basin removes a place
# from the map; coarsening only makes its divide less precise.
MIN_AREA_KM2 = [0, 5, 20, 50, 100]
TOLERANCES_M = [200, 400, 800, 1600]
COARSE_TOLERANCES_M = [500, 1000, 2000, 4000]
COORD_DIGITS = 3

# Candidate column names, most likely first. The one that exists wins.
NAME_COLUMNS = [
    "TopoOfficiel", "NomBassinVersant", "LbBassinVersant", "NomEntiteHydro",
    "NomMasseDEau", "TopoOH", "NomBVSpe", "NomBassinDCE", "LbBassinDCE",
]
CODE_COLUMNS = [
    "CdBassinVersant", "CdOH", "CdEntiteHydro", "CdMasseDEau", "CdEuMasseDEau",
    "CdBassinDCE", "CdEuBassinDCE", "gid",
]

manifest: dict = {
    "generated": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    "source": "Sandre — bassins versants (WFS eaufrance).",
    "probes": [],
    "steps": [],
    "errors": [],
}


def wfs_url(layer: str, **params: str) -> str:
    query = "".join(f"&{k}={v}" for k, v in params.items())
    return (
        f"{BASE}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature"
        f"&TYPENAMES={layer.replace(':', '%3A')}&SRSNAME=EPSG:4326{query}"
    )


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


def probe(layer: str) -> dict:
    """Measure a candidate without downloading it: how many entities, which
    columns, and how many bytes one entity costs."""
    result: dict = {"layer": layer}
    try:
        # RESULTTYPE=hits answers with an empty FeatureCollection whose
        # numberMatched attribute is the count — a few hundred bytes.
        r = requests.get(wfs_url(layer, RESULTTYPE="hits"), headers=UA, timeout=180)
        r.raise_for_status()
        found = re.search(r'numberMatched="(\d+|unknown)"', r.text)
        result["hits"] = int(found.group(1)) if found and found.group(1).isdigit() else None
        if found and found.group(1) == "unknown":
            result["hits_note"] = "service answered numberMatched=unknown"
    except Exception as e:  # noqa: BLE001
        result["hits_error"] = str(e)[:200]

    try:
        url = wfs_url(layer, OUTPUTFORMAT="geojson", COUNT="20")
        r = requests.get(url, headers=UA, timeout=300)
        r.raise_for_status()
        content = r.content
        if content.lstrip()[:1] == b"<":
            # An OGC exception report is XML too, so say what came back rather
            # than "layer unavailable" — the difference is a wrong request
            # against a missing layer (measured, sprint 51: WFS 2.0 wants
            # TYPENAMES, and OUTPUTFORMAT=application/json returns 400).
            result["sample_error"] = "response is XML/HTML: " + content[:200].decode("utf-8", "replace")
            return result
        p = Path(tempfile.mkdtemp()) / "sample.geojson"
        p.write_bytes(content)
        g = gpd.read_file(str(p))
        result["sample_features"] = int(len(g))
        result["columns"] = [c for c in g.columns if c != "geometry"]
        result["geometry_types"] = sorted({str(t) for t in g.geometry.type.unique()})
        if len(g):
            result["bytes_per_feature"] = int(len(content) / len(g))
            if result.get("hits"):
                result["estimated_full_bytes"] = result["hits"] * result["bytes_per_feature"]
        result["column_name"] = first_present(result["columns"], NAME_COLUMNS)
        result["column_code"] = first_present(result["columns"], CODE_COLUMNS)
    except Exception as e:  # noqa: BLE001
        result["sample_error"] = str(e)[:200]
    return result


def download(layer: str) -> gpd.GeoDataFrame:
    tmp = Path(tempfile.mkdtemp()) / "layer.geojson"
    size = 0
    with requests.get(wfs_url(layer, OUTPUTFORMAT="geojson"), headers=UA, timeout=1500, stream=True) as r:
        r.raise_for_status()
        with tmp.open("wb") as fh:
            for chunk in r.iter_content(1 << 20):
                fh.write(chunk)
                size += len(chunk)
    manifest["steps"].append({"layer": layer, "download_bytes": size})
    print(f"downloaded {layer}: {size/1e6:.1f} MB")
    return gpd.read_file(str(tmp))


def to_wgs84_polygons(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    gdf = gdf.to_crs(4326) if gdf.crs else gdf.set_crs(4326)
    return gdf[gdf.geometry.type.isin(["Polygon", "MultiPolygon"])].copy()


def build(
    gdf: gpd.GeoDataFrame,
    name_col: str | None,
    code_col: str | None,
    budget: int,
    tolerances: list[int],
    min_areas: list[float],
    label: str,
) -> tuple[str, dict]:
    """Walk the (min area × tolerance) ladder until the payload fits `budget`.
    Returns the payload and what it took to get there."""
    projected = gdf.to_crs(2154)
    # The referential publishes no area for these layers: computing it in
    # Lambert-93 is the same call already made for the lakes, and it is what
    # makes "keep the largest" a criterion rather than a guess.
    area_km2 = projected.geometry.area / 1_000_000.0
    gdf = gdf.assign(_area_km2=area_km2.values)

    for min_area in min_areas:
        subset = gdf[gdf["_area_km2"] >= min_area] if min_area else gdf
        if len(subset) == 0:
            continue
        proj = subset.to_crs(2154)
        for tol in tolerances:
            trial = proj.copy()
            trial["geometry"] = trial.geometry.simplify(tol, preserve_topology=True).buffer(0)
            trial = trial.to_crs(4326)
            keep = {}
            if name_col:
                keep[name_col] = "nom"
            if code_col:
                keep[code_col] = "code"
            trial = trial.assign(surfaceKm2=trial["_area_km2"].round(1))
            trial = trial[[*keep.keys(), "surfaceKm2", "geometry"]].rename(columns=keep)
            payload = serialize(trial)
            n = len(payload.encode("utf-8"))
            manifest["steps"].append(
                {"couche": label, "min_area_km2": min_area, "tolerance_m": tol,
                 "features": int(len(trial)), "bytes": n}
            )
            print(f"{label}: min={min_area} km² tol={tol} m → {len(trial)} features, {n/1e6:.2f} MB")
            if n <= budget:
                return payload, {
                    "min_area_km2": min_area,
                    "tolerance_m": tol,
                    "features": int(len(trial)),
                    "bytes": n,
                }
    raise RuntimeError(f"{label}: no (area, tolerance) combination fit {budget} bytes")


# ---------------------------------------------------------------------------
# 1. Fine watersheds — probe every candidate, download the first usable one
# ---------------------------------------------------------------------------
try:
    chosen_layer = None
    chosen_probe = None
    for layer in FINE_CANDIDATES:
        p = probe(layer)
        manifest["probes"].append(p)
        print("probe:", json.dumps(p, ensure_ascii=False))
        if p.get("sample_error") or not p.get("sample_features"):
            continue
        estimate = p.get("estimated_full_bytes")
        if estimate and estimate > DOWNLOAD_ESTIMATE_CAP:
            p["skipped"] = f"estimated {estimate/1e6:.0f} MB > cap {DOWNLOAD_ESTIMATE_CAP/1e6:.0f} MB"
            print("skipped:", p["skipped"])
            continue
        chosen_layer, chosen_probe = layer, p
        break

    if chosen_layer is None:
        raise RuntimeError("no fine watershed candidate was both readable and downloadable")

    manifest["fine_layer"] = {
        "layer": chosen_layer,
        "hits": chosen_probe.get("hits"),
        "columns": chosen_probe.get("columns"),
        "column_name": chosen_probe.get("column_name"),
        "column_code": chosen_probe.get("column_code"),
    }
    print(f"retained fine layer: {chosen_layer}")

    gdf = to_wgs84_polygons(download(chosen_layer))
    if gdf.empty:
        raise RuntimeError(f"{chosen_layer}: no polygon geometry after download")
    manifest["fine_layer"]["features_downloaded"] = int(len(gdf))

    name_col = first_present(gdf.columns, NAME_COLUMNS)
    code_col = first_present(gdf.columns, CODE_COLUMNS)
    manifest["fine_layer"].update({"column_name": name_col, "column_code": code_col})
    if name_col:
        named = int((gdf[name_col].notna() & (gdf[name_col].astype(str) != "")).sum())
        manifest["fine_layer"]["features_named"] = named
        print(f"named: {named}/{len(gdf)}")

    areas = gdf.to_crs(2154).geometry.area / 1_000_000.0
    manifest["fine_layer"]["area_km2_quantiles"] = {
        q: round(float(areas.quantile(v)), 2)
        for q, v in {"p10": 0.1, "median": 0.5, "p90": 0.9, "p99": 0.99, "max": 1.0}.items()
    }

    payload, how = build(
        gdf, name_col, code_col, BYTE_BUDGET, TOLERANCES_M, MIN_AREA_KM2, "bassins-versants"
    )
    (OUT / "bassins-versants.geojson").write_text(payload + "\n", encoding="utf-8")
    manifest["bassins_versants"] = {
        **how,
        "layer": chosen_layer,
        "coord_digits": COORD_DIGITS,
        "note": (
            f"Bassins versants simplifiés à {how['tolerance_m']} m en Lambert-93"
            + (f", limités à {how['min_area_km2']} km² et plus." if how["min_area_km2"] else ", tous conservés.")
            + " La surface est calculée ici (Lambert-93), le référentiel ne la publie pas. "
            "Un bassin versant est un découpage topographique : il ne coïncide pas avec le "
            "périmètre d'application d'un arrêté sécheresse."
        ),
    }
    print(f"bassins-versants: {how['features']} features, {how['bytes']/1e6:.2f} MB")
except Exception as e:  # noqa: BLE001
    manifest["errors"].append(f"bassins-versants: {e}")
    traceback.print_exc()

# ---------------------------------------------------------------------------
# 2. The DCE basin circumscriptions — 14 polygons, the agence de l'eau scale
# ---------------------------------------------------------------------------
try:
    p = probe(COARSE_LAYER)
    manifest["probes"].append(p)
    print("probe:", json.dumps(p, ensure_ascii=False))

    gdf = to_wgs84_polygons(download(COARSE_LAYER))
    if gdf.empty:
        raise RuntimeError(f"{COARSE_LAYER}: no polygon geometry after download")

    # ⚠️ `CdBassinDCE` is the key lib/bassins.ts indexes (A, B1, B2, C, D, E, F,
    # G, H). Taking any other code column here would give the map a basin the
    # popup cannot name an agence for.
    code_col = "CdBassinDCE" if "CdBassinDCE" in gdf.columns else first_present(gdf.columns, CODE_COLUMNS)
    name_col = first_present(gdf.columns, NAME_COLUMNS)
    manifest["grands_bassins_columns"] = {"code": code_col, "name": name_col,
                                          "available": [c for c in gdf.columns if c != "geometry"]}

    payload, how = build(
        gdf, name_col, code_col, COARSE_BYTE_BUDGET, COARSE_TOLERANCES_M, [0], "grands-bassins"
    )

    # ⚠️ One label point per district, added to the same collection.
    # MapLibre anchors a symbol on EVERY part of a multipolygon, so a district
    # made of a mainland plus its islands got its name written four times over
    # the map (measured on the France-wide view: « Loire-Bretagne » ×4,
    # « Adour-Garonne » ×3). The map filters this source by geometry type:
    # polygons feed the outline, points feed the labels.
    label_rows = []
    for _, row in gdf.iterrows():
        geom = row.geometry
        # The largest part, so the name lands on the mainland and not on an islet.
        parts = list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]
        biggest = max(parts, key=lambda p: p.area)
        point = biggest.representative_point()
        label_rows.append(
            {
                "type": "Feature",
                "properties": {
                    "nom": str(row[name_col]) if name_col else "",
                    "code": str(row[code_col]) if code_col else "",
                    "label": 1,
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [round(point.x, COORD_DIGITS), round(point.y, COORD_DIGITS)],
                },
            }
        )
    collection = json.loads(payload)
    collection["features"].extend(label_rows)
    payload = json.dumps(collection, ensure_ascii=False, separators=(",", ":"))
    how["label_points"] = len(label_rows)
    how["bytes"] = len(payload.encode("utf-8"))

    (OUT / "grands-bassins.geojson").write_text(payload + "\n", encoding="utf-8")
    manifest["grands_bassins"] = {
        **how,
        "layer": COARSE_LAYER,
        "coord_digits": COORD_DIGITS,
        "note": (
            f"Circonscriptions administratives de bassin (DCE), simplifiées à {how['tolerance_m']} m. "
            "Le code est celui que lib/bassins.ts associe à l'agence de l'eau et au SDAGE."
        ),
    }
    print(f"grands-bassins: {how['features']} features, {how['bytes']/1e6:.3f} MB")
except Exception as e:  # noqa: BLE001
    manifest["errors"].append(f"grands-bassins: {e}")
    traceback.print_exc()

(OUT / "bassins-versants-manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
)
print("errors:", json.dumps(manifest["errors"], ensure_ascii=False))

# The manifest is written whatever happens — the measurements of every probed
# candidate are the point of the run, and they must survive a failure. But a
# missing layer is a failed run: committing a green check over an absent file is
# exactly how /api/bassins-versants would 503 in silence.
if manifest["errors"]:
    print(f"ÉCHEC: {manifest['errors']}", file=sys.stderr)
    sys.exit(1)

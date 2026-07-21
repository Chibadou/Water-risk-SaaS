#!/usr/bin/env python3
"""Fetch reference geodata for HydroVigie, on a GitHub runner (full network,
unlike the dev sandbox). Two outputs, both consumed by Sprint 19:

  data/refdata/departements.geojson   — simplified department polygons
                                         (Sprint 19-B: France choropleth), coords
                                         rounded to ~100 m, properties {code,nom}
  data/refdata/zre-communes.json      — INSEE codes of communes in a Zone de
                                         Répartition des Eaux (Sprint 19-A:
                                         transition-risk panel), via spatial join
  data/refdata/manifest.json          — provenance, counts, and any errors

Defensive by design: the department layer (reliable source) must succeed; the
ZRE step is attempted and any failure is recorded in the manifest without
aborting the run, so B ships even if A's data proves messy.

Run in Actions with: pip install requests geopandas shapely
"""

from __future__ import annotations

import json
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "refdata"
OUT.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "hydrovigie-refdata/1.0 (github actions; water-risk-saas)"}

DEP_URL = (
    "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/"
    "departements-version-simplifiee.geojson"
)
COMMUNES_URL = (
    "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/"
    "communes-version-simplifiee.geojson"
)
DATAGOUV_SEARCH = "https://www.data.gouv.fr/api/1/datasets/?q=zone+de+repartition+des+eaux&page_size=20"

manifest: dict = {
    "generated": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    "departements": {},
    "zre": {},
    "errors": [],
}


def get_json(url: str, timeout: int = 180):
    r = requests.get(url, headers=UA, timeout=timeout)
    r.raise_for_status()
    return r.json()


def round_coords(obj, ndigits=3):
    """Round every coordinate in a GeoJSON geometry tree to shrink the file."""
    if isinstance(obj, list):
        if obj and all(isinstance(x, (int, float)) for x in obj):
            return [round(x, ndigits) for x in obj]
        return [round_coords(x, ndigits) for x in obj]
    return obj


# --- 1. Department polygons (reliable) --------------------------------------
try:
    gj = get_json(DEP_URL)
    feats = []
    for f in gj.get("features", []):
        props = f.get("properties", {})
        feats.append({
            "type": "Feature",
            "properties": {"code": props.get("code"), "nom": props.get("nom")},
            "geometry": {
                "type": f["geometry"]["type"],
                "coordinates": round_coords(f["geometry"]["coordinates"], 3),
            },
        })
    out = {"type": "FeatureCollection", "features": feats}
    raw = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    (OUT / "departements.geojson").write_text(raw + "\n", encoding="utf-8")
    manifest["departements"] = {"source": DEP_URL, "features": len(feats), "bytes": len(raw)}
    print(f"departements: {len(feats)} features, {len(raw)} bytes")
except Exception as e:  # noqa: BLE001
    manifest["errors"].append(f"departements: {e}")
    traceback.print_exc()

# --- 2. ZRE commune membership (best-effort) --------------------------------
# Discover the ZRE geographic layer on data.gouv, then spatial-join it with the
# commune centroids to get the list of communes in a ZRE.
try:
    import geopandas as gpd  # noqa: WPS433
    from shapely.geometry import shape  # noqa: F401,WPS433

    catalog = get_json(DATAGOUV_SEARCH)
    candidates = []
    for ds in catalog.get("data", []):
        title = (ds.get("title") or "").lower()
        if "répartition" not in title and "repartition" not in title:
            continue
        for res in ds.get("resources", []):
            fmt = (res.get("format") or "").lower()
            url = res.get("url") or ""
            if fmt in {"geojson", "json"} or url.lower().endswith(".geojson"):
                candidates.append({"dataset": ds.get("title"), "url": url, "format": fmt, "id": res.get("id")})
    manifest["zre"]["candidates"] = candidates[:10]
    print(f"zre: {len(candidates)} geojson candidate resource(s)")

    zre_gdf = None
    used = None
    for c in candidates:
        try:
            zre_gdf = gpd.read_file(c["url"])
            used = c
            break
        except Exception as e:  # noqa: BLE001
            manifest["errors"].append(f"zre read {c['url']}: {e}")
    if zre_gdf is None:
        raise RuntimeError("no readable ZRE geojson resource found")

    zre_gdf = zre_gdf.to_crs(4326)
    zre_union = zre_gdf.geometry.union_all() if hasattr(zre_gdf.geometry, "union_all") else zre_gdf.geometry.unary_union

    communes = gpd.read_file(COMMUNES_URL).to_crs(4326)
    # Representative point of each commune, tested against the ZRE union.
    communes["pt"] = communes.geometry.representative_point()
    in_zre = communes[communes["pt"].within(zre_union)]
    codes = sorted({str(c) for c in in_zre["code"].tolist() if c})

    payload = {
        "generated": manifest["generated"],
        "source": used,
        "note": (
            "Codes INSEE des communes dont le point représentatif tombe dans une "
            "Zone de Répartition des Eaux (ZRE). Jointure spatiale ZRE × communes."
        ),
        "count": len(codes),
        "codes": codes,
    }
    (OUT / "zre-communes.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
    )
    manifest["zre"].update({"source": used, "communes": len(codes)})
    print(f"zre: {len(codes)} communes in a ZRE (source {used['dataset'] if used else '?'})")
except Exception as e:  # noqa: BLE001
    manifest["errors"].append(f"zre: {e}")
    traceback.print_exc()

(OUT / "manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
)
print("manifest:", json.dumps(manifest.get("errors", []), ensure_ascii=False))
# Never fail the run on ZRE errors — the department layer is the guaranteed win.
sys.exit(0)

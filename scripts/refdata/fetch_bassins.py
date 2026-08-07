#!/usr/bin/env python3
"""Attach every commune to its river-basin district (circonscription de bassin) and
therefore to its agence de l'eau, on a GitHub runner.

Why a referential rather than a hardcoded table: basins follow hydrology, not
department boundaries, so a department-keyed mapping written from memory would
be wrong at every basin divide — and wrong invisibly. The Sandre WFS publishes
the administrative basin circumscriptions; joining commune representative
points against those polygons gives an attribution that is right by
construction.

Each of the six agences de l'eau runs its own aid programmes and sets its own
redevance rates, which is what makes this worth attaching: it turns the
transition panel from generic national policy into "who you actually apply to".

Outputs:
  data/refdata/bassins-communes.json — commune INSEE → basin code
  data/refdata/bassins-manifest.json — provenance, coverage, per-basin counts

Run in Actions with: pip install requests geopandas shapely
"""

from __future__ import annotations

import json
import sys
import tempfile
import traceback
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
import requests
from shapely.validation import make_valid

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "refdata"
OUT.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "hydrovigie-bassins/1.0 (github actions; water-risk-saas)"}
COMMUNES_URL = (
    "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/"
    "communes-version-simplifiee.geojson"
)

# Candidate Sandre WFS layers. The exact type name is not documented anywhere we
# can rely on, so several plausible ones are tried and GetCapabilities is
# consulted as a fallback rather than guessing a single string.
CANDIDATE_LAYERS = [
    "sa:CircAdminBassin",
    "sa:CircadminBassin",
    "sa:BassinDCE",
    "sa:BassinAdministratif",
    "sa:CIRCONSCRIPTION_BASSIN",
]
ENDPOINTS = ("sandre", "zon")

manifest: dict = {
    "generated": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    "source": "Sandre — circonscriptions administratives de bassin (WFS eaufrance).",
    "attempts": [],
    "errors": [],
}


def wfs_url(endpoint: str, layer: str, fmt: str = "geojson") -> str:
    return (
        f"https://services.sandre.eaufrance.fr/geo/{endpoint}?SERVICE=WFS&VERSION=2.0.0"
        f"&REQUEST=GetFeature&TYPENAMES={requests.utils.quote(layer)}"
        f"&OUTPUTFORMAT={fmt}&SRSNAME=EPSG:4326"
    )


def read_geo(url: str):
    r = requests.get(url, headers=UA, timeout=300)
    r.raise_for_status()
    content = r.content
    if content.lstrip()[:1] == b"<":
        raise RuntimeError("response is HTML/XML, not geodata")
    p = Path(tempfile.mkdtemp()) / "g.geojson"
    p.write_bytes(content)
    return gpd.read_file(str(p))


# --- discover which basin layers the service actually exposes ---------------
discovered: list[str] = []
try:
    import re

    caps = requests.get(
        "https://services.sandre.eaufrance.fr/geo/sandre?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities",
        headers=UA, timeout=120,
    ).text
    names = re.findall(r"<(?:wfs:)?Name>([^<]*)</(?:wfs:)?Name>", caps)
    discovered = sorted({n for n in names if "bassin" in n.lower() or "circ" in n.lower()})
    manifest["discovered_layers"] = discovered
    print("discovered basin-ish layers:", discovered)
except Exception as e:  # noqa: BLE001
    manifest["errors"].append(f"capabilities: {str(e)[:200]}")

layers = discovered + [l for l in CANDIDATE_LAYERS if l not in discovered]

gdf = None
used = None
for layer in layers:
    for ep in ENDPOINTS:
        url = wfs_url(ep, layer)
        try:
            g = read_geo(url)
            if g is None or g.empty:
                manifest["attempts"].append({"layer": layer, "endpoint": ep, "result": "empty"})
                continue
            g = g.to_crs(4326) if g.crs else g.set_crs(4326)
            g = g[g.geometry.type.isin(["Polygon", "MultiPolygon"])].copy()
            if g.empty:
                manifest["attempts"].append({"layer": layer, "endpoint": ep, "result": "no polygons"})
                continue
            gdf = g
            used = {"layer": layer, "endpoint": ep, "url": url, "features": len(g),
                    "columns": [c for c in g.columns if c != "geometry"]}
            manifest["attempts"].append({"layer": layer, "endpoint": ep, "result": f"ok, {len(g)} features"})
            print(f"loaded {len(g)} features from {layer} @ {ep}; columns: {used['columns']}")
            break
        except Exception as e:  # noqa: BLE001
            manifest["attempts"].append({"layer": layer, "endpoint": ep, "result": str(e)[:140]})
    if gdf is not None:
        break

if gdf is None:
    manifest["errors"].append("no basin layer could be read")
    (OUT / "bassins-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    raise SystemExit("no basin layer readable — see bassins-manifest.json")

manifest["source_layer"] = used

# Pick the column that names or codes the basin, preferring a short code.
name_col = None
for cand in ("CdCircAdminBassin", "CdBassinDCE", "CdEuBassinDCE", "code", "CODE", "LbCircAdminBassin", "NOM", "nom"):
    if cand in gdf.columns:
        name_col = cand
        break
if name_col is None:
    candidates = [c for c in gdf.columns if c != "geometry"]
    name_col = candidates[0] if candidates else None
if name_col is None:
    raise SystemExit("basin layer has no usable attribute column")
manifest["basin_column"] = name_col

label_col = next((c for c in ("LbCircAdminBassin", "LbBassinDCE", "NOM", "nom", "libelle") if c in gdf.columns), None)
manifest["label_column"] = label_col

try:
    gdf["geometry"] = gdf.geometry.apply(lambda g: make_valid(g) if g and not g.is_valid else g)
    communes = gpd.read_file(COMMUNES_URL).to_crs(4326)
    pts = gpd.GeoDataFrame(
        {"code": communes["code"]},
        geometry=communes.geometry.representative_point(),
        crs=4326,
    )
    joined = gpd.sjoin(pts, gdf[[name_col] + ([label_col] if label_col else []) + ["geometry"]],
                       predicate="within", how="inner")

    mapping: dict[str, str] = {}
    labels: dict[str, str] = {}
    for _, row in joined.iterrows():
        code = str(row["code"])
        basin = str(row[name_col])
        if code and basin and code not in mapping:
            mapping[code] = basin
            if label_col and row.get(label_col):
                labels.setdefault(basin, str(row[label_col]))

    from collections import Counter

    per_basin = Counter(mapping.values())
    payload = {
        "generated": manifest["generated"],
        "source": manifest["source"],
        "layer": used,
        "note": (
            "Code INSEE de commune → circonscription administrative de bassin, par jointure "
            "spatiale sur le point représentatif de la commune. L'absence d'un code signifie "
            "que la commune n'a pas pu être rattachée, pas qu'elle est hors bassin."
        ),
        "labels": labels,
        "count": len(mapping),
        "communes": mapping,
    }
    (OUT / "bassins-communes.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
    )
    manifest["communes"] = len(mapping)
    manifest["per_basin"] = dict(per_basin.most_common())
    manifest["bytes"] = (OUT / "bassins-communes.json").stat().st_size
    print(f"bassins: {len(mapping)} communes across {len(per_basin)} basins")
    print("per basin:", dict(per_basin.most_common()))
except Exception as e:  # noqa: BLE001
    manifest["errors"].append(f"join: {str(e)[:200]}")
    traceback.print_exc()

(OUT / "bassins-manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
)
print("errors:", manifest["errors"])

# The spatial join above records its failure into manifest["errors"] and lets the
# script exit 0, so the workflow committed a stale (or absent)
# bassins-communes.json under a green check. The join either produces a national
# mapping or it produced nothing usable — there is no meaningful middle, and
# 35 186 communes is the known reference (HANDBOOK, sprint 24).
if manifest["errors"] or manifest.get("communes", 0) < 30000:
    print(
        f"ÉCHEC: rattachement bassin incomplet "
        f"({manifest.get('communes', 0)} communes, erreurs={manifest['errors']})",
        file=sys.stderr,
    )
    sys.exit(1)

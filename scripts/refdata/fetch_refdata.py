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
DATAGOUV_QUERIES = [
    "zone de repartition des eaux",
    "zones de répartition des eaux ZRE",
    "ZRE répartition eaux",
]

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


try:
    MODE = json.loads((ROOT / "data" / "refdata-request.json").read_text(encoding="utf-8")).get("mode", "fetch")
except Exception:  # noqa: BLE001
    MODE = "fetch"


def classify(head: bytes) -> str:
    h = head.lstrip()
    if head[:2] == b"PK":
        return "zip"
    if h[:1] == b"<":
        return "html/xml"
    if h[:1] in (b"{", b"["):
        return "json"
    return "other"


def probe_url(url: str) -> dict:
    """Fetch just the first bytes of a URL and classify what it serves."""
    try:
        r = requests.get(url, headers=UA, timeout=60, stream=True, allow_redirects=True)
        head = next(r.iter_content(2048), b"") or b""
        final = r.url
        ct = (r.headers.get("content-type") or "").split(";")[0]
        status = r.status_code
        r.close()
        from urllib.parse import urlparse

        return {
            "url": url,
            "final_host": urlparse(final).netloc,
            "status": status,
            "content_type": ct,
            "kind": classify(head),
            "peek": head[:80].decode("latin-1", "replace"),
        }
    except Exception as e:  # noqa: BLE001
        return {"url": url, "error": str(e)[:160]}


def run_probe():
    """Systematically discover which ZRE sources actually serve geodata."""
    queries = [
        "zone de repartition des eaux",
        "ZRE",
        "zone repartition eaux Adour-Garonne",
        "zone repartition eaux Loire-Bretagne",
        "zone repartition eaux Seine-Normandie",
        "zone repartition eaux Rhin-Meuse",
        "zone repartition eaux Artois-Picardie",
        "zone repartition eaux Rhone-Mediterranee",
    ]
    resources = []
    seen = set()
    for q in queries:
        try:
            cat = get_json(
                "https://www.data.gouv.fr/api/1/datasets/?q=" + requests.utils.quote(q) + "&page_size=15"
            )
        except Exception as e:  # noqa: BLE001
            resources.append({"query": q, "error": str(e)[:120]})
            continue
        for ds in cat.get("data", []):
            title = (ds.get("title") or "")
            tl = title.lower()
            if "répartition" not in tl and "repartition" not in tl and "zre" not in tl:
                continue
            for res in ds.get("resources", []):
                url = res.get("url") or ""
                if not url or url in seen:
                    continue
                seen.add(url)
                fmt = (res.get("format") or "").lower()
                if fmt not in {"geojson", "json", "shp", "zip", "gml", "kml", "wfs", ""}:
                    continue
                p = probe_url(url)
                p["dataset"] = title
                p["format"] = fmt
                resources.append(p)

    # Candidate live WFS endpoints (report capabilities availability).
    wfs = [
        "https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities",
        "https://services.sandre.eaufrance.fr/geo/zon?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities",
        "https://services.sandre.eaufrance.fr/geo/sandre?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities",
    ]
    wfs_results = []
    for w in wfs:
        pr = probe_url(w)
        # If capabilities XML came back, note whether ZRE typenames appear.
        try:
            if pr.get("status") == 200 and "xml" in (pr.get("content_type") or "").lower():
                body = requests.get(w, headers=UA, timeout=90).text
                names = re.findall(r"<(?:wfs:)?Name>([^<]*)</(?:wfs:)?Name>", body)
                pr["zre_typenames"] = [n for n in names if "zre" in n.lower() or "repartition" in n.lower()][:20]
        except Exception as e:  # noqa: BLE001
            pr["wfs_error"] = str(e)[:120]
        wfs_results.append(pr)

    out = {
        "generated": manifest["generated"],
        "datagouv_resources": resources,
        "wfs": wfs_results,
    }
    (OUT / "probe.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"probe: {len(resources)} data.gouv resources, {len(wfs_results)} WFS endpoints → probe.json")


if MODE == "probe":
    import re  # noqa: WPS433

    run_probe()
    sys.exit(0)


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

    # Gather candidate resources across several queries. Accept any geo-ish
    # format, and prefer the data.gouv stable redirect (r/<id>) over the raw
    # resource URL, which often points at a now-dead INSPIRE host.
    seen: set[str] = set()
    candidates = []
    for q in DATAGOUV_QUERIES:
        try:
            catalog = get_json(
                "https://www.data.gouv.fr/api/1/datasets/?q="
                + requests.utils.quote(q)
                + "&page_size=20"
            )
        except Exception as e:  # noqa: BLE001
            manifest["errors"].append(f"zre search '{q}': {e}")
            continue
        for ds in catalog.get("data", []):
            title = (ds.get("title") or "").lower()
            if "répartition" not in title and "repartition" not in title and "zre" not in title:
                continue
            for res in ds.get("resources", []):
                fmt = (res.get("format") or "").lower()
                rid = res.get("id")
                raw_url = res.get("url") or ""
                if fmt not in {"geojson", "json", "gml", "shp", "zip", "kml", ""}:
                    continue
                # Two URLs to try, stable redirect first.
                for url in ([f"https://www.data.gouv.fr/fr/datasets/r/{rid}"] if rid else []) + [raw_url]:
                    if not url or url in seen:
                        continue
                    # Skip feed/catalogue endpoints — they aren't geo files.
                    if any(bad in url.lower() for bad in ("atomfeed", "/rss/", "atom")):
                        continue
                    seen.add(url)
                    candidates.append({"dataset": ds.get("title"), "url": url, "format": fmt})
    manifest["zre"]["candidates"] = candidates[:20]
    print(f"zre: {len(candidates)} candidate resource(s) across {len(DATAGOUV_QUERIES)} queries")

    def to_wgs84(g):
        """Reproject to WGS84, inferring a CRS for naive geometries (French
        data is usually Lambert-93 when projected, WGS84 when in lon/lat)."""
        if g.crs is None:
            minx, miny, maxx, maxy = g.total_bounds
            projected = abs(maxx) > 180 or abs(maxy) > 90
            g = g.set_crs(2154 if projected else 4326, allow_override=True)
        return g.to_crs(4326)

    import pandas as pd  # noqa: WPS433
    import tempfile  # noqa: WPS433
    from shapely.validation import make_valid  # noqa: WPS433

    def read_any(url: str):
        """Download bytes with requests (handles redirects reliably, unlike
        pyogrio's remote vsicurl), then read locally — zip shapefile or text.
        geopandas auto-detects a zipped shapefile from the .zip extension."""
        r = requests.get(url, headers=UA, timeout=180, allow_redirects=True)
        r.raise_for_status()
        content = r.content
        ct = (r.headers.get("content-type") or "").lower()
        head = content[:64].lstrip()
        if content[:2] == b"PK":  # zip archive (shapefile)
            p = Path(tempfile.mkdtemp()) / "z.zip"
            p.write_bytes(content)
            return gpd.read_file(str(p))  # .zip extension → geopandas reads the shapefile
        if head[:1] == b"<" or "html" in ct:
            raise RuntimeError("response is HTML/XML, not geodata")
        p = Path(tempfile.mkdtemp()) / "z.geojson"
        p.write_bytes(content)
        return gpd.read_file(str(p))

    # Load each dataset once (dedupe by title); keep only valid polygons.
    loaded = []
    used_sources = []
    seen_titles: set[str] = set()
    for c in candidates:
        title = c["dataset"]
        if title in seen_titles:
            continue
        try:
            g = read_any(c["url"])
            if g is None or g.empty or bool(g.geometry.is_empty.all()):
                continue
            g = to_wgs84(g)
            g = g[g.geometry.type.isin(["Polygon", "MultiPolygon"])].copy()
            if g.empty:
                continue
            g["geometry"] = g.geometry.apply(lambda geom: make_valid(geom) if geom and not geom.is_valid else geom)
            loaded.append(g[["geometry"]])
            used_sources.append({"dataset": title, "url": c["url"]})
            seen_titles.add(title)
            print(f"zre: loaded {len(g)} polygons from {title}")
        except Exception as e:  # noqa: BLE001
            manifest["errors"].append(f"zre read {c['url']}: {str(e)[:160]}")
    if not loaded:
        raise RuntimeError("no readable ZRE polygon resource found")

    zre_gdf = gpd.GeoDataFrame(pd.concat(loaded, ignore_index=True), crs=4326)
    b = zre_gdf.total_bounds
    manifest["zre"]["union_bounds"] = [round(float(x), 3) for x in b]
    print(f"zre: polygon bounds {manifest['zre']['union_bounds']}")

    communes = gpd.read_file(COMMUNES_URL).to_crs(4326)
    pts = gpd.GeoDataFrame(
        {"code": communes["code"]},
        geometry=communes.geometry.representative_point(),
        crs=4326,
    )
    # Spatial join: commune points that fall inside any ZRE polygon.
    joined = gpd.sjoin(pts, zre_gdf, predicate="within", how="inner")
    codes = sorted({str(c) for c in joined["code"].tolist() if c})

    payload = {
        "generated": manifest["generated"],
        "sources": used_sources,
        "note": (
            "Codes INSEE des communes dont le point représentatif tombe dans une "
            "Zone de Répartition des Eaux (ZRE). Jointure spatiale ZRE × communes. "
            "Couverture limitée aux couches ZRE lisibles au moment de l'extraction "
            "(voir sources) — l'absence d'un code ne garantit pas l'absence de ZRE."
        ),
        "count": len(codes),
        "codes": codes,
    }
    (OUT / "zre-communes.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
    )
    manifest["zre"].update({"sources": used_sources, "communes": len(codes)})
    print(f"zre: {len(codes)} communes in a ZRE from {len(used_sources)} source(s)")
except Exception as e:  # noqa: BLE001
    manifest["errors"].append(f"zre: {e}")
    traceback.print_exc()

(OUT / "manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
)
print("manifest:", json.dumps(manifest.get("errors", []), ensure_ascii=False))
# Never fail the run on ZRE errors — the department layer is the guaranteed win.
sys.exit(0)

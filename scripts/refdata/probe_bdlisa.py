#!/usr/bin/env python3
"""Probe BDLISA (référentiel hydrogéologique) for attaching a site to its aquifer.

The gap this would close: piezometers already carry `code_bdlisa`, but the
*site's* own aquifer is unknown, so stations are attached by distance alone — a
documented limitation, since a piezometer 15 km away in the right aquifer is
more representative than one 2 km away in a different one.

The blocker recorded so far was that BDLISA is a multi-layer referential with
nested entities at several depths, so "the aquifer at this point" needs an
explicit rule rather than a point join. The rule this probe tests: take the
**outcropping** entities (entités affleurantes) — those reaching the surface —
which is what a shallow borehole actually taps and what BRGM itself uses for
surface attribution.

Three questions:
  1. Which BDLISA layers does the Sandre WFS expose, and is one of them
     explicitly the outcropping level?
  2. Does a point/bbox query work, so the app can ask at request time rather
     than embedding a national polygon set of unknown size?
  3. Do the returned features carry a usable aquifer code to match against the
     piezometers' code_bdlisa?

Output: data/refdata/bdlisa-probe.json
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "refdata"
OUT.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "hydrovigie-bdlisa-probe/1.0 (github actions; water-risk-saas)"}
ENDPOINTS = ("sandre", "zon")

# Test points with known, different hydrogeology, so a layer that answers
# everywhere with the same code is visibly wrong.
TEST_POINTS = [
    ("Chartres (Beauce)", 1.4894, 48.4469),
    ("Montpellier", 3.8767, 43.6109),
    ("Lille", 3.0573, 50.6292),
    ("Bordeaux", -0.5792, 44.8378),
]

report: dict = {
    "generated": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    "layers": [],
    "point_queries": [],
    "errors": [],
}


def get(url: str, timeout: int = 180):
    return requests.get(url, headers=UA, timeout=timeout)


# --- 1. which BDLISA layers exist -------------------------------------------
try:
    caps = get(
        "https://services.sandre.eaufrance.fr/geo/sandre?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities"
    ).text
    names = re.findall(r"<(?:wfs:)?Name>([^<]*)</(?:wfs:)?Name>", caps)
    hits = sorted({n for n in names if re.search(r"bdlisa|hydrogeo|aquif|affleur", n, re.I)})
    report["layers"] = hits
    print("BDLISA-ish layers:", hits)
except Exception as e:  # noqa: BLE001
    report["errors"].append(f"capabilities: {repr(e)[:200]}")

# Prefer a layer whose name says it is the outcropping level.
ordered = sorted(
    report["layers"],
    key=lambda n: (0 if re.search(r"affleur", n, re.I) else 1, len(n)),
)
report["preferred_order"] = ordered[:12]

# --- 2 & 3. point query + attributes ----------------------------------------
for layer in ordered[:6]:
    for ep in ENDPOINTS:
        entry: dict = {"layer": layer, "endpoint": ep, "points": []}
        ok_any = False
        for label, lon, lat in TEST_POINTS:
            # A tiny bbox around the point stands in for a true intersects
            # filter, which WFS 2.0 spells inconsistently across servers.
            d = 0.01
            url = (
                f"https://services.sandre.eaufrance.fr/geo/{ep}?SERVICE=WFS&VERSION=2.0.0"
                f"&REQUEST=GetFeature&TYPENAMES={requests.utils.quote(layer)}"
                f"&OUTPUTFORMAT=geojson&SRSNAME=EPSG:4326&COUNT=5"
                f"&BBOX={lat - d},{lon - d},{lat + d},{lon + d},EPSG:4326"
            )
            try:
                r = get(url, timeout=120)
                body = r.content
                if body.lstrip()[:1] == b"<":
                    entry["points"].append({"point": label, "result": f"HTML/XML ({r.status_code})",
                                            "peek": body[:120].decode("latin-1", "replace")})
                    continue
                data = json.loads(body.decode("utf-8", "replace"))
                feats = data.get("features", [])
                props = feats[0].get("properties", {}) if feats else {}
                codes = [
                    f.get("properties", {}).get(k)
                    for f in feats
                    for k in props
                    if re.search(r"^cd|code", k, re.I)
                ][:4]
                entry["points"].append({
                    "point": label,
                    "features": len(feats),
                    "property_keys": list(props.keys())[:20] if feats else [],
                    "sample_codes": codes,
                })
                if feats:
                    ok_any = True
            except Exception as e:  # noqa: BLE001
                entry["points"].append({"point": label, "result": repr(e)[:140]})
        entry["usable"] = ok_any
        report["point_queries"].append(entry)
        print(f"{layer} @ {ep}: usable={ok_any}")
        if ok_any:
            break
    if any(q["layer"] == layer and q["usable"] for q in report["point_queries"]):
        break

usable = [q for q in report["point_queries"] if q.get("usable")]
report["verdict"] = (
    f"POINT QUERY WORKS on {usable[0]['layer']}" if usable
    else "NO LAYER ANSWERED A POINT QUERY"
)

(OUT / "bdlisa-probe.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=1, default=str) + "\n", encoding="utf-8"
)
print("verdict:", report["verdict"])
print("errors :", report["errors"])

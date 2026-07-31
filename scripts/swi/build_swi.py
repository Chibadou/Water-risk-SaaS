#!/usr/bin/env python3
"""Build the SWI (soil wetness index) climatology, on a GitHub runner.

The SWI is the fastest of the drought precursors: soil dries out weeks before
groundwater does, so it fills the gap between the piezometric index (slow,
already used) and the current restriction status.

What ships and what does not, and why:

  * The **climatology** — per SAFRAN cell, per calendar month, the historical
    distribution of the index over 1990-2019 — is stable by construction and is
    embedded in the repo.
  * The **current** month is deliberately NOT embedded. It changes monthly, and
    a snapshot would silently go stale, which is the trap already identified for
    the MétéEAU forecast. It is fetched at request time from the live decade
    file and cached, exactly as the arrêtés CSV already is.

Outputs:
  data/swi/cells.json          — cell number → WGS84 lat/lon (nearest-cell lookup)
  data/swi/clim/<bucket>.json  — cell → month → [min, q25, q50, q75, max]
  data/swi/meta.json           — provenance, coverage, validation results

Coordinate handling is the risk here. The dataset's documentation stub mentions
"Lambert 2 étendu, hectomètres", but the observed values (X≈641374,
Y≈7106309) only fit Lambert-93 in metres. Rather than trust either, the script
tries candidate CRSs and keeps the one whose converted points land inside
France — and fails loudly if none do.

Run in Actions with: pip install requests pyproj
"""

from __future__ import annotations

import csv
import gzip
import io
import json
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import requests
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "swi"
CLIM = OUT / "clim"
OUT.mkdir(parents=True, exist_ok=True)
CLIM.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "hydrovigie-swi/1.0 (github actions; water-risk-saas)"}
DATASET = "https://www.data.gouv.fr/api/1/datasets/donnees-mensuelles-dindice-dhumidite-des-sols-pour-le-dispositif-catnat/"

# Reference period for the climatology. Ends in 2019 so the embedded
# distribution is a fixed baseline rather than one that drifts as new years
# arrive — the current month is always compared against the same yardstick.
CLIM_FROM, CLIM_TO = 1990, 2019
BUCKETS = 40

# Metropolitan France, generously bounded. Used to validate the CRS choice.
FR_BBOX = (-5.5, 41.0, 10.0, 51.5)

meta: dict = {
    "generated": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    "source": (
        "Météo-France — « Données mensuelles d'indice d'humidité des sols pour le dispositif "
        "CatNat » (data.gouv.fr, Licence Ouverte). Indice SWI_UNIF_MENS, maille SAFRAN 8×8 km."
    ),
    "climatology_period": f"{CLIM_FROM}-{CLIM_TO}",
    "errors": [],
}


def fetch(url: str) -> bytes:
    r = requests.get(url, headers=UA, timeout=600)
    r.raise_for_status()
    data = r.content
    if data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)
    if data.lstrip()[:1] == b"<":
        raise ValueError("got HTML instead of the data file")
    return data


def read_rows(data: bytes):
    text = data.decode("utf-8", "replace")
    lines = [l for l in text.splitlines() if l and not l.startswith("#")]
    body = "\n".join(lines)
    delim = max([";", ",", "\t"], key=lambda d: body[:8192].count(d))
    return csv.DictReader(io.StringIO(body), delimiter=delim)


# --- discover the decade files ----------------------------------------------
ds = requests.get(DATASET, headers=UA, timeout=120).json()
files: dict[str, str] = {}
for r in ds.get("resources", []):
    title = (r.get("title") or "").strip()
    if title.startswith("swi.") and r.get("url"):
        files[title] = r["url"]
if not files:
    raise SystemExit("no swi.* resources found")
meta["files"] = sorted(files)
print("files:", sorted(files))

# --- pass 1: climatology over the reference period ---------------------------
# cell -> month(1-12) -> list of monthly SWI values
samples: dict[int, dict[int, list[float]]] = defaultdict(lambda: defaultdict(list))
coords: dict[int, tuple[float, float]] = {}

for title in sorted(files):
    # File names are swi.<YYYYMM>-<YYYYMM>.csv
    try:
        span = title.split(".")[1]
        start_year = int(span.split("-")[0][:4])
        end_year = int(span.split("-")[1][:4])
    except Exception:  # noqa: BLE001
        continue
    if end_year < CLIM_FROM or start_year > CLIM_TO:
        continue
    print(f"climatology ← {title}")
    for row in read_rows(fetch(files[title])):
        try:
            n = int(row["NUMERO"])
            date = row["DATE"]
            year, month = int(date[:4]), int(date[4:6])
            if not (CLIM_FROM <= year <= CLIM_TO):
                continue
            v = float(row["SWI_UNIF_MENS"])
        except (KeyError, ValueError, TypeError):
            continue
        samples[n][month].append(v)
        if n not in coords:
            try:
                coords[n] = (float(row["LAMBX"]), float(row["LAMBY"]))
            except (KeyError, ValueError, TypeError):
                pass

meta["cells_seen"] = len(samples)
print(f"cells: {len(samples)}, with coords: {len(coords)}")

# --- resolve the coordinate system by validation, not by trusting the doc ----
CANDIDATES = [
    ("EPSG:2154", 1.0, "Lambert-93, metres"),
    ("EPSG:27572", 1.0, "Lambert II étendu, metres"),
    ("EPSG:27572", 100.0, "Lambert II étendu, hectometres"),
    ("EPSG:2154", 100.0, "Lambert-93, hectometres"),
]
chosen = None
sample_cells = list(coords.items())[:400]
for epsg, scale, label in CANDIDATES:
    try:
        tr = Transformer.from_crs(epsg, "EPSG:4326", always_xy=True)
    except Exception:  # noqa: BLE001
        continue
    inside = 0
    for _, (x, y) in sample_cells:
        lon, lat = tr.transform(x * scale, y * scale)
        if FR_BBOX[0] <= lon <= FR_BBOX[2] and FR_BBOX[1] <= lat <= FR_BBOX[3]:
            inside += 1
    share = inside / max(1, len(sample_cells))
    meta.setdefault("crs_candidates", []).append({"epsg": epsg, "scale": scale, "label": label, "inside_france": round(share, 3)})
    print(f"  crs {label:34s} → {share:.1%} inside France")
    if share > 0.95 and chosen is None:
        chosen = (epsg, scale, label)

if not chosen:
    raise SystemExit("no candidate CRS places the cells inside France — refusing to guess")
meta["crs"] = {"epsg": chosen[0], "scale": chosen[1], "label": chosen[2]}
print("crs chosen:", chosen[2])

tr = Transformer.from_crs(chosen[0], "EPSG:4326", always_xy=True)
cells = []
for n, (x, y) in sorted(coords.items()):
    lon, lat = tr.transform(x * chosen[1], y * chosen[1])
    cells.append({"n": n, "lat": round(lat, 4), "lon": round(lon, 4)})
(OUT / "cells.json").write_text(
    json.dumps(cells, separators=(",", ":")) + "\n", encoding="utf-8"
)
meta["cells"] = len(cells)

# --- emit the per-cell monthly distribution ---------------------------------
def quantiles(vals: list[float]) -> list[float] | None:
    if len(vals) < 10:
        return None
    v = sorted(vals)

    def q(p: float) -> float:
        i = min(len(v) - 1, max(0, int(round(p * (len(v) - 1)))))
        return v[i]

    return [round(x, 3) for x in (v[0], q(0.25), statistics.median(v), q(0.75), v[-1])]


buckets: dict[int, dict[str, dict[str, list[float]]]] = defaultdict(dict)
kept = 0
for n, months in samples.items():
    entry: dict[str, list[float]] = {}
    for m, vals in months.items():
        qs = quantiles(vals)
        if qs:
            entry[str(m)] = qs
    if entry:
        buckets[n % BUCKETS][str(n)] = entry
        kept += 1

for b, payload in buckets.items():
    (CLIM / f"{b}.json").write_text(
        json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8"
    )

sizes = [p.stat().st_size for p in CLIM.glob("*.json")]
meta["climatology"] = {
    "cells": kept,
    "buckets": BUCKETS,
    "total_bytes": sum(sizes),
    "largest_bucket_bytes": max(sizes) if sizes else 0,
}
meta["cells_bytes"] = (OUT / "cells.json").stat().st_size

# The live file the runtime fetches; recorded so the app does not hardcode a
# resource id that may rotate.
current = sorted(files)[-1]
meta["current_file"] = {"title": current, "url": files[current]}

(OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print("crs:", meta["crs"])
print("cells.json:", meta["cells_bytes"], "bytes |", meta["cells"], "cells")
print("climatology:", meta["climatology"])
print("current file:", current)

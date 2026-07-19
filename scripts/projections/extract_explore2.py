#!/usr/bin/env python3
"""Extract Explore2 / DRIAS-Eau hydrological projections into the compact JSON
consumed by the app (data/projections.json).

Two modes:

  --demo
      Generates a SYNTHETIC dataset (no dependency beyond stdlib): a coarse
      grid over metropolitan France with plausible regional gradients based on
      published national orders of magnitude (low-flow declines of roughly
      -15 % at +2.7 °C to -40 % in the Southwest under RCP 8.5). The output is
      flagged "demo": true and the UI displays a prominent watermark. Never
      present these numbers as real projections.

  --input DIR
      Real extraction (requires xarray + pandas). Reads Explore2 "indicateurs
      débit" files (NetCDF/CSV downloaded from the Explore2 collection on
      data.gouv.fr / DRIAS-Eau) and produces per-simulation-point deltas vs the
      1976-2005 reference: median and Q10/Q90 across the multi-model ensemble
      (GCM/RCM × hydrological model), for the scenarios mapped below.

      ⚠️ VERIFY before first real run (file conventions could not be checked
      from the development sandbox):
        - variable names for the indicators (expected: QA / module, QMNA5,
          VCN10; groundwater recharge comes from the "souterrain" volume),
        - the dimension holding ensemble members,
        - the reference-period variable or companion file,
        - point ids and coordinates (expected: code point de simulation +
          lambert93 or WGS84 coords).
      The __main__ block marks each assumption with # VERIFY.

Output schema (data/projections.json):
{
  "meta": {"demo": bool, "generated": iso8601, "source": str,
            "reference": "1976-2005", "horizon": "2041-2070 (milieu de siècle)"},
  "points": [
    {"id": str, "lat": float, "lon": float,
     "scenarios": {
       "tracc27": {"module": {"median": -8, "q10": -18, "q90": 2}, "qmna5": …,
                    "vcn10": …, "recharge": …},
       "rcp85":   {…}
     }}
  ]
}
Deltas are percentages vs the 1976-2005 reference (negative = less water).
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

INDICATORS = ["module", "qmna5", "vcn10", "recharge"]
SCENARIOS = ["tracc27", "rcp85"]  # TRACC +2.7°C ≈ 2050 reference; RCP 8.5 stress test


# ---------------------------------------------------------------------------
# Demo mode — synthetic, clearly-flagged data
# ---------------------------------------------------------------------------

def in_france(lat: float, lon: float) -> bool:
    """Crude metropolitan-France mask built from bounding boxes (demo only)."""
    boxes = [
        (42.5, 46.0, -1.5, 7.5),   # south
        (46.0, 49.5, -4.5, 7.8),   # centre-west to east
        (49.5, 51.0, 0.0, 4.2),    # north
        (41.5, 43.0, 8.5, 9.6),    # Corsica
    ]
    return any(la0 <= lat <= la1 and lo0 <= lon <= lo1 for la0, la1, lo0, lo1 in boxes)


def demo_delta(lat: float, lon: float, indicator: str, scenario: str) -> dict:
    """Plausible regional gradient: worse in the Southwest / Mediterranean arc,
    milder in the North; RCP 8.5 amplifies. Deterministic (no RNG) so the file
    is reproducible."""
    # 0 (north) → 1 (deep south-west)
    south = max(0.0, min(1.0, (47.5 - lat) / 5.5))
    west = max(0.0, min(1.0, (4.0 - lon) / 6.0))
    med = max(0.0, min(1.0, (lon - 2.0) / 4.0)) * max(0.0, min(1.0, (45.5 - lat) / 3.0))
    stress = min(1.0, 0.55 * south * (0.5 + 0.5 * west) + 0.75 * med + 0.15)

    base = {"module": -14.0, "qmna5": -26.0, "vcn10": -24.0, "recharge": -18.0}[indicator]
    ampl = 1.0 if scenario == "tracc27" else 1.55
    # deterministic wiggle so neighbouring points differ slightly
    wiggle = 3.0 * math.sin(lat * 2.1) * math.cos(lon * 1.7)
    median = base * stress * ampl + wiggle
    spread = 8.0 + 10.0 * stress
    return {
        "median": round(median, 1),
        "q10": round(median - spread, 1),
        "q90": round(min(median + spread, 8.0), 1),
    }


def build_demo() -> dict:
    points = []
    i = 0
    lat = 41.5
    while lat <= 51.0:
        lon = -4.5
        while lon <= 9.5:
            if in_france(lat, lon):
                i += 1
                points.append({
                    "id": f"DEMO_{i:03d}",
                    "lat": round(lat, 2),
                    "lon": round(lon, 2),
                    "scenarios": {
                        sc: {ind: demo_delta(lat, lon, ind, sc) for ind in INDICATORS}
                        for sc in SCENARIOS
                    },
                })
            lon += 1.1
        lat += 0.9
    return {
        "meta": {
            "demo": True,
            "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "source": "SYNTHÉTIQUE — gradients régionaux plausibles, PAS des données Explore2",
            "reference": "1976-2005",
            "horizon": "2041-2070 (milieu de siècle)",
        },
        "points": points,
    }


# ---------------------------------------------------------------------------
# Real mode — Explore2 extraction (skeleton, requires xarray/pandas)
# ---------------------------------------------------------------------------

def build_real(input_dir: Path) -> dict:
    try:
        import numpy as np  # noqa: F401
        import xarray as xr  # noqa: F401
    except ImportError:
        sys.exit("Real mode requires xarray + numpy: pip install xarray netcdf4 numpy pandas")

    # VERIFY: adapt the glob patterns to the actual Explore2 delivery layout.
    files = sorted(input_dir.glob("**/*.nc"))
    if not files:
        sys.exit(f"No NetCDF files under {input_dir}")

    # VERIFY: mapping from our scenario keys to Explore2 experiment labels.
    #   tracc27 → the TRACC +2.7°C selection (or rcp45/rcp85 subset at H2
    #             following the DRIAS-Eau TRACC correspondence tables)
    #   rcp85   → rcp85 at horizon H2 (2041-2070)
    # VERIFY: indicator variable names, e.g. {"module": "QA", "qmna5": "QMNA5",
    #         "vcn10": "VCN10"}; recharge lives in the groundwater volume.
    # Expected processing per point and scenario:
    #   1. open the ensemble (dimension "member" or one file per GCM/RCM×HM),
    #   2. delta% = 100 * (indic(H2) - indic(REF 1976-2005)) / indic(REF),
    #   3. median / quantile(0.10) / quantile(0.90) across members,
    #   4. keep point id + WGS84 coords (convert from Lambert-93 if needed).
    raise NotImplementedError(
        "Fill in the VERIFY items against the downloaded Explore2 files, "
        "then emit the same schema as build_demo()."
    )


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--demo", action="store_true", help="generate the synthetic demo dataset")
    mode.add_argument("--input", type=Path, help="directory of Explore2 NetCDF/CSV files")
    ap.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[2] / "data" / "projections.json")
    args = ap.parse_args()

    data = build_demo() if args.demo else build_real(args.input)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(data['points'])} points → {args.output} (demo={data['meta']['demo']})")


if __name__ == "__main__":
    main()

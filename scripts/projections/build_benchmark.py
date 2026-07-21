#!/usr/bin/env python3
"""Build the projection benchmark distribution consumed by the app.

Reads the already-extracted Explore2 shards (data/projections/communes/*.json)
and computes, for the reference warming level (+2.7 °C, the 2050 trajectory) and
the summer low-flow indicator (VCN10_ete, median q50), the distribution of the
projected change across:
  - all of France (national)
  - each department (shard prefix)

For each scope it stores 101 percentile breakpoints (value at p0..p100) plus the
sample size, so the app can place a given commune's projected decline as a
percentile rank without shipping every commune value.

Output: data/projections/benchmark.json

Stdlib only — reads local files, no network. Run from the repo root:
  python3 scripts/projections/build_benchmark.py
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMMUNES_DIR = ROOT / "data" / "projections" / "communes"
OUT = ROOT / "data" / "projections" / "benchmark.json"

LEVEL = "+2.7°C France"
INDICATOR = "VCN10_ete"
MEDIAN_INDEX = 1  # [lo=q05, median=q50, hi=q95]


def percentile_breaks(values: list[float]) -> list[float]:
    """101 ascending breakpoints: value at percentiles 0..100 (linear interp)."""
    s = sorted(values)
    n = len(s)
    if n == 1:
        return [round(s[0], 2)] * 101
    out = []
    for p in range(101):
        # position on 0..n-1 for percentile p
        pos = (p / 100) * (n - 1)
        lo = int(pos)
        hi = min(lo + 1, n - 1)
        frac = pos - lo
        out.append(round(s[lo] + (s[hi] - s[lo]) * frac, 2))
    return out


def collect() -> dict[str, list[float]]:
    """dept prefix -> list of median VCN10 values (national under key '_')."""
    buckets: dict[str, list[float]] = {"_": []}
    for shard in sorted(COMMUNES_DIR.glob("*.json")):
        dept = shard.stem  # "01", "2A", "971", …
        data = json.loads(shard.read_text(encoding="utf-8"))
        vals: list[float] = []
        for rec in data.values():
            triple = rec.get(LEVEL, {}).get(INDICATOR)
            if not triple:
                continue
            median = triple[MEDIAN_INDEX]
            if median is None:
                continue
            vals.append(float(median))
        if vals:
            buckets[dept] = vals
            buckets["_"].extend(vals)
    return buckets


def main() -> None:
    buckets = collect()
    national = buckets.pop("_")
    if not national:
        raise SystemExit("no VCN10 medians found — nothing to benchmark")

    out = {
        "indicator": INDICATOR,
        "level": LEVEL,
        "stat": "median (q50)",
        "note": (
            "Distribution du changement projeté d'étiage estival (VCN10, médiane "
            "multi-modèles) par commune, à la trajectoire de référence +2,7 °C. "
            "Valeur plus négative = déclin plus sévère."
        ),
        "generated": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "national": {"n": len(national), "q": percentile_breaks(national)},
        "departments": {
            dept: {"n": len(vals), "q": percentile_breaks(vals)}
            for dept, vals in sorted(buckets.items())
        },
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"benchmark: national n={len(national)}, {len(buckets)} departments → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

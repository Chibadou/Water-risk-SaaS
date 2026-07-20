#!/usr/bin/env bash
# Probes the production deployment and the upstream open-data sources from a
# GitHub runner (the dev sandbox has no egress to those hosts) and writes the
# results under data/diag/ so the dev session can analyze them after the
# workflow commits them back to the branch.
set -uo pipefail

BASE="${DIAG_BASE_URL:-https://water-risk-saa-s.vercel.app}"
OUT="data/diag"
mkdir -p "$OUT"
rm -f "$OUT"/*

# --- App endpoints -----------------------------------------------------------

probe() { # <name> <url> — saves status/headers, pretty JSON or text head
  local name="$1" url="$2"
  echo "== $name: $url"
  curl -sS -m 120 -D "$OUT/$name.headers.txt" -o "$OUT/$name.body" \
    -w "status=%{http_code} time=%{time_total}s size=%{size_download}\n" \
    "$url" > "$OUT/$name.meta.txt" 2>&1 || echo "curl-failed" >> "$OUT/$name.meta.txt"
  if [ -f "$OUT/$name.body" ]; then
    if jq . "$OUT/$name.body" > "$OUT/$name.json" 2>/dev/null; then
      :
    else
      head -c 3000 "$OUT/$name.body" > "$OUT/$name.head.txt"
    fi
    rm -f "$OUT/$name.body"
  fi
}

probe history "$BASE/api/history?zones=test&debug=1"
probe zones "$BASE/api/zones?lat=45.7578&lon=4.8320&profil=entreprise"
probe projection "$BASE/api/projection?citycode=69123"

# Which code is deployed on prod? The shell badge says "Démo — Sprint N".
curl -sS -m 60 -o /tmp/home.html "$BASE/" 2>> "$OUT/home.meta.txt" || true
{ grep -oE "Sprint [0-9.]+" /tmp/home.html | head -n 3; echo "---"; \
  grep -oE "/_next/static/[a-zA-Z0-9]+" /tmp/home.html | head -n 1; } \
  > "$OUT/home.sprint.txt" 2>/dev/null || true

# PMTiles proxy: must honor Range requests (MapLibre sends them).
curl -sS -m 120 -r 0-16383 -D "$OUT/pmtiles.headers.txt" -o /tmp/pm.bin \
  -w "status=%{http_code} size=%{size_download}\n" "$BASE/api/pmtiles" \
  > "$OUT/pmtiles.meta.txt" 2>&1 || true
xxd /tmp/pm.bin | head -n 8 > "$OUT/pmtiles.hex.txt" 2>/dev/null || true
# Second range slice: a broken proxy often serves offset 0 for every range.
curl -sS -m 120 -r 16384-32767 -o /tmp/pm2.bin \
  -w "status=%{http_code} size=%{size_download}\n" "$BASE/api/pmtiles" \
  > "$OUT/pmtiles.range2.meta.txt" 2>&1 || true
xxd /tmp/pm2.bin | head -n 4 > "$OUT/pmtiles.range2.hex.txt" 2>/dev/null || true

# --- Upstream sources, fetched directly from the runner ----------------------

# The dataset listing that lib/history.ts discovery relies on.
curl -sSL -m 120 -o /tmp/dataset.json \
  "https://www.data.gouv.fr/api/1/datasets/donnee-secheresse-vigieau/" 2>> "$OUT/dataset.meta.txt" || true
jq '{resource_count: (.resources | length), resources: [.resources[] | {title, format, filesize, url, latest, last_modified}]}' \
  /tmp/dataset.json > "$OUT/dataset.resources.json" 2>/dev/null || true

# Arrêtés CSV (~830 KB): keep the whole file for local parser testing.
curl -sSL -m 300 -D "$OUT/arretes.headers.txt" -o "$OUT/arretes.csv" \
  -w "status=%{http_code} size=%{size_download} url=%{url_effective}\n" \
  "https://www.data.gouv.fr/api/1/datasets/r/0732e970-c12c-4e6a-adca-5ac9dbc3fdfa" \
  > "$OUT/arretes.meta.txt" 2>&1 || true
head -n 3 "$OUT/arretes.csv" > "$OUT/arretes.head.txt" 2>/dev/null || true

# Restrictions CSV (10-15 MB): header + first rows only.
curl -sSL -m 300 -D "$OUT/restrictions.headers.txt" -o /tmp/restrictions.csv \
  -w "status=%{http_code} size=%{size_download} url=%{url_effective}\n" \
  "https://www.data.gouv.fr/api/1/datasets/r/f425cfa6-ccd1-438e-bb03-9d90ab527851" \
  > "$OUT/restrictions.meta.txt" 2>&1 || true
head -c 200000 /tmp/restrictions.csv > "$OUT/restrictions.head.csv" 2>/dev/null || true

echo "Diagnostics written to $OUT:"
ls -la "$OUT"

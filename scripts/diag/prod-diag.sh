#!/usr/bin/env bash
# Diagnostics runner executed by .github/workflows/prod-diag.yml on a GitHub
# runner (full network access, unlike the development sandbox). Results are
# written under data/diag/ and committed back to the branch.
#
# Modes (data/diag-request.json "mode"):
#   prod — probe the deployed app + upstream open-data sources.
#   app  — build & start the app ON the runner and probe localhost: verifies
#          /api/history, /api/pmtiles (Range), /api/zones, /api/projection
#          against the real upstream hosts without needing a deployment.
set -uo pipefail

REQ_BASE=$(jq -r '.base // empty' data/diag-request.json 2>/dev/null || true)
BASE="${DIAG_BASE_URL:-${REQ_BASE:-https://water-risk-saa-s.vercel.app}}"
OUT="data/diag"
MODE=$(jq -r '.mode // "prod"' data/diag-request.json 2>/dev/null || echo "prod")
mkdir -p "$OUT"
rm -f "$OUT"/*

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

probe_pmtiles() { # <prefix> <base-url> — two Range slices + hashes
  local prefix="$1" base="$2"
  curl -sS -m 120 -r 0-16383 -D "$OUT/$prefix.headers.txt" -o /tmp/pm1.bin \
    -w "status=%{http_code} size=%{size_download}\n" "$base/api/pmtiles" \
    > "$OUT/$prefix.meta.txt" 2>&1 || true
  xxd /tmp/pm1.bin 2>/dev/null | head -n 4 > "$OUT/$prefix.hex.txt" || true
  curl -sS -m 120 -r 16384-32767 -o /tmp/pm2.bin \
    -w "status=%{http_code} size=%{size_download}\n" "$base/api/pmtiles" \
    > "$OUT/$prefix.range2.meta.txt" 2>&1 || true
  # A broken proxy serves identical bytes for different ranges.
  { md5sum /tmp/pm1.bin /tmp/pm2.bin 2>/dev/null || true; } > "$OUT/$prefix.slice-hashes.txt"
}

if [ "$MODE" = "hubeau" ]; then
  # ---- Raw Hub'Eau responses to diagnose station resolution ----
  H="https://hubeau.eaufrance.fr/api"
  d60=$(date -u -d '60 days ago' +%F 2>/dev/null || date -u -v-60d +%F)
  d20y=$(date -u -d '20 years ago' +%F 2>/dev/null || date -u -v-20y +%F)

  # 1. Hydro stations near Orléans — do they carry code_site?
  curl -sS -m 60 "$H/v2/hydrometrie/referentiel/stations?bbox=1.4,47.5,2.4,48.3&size=10&fields=code_station,code_site,libelle_station,longitude_station,latitude_station,en_service" \
    -o "$OUT/hb_hydro_stations.json" 2>&1 || true
  SITE=$(jq -r '[.data[]? | .code_site] | map(select(.!=null)) | .[0] // empty' "$OUT/hb_hydro_stations.json" 2>/dev/null)
  STN=$(jq -r '[.data[]? | .code_station] | map(select(.!=null)) | .[0] // empty' "$OUT/hb_hydro_stations.json" 2>/dev/null)
  echo "first code_site=$SITE code_station=$STN" > "$OUT/hb_hydro_codes.txt"
  # 2. obs_elab QmJ keyed by SITE vs STATION — which returns data, how fresh?
  curl -sS -m 60 "$H/v2/hydrometrie/obs_elab?code_entite=${SITE}&grandeur_hydro_elab=QmJ&date_debut_obs_elab=${d60}&size=20&sort=desc&fields=date_obs_elab,resultat_obs_elab" \
    -o "$OUT/hb_obs_by_site.json" 2>&1 || true
  curl -sS -m 60 "$H/v2/hydrometrie/obs_elab?code_entite=${STN}&grandeur_hydro_elab=QmJ&date_debut_obs_elab=${d60}&size=20&sort=desc&fields=date_obs_elab,resultat_obs_elab" \
    -o "$OUT/hb_obs_by_station.json" 2>&1 || true
  jq '{count, first3: [.data[0,1,2] | select(.!=null)]}' "$OUT/hb_obs_by_site.json" > "$OUT/hb_obs_by_site.summary.json" 2>/dev/null || true
  jq '{count, first3: [.data[0,1,2] | select(.!=null)]}' "$OUT/hb_obs_by_station.json" > "$OUT/hb_obs_by_station.summary.json" 2>/dev/null || true

  # 3. Piezo stations near Strasbourg — full fields (date_fin_mesure? codes_bdlisa?)
  curl -sS -m 60 "$H/v1/niveaux_nappes/stations?bbox=7.2,48.2,8.3,49.0&size=10&format=json" \
    -o "$OUT/hb_piezo_stations.json" 2>&1 || true
  jq '{count: (.data|length), keys: (.data[0]|keys), sample: {code_bss: .data[0].code_bss, bss_id: .data[0].bss_id, date_fin_mesure: .data[0].date_fin_mesure, codes_bdlisa: .data[0].codes_bdlisa}}' \
    "$OUT/hb_piezo_stations.json" > "$OUT/hb_piezo_stations.summary.json" 2>/dev/null || true
  BSS=$(jq -r '[.data[]? | .code_bss] | map(select(.!=null)) | .[0] // empty' "$OUT/hb_piezo_stations.json" 2>/dev/null)
  echo "first code_bss=$BSS" > "$OUT/hb_piezo_code.txt"
  # 4. chroniques history for that BSS — how many years?
  curl -sS -m 90 "$H/v1/niveaux_nappes/chroniques?code_bss=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$BSS")&date_debut_mesure=${d20y}&size=20000&sort=asc&fields=date_mesure,niveau_nappe_eau,profondeur_nappe" \
    -o "$OUT/hb_chroniques.json" 2>&1 || true
  jq '{count: (.data|length), first: .data[0], last: .data[-1]}' "$OUT/hb_chroniques.json" > "$OUT/hb_chroniques.summary.json" 2>/dev/null || true
  rm -f "$OUT/hb_chroniques.json" "$OUT/hb_hydro_stations.json" "$OUT/hb_piezo_stations.json" "$OUT/hb_obs_by_site.json" "$OUT/hb_obs_by_station.json"
  echo "hubeau diag written:"; ls -la "$OUT"
elif [ "$MODE" = "app" ]; then
  # ---- Build & run the app on the runner, probe localhost ----
  export NEXT_TELEMETRY_DISABLED=1
  npm ci --no-audit --no-fund > "$OUT/app_install.log" 2>&1 || { tail -40 "$OUT/app_install.log"; exit 1; }
  npm run build > "$OUT/app_build.log" 2>&1 || { tail -60 "$OUT/app_build.log"; exit 1; }
  tail -5 "$OUT/app_build.log" || true
  npx next start -p 3300 > "$OUT/app_server.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 60); do
    curl -sf -m 2 -o /dev/null http://localhost:3300/ && break
    sleep 1
  done

  L="http://localhost:3300"
  probe app_home "$L/"
  probe app_zones "$L/api/zones?lat=45.7578&lon=4.8320&profil=entreprise"
  CODES=$(jq -r '[.zones[]? | (.code // (.id|tostring))] | join(",")' "$OUT/app_zones.json" 2>/dev/null || true)
  probe app_history "$L/api/history?zones=${CODES:-test}&debug=1"
  probe app_projection_code "$L/api/projection?citycode=69123"
  probe app_projection_latlon "$L/api/projection?lat=45.7578&lon=4.8320"
  # Orléans: Loire (long QmJ record) + Beauce aquifer (long-record piezometers).
  probe app_hydro "$L/api/hydro?lat=47.9020&lon=1.9090"
  probe app_piezo "$L/api/piezo?lat=47.9020&lon=1.9090"
  # Strasbourg: Rhine alluvial aquifer — second chance for a piezo with history.
  probe app_piezo2 "$L/api/piezo?lat=48.5830&lon=7.7450"
  # Onde is seasonal — probe a southern site likely to have summer campaigns.
  probe app_onde "$L/api/onde?lat=43.6047&lon=1.4442"
  probe_pmtiles app_pmtiles "$L"

  kill "$SERVER_PID" 2>/dev/null || true
  # Build artifacts must not be committed back.
  rm -rf .next node_modules
else
  # ---- Probe the deployed app ----
  probe root "$BASE/"
  # Local-only: these account routes must be gone (expect 404).
  probe gone_compte "$BASE/compte"
  probe gone_connexion "$BASE/connexion"
  probe gone_apiv1 "$BASE/api/v1/sites"
  probe history "$BASE/api/history?zones=test&debug=1"
  probe zones "$BASE/api/zones?lat=45.7578&lon=4.8320&profil=entreprise"
  probe projection "$BASE/api/projection?citycode=69123"
  curl -sS -m 60 -o /tmp/home.html "$BASE/" 2>> "$OUT/home.meta.txt" || true
  { grep -oE "Sprint [0-9.]+" /tmp/home.html | head -n 3; echo "---"; } \
    > "$OUT/home.sprint.txt" 2>/dev/null || true
  probe_pmtiles pmtiles "$BASE"

  # ---- Upstream sources, fetched directly from the runner ----
  curl -sSL -m 120 -o /tmp/dataset.json \
    "https://www.data.gouv.fr/api/1/datasets/donnee-secheresse-vigieau/" 2>> "$OUT/dataset.meta.txt" || true
  jq '{resource_count: (.resources | length), resources: [.resources[] | {title, format, filesize, url, latest, last_modified}]}' \
    /tmp/dataset.json > "$OUT/dataset.resources.json" 2>/dev/null || true

  # Arrêtés Cadre CSV (~830 KB, negative fixture for the parser: no gravity).
  curl -sSL -m 300 -D "$OUT/arretes.headers.txt" -o "$OUT/arretes.csv" \
    -w "status=%{http_code} size=%{size_download} url=%{url_effective}\n" \
    "https://www.data.gouv.fr/api/1/datasets/r/0732e970-c12c-4e6a-adca-5ac9dbc3fdfa" \
    > "$OUT/arretes.meta.txt" 2>&1 || true
  head -n 3 "$OUT/arretes.csv" > "$OUT/arretes.head.txt" 2>/dev/null || true

  # Master "Arrêtés" CSV (~11 MB, all years incl. current): head only.
  curl -sSL -m 300 -D "$OUT/restrictions.headers.txt" -o /tmp/restrictions.csv \
    -w "status=%{http_code} size=%{size_download} url=%{url_effective}\n" \
    "https://www.data.gouv.fr/api/1/datasets/r/f425cfa6-ccd1-438e-bb03-9d90ab527851" \
    > "$OUT/restrictions.meta.txt" 2>&1 || true
  head -c 200000 /tmp/restrictions.csv > "$OUT/restrictions.head.csv" 2>/dev/null || true
fi

echo "Diagnostics written to $OUT:"
ls -la "$OUT"

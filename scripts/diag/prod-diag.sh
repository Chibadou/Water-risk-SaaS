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

if [ "$MODE" = "grandeur" ]; then
  # ---- Discover the valid obs_elab grandeur token for daily flow ----
  H="https://hubeau.eaufrance.fr/api"
  d90=$(date -u -d '90 days ago' +%F 2>/dev/null || date -u -v-90d +%F)
  SITE="K4800010"; STN="K480001001" # La Loire à Onzain (active)
  # 1. No grandeur filter → read the grandeur_hydro_elab token straight from data.
  for ent in "$SITE" "$STN"; do
    curl -sS -m 40 "$H/v2/hydrometrie/obs_elab?code_entite=${ent}&date_debut_obs_elab=${d90}&size=5&sort=desc" \
      -o "/tmp/g_${ent}.json" 2>/dev/null || true
    jq '{http_ok: (.data!=null), count: (.data|length), grandeurs: ([.data[]?.grandeur_hydro_elab] | unique), sample: (.data[0] // .)}' \
      "/tmp/g_${ent}.json" > "$OUT/grandeur_none_${ent}.json" 2>/dev/null || head -c 800 "/tmp/g_${ent}.json" > "$OUT/grandeur_none_${ent}.json"
  done
  # 2. Try candidate tokens against the site.
  : > "$OUT/grandeur_candidates.tsv"
  for g in QmJ QmM QmnJ QMJ qmj DEBIT debit Q; do
    code=$(curl -sS -m 40 -o "/tmp/gc.json" -w "%{http_code}" \
      "$H/v2/hydrometrie/obs_elab?code_entite=${SITE}&grandeur_hydro_elab=${g}&date_debut_obs_elab=${d90}&size=3&sort=desc&fields=date_obs_elab,resultat_obs_elab,grandeur_hydro_elab" 2>/dev/null)
    n=$(jq -r '(.data|length) // "err"' "/tmp/gc.json" 2>/dev/null)
    echo -e "${g}\thttp=${code}\tn=${n}" >> "$OUT/grandeur_candidates.tsv"
  done
  rm -f /tmp/g_*.json /tmp/gc.json
  echo "grandeur diag written:"; ls -la "$OUT"
elif [ "$MODE" = "hubeau" ]; then
  # ---- Raw Hub'Eau responses to diagnose station resolution ----
  H="https://hubeau.eaufrance.fr/api"
  d60=$(date -u -d '60 days ago' +%F 2>/dev/null || date -u -v-60d +%F)
  urlenc() { python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$1"; }

  # Loire mid-course (Tours/Amboise) — major river, active hydrometry expected.
  curl -sS -m 60 "$H/v2/hydrometrie/referentiel/stations?bbox=0.3,47.2,1.3,47.7&size=40&fields=code_station,code_site,libelle_station,en_service" \
    -o "$OUT/hb_hydro_stations.json" 2>&1 || true
  jq -r '.data[]? | select(.en_service==true) | "\(.code_station)\t\(.code_site)\t\(.libelle_station)"' \
    "$OUT/hb_hydro_stations.json" 2>/dev/null | head -8 > "$OUT/hb_active_stations.tsv"
  : > "$OUT/hb_obs_probe.tsv"
  KEPT=0
  while IFS=$'\t' read -r stn site lib; do
    for key in "$stn" "$site"; do
      [ -z "$key" ] && continue
      body="/tmp/obs_${key}.json"
      code=$(curl -sS -m 40 -o "$body" -w "%{http_code}" \
        "$H/v2/hydrometrie/obs_elab?code_entite=$(urlenc "$key")&grandeur_hydro_elab=QmJ&date_debut_obs_elab=${d60}&size=20&sort=desc&fields=date_obs_elab,resultat_obs_elab" 2>/dev/null)
      n=$(jq -r '(.data|length) // "na"' "$body" 2>/dev/null)
      last=$(jq -r '.data[0].date_obs_elab // "na"' "$body" 2>/dev/null)
      echo -e "${lib}\tkey=${key}\thttp=${code}\tn=${n}\tlast=${last}" >> "$OUT/hb_obs_probe.tsv"
      # keep the first non-empty raw body + the error shape of the first empty
      if [ "$n" != "na" ] && [ "$n" -gt 0 ] 2>/dev/null && [ "$KEPT" -eq 0 ]; then
        cp "$body" "$OUT/hb_obs_nonempty.json"; KEPT=1
      fi
      [ ! -f "$OUT/hb_obs_firstbody.json" ] && head -c 1500 "$body" > "$OUT/hb_obs_firstbody.json"
      rm -f "$body"
    done
  done < "$OUT/hb_active_stations.tsv"

  # Piezo: how many stations near Strasbourg are actually active (recent)?
  curl -sS -m 60 "$H/v1/niveaux_nappes/stations?bbox=7.2,48.2,8.3,49.0&size=300&format=json&fields=code_bss,bss_id,date_fin_mesure,codes_bdlisa,nb_mesures_piezo" \
    -o "$OUT/hb_piezo_stations.json" 2>&1 || true
  jq --arg cut "$(date -u -d '120 days ago' +%F 2>/dev/null || date -u -v-120d +%F)" \
    '{total: (.data|length), active: [.data[]? | select(.date_fin_mesure!=null and (.date_fin_mesure[0:10] >= $cut))] | length,
      active_sample: [.data[]? | select(.date_fin_mesure!=null and (.date_fin_mesure[0:10] >= $cut))][0:3] | map({code_bss, date_fin_mesure, codes_bdlisa, nb_mesures_piezo})}' \
    "$OUT/hb_piezo_stations.json" > "$OUT/hb_piezo_active.json" 2>/dev/null || true
  BSS=$(jq -r --arg cut "$(date -u -d '120 days ago' +%F 2>/dev/null || date -u -v-120d +%F)" \
    '[.data[]? | select(.date_fin_mesure!=null and (.date_fin_mesure[0:10] >= $cut)) | .code_bss][0] // empty' "$OUT/hb_piezo_stations.json" 2>/dev/null)
  echo "active BSS chosen=$BSS" > "$OUT/hb_piezo_code.txt"
  if [ -n "$BSS" ]; then
    curl -sS -m 90 "$H/v1/niveaux_nappes/chroniques?code_bss=$(urlenc "$BSS")&date_debut_mesure=2005-01-01&size=20000&sort=asc&fields=date_mesure,niveau_nappe_eau,profondeur_nappe" \
      -o "$OUT/hb_chroniques.json" 2>&1 || true
    jq '{count: (.data|length), first: .data[0].date_mesure, last: .data[-1].date_mesure, has_niveau: (.data[0].niveau_nappe_eau!=null), has_prof: (.data[0].profondeur_nappe!=null)}' \
      "$OUT/hb_chroniques.json" > "$OUT/hb_chroniques.summary.json" 2>/dev/null || true
    rm -f "$OUT/hb_chroniques.json"
  fi
  rm -f "$OUT/hb_hydro_stations.json" "$OUT/hb_piezo_stations.json"
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

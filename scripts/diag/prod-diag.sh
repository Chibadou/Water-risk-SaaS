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
#   carte — Sprint 29: do the map layers have the data they need? BNPE ouvrage
#          coordinates, national groundwater-body volumetry, station counts.
set -uo pipefail

REQ_BASE=$(jq -r '.base // empty' data/diag-request.json 2>/dev/null || true)
BASE="${DIAG_BASE_URL:-${REQ_BASE:-https://water-risk-saa-s.vercel.app}}"
OUT="data/diag"
MODE=$(jq -r '.mode // "prod"' data/diag-request.json 2>/dev/null || echo "prod")
mkdir -p "$OUT"
rm -f "$OUT"/*

# Defined at top level on purpose: it used to live inside the `hubeau` branch,
# so `prod` mode called an undefined function and silently built an empty URL.
urlenc() { python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$1"; }

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

if [ "$MODE" = "carte3" ]; then
  # ---- Sprint 31: what can the map say about WHERE THE WATER COMES FROM? ---
  # Two blocking questions:
  #   1. BNPE publishes the USE of a withdrawal on its chronicles, not on the
  #      ouvrages referential. Joining them by code_ouvrage would give drinking
  #      water catchments for free — but only if the join actually covers a
  #      useful share of the structures. A partial join is fine; presenting the
  #      uncovered ones as "not drinking water" would not be.
  #   2. Are surface water bodies (lakes, reservoirs, ponds) usable: how many,
  #      how heavy, and do they carry a NAME? An unnamed polygon teaches nothing.
  H="https://hubeau.eaufrance.fr/api"
  S="https://services.sandre.eaufrance.fr/geo/sandre?SERVICE=WFS&VERSION=2.0.0"

  # --- 1. Usage coverage, on the three reference sites ---------------------
  # bbox order for Hub'Eau is lon,lat,lon,lat (unlike the Sandre WFS).
  probe_usage() { # <name> <bbox>
    local name="$1" bb="$2"
    curl -sS -m 120 "$H/v1/prelevements/referentiel/ouvrages?bbox=$bb&size=5000&format=json&fields=code_ouvrage" \
      -o "/tmp/u_ouv_$name.json" 2>/dev/null || true
    # No `annee` filter: we want to know which years exist before choosing one.
    curl -sS -m 180 "$H/v1/prelevements/chroniques?bbox=$bb&size=20000&format=json&fields=code_ouvrage,libelle_usage,annee" \
      -o "/tmp/u_chr_$name.json" 2>/dev/null || true
    jq -n --slurpfile o "/tmp/u_ouv_$name.json" --slurpfile c "/tmp/u_chr_$name.json" --arg site "$name" '
      ($o[0].data // []) as $ouv | ($c[0].data // []) as $chr |
      ([$ouv[].code_ouvrage] | unique) as $codes |
      ([$chr[] | select(.libelle_usage != null) | .code_ouvrage] | unique) as $withUsage |
      {
        site: $site,
        ouvrages: ($codes | length),
        chroniques_rows: ($chr | length),
        # THE number: what fraction of structures the join actually reaches.
        ouvrages_avec_usage: ([$codes[] | select(. as $x | $withUsage | index($x))] | length),
        usages_distincts: ([$chr[].libelle_usage] | unique),
        annees: ([$chr[].annee] | unique | sort),
        # Structures whose usage is drinking water, per the raw label.
        aep_like: ([$chr[] | select((.libelle_usage // "" | ascii_downcase) | test("potable")) | .code_ouvrage] | unique | length)
      }' > "$OUT/carte3_usage_$name.json" 2>/dev/null || true
    rm -f "/tmp/u_ouv_$name.json" "/tmp/u_chr_$name.json"
  }
  # Chartres 30 km, Lyon 10 km, Perpignan 60 km — same three as the other diags.
  probe_usage chartres  "1.08,48.17,1.90,48.71"
  probe_usage lyon      "4.70,45.67,4.96,45.85"
  probe_usage perpignan "2.16,42.16,3.63,43.24"

  # --- 2. Surface water bodies ---------------------------------------------
  for layer in "sa:PlanEau_FXX_Topage2026" "sa:PlanEau_FXX_Topage2024"; do
    slug=$(echo "$layer" | tr ':' '_')
    curl -sS -m 180 "$S&REQUEST=GetFeature&TYPENAMES=$(urlenc "$layer")&RESULTTYPE=hits" \
      -o "/tmp/pe_hits_$slug.xml" 2>/dev/null || true
    HITS=$(grep -o 'numberMatched="[0-9]*"' "/tmp/pe_hits_$slug.xml" 2>/dev/null | head -1 | tr -dc '0-9')
    curl -sS -m 180 "$S&REQUEST=GetFeature&TYPENAMES=$(urlenc "$layer")&OUTPUTFORMAT=geojson&SRSNAME=EPSG:4326&COUNT=3" \
      -o "/tmp/pe_one_$slug.json" 2>/dev/null || true
    ONE=$(wc -c < "/tmp/pe_one_$slug.json" 2>/dev/null || echo 0)
    jq -n --slurpfile f "/tmp/pe_one_$slug.json" --arg layer "$layer" \
      --arg hits "${HITS:-unknown}" --arg one "$ONE" '
      def props: ($f[0].features[0].properties // {});
      {
        layer: $layer, numberMatched: $hits, three_features_bytes: ($one|tonumber? // 0),
        properties: (props|keys),
        name_like:   (props|keys|map(select(test("nom|toponyme|libell";"i")))),
        nature_like: (props|keys|map(select(test("nature|type|origine|regime";"i")))),
        samples: [$f[0].features[]?.properties],
        geometry_type: ($f[0].features[0].geometry.type // "none")
      }' > "$OUT/carte3_plans_eau_$slug.json" 2>/dev/null || true
    rm -f "/tmp/pe_hits_$slug.xml" "/tmp/pe_one_$slug.json"
  done
  # National weight, to size the same decision made for rivers.
  curl -sS -m 600 -o /dev/null \
    -w "status=%{http_code} bytes=%{size_download} time=%{time_total}s\n" \
    "$S&REQUEST=GetFeature&TYPENAMES=$(urlenc "sa:PlanEau_FXX_Topage2026")&OUTPUTFORMAT=geojson&SRSNAME=EPSG:4326" \
    > "$OUT/carte3_plans_eau_national_weight.txt" 2>&1 || true

  echo "carte3 diag written:"; ls -la "$OUT"
elif [ "$MODE" = "carte2" ]; then
  # ---- Sprint 30: what can the map actually SAY about what it draws? -------
  # Four blocking questions, none of which may be answered by guessing:
  #   1. Which "characteristics" exist on each referential? Sprint 29 shipped a
  #      `fields=` list containing `libelle_site`, never observed in a response
  #      — the same failure mode that would have 400'd the BNPE layer.
  #   2. Does any referential publish a URI to its official record? Fabricating
  #      one from a URL pattern would ship dead links.
  #   3. What is the watercourse layer called, how big is it, and does it carry
  #      a name + a hierarchy attribute to keep only the main network?
  #   4. Why is `Karstique` 0 on all 621 embedded groundwater bodies? A constant
  #      characteristic is either wrong or useless — and we are about to display it.
  H="https://hubeau.eaufrance.fr/api"
  S="https://services.sandre.eaufrance.fr/geo/sandre?SERVICE=WFS&VERSION=2.0.0"

  # --- 1 & 2. Full record shape per referential, NO fields= filter ----------
  # bbox = Chartres, the reference point of every other diag.
  BB="0.68,47.90,2.30,48.98"
  curl -sS -m 90 "$H/v2/hydrometrie/referentiel/stations?bbox=$BB&format=json&size=3" \
    -o /tmp/c2_hydro.json 2>/dev/null || true
  curl -sS -m 90 "$H/v1/niveaux_nappes/stations?bbox=$BB&format=json&size=3" \
    -o /tmp/c2_piezo.json 2>/dev/null || true
  curl -sS -m 90 "$H/v1/ecoulement/observations?bbox=$BB&grandeur_hydro=ecoulement&size=3&format=json" \
    -o /tmp/c2_onde.json 2>/dev/null || true
  for f in hydro piezo onde; do
    jq '{count:(.data|length), keys:((.data[0]//{})|keys), sample:(.data[0]//{})}' \
      "/tmp/c2_$f.json" > "$OUT/carte2_${f}_keys.json" 2>/dev/null \
      || head -c 1500 "/tmp/c2_$f.json" > "$OUT/carte2_${f}_keys.json"
  done
  # THE answer, in one file: which fields are safe to request, which carry a
  # date/period, a commune, and — crucially — an official record URI.
  jq -n --slurpfile h /tmp/c2_hydro.json --slurpfile p /tmp/c2_piezo.json --slurpfile o /tmp/c2_onde.json '
    def k($d): (($d[0].data[0]) // {}) | keys;
    def pick($d; $re): k($d) | map(select(test($re; "i")));
    {
      hydro: { keys: k($h), uri: pick($h; "uri"), dates: pick($h; "date"),
               place: pick($h; "commune|departement|cours_eau|site"),
               has_libelle_site: ((k($h) | index("libelle_site")) != null) },
      piezo: { keys: k($p), uri: pick($p; "uri"), dates: pick($p; "date"),
               place: pick($p; "commune|departement|bdlisa|altitude|profondeur") },
      onde:  { keys: k($o), uri: pick($o; "uri"), dates: pick($o; "date"),
               place: pick($o; "commune|departement|cours_eau|station") }
    }' > "$OUT/carte2_FIELDS_ANSWER.json" 2>/dev/null || true
  rm -f /tmp/c2_hydro.json /tmp/c2_piezo.json /tmp/c2_onde.json

  # --- 3. Which Sandre layer holds watercourses? ---------------------------
  curl -sS -m 180 "$S&REQUEST=GetCapabilities" -o /tmp/c2_caps.xml 2>/dev/null || true
  python3 - <<'PYEOF' > "$OUT/carte2_watercourse_layers.json" 2>/dev/null || true
import re, json
try:
    x = open("/tmp/c2_caps.xml", encoding="utf-8", errors="replace").read()
except Exception:
    x = ""
# FeatureType blocks pair a Name with its Title; parse them together so the
# candidate list is readable rather than two unaligned arrays.
blocks = re.findall(r"<(?:wfs:)?FeatureType[^>]*>(.*?)</(?:wfs:)?FeatureType>", x, re.S)
pat = re.compile(r"cours.?d.?eau|coursdeau|tron[cç]on|hydrograph|topage|reseau.?hydro", re.I)
out = []
for b in blocks:
    n = re.search(r"<(?:wfs:)?Name>([^<]+)</(?:wfs:)?Name>", b)
    t = re.search(r"<(?:wfs:)?Title>([^<]*)</(?:wfs:)?Title>", b)
    if not n:
        continue
    name, title = n.group(1), (t.group(1) if t else "")
    if pat.search(name) or pat.search(title):
        out.append({"name": name, "title": title})
print(json.dumps({"total_feature_types": len(blocks), "candidates": out}, ensure_ascii=False, indent=1))
PYEOF
  # Weigh each candidate: entity count, one feature's size, and whether it has
  # a toponym + a hierarchy attribute (without one, "main network" has no
  # criterion and the layer has to fall back to "named watercourses only").
  CANDS=$(jq -r '.candidates[]?.name' "$OUT/carte2_watercourse_layers.json" 2>/dev/null | head -6)
  for layer in $CANDS; do
    slug=$(echo "$layer" | tr ':/' '__')
    curl -sS -m 180 "$S&REQUEST=GetFeature&TYPENAMES=$(urlenc "$layer")&RESULTTYPE=hits" \
      -o "/tmp/c2_hits_$slug.xml" 2>/dev/null || true
    HITS=$(grep -o 'numberMatched="[0-9]*"' "/tmp/c2_hits_$slug.xml" 2>/dev/null | head -1 | tr -dc '0-9')
    curl -sS -m 180 "$S&REQUEST=GetFeature&TYPENAMES=$(urlenc "$layer")&OUTPUTFORMAT=geojson&SRSNAME=EPSG:4326&COUNT=1" \
      -o "/tmp/c2_one_$slug.json" 2>/dev/null || true
    ONE=$(wc -c < "/tmp/c2_one_$slug.json" 2>/dev/null || echo 0)
    jq -n --slurpfile f "/tmp/c2_one_$slug.json" --arg layer "$layer" \
      --arg hits "${HITS:-unknown}" --arg one "$ONE" '
      def props: ($f[0].features[0].properties // {});
      {
        layer: $layer, numberMatched: $hits, one_feature_bytes: ($one|tonumber? // 0),
        properties: (props|keys),
        name_like:      (props|keys|map(select(test("nom|toponyme|libell";"i")))),
        hierarchy_like: (props|keys|map(select(test("ordre|strahler|classe|rang|niveau|principal";"i")))),
        sample: props,
        geometry_type: ($f[0].features[0].geometry.type // "none")
      }' > "$OUT/carte2_cours_eau_$slug.json" 2>/dev/null || true
    rm -f "/tmp/c2_hits_$slug.xml" "/tmp/c2_one_$slug.json"
  done
  rm -f /tmp/c2_caps.xml

  # --- 4. Is `Karstique` real? --------------------------------------------
  # Read raw values over a large sample rather than one feature: the embedded
  # file has it at 0 on all 621 bodies, which France's karst country contradicts.
  curl -sS -m 300 "$S&REQUEST=GetFeature&TYPENAMES=$(urlenc "sa:MasseDEauSouterraine_VRAP2022_FXX")&OUTPUTFORMAT=geojson&SRSNAME=EPSG:4326&COUNT=200&PROPERTYNAME=CdMasseDEau,NomMasseDEau,Karstique,MultiCouches,NatureEcoulement,TypeMasseDEauSouterraine,SurfaceAffKm" \
    -o /tmp/c2_meso.json 2>/dev/null || true
  jq '{
    returned: (.features|length),
    karstique_values:  ([.features[]?.properties.Karstique] | group_by(.) | map({v: .[0], n: length})),
    multicouches_values: ([.features[]?.properties.MultiCouches] | group_by(.) | map({v: .[0], n: length})),
    nature_values: ([.features[]?.properties.NatureEcoulement] | group_by(.) | map({v: .[0], n: length})),
    type_values: ([.features[]?.properties.TypeMasseDEauSouterraine] | group_by(.) | map({v: .[0], n: length})),
    karstic_named: [.features[]? | select((.properties.NomMasseDEau // "") | test("causse|karst|jura|calcaire";"i"))
                    | {nom: .properties.NomMasseDEau, karstique: .properties.Karstique, nature: .properties.NatureEcoulement}][0:8]
  }' /tmp/c2_meso.json > "$OUT/carte2_KARSTIQUE_ANSWER.json" 2>/dev/null \
    || head -c 1500 /tmp/c2_meso.json > "$OUT/carte2_KARSTIQUE_ANSWER.json"
  rm -f /tmp/c2_meso.json

  echo "carte2 diag written:"; ls -la "$OUT"
elif [ "$MODE" = "bnpe" ]; then
  # ---- Can we build a surface-withdrawals / river-flow ratio? ----
  H="https://hubeau.eaufrance.fr/api"
  # 1. Full record shape for one commune (all fields) — is there a milieu field?
  curl -sS -m 60 "$H/v1/prelevements/chroniques?code_commune_insee=45234&annee=2022&size=3&format=json" \
    -o /tmp/b1.json 2>/dev/null || true
  jq '{count:(.data|length), keys:(.data[0]|keys), sample:.data[0]}' /tmp/b1.json > "$OUT/bnpe_fields.json" 2>/dev/null || head -c 1200 /tmp/b1.json > "$OUT/bnpe_fields.json"
  # 2. Does bbox filter work, and what milieu labels exist over an area?
  curl -sS -m 90 "$H/v1/prelevements/chroniques?bbox=1.7,47.7,2.1,48.1&annee=2022&size=2000&format=json&fields=annee,volume,libelle_usage,code_type_milieu,libelle_type_milieu,code_commune_insee" \
    -o /tmp/b2.json 2>/dev/null || true
  jq '{http_data:(.data!=null), count:(.data|length),
       milieux:([.data[]?.libelle_type_milieu]|unique),
       codes_milieu:([.data[]?.code_type_milieu]|unique),
       surface_vol:([.data[]? | select((.libelle_type_milieu//""|ascii_downcase)|test("surf")) | .volume]|add),
       total_vol:([.data[]?.volume]|add)}' /tmp/b2.json > "$OUT/bnpe_bbox.json" 2>/dev/null || head -c 1200 /tmp/b2.json > "$OUT/bnpe_bbox.json"
  # 3. Commune area from geo.api (for a per-area fallback if needed).
  curl -sS -m 40 "https://geo.api.gouv.fr/communes/45234?fields=nom,surface,population,contour" \
    -o /tmp/b3.json 2>/dev/null || true
  jq '{nom, surface, population}' /tmp/b3.json > "$OUT/geo_commune.json" 2>/dev/null || true
  rm -f /tmp/b1.json /tmp/b2.json /tmp/b3.json
  echo "bnpe diag written:"; ls -la "$OUT"
elif [ "$MODE" = "grandeur" ]; then
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
elif [ "$MODE" = "ressource" ]; then
  # ---- Sprint 27: does the resource model have the data it needs? ----------
  # Two questions, both blocking. Nothing of the model gets written before this
  # answers them, per the repo rule: do not code against unverified data.
  #
  #   1. Is `surface_bv` (catchment area) on referentiel/sites or /stations?
  #      The app queries `stations` today; if the field lives on `sites`, the
  #      model needs a site<->station join it does not currently do.
  #   2. Does the published état des lieux carry a machine-readable QUANTITATIVE
  #      STATUS per water body, or only geometries? Only the former is usable.
  H="https://hubeau.eaufrance.fr/api"

  # Deliberately NO `fields=` filter: we want the full record shape, since the
  # question is precisely which keys exist.
  curl -sS -m 60 "$H/v2/hydrometrie/referentiel/stations?bbox=0.3,47.2,1.3,47.7&size=3" \
    -o "$OUT/rs_stations_raw.json" 2>&1 || true
  curl -sS -m 60 "$H/v2/hydrometrie/referentiel/sites?bbox=0.3,47.2,1.3,47.7&size=3" \
    -o "$OUT/rs_sites_raw.json" 2>&1 || true
  for f in stations sites; do
    jq '{count: (.data|length), keys: (.data[0] // {} | keys)}' "$OUT/rs_${f}_raw.json" \
      > "$OUT/rs_${f}_keys.json" 2>/dev/null || true
  done
  # The answer, in one file: which endpoint carries a usable catchment area.
  jq -n \
    --slurpfile st "$OUT/rs_stations_raw.json" --slurpfile si "$OUT/rs_sites_raw.json" \
    '{
      stations_has_surface_bv: (($st[0].data[0] // {}) | has("surface_bv")),
      sites_has_surface_bv:    (($si[0].data[0] // {}) | has("surface_bv")),
      stations_surface_keys:   (($st[0].data[0] // {}) | keys | map(select(test("surf|bassin|bv"; "i")))),
      sites_surface_keys:      (($si[0].data[0] // {}) | keys | map(select(test("surf|bassin|bv"; "i")))),
      sites_sample:            [($si[0].data[]? | {code_site, libelle_site, surface_bv})],
      stations_sample:         [($st[0].data[]? | {code_station, code_site, surface_bv})]
    }' > "$OUT/rs_surface_bv_ANSWER.json" 2>/dev/null || true

  # A real join check: take an active station, fetch its site, read surface_bv.
  SITE=$(jq -r '.data[0].code_site // empty' "$OUT/rs_stations_raw.json" 2>/dev/null)
  if [ -n "$SITE" ]; then
    curl -sS -m 60 "$H/v2/hydrometrie/referentiel/sites?code_site=$(urlenc "$SITE")&size=1" \
      -o "$OUT/rs_site_join.json" 2>&1 || true
    jq '{code_site, libelle_site, surface_bv, code_entite_hydro_cours_eau: .code_entite_hydro_cours_eau}' \
      <(jq '.data[0] // {}' "$OUT/rs_site_join.json") > "$OUT/rs_site_join.summary.json" 2>/dev/null || true
  fi

  # Question 2: enumerate the état des lieux datasets and their resources, so we
  # can see whether a status table (not just geometry) is actually downloadable.
  for q in "masses d'eau souterraines etat des lieux" "masses d'eau etat des lieux 2025" "SDAGE etats pressions objectifs"; do
    slug=$(echo "$q" | tr " '" "__")
    curl -sS -m 60 "https://www.data.gouv.fr/api/1/datasets/?q=$(urlenc "$q")&page_size=6" \
      -o "/tmp/ds_$slug.json" 2>/dev/null || true
    jq '[.data[]? | {title, slug, id,
        resources: [.resources[]? | {title, format, filesize, url}] }]' \
      "/tmp/ds_$slug.json" > "$OUT/rs_datagouv_$slug.json" 2>/dev/null || true
    rm -f "/tmp/ds_$slug.json"
  done

  # Sandre WFS — the route this repo already uses successfully for ZRE,
  # BassinDCE and EntiteHydroGeol. Enumerate the layers rather than guessing a
  # name: a first pass guessed a REST path and got a bare 400.
  curl -sS -m 120 "https://services.sandre.eaufrance.fr/geo/sandre?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" \
    -o "/tmp/sandre_caps.xml" 2>/dev/null || true
  python3 - <<'PYEOF' > "$OUT/rs_sandre_layers.json" 2>/dev/null || true
import re, json
try:
    x = open("/tmp/sandre_caps.xml", encoding="utf-8", errors="replace").read()
except Exception:
    x = ""
names = re.findall(r"<(?:wfs:)?Name>([^<]+)</(?:wfs:)?Name>", x)
titles = re.findall(r"<(?:wfs:)?Title>([^<]+)</(?:wfs:)?Title>", x)
pat = re.compile(r"masse|mdo|meso|mesu|edl|etat", re.I)
print(json.dumps({
    "layer_count": len(names),
    "water_body_layers": [n for n in names if pat.search(n)],
    "matching_titles": [t for t in titles if pat.search(t)][:40],
    "all_layers_sample": names[:60],
}, ensure_ascii=False, indent=1))
PYEOF
  rm -f /tmp/sandre_caps.xml

  # Do the water-body layers carry a QUANTITATIVE STATUS, or only geometry?
  # 699 layers exist; VRAP2022 is the SDAGE 2022-2027 reporting version, the most
  # recent national one. DescribeFeatureType lists the attributes without
  # downloading the (large) features.
  W="https://services.sandre.eaufrance.fr/geo/sandre"
  for layer in MasseDEauSouterraine_VRAP2022_FXX MasseDEauRiviere_VRAP2022_FXX MasseDEauSouterraine_VEDL2019_FXX; do
    curl -sS -m 120 "$W?SERVICE=WFS&VERSION=2.0.0&REQUEST=DescribeFeatureType&TYPENAMES=sa:${layer}" \
      -o "/tmp/dft_${layer}.xml" 2>/dev/null || true
    python3 - "$layer" <<'PYEOF' >> "$OUT/rs_masse_eau_ATTRS.txt" 2>/dev/null || true
import re, sys
layer = sys.argv[1]
try:
    x = open(f"/tmp/dft_{layer}.xml", encoding="utf-8", errors="replace").read()
except Exception:
    x = ""
els = re.findall(r'<xsd:element[^>]*name="([^"]+)"[^>]*type="([^"]+)"', x)
print(f"== {layer} ({len(els)} attributs)")
for n, t in els:
    print(f"   {n}\t{t}")
if not els:
    print("   (aucun attribut lu — extrait brut :)")
    print("   " + x[:400].replace("\n", " "))
print()
PYEOF
    rm -f "/tmp/dft_${layer}.xml"
  done

  # Two real records, to see whether the status attributes are actually filled.
  curl -sS -m 120 "$W?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=sa:MasseDEauSouterraine_VRAP2022_FXX&COUNT=2&OUTPUTFORMAT=geojson" \
    -o "/tmp/me_sample.json" 2>/dev/null || true
  jq '{n: (.features|length), properties: [.features[]?.properties]}' /tmp/me_sample.json \
    > "$OUT/rs_masse_eau_SAMPLE.json" 2>/dev/null || head -c 1200 /tmp/me_sample.json > "$OUT/rs_masse_eau_SAMPLE.head.txt"
  rm -f /tmp/me_sample.json

  # The Sandre nomenclature behind influence_generale_site: its codes must be
  # read, not guessed — the repo rule is to never invent coefficients.
  curl -sS -m 60 "https://api.sandre.eaufrance.fr/referentiels/v1/nsa.json?filter=%3CFilter%3E%3CIS%3E%3CField%20name%3D%22CdNomenclature%22%2F%3E%3CValue%3E176%3C%2FValue%3E%3C%2FIS%3E%3C%2FFilter%3E&outputSchema=SANDREv4" \
    -o "$OUT/rs_nomenclature_influence.json" 2>/dev/null || true
  head -c 2500 "$OUT/rs_nomenclature_influence.json" > "$OUT/rs_nomenclature_influence.head.txt" 2>/dev/null || true

  # Coverage on the population that actually matters: sites the app could
  # attach — in service, with a long enough record to yield a module.
  curl -sS -m 120 "$H/v2/hydrometrie/referentiel/sites?size=2000&statut_site=1&fields=code_site,surface_bv,influence_generale_site,date_premiere_donnee_dispo_site" \
    -o "/tmp/sites_actifs.json" 2>/dev/null || true
  jq '{
    actifs: (.data|length),
    avec_surface: ([.data[]? | select(.surface_bv != null and .surface_bv > 0)] | length),
    avec_surface_et_anciennete: ([.data[]? | select(.surface_bv != null and .surface_bv > 0
        and .date_premiere_donnee_dispo_site != null and (.date_premiere_donnee_dispo_site[0:4]|tonumber) <= 2008)] | length)
  }' /tmp/sites_actifs.json > "$OUT/rs_surface_bv_COVERAGE_ACTIFS.json" 2>/dev/null || true
  rm -f /tmp/sites_actifs.json

  # How often is surface_bv actually filled? A model that needs it is worth
  # nothing if the field is mostly null. Measured nationally, not on 3 rows.
  curl -sS -m 120 "$H/v2/hydrometrie/referentiel/sites?size=2000&fields=code_site,surface_bv,influence_generale_site,statut_site,code_zone_hydro_site" \
    -o "/tmp/sites_bulk.json" 2>/dev/null || true
  jq '{
    total: (.data|length),
    surface_bv_renseigne: ([.data[]? | select(.surface_bv != null and .surface_bv > 0)] | length),
    surface_bv_null: ([.data[]? | select(.surface_bv == null)] | length),
    influence: ([.data[]? | .influence_generale_site] | group_by(.) | map({valeur: .[0], n: length}) | sort_by(-.n)),
    statut: ([.data[]? | .statut_site] | group_by(.) | map({valeur: .[0], n: length}) | sort_by(-.n)),
    surface_quantiles_km2: ([.data[]? | select(.surface_bv != null and .surface_bv > 0) | .surface_bv] | sort
      | {min: .[0], q25: .[(length*0.25|floor)], med: .[(length*0.5|floor)], q75: .[(length*0.75|floor)], max: .[-1]})
  }' /tmp/sites_bulk.json > "$OUT/rs_surface_bv_COVERAGE.json" 2>/dev/null || true
  rm -f /tmp/sites_bulk.json

  echo "ressource diag written:"; ls -la "$OUT"
elif [ "$MODE" = "anticipation" ]; then
  # ---- Real inputs for lib/anticipation.ts, all from ONE coherent site ----
  # The anticipation index (Sprint 20) has only ever run against synthetic
  # fixtures or the sandbox's degraded state (egress blocked there). This
  # fetches zones/history/onde/hydro/piezo for a single real coordinate so the
  # index can be replayed locally against genuine data via computeAnticipation.
  # Perpignan (Pyrénées-Orientales, 66136): historically drought-prone, likely
  # to carry an active VigiEau restriction and an active summer Onde campaign.
  export NEXT_TELEMETRY_DISABLED=1
  npm ci --no-audit --no-fund > "$OUT/anti_install.log" 2>&1 || { tail -40 "$OUT/anti_install.log"; exit 1; }
  npm run build > "$OUT/anti_build.log" 2>&1 || { tail -60 "$OUT/anti_build.log"; exit 1; }
  npx next start -p 3300 > "$OUT/anti_server.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 60); do
    curl -sf -m 2 -o /dev/null http://localhost:3300/ && break
    sleep 1
  done

  L="http://localhost:3300"
  LAT=42.6986
  LON=2.8956

  probe anti_zones "$L/api/zones?lat=${LAT}&lon=${LON}&profil=entreprise"
  CODES=$(jq -r '[.zones[]? | (.code // (.id|tostring))] | join(",")' "$OUT/anti_zones.json" 2>/dev/null || true)
  probe anti_history "$L/api/history?zones=${CODES:-test}&debug=1"
  probe anti_onde "$L/api/onde?lat=${LAT}&lon=${LON}"
  probe anti_hydro "$L/api/hydro?lat=${LAT}&lon=${LON}"
  probe anti_piezo "$L/api/piezo?lat=${LAT}&lon=${LON}"

  kill "$SERVER_PID" 2>/dev/null || true
  rm -rf .next node_modules
  echo "anticipation diag written:"; ls -la "$OUT"
elif [ "$MODE" = "carte" ]; then
  # ---- Sprint 29: can the map page be built from real sources? -------------
  # Three questions, all blocking. No product code is written against these
  # layers before this answers them (repo rule: probe before coding).
  #
  #   1. BNPE: does referentiel/ouvrages carry COORDINATES? HANDBOOK item 8 bis
  #      says "never investigated". Without them the withdrawal layer cannot be
  #      drawn — and a commune centroid would be an invented borehole.
  #   2. Nappes: how big is a national groundwater-body layer, and is there an
  #      attribute to keep only the outcropping entities? Nested polygons stack
  #      into an unreadable map, and a 20 MB GeoJSON cannot be embedded.
  #   3. Volumetry: how many stations does a 60 km bbox actually return? That
  #      sizes the `size=` cap and the radius bound of /api/carte.
  H="https://hubeau.eaufrance.fr/api"
  S="https://services.sandre.eaufrance.fr/geo/sandre?SERVICE=WFS&VERSION=2.0.0"
  # Chartres (INSEE 28085) is the reference point of the other diags, so the
  # counts below are comparable with the ressource/portefeuille replays.
  # ⚠️ Sandre WFS 2.0 in EPSG:4326 expects BBOX as lat,lon,lat,lon (see the
  # working call in app/api/piezo/route.ts) — NOT the lon,lat of Hub'Eau.
  NAPPES_BBOX="48.20,1.10,48.70,1.90,EPSG:4326"

  # --- 1. BNPE ouvrages: full record shape, NO fields= filter on purpose -----
  curl -sS -m 60 "$H/v1/prelevements/referentiel/ouvrages?code_commune_insee=28085&size=3" \
    -o "$OUT/carte_bnpe_raw.json" 2>&1 || true
  jq '{count:(.data|length), keys:((.data[0]//{})|keys), sample:(.data[0]//{})}' \
    "$OUT/carte_bnpe_raw.json" > "$OUT/carte_bnpe_keys.json" 2>/dev/null || true
  # Does the endpoint accept a bbox (map-shaped query) at all?
  curl -sS -m 90 "$H/v1/prelevements/referentiel/ouvrages?bbox=1.1,48.2,1.9,48.7&size=500" \
    -o /tmp/bnpe_bbox.json 2>&1 || true
  jq '{accepts_bbox:(.data!=null), count:(.data|length), first:(.data[0]//{})}' \
    /tmp/bnpe_bbox.json > "$OUT/carte_bnpe_bbox.json" 2>/dev/null \
    || head -c 1500 /tmp/bnpe_bbox.json > "$OUT/carte_bnpe_bbox.json"
  # THE answer: which key, if any, holds a usable WGS84 coordinate.
  jq -n --slurpfile o "$OUT/carte_bnpe_raw.json" --slurpfile b /tmp/bnpe_bbox.json '
    def keysof($d): ($d[0].data[0] // {}) | keys;
    {
      ouvrages_keys: keysof($o),
      coord_like_keys: (keysof($o) | map(select(test("lon|lat|geom|x$|y$|coord";"i")))),
      has_longitude: (keysof($o) | index("longitude")) != null,
      has_geometry:  (keysof($o) | index("geometry")) != null,
      bbox_supported: ($b[0].data != null),
      bbox_count: ($b[0].data // [] | length),
      sample_coords: [($o[0].data[]? | {code_ouvrage, longitude, latitude, x, y, geometry})]
    }' > "$OUT/carte_bnpe_ANSWER.json" 2>/dev/null || true
  rm -f /tmp/bnpe_bbox.json

  # --- 2. Nappes: national volumetry + attributes, both candidate layers -----
  for layer in "sa:MasseDEauSouterraine_VRAP2022_FXX" "sa:EntiteHydroGeol"; do
    slug=$(echo "$layer" | tr ':' '_')
    # hits = entity count, without downloading a single geometry.
    curl -sS -m 120 "$S&REQUEST=GetFeature&TYPENAMES=$(urlenc "$layer")&RESULTTYPE=hits" \
      -o "/tmp/hits_$slug.xml" 2>/dev/null || true
    HITS=$(grep -o 'numberMatched="[0-9]*"' "/tmp/hits_$slug.xml" 2>/dev/null | head -1 | tr -dc '0-9')
    # One feature: real attribute list + the weight of one geometry.
    curl -sS -m 120 "$S&REQUEST=GetFeature&TYPENAMES=$(urlenc "$layer")&OUTPUTFORMAT=geojson&SRSNAME=EPSG:4326&COUNT=1" \
      -o "/tmp/one_$slug.json" 2>/dev/null || true
    ONE_BYTES=$(wc -c < "/tmp/one_$slug.json" 2>/dev/null || echo 0)
    jq -n --slurpfile f "/tmp/one_$slug.json" --arg layer "$layer" \
      --arg hits "${HITS:-unknown}" --arg one "$ONE_BYTES" '
      {
        layer: $layer,
        numberMatched: $hits,
        one_feature_bytes: ($one|tonumber? // 0),
        properties: (($f[0].features[0].properties // {}) | keys),
        # A level/outcropping attribute is what keeps nested polygons apart.
        level_like_keys: ((($f[0].features[0].properties // {}) | keys)
                          | map(select(test("niveau|ordre|affleur|type|nature|multi";"i")))),
        sample_properties: ($f[0].features[0].properties // {}),
        geometry_type: ($f[0].features[0].geometry.type // "none")
      }' > "$OUT/carte_nappes_$slug.json" 2>/dev/null || true
    rm -f "/tmp/hits_$slug.xml" "/tmp/one_$slug.json"
  done
  # Full national payload weight for the preferred layer — decides embedded vs
  # on-the-fly. Downloaded to /dev/null: only the byte count matters here.
  curl -sS -m 300 -o /dev/null \
    -w "status=%{http_code} bytes=%{size_download} time=%{time_total}s\n" \
    "$S&REQUEST=GetFeature&TYPENAMES=$(urlenc "sa:MasseDEauSouterraine_VRAP2022_FXX")&OUTPUTFORMAT=geojson&SRSNAME=EPSG:4326" \
    > "$OUT/carte_nappes_national_weight.txt" 2>&1 || true
  # And the map-scale question: does a viewport BBOX query work and how heavy?
  curl -sS -m 120 -o /tmp/nappes_bbox.json \
    -w "status=%{http_code} bytes=%{size_download} time=%{time_total}s\n" \
    "$S&REQUEST=GetFeature&TYPENAMES=$(urlenc "sa:MasseDEauSouterraine_VRAP2022_FXX")&OUTPUTFORMAT=geojson&SRSNAME=EPSG:4326&COUNT=50&BBOX=${NAPPES_BBOX}" \
    > "$OUT/carte_nappes_bbox.meta.txt" 2>&1 || true
  jq '{features:(.features|length), types:([.features[]?.geometry.type]|unique)}' \
    /tmp/nappes_bbox.json > "$OUT/carte_nappes_bbox.json" 2>/dev/null \
    || head -c 1500 /tmp/nappes_bbox.json > "$OUT/carte_nappes_bbox.json"
  rm -f /tmp/nappes_bbox.json

  # --- 3. Station volumetry on a real 60 km bbox around Chartres ------------
  probe carte_hydro_ref "$H/v2/hydrometrie/referentiel/stations?bbox=0.68,47.90,2.30,48.98&format=json&size=500&fields=code_station,libelle_station,longitude_station,latitude_station,en_service"
  probe carte_piezo_ref "$H/v1/niveaux_nappes/stations?bbox=0.68,47.90,2.30,48.98&format=json&size=500&fields=code_bss,bss_id,libelle_pe,geometry,x,y,date_fin_mesure,codes_bdlisa"
  probe carte_onde_ref "$H/v1/ecoulement/stations?bbox=0.68,47.90,2.30,48.98&format=json&size=500"
  jq -n \
    --slurpfile h "$OUT/carte_hydro_ref.json" \
    --slurpfile p "$OUT/carte_piezo_ref.json" \
    --slurpfile o "$OUT/carte_onde_ref.json" '
    {
      hydro_count: (($h[0].data // []) | length),
      hydro_en_service: (($h[0].data // []) | map(select(.en_service != false)) | length),
      piezo_count: (($p[0].data // []) | length),
      piezo_with_geometry: (($p[0].data // []) | map(select((.geometry.coordinates // null) != null)) | length),
      piezo_with_xy: (($p[0].data // []) | map(select(.x != null and .y != null)) | length),
      onde_count: (($o[0].data // []) | length),
      onde_keys: (($o[0].data[0] // {}) | keys)
    }' > "$OUT/carte_volumetry_ANSWER.json" 2>/dev/null || true

  # --- 4. The route itself, against the real services ----------------------
  # The probes above validate the upstream schemas the parsers read. This runs
  # /api/carte end to end on three contrasted points, which is the only way to
  # see the whole chain (bbox → parse → radius filter) against live data.
  export NEXT_TELEMETRY_DISABLED=1
  npm ci --no-audit --no-fund > "$OUT/carte_install.log" 2>&1 || { tail -40 "$OUT/carte_install.log"; exit 1; }
  npm run build > "$OUT/carte_build.log" 2>&1 || { tail -60 "$OUT/carte_build.log"; exit 1; }
  npx next start -p 3300 > "$OUT/carte_server.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 60); do
    curl -sf -m 2 -o /dev/null http://localhost:3300/ && break
    sleep 1
  done
  L="http://localhost:3300"
  probe carte_route_chartres "$L/api/carte?lat=48.4439&lon=1.4890&rayon=30"
  probe carte_route_lyon "$L/api/carte?lat=45.7578&lon=4.8320&rayon=10"
  probe carte_route_perpignan "$L/api/carte?lat=42.6986&lon=2.8956&rayon=60"
  probe carte_route_nappes "$L/api/nappes"
  # Sprint 32: state of ONE object, timed. The standardized reference downloads
  # 18-25 years of record, so its cost is the open question of the sprint —
  # `probe` records time_total for each of these.
  for site in chartres lyon perpignan; do
    HYD=$(jq -r '.features.hydro[0].code // empty' "$OUT/carte_route_$site.json" 2>/dev/null)
    PIE=$(jq -r '.features.piezo[0].code // empty' "$OUT/carte_route_$site.json" 2>/dev/null)
    PIEALT=$(jq -r '.features.piezo[0].altCode // empty' "$OUT/carte_route_$site.json" 2>/dev/null)
    OUV=$(jq -r '(.features.aep[0].code // .features.bnpe[0].code) // empty' "$OUT/carte_route_$site.json" 2>/dev/null)
    [ -n "$HYD" ] && probe "carte_etat_hydro_$site" "$L/api/carte/etat?kind=hydro&code=$(urlenc "$HYD")"
    [ -n "$PIE" ] && probe "carte_etat_piezo_$site" "$L/api/carte/etat?kind=piezo&code=$(urlenc "$PIE")&altCode=$(urlenc "${PIEALT:-}")"
    [ -n "$OUV" ] && probe "carte_etat_ouvrage_$site" "$L/api/carte/etat?kind=bnpe&code=$(urlenc "$OUV")"
  done
  probe carte_etat_zone "$L/api/carte/etat?kind=nappes&lat=48.4439&lon=1.4890"
  # One file to read: what each state answered, and how long it took.
  { for f in "$OUT"/carte_etat_*.meta.txt; do
      [ -f "$f" ] || continue
      n=$(basename "$f" .meta.txt)
      printf "%-32s %s | %s\n" "$n" "$(tr -d '\n' < "$f")" \
        "$(jq -c '{disponible, type, message, reference: (.reference.label // null), annees: (.reference.years // null)}' "$OUT/$n.json" 2>/dev/null || echo '-')"
    done; } > "$OUT/carte_etat_SUMMARY.txt" 2>/dev/null || true
  # The summary that gets read: counts per layer, how many BNPE structures are
  # published at the commune centroid, and whether any radius leaked through.
  for f in chartres lyon perpignan; do
    jq --arg f "$f" '{
      site: $f, radiusKm,
      counts: (.features | with_entries(.value |= length)),
      messages,
      bnpe_approximate: ([.features.bnpe[]? | select(.approximate == true)] | length),
      aep_markers: (.features.aep | length),
      # THE number for Sprint 31: how many structures the chronicles join reached.
      usage_connu: ([.features.bnpe[]?, .features.aep[]?
                     | select(.caracteristiques[]? | select(.label == "Usage" and .valeur != "non renseigné"))] | length),
      usage_inconnu: ([.features.bnpe[]?
                     | select(.caracteristiques[]? | select(.label == "Usage" and .valeur == "non renseigné"))] | length),
      onde_with_severity: ([.features.onde[]? | select(.severity != null)] | length),
      max_distance: ([.features[]?[]?.distanceKm] | max),
      sample: {
        hydro: (.features.hydro[0] // null),
        piezo: (.features.piezo[0] // null),
        onde:  (.features.onde[0]  // null),
        bnpe:  (.features.bnpe[0]  // null)
      }
    }' "$OUT/carte_route_$f.json" > "$OUT/carte_route_${f}_SUMMARY.json" 2>/dev/null || true
  done
  kill "$SERVER_PID" 2>/dev/null || true
  rm -rf .next node_modules

  echo "carte diag written:"; ls -la "$OUT"
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
  # BNPE: agricultural commune with real withdrawals (Chartres, Beauce).
  probe app_bnpe "$L/api/bnpe?citycode=28085"
  probe app_bnpe2 "$L/api/bnpe?citycode=31555"
  probe_pmtiles app_pmtiles "$L"

  # --- Sprint 27: the resource model, on contrasted basins -----------------
  # The resource is MODELLED, not read. Unit tests prove the arithmetic on made
  # up numbers; only real stations show whether the chain produces plausible
  # French hydrology. Four sites chosen for contrast: Loire, Beauce (chalk),
  # Adour-Garonne (stressed), Brittany (impermeable, high specific discharge).
  for rs in "orleans:47.9020:1.9090:45234" "chartres:48.4469:1.4894:28085" \
            "toulouse:43.6047:1.4442:31555" "rennes:48.1173:-1.6778:35238"; do
    n="${rs%%:*}"; rest="${rs#*:}"; lat="${rest%%:*}"; rest="${rest#*:}"
    lon="${rest%%:*}"; cc="${rest##*:}"
    probe "rs_hydro_$n" "$L/api/hydro?lat=${lat}&lon=${lon}"
    probe "rs_bnpe_$n"  "$L/api/bnpe?citycode=${cc}"
  done

  # --- Sprint 26: the portfolio replay, on real decrees --------------------
  # Simultaneity has only ever run on synthetic fixtures: /api/history is
  # unreachable from the sandbox. Build a real three-site portfolio, spread far
  # enough apart that they are NOT expected to share a zone, and pull the
  # run-length calendar for the union of their zones in one call — exactly what
  # the dashboard does. scripts/diag/replay-portefeuille.ts then feeds this into
  # computePortfolio offline.
  PF_CODES=""
  for pf in "perpignan:42.6986:2.8956" "chartres:48.4469:1.4894" "lyon:45.7578:4.8320"; do
    name="${pf%%:*}"; rest="${pf#*:}"; lat="${rest%%:*}"; lon="${rest##*:}"
    probe "pf_zones_$name" "$L/api/zones?lat=${lat}&lon=${lon}&profil=entreprise"
    c=$(jq -r '[.zones[]? | (.code // (.id|tostring))] | join(",")' "$OUT/pf_zones_$name.json" 2>/dev/null || true)
    [ -n "$c" ] && PF_CODES="${PF_CODES:+$PF_CODES,}$c"
    # Exposure is keyed by department, and the replay weights the peak with it.
    probe "pf_restrictions_$name" "$L/api/restrictions?dep=$(echo "$c" | cut -d_ -f2)&type=SUP&profil=entreprise"
  done
  probe pf_history_periodes "$L/api/history?zones=${PF_CODES:-test}&periodes=1"
  # Same zones WITHOUT the flag: the two payloads must agree on every aggregate
  # and differ only by the calendar, which is the whole contract of the opt-in.
  probe pf_history_plain "$L/api/history?zones=${PF_CODES:-test}"

  # Confirm the piezo referential coordinate shape (geometry vs x/y).
  curl -sS -m 60 "https://hubeau.eaufrance.fr/api/v1/niveaux_nappes/stations?bbox=1.4,47.5,2.4,48.3&size=3&format=json&fields=code_bss,geometry,x,y,date_fin_mesure,codes_bdlisa" \
    -o /tmp/pz.json 2>/dev/null || true
  jq '[.data[]? | {code_bss, geometry, x, y, date_fin_mesure}]' /tmp/pz.json > "$OUT/piezo_coord_shape.json" 2>/dev/null || true

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
  # Sprint 26 in production: the run-length calendar must be served on demand
  # and absent without the flag. Real zones (Lyon, Chartres) — `test` matches
  # nothing and would let a missing feature look like an empty calendar.
  probe periodes "$BASE/api/history?zones=84_69_0004,24_028_0003&periodes=1"
  probe periodes_off "$BASE/api/history?zones=84_69_0004,24_028_0003"
  probe zones "$BASE/api/zones?lat=45.7578&lon=4.8320&profil=entreprise"
  probe projection "$BASE/api/projection?citycode=69123"
  # Sprint 9 physical features on prod: low-flow (Loire), IPS+aquifer (nappe), Onde.
  probe hydro "$BASE/api/hydro?lat=47.9020&lon=1.9090"
  probe piezo "$BASE/api/piezo?lat=47.9020&lon=1.9090"
  probe onde "$BASE/api/onde?lat=43.6047&lon=1.4442"
  # Sprints 21-25. The three constrained-days horizons have never run against
  # live data — the sandbox blocks every French open-data host — so this is the
  # first real check of the model end to end, not just of the endpoints.
  probe restrictions "$BASE/api/restrictions?dep=28&type=SUP&profil=entreprise"
  probe restrictions_guide "$BASE/api/restrictions?dep=99&profil=entreprise"
  probe swi "$BASE/api/swi?lat=48.4469&lon=1.4894"
  probe bdlisa "$BASE/api/bdlisa?lat=48.4469&lon=1.4894"
  probe transition_bassin "$BASE/api/transition?citycode=28085"
  probe transition_corse "$BASE/api/transition?citycode=2A004"
  # The zones a real site actually falls in, then that site's arrêté history —
  # the input the "année type" and "fin de saison" horizons are built from.
  ZCODES=$(jq -r '[.zones[]? | .code] | unique | join(",")' "$OUT/zones.json" 2>/dev/null \
    || jq -r '[.zones[]? | .code] | unique | join(",")' "$OUT/zones.body" 2>/dev/null || true)
  if [ -n "$ZCODES" ] && [ "$ZCODES" != "null" ]; then
    probe history_real "$BASE/api/history?zones=$(urlenc "$ZCODES")&debug=1"
  fi
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

// Hub'Eau mock v2: param-aware, multiple stations, optional no-flow mode.
// NOFLOW=1 → no station has QmJ data (tests the water-height fallback).
// PORT env overrides the listen port (default 9999).
import { createServer } from "node:http";

const NOFLOW = process.env.NOFLOW === "1";
const PORT = Number(process.env.PORT ?? 9999);

const today = (offsetDays) => new Date(Date.now() - offsetDays * 86400_000).toISOString().slice(0, 10);

// 35 days of flow in l/s, declining recently (trend "baisse")
const hydroObs = Array.from({ length: 35 }, (_, i) => {
  const day = 34 - i;
  const base = day > 7 ? 5200 : 5200 - (7 - day) * 300;
  return { date_obs_elab: today(day), resultat_obs_elab: base };
});

// 20 days of water height in mm, hourly-ish (one per day is fine), rising
const heightObs = Array.from({ length: 20 }, (_, i) => ({
  date_obs: `${today(i)}T08:00:00Z`, // sort=desc → newest first
  resultat_obs: 820 - i * 6,
}));

// 35 days of groundwater NGF level, rising (trend "hausse")
const piezoTr = Array.from({ length: 35 }, (_, i) => {
  const day = 34 - i;
  return { date_mesure: `${today(day)}T06:00:00Z`, niveau_nappe_eau: 102.1 + (34 - day) * 0.02, profondeur_nappe: 8.4 };
});

const wrap = (data) => ({ count: data.length, data });

// Arrêtés CSV (VigiEau-style): semicolon-delimited, accented headers, mixed
// date formats. Zone Z_A: 60 days alerte + overlapping 10 days crise (should
// dedupe to 60 days alerte+). Zone Z_B: vigilance only → 0 days alerte+.
const arretesCsv = [
  "id_arrete;id_zone;code_zone;nom_zone;type_zone;Niveau de gravité;date_début;date_fin",
  `1;101;Z_A;Bassin Têt;SUP;Alerte;${today(70)};${today(11)}`,
  `2;101;Z_A;Bassin Têt;SUP;Crise;${today(20)};${today(11)}`,
  `3;102;Z_B;Nappe Roussillon;SOU;Vigilance;15/05/${new Date().getFullYear()};`,
].join("\r\n");

createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const path = url.pathname;
  const q = url.searchParams;
  let body = null;

  if (path === "/csv/arretes.csv") {
    res.writeHead(200, { "content-type": "text/csv" });
    res.end(arretesCsv);
    return;
  }

  if (path === "/api/v2/hydrometrie/referentiel/stations") {
    body = wrap([
      // nearest, in service, but no flow data
      { code_station: "Y_NOFLOW", libelle_station: "L'Agly à Estagel", longitude_station: 2.88, latitude_station: 42.7, en_service: true },
      // ~11 km away, has flow data (unless NOFLOW mode)
      { code_station: "Y0654040", libelle_station: "La Têt à Perpignan", longitude_station: 2.9, latitude_station: 42.79, en_service: true },
      { code_station: "Y_CLOSED", libelle_station: "Station fermée", longitude_station: 2.87, latitude_station: 42.69, en_service: false },
    ]);
  } else if (path === "/api/v2/hydrometrie/obs_elab") {
    body = !NOFLOW && q.get("code_entite") === "Y0654040" ? wrap(hydroObs) : wrap([]);
  } else if (path === "/api/v2/hydrometrie/observations_tr") {
    body = q.get("code_entite") === "Y_NOFLOW" && q.get("grandeur_hydro") === "H" ? wrap(heightObs) : wrap([]);
  } else if (path === "/api/v1/niveaux_nappes/stations") {
    body = wrap([
      { code_bss: "10902X0203/F", bss_id: "BSS002ABCD", libelle_pe: "Piézo plaine du Roussillon", longitude: 2.91, latitude: 42.67, date_fin_mesure: today(1) },
      { code_bss: "10902X9999/F", bss_id: "BSS002ZZZZ", libelle_pe: "Piézo sans données", longitude: 2.86, latitude: 42.71, date_fin_mesure: today(10) },
    ]);
  } else if (path === "/api/v1/niveaux_nappes/chroniques_tr") {
    body = q.get("bss_id") === "BSS002ABCD" ? wrap(piezoTr) : wrap([]);
  } else if (path === "/api/v1/niveaux_nappes/chroniques") {
    body = wrap([]);
  }

  if (!body) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}).listen(PORT, () => console.log(`hubeau mock on :${PORT} (NOFLOW=${NOFLOW})`));

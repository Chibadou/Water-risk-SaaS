// The defect this guards, in one sentence: the station referential answers, the
// per-station series calls all fail, and the payload used to say "Stations
// proches sans données récentes de débit ni de hauteur." — an outage rendered as
// a fact about the rivers.
//
// `probeHydroFlow` returns null ONLY when the call itself failed; that null was
// dropped into the same bucket as a station that answered "nothing recent", and
// `toOption` then set `available: false` for both. Nothing downstream could tell
// them apart, including the composite score's confidence.
//
// This runs a stub Hub'Eau on localhost (HUBEAU_BASE_URL is overridable for
// exactly this reason) so the degraded path is actually EXECUTED — the sandbox
// blocks egress, so the real service can never exercise it here.
//
// npx tsx scripts/test/hubeau-degrade.test.ts

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { IndicatorsPayload } from "../../lib/hubeau";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};

/** Two real-looking stations a few km from Chartres. */
const STATIONS = [
  { code_station: "H1234001", libelle_station: "L'Eure à Chartres", longitude_station: 1.49, latitude_station: 48.45, en_service: true },
  { code_station: "H1234002", libelle_station: "L'Eure à Lucé", longitude_station: 1.46, latitude_station: 48.43, en_service: true },
];

/** "series-down" = the calls fail; "series-empty" = they answer, with nothing. */
let mode: "series-down" | "series-empty" = "series-down";

async function main() {
  const server = createServer((req, res) => {
    if ((req.url ?? "").includes("/referentiel/stations")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: STATIONS }));
      return;
    }
    if (mode === "series-down") {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "indisponible" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: [] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const { port } = server.address() as AddressInfo;

  // Set before the import: lib/hubeau reads HUBEAU_BASE_URL at module load.
  process.env.HUBEAU_BASE_URL = `http://127.0.0.1:${port}`;
  const { hydroIndicators } = await import("../../lib/hubeau");

  try {
    mode = "series-down";
    const down = (await hydroIndicators(48.4468, 1.4892)) as IndicatorsPayload;
    mode = "series-empty";
    const empty = (await hydroIndicators(48.4468, 1.4892)) as IndicatorsPayload;

    // --- Both cases genuinely reach the "nothing to offer" branch ------------
    check("panne: aucune station sélectionnée", down.selected === undefined);
    check("silence: aucune station sélectionnée", empty.selected === undefined);
    check(
      "les deux ont bien trouvé les stations du référentiel",
      down.stations.length === 2 && empty.stations.length === 2,
    );

    // --- and they must NOT look the same -------------------------------------
    check("panne: serviceDegraded est levé", down.serviceDegraded === true);
    check("silence: serviceDegraded reste absent", empty.serviceDegraded === undefined);
    check("panne: le message dit l'injoignabilité", down.message?.includes("injoignable") === true);
    check(
      "panne: le message refuse de conclure sur la ressource",
      down.message?.includes("n'est pas un constat sur la ressource") === true,
    );
    check(
      "silence: le message reste le constat d'origine",
      empty.message === "Stations proches sans données récentes de débit ni de hauteur.",
    );
    check("les deux messages diffèrent", down.message !== empty.message);

    // --- per-station flag, for the station picker -----------------------------
    check("panne: chaque station est marquée injoignable", down.stations.every((s) => s.unreachable === true));
    check(
      "silence: aucune station n'est marquée injoignable",
      empty.stations.every((s) => s.unreachable === undefined),
    );
    check(
      "dans les deux cas available reste false — le drapeau ne l'invente pas",
      down.stations.every((s) => !s.available) && empty.stations.every((s) => !s.available),
    );
  } finally {
    server.close();
  }

  console.log(failures === 0 ? "hubeau-degrade: all checks pass" : `hubeau-degrade: ${failures} FAILED`);
  if (failures > 0) process.exit(1);
}

void main();

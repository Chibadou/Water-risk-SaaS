import { NextRequest, NextResponse } from "next/server";
import { hubeauJson, stationEtat, type EtatStation } from "@/lib/hubeau";
import { parseVolumesOuvrage, type VolumeOuvrage } from "@/lib/carteEau";
import { fetchZonesForPoint } from "@/lib/vigieau";
import { resolveRattachement } from "@/lib/rattachement";
import type { NiveauGravite } from "@/lib/types";

// GET /api/carte/etat?kind=&code=&altCode=&lat=&lon=
// → the current state of ONE map object, on click.
//
// The map page answers "what is around here?"; this route answers "and where is
// it at?" — the same figures the site sheet shows, for the object the reader
// just clicked. Fetched per click rather than upfront: probing the chronicle of
// every station in view would cost hundreds of calls to serve one popup.
//
// ⚠️ What counts as a state differs by object, and the words must differ too:
//   - a station MEASURES the resource            → level/flow, trend, reference
//   - a withdrawal structure PRESSES on it       → last declared volume, and its year
//   - a water body has no national physical state → the REGULATORY level of the
//     zone it sits in (the quantitative status of water bodies was investigated
//     and closed in Sprint 27; see HANDBOOK §5)

const HUBEAU_ROOT = process.env.HUBEAU_BASE_URL ?? "https://hubeau.eaufrance.fr";
const BNPE_BASE = `${HUBEAU_ROOT}/api/v1/prelevements`;

export type EtatReponse =
  | { disponible: false; message: string }
  | ({ disponible: true; type: "station" } & EtatStation)
  | { disponible: true; type: "prelevement"; volume: VolumeOuvrage }
  | {
      disponible: true;
      type: "reglementaire";
      niveau: NiveauGravite | null;
      /**
       * How `niveau` was obtained (ADR-003). On the map this is always
       * `"maximum"` — a point has no usage vector — and saying so is the whole
       * change: the colour is the most severe of the covering zones, not a
       * reading of any particular abstraction.
       */
      base?: "vecteur" | "origine_unique" | "maximum" | "aucune";
      degrade?: boolean;
      /** several zones of one type cover the point */
      ambigu?: boolean;
      zones: Array<{ nom?: string; type?: string; niveau?: NiveauGravite }>;
    };

function indisponible(message: string, status = 200) {
  return NextResponse.json({ disponible: false, message } satisfies EtatReponse, { status });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const kind = params.get("kind") ?? "";
  const code = params.get("code")?.slice(0, 60) ?? "";
  const altCode = params.get("altCode")?.slice(0, 60) || undefined;

  if (kind === "hydro" || kind === "piezo") {
    if (!code) return indisponible("Code de station manquant.", 400);
    const etat = await stationEtat({ kind, code, altCode });
    // Two failures, two sentences: a silent station is a fact about the
    // station, an unreachable service is a fact about us.
    if (etat === "service-indisponible") return indisponible("Service Hub'Eau injoignable.");
    if (etat === "station-muette") {
      return indisponible("Cette station ne publie pas de mesure récente exploitable.");
    }
    return NextResponse.json({ disponible: true, type: "station", ...etat } satisfies EtatReponse);
  }

  if (kind === "bnpe" || kind === "aep") {
    if (!code) return indisponible("Code d'ouvrage manquant.", 400);
    const rows = await hubeauJson(
      `${BNPE_BASE}/chroniques?code_ouvrage=${encodeURIComponent(code)}` +
        `&size=200&format=json&fields=annee,volume,libelle_usage`,
      24 * 3600,
    );
    if (rows === null) return indisponible("Chroniques BNPE indisponibles.");
    const volume = parseVolumesOuvrage(rows);
    if (!volume) {
      return indisponible("Aucun volume déclaré pour cet ouvrage.");
    }
    return NextResponse.json({ disponible: true, type: "prelevement", volume } satisfies EtatReponse);
  }

  if (kind === "nappes" || kind === "coursEau" || kind === "plansEau") {
    const lat = Number(params.get("lat"));
    const lon = Number(params.get("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return indisponible("Coordonnées manquantes.", 400);
    }
    const { body } = await fetchZonesForPoint(lat, lon, "entreprise");
    if (body.message && body.zones.length === 0 && !body.notCovered) {
      return indisponible(body.message);
    }
    // notCovered is an answer, not a failure: no arrêté applies at this point.
    //
    // ⚠️ G5 on the map. This endpoint answers for a POINT ON A MAP, not for a
    // known site: there is no usage vector to weight with, so the resolution
    // legitimately lands on the `maximum` rung. What changes is that it now SAYS
    // so — `base: "maximum"` and `degrade: true` travel with the level, so a popup
    // can state that the colour is the most severe of the covering zones rather
    // than a reading of any particular abstraction.
    const rat = resolveRattachement(body.zones, {});
    return NextResponse.json({
      disponible: true,
      type: "reglementaire",
      niveau: rat.niveauEffectif ?? null,
      base: rat.base,
      degrade: rat.degrade,
      ambigu: rat.ambigu,
      zones: body.zones.map((z) => ({ nom: z.nom, type: z.type, niveau: z.niveauGravite })),
    } satisfies EtatReponse);
  }

  return indisponible("Type d'objet inconnu.", 400);
}

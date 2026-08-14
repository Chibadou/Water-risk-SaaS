import { NextRequest, NextResponse } from "next/server";
import { situerPoint } from "@/lib/communes";
import { couverture } from "@/lib/juridiction";

// GET /api/situation?lat=&lon=
// → ce point est-il un LIEU ? Trois réponses possibles, jamais deux.
//
// ⚠️ À ne pas confondre avec la couverture juridictionnelle, que cette route
// renvoie aussi mais qui répond à une autre question. `couverture()` teste une
// boîte englobante ; celle autour de la France métropolitaine contient toute la
// Méditerranée occidentale. Un point au large de Toulon en ressortait
// « couvert », et la fiche d'analyse a rempli ses panneaux avec les stations du
// littoral en présentant leurs mesures comme celles du site — mesuré en ligne le
// 2026-08-13, premier regard porté sur le déploiement.
//
// Le signal qui tranche ne coûte rien et existait déjà dans le dépôt : en mer,
// le référentiel des communes ne rattache rien.

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      {
        etat: "indeterminee",
        detail:
          "Coordonnées illisibles : ce point n'a pas pu être situé. ⚠️ Ce n'est PAS « hors du " +
          "territoire », c'est « on ne sait pas où ».",
      },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  const situation = await situerPoint(lat, lon);
  const cov = couverture(lat, lon, params.get("ccode") ?? undefined);

  return NextResponse.json(
    { ...situation, couverture: cov },
    {
      headers: {
        // Le découpage communal ne bouge pas dans la journée ; une panne du
        // référentiel, si. On ne met donc en cache que les réponses fermes.
        "cache-control":
          situation.etat === "indeterminee"
            ? "no-store"
            : "public, max-age=86400, s-maxage=604800",
      },
    },
  );
}

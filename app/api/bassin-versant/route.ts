import { NextRequest, NextResponse } from "next/server";
import { bassinDuPoint } from "@/lib/bassinVersant";
import { chargerBassins } from "@/lib/bassinsData";

// GET /api/bassin-versant?lat=&lon=
// → dans QUEL bassin versant tombe ce point ? Trois réponses possibles, jamais
//   deux : `trouve`, `hors-couverture`, `indisponible`.
//
// ⚠️ À ne pas confondre avec /api/bassins-versants (pluriel), qui sert les
// contours à dessiner sur /carte. Celle-ci répond sur UN point et sert un
// CALCUL : `lib/ressource.ts` y transpose un débit spécifique. D'où le test
// géométrique réel (`lib/geoPoint.ts`) là où la route plurielle se contente
// d'un recouvrement de boîtes englobantes — le bon compromis pour un dessin,
// le mauvais pour un rattachement.
//
// ⚠️ next.config.ts doit lister le fichier de données dans
// outputFileTracingIncludes, sinon la route répond 503 en production tout en
// marchant parfaitement en dev.

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));

  const features = await chargerBassins();
  if (!features) {
    return NextResponse.json(
      {
        etat: "indisponible",
        detail:
          "Le référentiel des bassins versants n'a pas pu être lu. La ressource reste estimée " +
          "sur l'emprise communale — l'approximation est signalée, pas masquée.",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const bassin = bassinDuPoint(features, lat, lon);

  return NextResponse.json(bassin, {
    // Des coordonnées illisibles sont une faute d'appel, pas une panne de
    // service : 400. Le corps reste à trois états, pour que le client n'ait
    // jamais à deviner depuis un statut.
    status: bassin.etat === "indisponible" ? 400 : 200,
    headers: {
      // Le découpage des bassins versants est un référentiel figé : il ne bouge
      // qu'à un rafraîchissement du dépôt. Une réponse qu'on n'a pas su donner,
      // elle, ne se met pas en cache — sinon un incident d'un instant se fige
      // une semaine.
      "cache-control":
        bassin.etat === "indisponible" ? "no-store" : "public, max-age=86400, s-maxage=604800",
    },
  });
}

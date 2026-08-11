import { NextRequest, NextResponse } from "next/server";
import { fetchZonesForPoint } from "@/lib/vigieau";
import { couverture } from "@/lib/juridiction";

const PROFILS = new Set(["particulier", "entreprise", "collectivite", "exploitation"]);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const lon = params.get("lon");
  const lat = params.get("lat");
  const profil = params.get("profil") ?? "entreprise";

  if (!lon || !lat) {
    return NextResponse.json(
      { zones: [], notCovered: false, message: "Paramètres lon/lat requis" },
      { status: 400 },
    );
  }
  if (!PROFILS.has(profil)) {
    return NextResponse.json(
      { zones: [], notCovered: false, message: "Profil invalide" },
      { status: 400 },
    );
  }
  const latN = Number(lat);
  const lonN = Number(lon);
  if (!Number.isFinite(latN) || !Number.isFinite(lonN)) {
    return NextResponse.json(
      { zones: [], notCovered: false, message: "Paramètres lon/lat invalides" },
      { status: 400 },
    );
  }

  // G15 — a point outside the jurisdiction is answered BEFORE the upstream call.
  // ⚠️ Two reasons, and only one is about saving a request. The other is that
  // VigiEau answers an out-of-France point with an empty zone list, which is
  // indistinguishable from "covered, no restriction in force" — the exact
  // confusion the repo's central rule exists to prevent. A site in Barcelona
  // would have read "aucune restriction en vigueur".
  // The commune code, when the client has one, is POSITIVE proof of being in the
  // French referential — the bounding box below can only reject the far field.
  const cov = couverture(latN, lonN, params.get("ccode") ?? undefined);
  if (!cov.couvert) {
    return NextResponse.json({
      zones: [],
      notCovered: false,
      horsPerimetre: true,
      message: cov.detail,
    });
  }

  const { status, body } = await fetchZonesForPoint(latN, lonN, profil);
  return NextResponse.json(body, { status });
}

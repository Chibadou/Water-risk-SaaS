import { NextRequest, NextResponse } from "next/server";
import { fetchZonesForPoint } from "@/lib/vigieau";

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

  const { status, body } = await fetchZonesForPoint(latN, lonN, profil);
  return NextResponse.json(body, { status });
}

import { NextRequest, NextResponse } from "next/server";
import { bnpeForCommune } from "@/lib/bnpe";

// GET /api/bnpe?citycode=INSEE → declared annual withdrawal volumes for the
// commune, by usage (latest available year). { available:false } when the
// commune has no BNPE record or the service is unreachable.
export async function GET(request: NextRequest) {
  const citycode = request.nextUrl.searchParams.get("citycode")?.trim();
  if (!citycode) {
    return NextResponse.json({ available: false, message: "Paramètre citycode requis" }, { status: 400 });
  }
  const summary = await bnpeForCommune(citycode);
  if (!summary) {
    return NextResponse.json({
      available: false,
      message: "Aucun prélèvement déclaré pour cette commune (ou service indisponible).",
    });
  }
  return NextResponse.json({ available: true, ...summary });
}

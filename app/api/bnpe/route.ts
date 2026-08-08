import { NextRequest, NextResponse } from "next/server";
import { bnpeForCommune } from "@/lib/bnpe";

// GET /api/bnpe?citycode=INSEE → declared annual withdrawal volumes for the
// commune, by usage (latest available year). Three outcomes, never merged:
// available:true, "the commune declares nothing", and "we could not ask".
export async function GET(request: NextRequest) {
  const citycode = request.nextUrl.searchParams.get("citycode")?.trim();
  if (!citycode) {
    return NextResponse.json({ available: false, message: "Paramètre citycode requis" }, { status: 400 });
  }
  const summary = await bnpeForCommune(citycode);
  if (summary === "service-error") {
    return NextResponse.json({
      available: false,
      serviceIndisponible: true,
      message: "Service BNPE injoignable : les prélèvements de cette commune n'ont pas pu être consultés.",
    });
  }
  if (!summary) {
    return NextResponse.json({
      available: false,
      message: "Aucun prélèvement déclaré pour cette commune.",
    });
  }
  return NextResponse.json({ available: true, ...summary });
}

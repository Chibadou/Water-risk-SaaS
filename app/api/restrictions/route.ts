import { NextRequest, NextResponse } from "next/server";
import { restrictionsFor } from "@/lib/restrictionsData";
import { exposureForProfil, type ProfilFlagKey } from "@/lib/restrictions";
import type { NiveauGravite, Profil, ZoneType } from "@/lib/types";

// GET /api/restrictions?dep=28&type=SUP&profil=entreprise
//
// Returns, for each gravity level, the usages actually restricted for this
// profile and the resulting exposure (0-1). This is what turns "45 days in
// alerte renforcée" into "N days where the activity is held back", without
// inventing a single coefficient: the weights are read from the measures the
// prefecture published.

const LEVELS: NiveauGravite[] = ["vigilance", "alerte", "alerte_renforcee", "crise"];

const PROFIL_FLAG: Record<Profil, ProfilFlagKey> = {
  particulier: "concerne_particulier",
  entreprise: "concerne_entreprise",
  collectivite: "concerne_collectivite",
  exploitation: "concerne_exploitation",
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dep = searchParams.get("dep")?.trim() || undefined;
  const typeRaw = searchParams.get("type")?.trim().toUpperCase();
  const zoneType =
    typeRaw === "SUP" || typeRaw === "SOU" || typeRaw === "AEP" ? (typeRaw as ZoneType) : undefined;
  const profilRaw = searchParams.get("profil")?.trim() as Profil | null;
  const profil: Profil =
    profilRaw && profilRaw in PROFIL_FLAG ? profilRaw : "entreprise";

  try {
    const lookup = await restrictionsFor(dep, zoneType);
    if (!lookup) {
      return NextResponse.json({
        available: false,
        message: "Référentiel des restrictions indisponible.",
      });
    }

    const flag = PROFIL_FLAG[profil];
    const exposure: Partial<Record<NiveauGravite, number>> = {};
    const usages: Partial<Record<NiveauGravite, unknown>> = {};
    for (const level of LEVELS) {
      const rows = lookup.byLevel[level];
      if (!rows || rows.length === 0) continue;
      const result = exposureForProfil(rows, flag);
      if (result.exposure !== undefined) exposure[level] = result.exposure;
      usages[level] = { exposure: result.exposure, unread: result.unread, usages: result.usages };
    }

    return NextResponse.json(
      {
        available: Object.keys(exposure).length > 0,
        origin: lookup.origin,
        departement: lookup.departement,
        zoneType: lookup.zoneType,
        profil,
        exposure,
        detail: usages,
      },
      { headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } },
    );
  } catch {
    return NextResponse.json({
      available: false,
      message: "Lecture des restrictions impossible.",
    });
  }
}

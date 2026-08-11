import { NextRequest, NextResponse } from "next/server";
import { restrictionsFor } from "@/lib/restrictionsData";
import { exposureForProfil, type ProfilFlagKey } from "@/lib/restrictions";
import type { NiveauGravite, Profil, ZoneType } from "@/lib/types";
import { NIVEAUX } from "@/lib/juridiction";

// GET /api/restrictions?dep=28&type=SUP&profil=entreprise
//
// Returns, for each gravity level, the usages actually restricted for this
// profile and the resulting exposure (0-1). This is what turns "45 days in
// alerte renforcée" into "N days where the activity is held back", without
// inventing a single coefficient: the weights are read from the measures the
// prefecture published.

const LEVELS = NIVEAUX;

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
    // Two shapes on purpose, and the difference matters:
    //
    //   `exposureInterval` is the truth — [min, max] per level, widened by every
    //   measure the arrêté left unquantified (note §3.2, arbitrage G2).
    //
    //   `exposure` is the LOWER BOUND of that interval — the quantified-only
    //   reading, so it UNDERSTATES rather than overstates. lib/interruption.ts,
    //   the model that needed a scalar, was removed at Sprint 42b; the field is
    //   kept for the weighted simultaneity peak, which genuinely needs one number
    //   per level, and for any client still reading the old shape.
    const exposure: Partial<Record<NiveauGravite, number>> = {};
    const exposureInterval: Partial<Record<NiveauGravite, { min: number; max: number }>> = {};
    const usages: Partial<Record<NiveauGravite, unknown>> = {};
    for (const level of LEVELS) {
      const rows = lookup.byLevel[level];
      if (!rows || rows.length === 0) continue;
      const result = exposureForProfil(rows, flag);
      if (result.exposure !== undefined) {
        exposure[level] = result.exposure.min;
        exposureInterval[level] = result.exposure;
      }
      usages[level] = {
        exposure: result.exposure,
        // Counted apart rather than folded into the mean (note §3.1): a measure
        // nobody can read, a non-binding recommendation and a declaration duty
        // are three different things, and only the first widens the interval.
        unquantified: result.unquantified,
        recommendation: result.recommendation,
        reportingOnly: result.reportingOnly,
        usages: result.usages,
      };
    }

    return NextResponse.json(
      {
        available: Object.keys(exposure).length > 0,
        origin: lookup.origin,
        departement: lookup.departement,
        zoneType: lookup.zoneType,
        profil,
        exposure,
        exposureInterval,
        detail: usages,
        // ADR-006: the decree table, so a measure id resolves to a numero and a
        // zone name. Absent when the shard predates the Sprint 44 rebuild — which
        // the interface must treat as "not yet rebuilt", not as "no source".
        arretes: lookup.arretes,
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

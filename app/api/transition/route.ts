import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { TransitionPayload } from "@/lib/transition";

// GET /api/transition?citycode=INSEE
// Resolves whether the commune sits in a Zone de Répartition des Eaux (ZRE),
// from the Actions-fetched list (data/refdata/zre-communes.json). The list is
// the set of communes whose representative point falls inside a ZRE polygon.

let zreCache: Set<string> | null | undefined;

async function loadZre(): Promise<Set<string> | null> {
  if (zreCache === undefined) {
    try {
      const raw = await fs.readFile(
        path.join(process.cwd(), "data", "refdata", "zre-communes.json"),
        "utf-8",
      );
      const parsed = JSON.parse(raw) as { codes?: string[] };
      const set = new Set(parsed.codes ?? []);
      // An empty list means no usable ZRE coverage was fetched — treat it as
      // "unavailable" rather than asserting every commune is outside a ZRE.
      zreCache = set.size > 0 ? set : null;
    } catch {
      zreCache = null;
    }
  }
  return zreCache;
}

// Paris / Lyon / Marseille arrondissements → commune code (the ZRE list is
// keyed by commune, like the projections dataset).
function normalizeInsee(insee: string): string {
  if (/^751\d\d$/.test(insee)) return "75056";
  if (/^132\d\d$/.test(insee)) return "13055";
  if (/^6938\d$/.test(insee)) return "69123";
  return insee;
}

export async function GET(request: NextRequest) {
  const citycode = request.nextUrl.searchParams.get("citycode")?.trim();
  if (!citycode) {
    return NextResponse.json(
      { available: false, message: "Paramètre citycode requis" } satisfies TransitionPayload,
      { status: 400 },
    );
  }
  const zreSet = await loadZre();
  if (!zreSet) {
    // Data not present on this deployment yet — transition context degrades to
    // the static Plan Eau part only.
    return NextResponse.json({
      available: false,
      citycode,
      message: "Référentiel ZRE non chargé sur ce déploiement.",
    } satisfies TransitionPayload);
  }
  const code = normalizeInsee(citycode);
  return NextResponse.json({
    available: true,
    citycode: code,
    zre: zreSet.has(code),
  } satisfies TransitionPayload);
}

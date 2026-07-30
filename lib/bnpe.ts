// BNPE — Banque Nationale des Prélèvements en Eau (OFB) via Hub'Eau
// `/v1/prelevements`. Declared annual withdrawn volumes per ouvrage, by usage,
// aggregated to the commune. These are annual, redevance-oriented figures —
// structural context on local water pressure, NOT a real-time signal — so we
// present them informatively rather than forcing them into the 0-100 score
// (which would need a resource denominator at the right scale).

const HUBEAU_ROOT = process.env.HUBEAU_BASE_URL ?? "https://hubeau.eaufrance.fr";
const BNPE_BASE = `${HUBEAU_ROOT}/api/v1/prelevements`;
const REVALIDATE = 30 * 24 * 3600; // annual data, refreshed at most yearly
const UPSTREAM_TIMEOUT_MS = 10000;

export interface UsageVolume {
  usage: string; // normalized category
  volumeM3: number;
  /** volume split by where the water is taken from, when the ouvrage is known */
  parMilieu?: Partial<Record<Milieu, number>>;
}

/**
 * Where a withdrawal is taken from. The chronicle rows carry no such field —
 * a documented dead end — but the `referentiel/ouvrages` endpoint does, and
 * joins on `code_ouvrage`. That join is what makes "who takes the water the
 * site depends on" answerable rather than a single undifferentiated total.
 */
export type Milieu = "souterrain" | "superficiel" | "littoral" | "inconnu";

export interface BnpeSummary {
  annee: number;
  totalM3: number;
  ouvrages: number;
  parUsage: UsageVolume[]; // descending by volume
  /** totals per milieu, when the ouvrage referential could be joined */
  parMilieu?: Partial<Record<Milieu, number>>;
  /** true when at least one row could be attributed to a milieu */
  milieuAvailable?: boolean;
  /** commune context (geo.api) for intensity ratios, when available */
  surfaceKm2?: number;
  population?: number;
}

/** Map the raw BNPE usage label to a small, stable set of categories. */
export function normalizeUsage(libelle: string | undefined): string {
  const l = (libelle ?? "").toLowerCase();
  if (!l) return "Autres";
  if (l.includes("potable") || l.includes("alimentation en eau")) return "Eau potable";
  if (l.includes("irrig") || l.includes("agric")) return "Agriculture";
  if (l.includes("énerg") || l.includes("energ") || l.includes("refroid")) return "Énergie";
  if (l.includes("industr")) return "Industrie";
  if (l.includes("canal") || l.includes("canaux")) return "Canaux";
  if (l.includes("tourism") || l.includes("loisir") || l.includes("neige")) return "Tourisme / loisirs";
  return "Autres";
}

/** Map the BNPE milieu label/code to our small set. */
export function normalizeMilieu(libelle: string | undefined, code?: string | undefined): Milieu {
  const l = `${libelle ?? ""} ${code ?? ""}`.toLowerCase();
  if (!l.trim()) return "inconnu";
  if (l.includes("souterrain") || l.includes("sout")) return "souterrain";
  if (l.includes("littoral") || l.includes("mer") || l.includes("transition")) return "littoral";
  if (l.includes("surface") || l.includes("continental") || l.includes("cont")) return "superficiel";
  return "inconnu";
}

function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Aggregate raw chronicle rows into the latest complete year's volumes by
 *  usage. Exported for unit testing (pure, no network). */
export function aggregateBnpe(
  rows: unknown[],
  milieuByOuvrage?: Map<string, Milieu>,
): BnpeSummary | null {
  // Group volumes and ouvrage codes per year.
  const perYear = new Map<
    number,
    {
      byUsage: Map<string, number>;
      byUsageMilieu: Map<string, Map<Milieu, number>>;
      byMilieu: Map<Milieu, number>;
      ouvrages: Set<string>;
      total: number;
    }
  >();
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    const annee = num(r.annee);
    const volume = num(r.volume);
    // Skip zero/negative volumes: an ouvrage that declared no withdrawal
    // shouldn't inflate the total, the usage split, or the ouvrage count.
    if (annee === undefined || volume === undefined || volume <= 0) continue;
    const usage = normalizeUsage(str(r.libelle_usage));
    let y = perYear.get(annee);
    if (!y) {
      y = {
        byUsage: new Map(),
        byUsageMilieu: new Map(),
        byMilieu: new Map(),
        ouvrages: new Set(),
        total: 0,
      };
      perYear.set(annee, y);
    }
    y.byUsage.set(usage, (y.byUsage.get(usage) ?? 0) + volume);
    y.total += volume;
    const ouvrage = str(r.code_ouvrage);
    if (ouvrage) y.ouvrages.add(ouvrage);

    const milieu: Milieu = (ouvrage ? milieuByOuvrage?.get(ouvrage) : undefined) ?? "inconnu";
    y.byMilieu.set(milieu, (y.byMilieu.get(milieu) ?? 0) + volume);
    let m = y.byUsageMilieu.get(usage);
    if (!m) {
      m = new Map();
      y.byUsageMilieu.set(usage, m);
    }
    m.set(milieu, (m.get(milieu) ?? 0) + volume);
  }
  if (perYear.size === 0) return null;

  // Latest year that actually carries volume.
  const years = [...perYear.keys()].sort((a, b) => b - a);
  const annee = years.find((y) => (perYear.get(y)?.total ?? 0) > 0) ?? years[0];
  const y = perYear.get(annee)!;
  const parUsage = [...y.byUsage.entries()]
    .map(([usage, volumeM3]) => {
      const split = y.byUsageMilieu.get(usage);
      const parMilieu: Partial<Record<Milieu, number>> = {};
      if (split) for (const [m, v] of split) parMilieu[m] = Math.round(v);
      return { usage, volumeM3, parMilieu };
    })
    .filter((u) => u.volumeM3 > 0)
    .sort((a, b) => b.volumeM3 - a.volumeM3);

  const parMilieu: Partial<Record<Milieu, number>> = {};
  for (const [m, v] of y.byMilieu) parMilieu[m] = Math.round(v);
  // "inconnu" alone means the join never resolved — say so rather than showing
  // a breakdown that is really a single undifferentiated bucket.
  const milieuAvailable = [...y.byMilieu.keys()].some((m) => m !== "inconnu");

  return {
    annee,
    totalM3: Math.round(y.total),
    ouvrages: y.ouvrages.size,
    parUsage,
    parMilieu,
    milieuAvailable,
  };
}

/** Commune area (km²) and population, for withdrawal-intensity context. */
async function communeContext(insee: string): Promise<{ surfaceKm2?: number; population?: number }> {
  try {
    const res = await fetch(`https://geo.api.gouv.fr/communes/${insee}?fields=surface,population`, {
      next: { revalidate: REVALIDATE },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return {};
    const c = (await res.json()) as { surface?: number; population?: number };
    // geo.api `surface` is in hectares.
    return {
      surfaceKm2: c.surface ? c.surface / 100 : undefined,
      population: c.population,
    };
  } catch {
    return {};
  }
}

/**
 * Withdrawal milieu per ouvrage, from the referential.
 *
 * The chronicles carry the volumes and the usage but not the milieu; the
 * ouvrages referential carries the milieu but not the volumes. Joining them on
 * `code_ouvrage` is what turns a flat "who withdraws how much" into "who
 * withdraws how much from the resource this site actually depends on" — the
 * question a restriction arbitration turns on. Failure is non-fatal: the
 * summary is still returned, with the milieu split reported as unavailable.
 */
async function milieuByOuvrage(insee: string): Promise<Map<string, Milieu>> {
  const out = new Map<string, Milieu>();
  try {
    const url =
      `${BNPE_BASE}/referentiel/ouvrages?code_commune_insee=${encodeURIComponent(insee)}` +
      `&size=5000&fields=code_ouvrage,libelle_type_milieu,code_type_milieu`;
    const res = await fetch(url, {
      next: { revalidate: REVALIDATE },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (res.status !== 200 && res.status !== 206) return out;
    const json = (await res.json()) as { data?: unknown[] };
    for (const row of json.data ?? []) {
      if (typeof row !== "object" || row === null) continue;
      const r = row as Record<string, unknown>;
      const code = str(r.code_ouvrage);
      if (!code) continue;
      out.set(code, normalizeMilieu(str(r.libelle_type_milieu), str(r.code_type_milieu)));
    }
  } catch {
    // Non-fatal by design — see the doc comment.
  }
  return out;
}

export async function bnpeForCommune(citycode: string): Promise<BnpeSummary | null> {
  const insee = citycode.trim();
  if (!/^\d[0-9AB]\d{3}$/i.test(insee)) return null;
  const url =
    `${BNPE_BASE}/chroniques?code_commune_insee=${encodeURIComponent(insee)}` +
    `&size=5000&fields=annee,volume,libelle_usage,code_ouvrage`;
  try {
    const [res, milieux] = await Promise.all([
      fetch(url, {
        next: { revalidate: REVALIDATE },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      }),
      milieuByOuvrage(insee),
    ]);
    if (res.status !== 200 && res.status !== 206) return null;
    const json = (await res.json()) as { data?: unknown[] };
    if (!Array.isArray(json.data)) return null;
    const summary = aggregateBnpe(json.data, milieux);
    if (!summary) return null;
    const ctx = await communeContext(insee);
    return { ...summary, ...ctx };
  } catch {
    return null;
  }
}

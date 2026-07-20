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
}

export interface BnpeSummary {
  annee: number;
  totalM3: number;
  ouvrages: number;
  parUsage: UsageVolume[]; // descending by volume
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

function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Aggregate raw chronicle rows into the latest complete year's volumes by
 *  usage. Exported for unit testing (pure, no network). */
export function aggregateBnpe(rows: unknown[]): BnpeSummary | null {
  // Group volumes and ouvrage codes per year.
  const perYear = new Map<number, { byUsage: Map<string, number>; ouvrages: Set<string>; total: number }>();
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
      y = { byUsage: new Map(), ouvrages: new Set(), total: 0 };
      perYear.set(annee, y);
    }
    y.byUsage.set(usage, (y.byUsage.get(usage) ?? 0) + volume);
    y.total += volume;
    const ouvrage = str(r.code_ouvrage);
    if (ouvrage) y.ouvrages.add(ouvrage);
  }
  if (perYear.size === 0) return null;

  // Latest year that actually carries volume.
  const years = [...perYear.keys()].sort((a, b) => b - a);
  const annee = years.find((y) => (perYear.get(y)?.total ?? 0) > 0) ?? years[0];
  const y = perYear.get(annee)!;
  const parUsage = [...y.byUsage.entries()]
    .map(([usage, volumeM3]) => ({ usage, volumeM3 }))
    .filter((u) => u.volumeM3 > 0)
    .sort((a, b) => b.volumeM3 - a.volumeM3);
  return { annee, totalM3: Math.round(y.total), ouvrages: y.ouvrages.size, parUsage };
}

export async function bnpeForCommune(citycode: string): Promise<BnpeSummary | null> {
  const insee = citycode.trim();
  if (!/^\d[0-9AB]\d{3}$/i.test(insee)) return null;
  const url =
    `${BNPE_BASE}/chroniques?code_commune_insee=${encodeURIComponent(insee)}` +
    `&size=5000&fields=annee,volume,libelle_usage,code_ouvrage`;
  try {
    const res = await fetch(url, {
      next: { revalidate: REVALIDATE },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (res.status !== 200 && res.status !== 206) return null;
    const json = (await res.json()) as { data?: unknown[] };
    return Array.isArray(json.data) ? aggregateBnpe(json.data) : null;
  } catch {
    return null;
  }
}

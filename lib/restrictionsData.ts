// Server-side loader for the embedded restriction reference data.
//
// Both files are built offline by scripts/restrictions/build_restrictions.py and
// shipped in the repo, so reading them costs no egress — the 23 MB source is
// never touched at request time. Same pattern as lib/projections.ts.

import { promises as fs } from "fs";
import path from "path";
import type { NiveauGravite, ZoneType } from "./types";
import type { ProfilFlagKey, RestrictionRow } from "./restrictions";
import { NIVEAUX } from "./juridiction";
import { ZONE_TYPES } from "./rattachement";

const DATA_DIR = path.join(process.cwd(), "data", "restrictions");

const LEVELS = NIVEAUX;
const AUDIENCES: ProfilFlagKey[] = [
  "concerne_particulier",
  "concerne_entreprise",
  "concerne_collectivite",
  "concerne_exploitation",
];

export type RestrictionsByLevel = Partial<Record<NiveauGravite, RestrictionRow[]>>;

/** Where the rows came from: the zone's own arrêtés, or the national guide. */
export type RestrictionsOrigin = "restrictions" | "guide";

interface GuideEntry {
  usage: string;
  thematique?: string | null;
  mesures: Partial<Record<NiveauGravite, string | null>>;
  concerne: Partial<Record<ProfilFlagKey, boolean>>;
}

type ShardPayload = Partial<Record<ZoneType, Partial<Record<NiveauGravite, RestrictionRow[]>>>> & {
  /**
   * Decree table for the department, id → { numero, zone } (Sprint 44).
   * Leading underscore so it cannot collide with a zone type, present or future.
   * Absent from shards built before Sprint 44 — which is why every reader treats
   * it as optional rather than assuming the rebuild has happened.
   */
  _arretes?: Record<string, ArreteRef2>;
};

/** Local mirror of ArreteRef, minus the id which is the record key. */
interface ArreteRef2 {
  numero?: string | null;
  zone?: string | null;
}

const shardCache = new Map<string, ShardPayload | null>();
let guideCache: GuideEntry[] | null | undefined;

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

async function loadGuide(): Promise<GuideEntry[] | null> {
  if (guideCache !== undefined) return guideCache;
  guideCache = await readJson<GuideEntry[]>(path.join(DATA_DIR, "guide.json"));
  return guideCache;
}

async function loadShard(departement: string): Promise<ShardPayload | null> {
  const key = departement.trim().toUpperCase();
  if (shardCache.has(key)) return shardCache.get(key) ?? null;
  // Department codes are two characters (2A/2B included) except overseas (97x).
  if (!/^(\d{2}|2[AB]|9[78]\d)$/.test(key)) {
    shardCache.set(key, null);
    return null;
  }
  const payload = await readJson<ShardPayload>(path.join(DATA_DIR, "zones", `${key}.json`));
  shardCache.set(key, payload);
  return payload;
}

/** The national reference matrix, reshaped per gravity level. */
async function guideByLevel(): Promise<RestrictionsByLevel | null> {
  const guide = await loadGuide();
  if (!guide || guide.length === 0) return null;
  const out: RestrictionsByLevel = {};
  for (const level of LEVELS) {
    const rows: RestrictionRow[] = [];
    for (const entry of guide) {
      const description = entry.mesures?.[level];
      if (!description) continue;
      const concerne: RestrictionRow["concerne"] = {};
      for (const a of AUDIENCES) concerne[a] = entry.concerne?.[a] === true;
      rows.push({
        usage: entry.usage,
        thematique: entry.thematique ?? undefined,
        description,
        concerne,
      });
    }
    if (rows.length > 0) out[level] = rows;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export interface RestrictionsLookup {
  origin: RestrictionsOrigin;
  byLevel: RestrictionsByLevel;
  departement?: string;
  zoneType?: ZoneType;
  /** the department's decree table, so a measure id resolves to a numero */
  arretes?: Record<string, ArreteRef2>;
}

/**
 * Restrictions applying to a site, by gravity level.
 *
 * Prefers what the department actually published for the zone type the site
 * draws from; falls back to the national guide, which is the reference the
 * arrêtés-cadre themselves derive from. The origin is returned so the UI can
 * say which of the two produced the figure rather than presenting a fallback as
 * if it were zone-specific.
 */
export async function restrictionsFor(
  departement: string | undefined,
  zoneType: ZoneType | undefined,
): Promise<RestrictionsLookup | null> {
  if (departement) {
    const shard = await loadShard(departement);
    if (shard) {
      // Without a stated water origin there is no single zone type to read, so
      // merge across types: a usage restricted under any of them is a real
      // constraint for a site that may depend on any of them.
      const types: ZoneType[] = zoneType ? [zoneType] : ZONE_TYPES;
      const byLevel: RestrictionsByLevel = {};
      for (const level of LEVELS) {
        const seen = new Map<string, RestrictionRow>();
        for (const t of types) {
          for (const row of shard[t]?.[level] ?? []) {
            const key = `${row.usage}|${row.description ?? ""}`;
            if (!seen.has(key)) seen.set(key, row);
          }
        }
        if (seen.size > 0) byLevel[level] = [...seen.values()];
      }
      if (Object.keys(byLevel).length > 0) {
        return {
          origin: "restrictions",
          byLevel,
          departement: departement.toUpperCase(),
          zoneType,
          arretes: shard._arretes,
        };
      }
    }
  }
  const guide = await guideByLevel();
  return guide ? { origin: "guide", byLevel: guide } : null;
}

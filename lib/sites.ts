"use client";

import { useCallback, useEffect, useState } from "react";
import type { Profil } from "./types";

// Sites are stored locally in the browser (no account, no server storage).
// localStorage is preferred over cookies: ~5 MB quota and never sent to the server.

export type Secteur =
  | "agriculture"
  | "industrie"
  | "energie"
  | "services"
  | "collectivite"
  | "autre"
  | "particulier";

// Where the site actually takes its water from. This is not cosmetic: VigiEau
// publishes a separate gravity level per zone type (SUP / SOU / AEP), and a
// site is only exposed to the one it draws from. A plant on the mains is not
// affected by a depleted aquifer it never pumps.
export type OrigineEau = "aep" | "superficiel" | "souterrain" | "mixte" | "inconnu";

// ⚠️ `Dependance` ("faible / moyenne / forte / critique") was REMOVED here at
// Sprint 42b (G10). It fed a multiplier I had invented — 0.6 to 1.8 — applied to
// a measured day count, and its four values described an intuition rather than a
// behaviour. `ResponseType` below replaces it by naming what a plant physically
// does when it gets less water. Saved sites that still carry a `dependance` key
// keep it in localStorage and it is simply ignored: there is no honest mapping
// from an invented coefficient onto a physical shape, so reinterpreting the old
// answer would put words in the user's mouth.

/**
 * How production responds to a shortfall — note technique §4.3.
 *
 * This is the field that decides the whole IA result, and it is renseigné by
 * the client rather than guessed: the model has no way to know whether a plant
 * degrades or trips.
 *
 *  - `linear`    — cooling tower, washing. Output follows the volume.
 *  - `threshold` — semiconductor fab. It runs or it does not; it does not run
 *                  at 60 % of its ultra-pure water.
 *  - `stepwise`  — multi-line plant. Lines stop in steps.
 */
export type ResponseType = "linear" | "threshold" | "stepwise";

/**
 * When the site actually draws its water, over a day — note technique §11.4.
 *
 * ⚠️ This exists because the tool ALREADY makes this assumption silently. A
 * time-window measure is counted as a fraction of the day ("interdiction de 8h
 * à 20h" = 12/24), which presumes consumption is uniform across 24 h — false
 * for a 2×8 plant and for an office alike. Declaring the profile replaces an
 * invisible hypothesis with a stated one (arbitrage G11).
 *
 * `uniforme` remains the default, and stays an assumption that gets journalled,
 * never a measurement.
 */
export type LoadProfile = "uniforme" | "journee_ouvree" | "deux_huit" | "continu";

/** Where one usage takes its water. Mirrors the VigiEau zone types. */
export type SourceType = "SUP" | "SOU" | "AEP";

/**
 * One line of the site's usage vector — note technique §2.2, ADR-001.
 *
 * The pivot of the whole model: arrêtés do not restrict companies, they
 * restrict USAGES. Describing a site as a volume-weighted vector of usages is
 * what lets one engine serve an industrial site, an office block and a
 * mains-connected warehouse without a single `if secteur ==`.
 *
 * ⚠️ It is also what makes the effective level weighted rather than maximal
 * (ADR-003): a site drawing 95 % from the mains and 5 % from a river is not "in
 * crisis" because the river is.
 */
export interface SiteUsage {
  /** stable id, so a row can be edited without reordering the vector */
  id: string;
  /** free text for now; the Guide Sécheresse nomenclature is the target (§3.3) */
  usageCode: string;
  /**
   * Annual volume for THIS usage, m³ — declared directly.
   *
   * Usually absent: an operator rarely knows its cubic metres per usage. The
   * form asks for `part` instead, and the volume is derived. Which of the two
   * produced a figure is carried all the way to the export (ADR-006), because
   * "volume declared per usage" and "volume inferred from a declared share" are
   * not the same evidence.
   */
  volumeM3?: number;
  /**
   * Share of the site's total annual volume taken by this usage, 0-1.
   *
   * This is what the form actually collects: "80 % procédé, 15 %
   * refroidissement, 5 % sanitaire" is answerable from memory, where three
   * per-usage volumes are not. `weightedLevel` needs only the shares; the VNP
   * needs volumes, and derives them.
   */
  part?: number;
  sourceType?: SourceType;
  loadProfile?: LoadProfile;
  /**
   * Exempt from restriction: safety, fire defence, environmental protection,
   * public and animal health, sanitation, drinking water (§4.2b). Exempt volume
   * is deducted before ρ is applied, so flagging it wrongly changes the VNP.
   */
  isExempt?: boolean;
  /** the usage the process cannot run without — drives the IA threshold */
  isProcessCritical?: boolean;
}

/**
 * Figures the company holds about its own site, which no public source
 * publishes. VigiEau gives the constraint; only the operator can say what that
 * constraint costs. All optional, all declared, none ever inferred — and none
 * of them enters the composite score (same no-double-counting rule as
 * `secteur`, `origine` and `reponse`).
 */
export interface DonneesInternes {
  /** annual withdrawal, m³ */
  volumeM3?: number;
  /** days of activity the site can run on stored water */
  autonomieJours?: number;
  /** cost of one constrained day, € */
  coutJourEuros?: number;
  /** annual revenue of the site, € — only used as a fallback for the above */
  caAnnuelEuros?: number;
  /**
   * Share of the withdrawal returned to the SAME water body, 0-1 (§4.2c).
   *
   * ⚠️ The note calls this field obligatoire, and the reason is a factor of ten:
   * where withdrawal and discharge happen in the same body, the restriction
   * bears on CONSUMPTION, not withdrawal. Open-circuit cooling returns almost
   * everything; an evaporative process returns almost nothing. Without it the
   * VNP is wrong by an order of magnitude.
   */
  tauxRestitution?: number;
  /** storage the site can draw on, m³ — the volumetric form of `autonomieJours` */
  tamponM3?: number;
  /** below this volume the site stops entirely, m³ (§2.2 min_technical_threshold) */
  seuilTechniqueM3?: number;
  /**
   * How many equal steps a `stepwise` site loses production in.
   *
   * ⚠️ No default. Arbitrage of 2026-08-08 (G17): a `stepwise` site that does not
   * declare its steps gets a motivated refusal rather than a figure computed on
   * an invented number — the treatment already applied to V_ref (G9).
   */
  paliers?: number;
  /**
   * Monthly split of the annual volume: twelve shares, January first, summing
   * to about 1.
   *
   * ⚠️ Arbitrage of 2026-08-08 (G19). Both engines used a FLAT daily need
   * (`V_ref / 365`) while restrictions fall in summer, when many processes
   * consume more — so both understated a summer-peaking site. Declaring the
   * split fixes it; leaving it empty keeps the flat assumption, now JOURNALLED
   * instead of silent.
   *
   * Deliberately not offered as named presets ("summer peak", "flat", "summer
   * trough"): a preset needs multipliers nobody measured, which is the invented
   * coefficient this repo keeps removing. Shares are asked for the same way the
   * usage vector asks for them — the operator approximates, and it is their
   * approximation rather than ours.
   */
  profilMensuel?: number[];
}

export interface SavedSite extends DonneesInternes {
  id: string;
  label: string;
  lon: number;
  lat: number;
  citycode?: string;
  profil: Profil;
  secteur?: Secteur;
  /** optional: legacy sites predate these, hence the safe defaults downstream */
  origine?: OrigineEau;
  /** how production responds to a shortfall (§4.3) — replaced `dependance` (G10) */
  reponse?: ResponseType;
  /**
   * The site's usage vector (ADR-001). Absent on every site saved before
   * Sprint 40 — and an absent vector must read as INCOMPLETE, never as a
   * single usage at 100 %. See `profileCompleteness` in lib/siteProfile.ts.
   */
  usages?: SiteUsage[];
  createdAt: string;
}

const STORAGE_KEY = "hydrovigie.sites.v1";

function isValidSite(s: unknown): s is SavedSite {
  if (typeof s !== "object" || s === null) return false;
  const o = s as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.label === "string" &&
    typeof o.lon === "number" &&
    typeof o.lat === "number" &&
    typeof o.profil === "string"
  );
}

export function loadSites(): SavedSite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isValidSite) : [];
  } catch {
    return [];
  }
}

/** true when the list was actually written. Callers MUST surface a false. */
function persist(sites: SavedSite[]): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sites));
    return true;
  } catch {
    // Quota exceeded, private mode, storage disabled. The old comment claimed
    // "the UI keeps in-memory state", but there is no in-memory state: the list
    // is re-read from localStorage on every event, so the write is the only
    // thing that exists. Failing here means the click did nothing at all.
    return false;
  } finally {
    // Outside the try on purpose: it used to sit after setItem, so a throw
    // skipped it and useSavedSites never refreshed — the button silently did
    // nothing, with no error and no visible state change.
    window.dispatchEvent(new Event("hydrovigie:sites"));
  }
}

export function siteKey(lon: number, lat: number): string {
  return `${lon.toFixed(6)},${lat.toFixed(6)}`;
}

/** Client hook over the localStorage-backed site list, synced across tabs. */
export function useSavedSites() {
  const [sites, setSites] = useState<SavedSite[]>([]);

  useEffect(() => {
    const refresh = () => setSites(loadSites());
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("hydrovigie:sites", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("hydrovigie:sites", refresh);
    };
  }, []);

  /** true when the site is now stored (already-present counts as stored). */
  const addSite = useCallback(
    (site: Omit<SavedSite, "id" | "createdAt">): boolean => {
      const current = loadSites();
      const id = siteKey(site.lon, site.lat);
      if (current.some((s) => s.id === id)) return true;
      return persist([...current, { ...site, id, createdAt: new Date().toISOString() }]);
    },
    [],
  );

  const removeSite = useCallback((id: string): boolean => {
    return persist(loadSites().filter((s) => s.id !== id));
  }, []);

  /** number of sites actually written; -1 when the write itself failed. */
  const importSites = useCallback((incoming: unknown): number => {
    if (!Array.isArray(incoming)) return 0;
    const valid = incoming.filter(isValidSite);
    const current = loadSites();
    const known = new Set(current.map((s) => s.id));
    const added = valid.filter((s) => !known.has(s.id));
    if (added.length === 0) return 0;
    return persist([...current, ...added]) ? added.length : -1;
  }, []);

  const exportSites = useCallback((): string => JSON.stringify(loadSites(), null, 2), []);

  return { sites, addSite, removeSite, importSites, exportSites };
}

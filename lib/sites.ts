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

export interface SavedSite {
  id: string;
  label: string;
  lon: number;
  lat: number;
  citycode?: string;
  profil: Profil;
  secteur?: Secteur;
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

function persist(sites: SavedSite[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sites));
    // storage events only fire in *other* tabs; notify this one explicitly.
    window.dispatchEvent(new Event("hydrovigie:sites"));
  } catch {
    // quota exceeded or private mode: fail silently, UI keeps in-memory state
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

  const addSite = useCallback(
    (site: Omit<SavedSite, "id" | "createdAt">) => {
      const current = loadSites();
      const id = siteKey(site.lon, site.lat);
      if (current.some((s) => s.id === id)) return;
      persist([...current, { ...site, id, createdAt: new Date().toISOString() }]);
    },
    [],
  );

  const removeSite = useCallback((id: string) => {
    persist(loadSites().filter((s) => s.id !== id));
  }, []);

  const importSites = useCallback((incoming: unknown): number => {
    if (!Array.isArray(incoming)) return 0;
    const valid = incoming.filter(isValidSite);
    const current = loadSites();
    const known = new Set(current.map((s) => s.id));
    const added = valid.filter((s) => !known.has(s.id));
    if (added.length > 0) persist([...current, ...added]);
    return added.length;
  }, []);

  const exportSites = useCallback((): string => JSON.stringify(loadSites(), null, 2), []);

  return { sites, addSite, removeSite, importSites, exportSites };
}

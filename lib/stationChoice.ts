"use client";

// Remembers, per site and per indicator kind, which station the user picked
// in the "Ressource en eau à proximité" section. Browser-local, like sites.

const STORAGE_KEY = "hydrovigie.stations.v1";

type ChoiceMap = Record<string, { hydro?: string; piezo?: string }>;

function load(): ChoiceMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return typeof parsed === "object" && parsed !== null ? (parsed as ChoiceMap) : {};
  } catch {
    return {};
  }
}

export function getStationChoice(siteKey: string, kind: "hydro" | "piezo"): string | undefined {
  return load()[siteKey]?.[kind];
}

export function setStationChoice(siteKey: string, kind: "hydro" | "piezo", code: string): void {
  try {
    const map = load();
    map[siteKey] = { ...map[siteKey], [kind]: code };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // private mode / quota: selection just won't persist
  }
}

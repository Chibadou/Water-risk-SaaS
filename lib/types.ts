// Shared types for BAN geocoding and VigiEau API responses.
// Fields are optional/defensive: shapes come from public API docs and may vary.

export type Profil = "particulier" | "entreprise" | "collectivite" | "exploitation";

export type ZoneType = "SUP" | "SOU" | "AEP";

export type NiveauGravite = "vigilance" | "alerte" | "alerte_renforcee" | "crise";

export interface GeocodeResult {
  label: string;
  lon: number;
  lat: number;
  citycode?: string;
  city?: string;
  postcode?: string;
  context?: string;
  score?: number;
  type?: string;
}

export interface VigieauArrete {
  id?: number;
  dateDebutValidite?: string;
  dateFinValidite?: string;
  cheminFichier?: string;
  cheminFichierArreteCadre?: string;
}

export interface VigieauUsage {
  nom?: string;
  thematique?: string;
  description?: string;
  concerneParticulier?: boolean;
  concerneEntreprise?: boolean;
  concerneCollectivite?: boolean;
  concerneExploitation?: boolean;
}

export interface VigieauZone {
  id?: number;
  code?: string;
  nom?: string;
  type?: ZoneType;
  niveauGravite?: NiveauGravite;
  departement?: string;
  arrete?: VigieauArrete;
  usages?: VigieauUsage[];
}

export interface ZonesResponse {
  zones: VigieauZone[];
  /** true when VigiEau returned 404: department not covered or no alert zone at this point */
  notCovered: boolean;
  /** non-fatal message to surface to the user (e.g. upstream error) */
  message?: string;
}

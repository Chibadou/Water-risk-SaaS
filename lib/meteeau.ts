// MétéEAU des nappes (BRGM) — outbound link to the official 6-month groundwater
// forecast (client-safe, no fs, no I/O).
//
// Why a link and not an integration: the MétéEAU forecast API
// (api.meteeaunappes.brgm.fr) is OAuth2-gated behind BRGM's Keycloak — global
// `security` on every operation, 401 `WWW-Authenticate: Bearer` — and no
// forecast dataset is published on data.gouv. Re-hosting the product would also
// be unviable (national coverage, monthly expiry) and legally unclear. Sending
// users to the source keeps the data fresh, attributed and correctly licensed,
// and matches the local-only product decision.
//
// The anticipation index (lib/anticipation.ts) is unaffected: it keeps scoring
// the *observed* groundwater IPS from the open Hub'Eau/ADES series. This link is
// a consultable forward-looking complement, not a score component.

/**
 * Public MétéEAU des nappes viewer (BRGM). Confirmed by the `mapurl` probe: the
 * institutional site meteeaunappes.brgm.fr is a Drupal shell that links out to
 * this Angular app, which is the actual forecast map (HTTP 200, `<app-root>`,
 * title "MétéEau Nappes").
 */
export const METEEAU_BASE = "https://app.meteeaunappes.brgm.fr/";

/**
 * Whether the public viewer accepts a map-centering scheme in its URL.
 *
 * False: the probe found no lat/lon/bbox parameter on the app's entry point —
 * it is an Angular SPA whose routes are defined inside its JS bundles. Rather
 * than append parameters the viewer would silently ignore (a link that looks
 * centered but is not), we link to the app and let the user search their sector.
 * If a centering route is ever confirmed, set this true and the builder below
 * starts emitting it — nothing else needs to change.
 */
export const METEEAU_SUPPORTS_CENTERING = false;

/**
 * Best available link to the official 6-month groundwater forecast, centered on
 * the site when the viewer supports it. Pure — no I/O.
 *
 * Degrades to the plain entry point for missing or out-of-range coordinates, so
 * the UI can always render a working link.
 */
export function meteeauForecastUrl(lat?: number, lon?: number): string {
  if (!METEEAU_SUPPORTS_CENTERING) return METEEAU_BASE;
  const usable =
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180;
  if (!usable) return METEEAU_BASE;
  const p = new URLSearchParams({ lat: lat.toFixed(5), lon: lon.toFixed(5) });
  return `${METEEAU_BASE}?${p.toString()}`;
}

/** What the official forecast is, in plain terms. */
export const METEEAU_NOTE =
  "MétéEAU des nappes est l'outil officiel du BRGM : il publie, pour des piézomètres de " +
  "référence, une prévision probabiliste du niveau des nappes à 6 mois, comparée aux seuils " +
  "de sécheresse. C'est la projection de référence sur l'horizon qui suit l'étiage en cours.";

/** Why we link out instead of embedding the forecast — shown next to the link. */
export const METEEAU_WHY_LINK =
  "Cette prévision est produite et mise à jour chaque mois par le BRGM, et diffusée via son " +
  "outil officiel dont l'accès est authentifié : nous ne pouvons pas l'afficher directement " +
  "ici sans en ré-héberger une copie, qui serait vite périmée. Nous vous renvoyons donc vers " +
  "la source, toujours à jour. Notre indice d'anticipation ci-dessus reste calculé sur les " +
  "niveaux de nappe réellement observés (données ouvertes Hub'Eau/ADES).";

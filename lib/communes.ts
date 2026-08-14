// Rattachement inverse d'un point à une commune française.
//
// ⚠️ Ce module existe pour une raison précise, trouvée en production le
// 2026-08-13 : le rattachement inverse était écrit deux fois — une fois dans
// `/api/projection` — et il repliait **le tableau vide et la panne réseau sur
// le même `null`**. Un point en pleine mer et un référentiel injoignable
// devenaient indiscernables, et la page d'analyse remplissait alors ses
// panneaux avec les stations les plus proches, à cinquante kilomètres de là.
//
// Le fetch vit ici, l'interprétation vit dans `lib/juridiction.ts`
// (`situationPoint`, fonction pure). La séparation est ce qui rend les trois
// états testables : on ne peut pas provoquer une panne du référentiel à
// volonté, mais on peut lui passer `{ injoignable: true }`.

import { situationPoint, type ReponseCommunes, type Situation } from "./juridiction";

const GEO_COMMUNES = "https://geo.api.gouv.fr/communes";
/** Le découpage communal bouge une fois par an : un mois de cache est prudent. */
const REVALIDATE_S = 30 * 24 * 3600;
const TIMEOUT_MS = 8000;

/** Ce que le référentiel a répondu, sans interprétation. */
export async function interrogerCommunes(lat: number, lon: number): Promise<ReponseCommunes> {
  try {
    const url = `${GEO_COMMUNES}?lat=${lat}&lon=${lon}&fields=code,nom&format=json`;
    const res = await fetch(url, {
      next: { revalidate: REVALIDATE_S },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // ⚠️ Un 200 avec une liste vide est une RÉPONSE (« aucune commune ici ») ;
    // un 500 ou un timeout est une ABSENCE de réponse. Tout ce module tient
    // dans cette distinction.
    if (!res.ok) return { injoignable: true };
    const arr = (await res.json()) as Array<{ code?: string | null; nom?: string | null }>;
    if (!Array.isArray(arr)) return { injoignable: true };
    return { injoignable: false, communes: arr };
  } catch {
    return { injoignable: true };
  }
}

/** Le point est-il un lieu ? Trois réponses possibles, jamais deux. */
export async function situerPoint(lat: number, lon: number): Promise<Situation> {
  return situationPoint(await interrogerCommunes(lat, lon));
}

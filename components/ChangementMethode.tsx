"use client";

import { useCallback, useSyncExternalStore } from "react";
import { CHANGEMENTS_METHODE, MODELE_VERSION, modeleLigne } from "@/lib/modele";

// A dated, dismissible notice that the figures have changed METHOD, not risk.
//
// ⚠️ Why a notice and not a line in the changelog. Sprint 43 replaced the maximum
// across resources with a volume-weighted level. That generally LOWERS the scores
// a user has already read, and a portfolio ranking can reorder. Without a word,
// the honest reading available to them is "my risk improved" — which is false, and
// which we would have caused.
//
// It is dismissible and remembers the dismissal per model version: a warning that
// cannot be turned off becomes furniture, and furniture is not read. A new version
// brings it back, which is the point.

const KEY = "hydrovigie.methode.vue";
const EVENT = "hydrovigie:methode";

/** Subscribe to our own dismissal event, and to other tabs' storage writes. */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function lu(): boolean {
  try {
    return window.localStorage.getItem(KEY) === MODELE_VERSION;
  } catch {
    // Private mode or storage disabled: treat as not yet read. A notice shown
    // twice is better than one never shown.
    return false;
  }
}

export default function ChangementMethode() {
  // ⚠️ `useSyncExternalStore` rather than useState + useEffect. localStorage read
  // during render would make the server and client markup disagree; a setState in
  // an effect is what the lint rule forbids (and it double-renders). The third
  // argument is the SERVER snapshot: `true` means "already read", so the server
  // renders nothing and the client decides — no hydration mismatch either way.
  const visible = !useSyncExternalStore(subscribe, lu, () => true);
  // Both hooks before any early return: a hook placed after a conditional return
  // runs in a different order between renders.
  const masquer = useCallback(() => {
    try {
      window.localStorage.setItem(KEY, MODELE_VERSION);
    } catch {
      // Nothing to do: the notice will simply reappear next time.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const dernier = CHANGEMENTS_METHODE[0];
  if (!visible || !dernier) return null;

  return (
    <section
      aria-label="Changement de méthode de calcul"
      className="rounded-xl border border-sky-200 bg-sky-50/60 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">
            Les chiffres ont changé de méthode, pas de risque
          </h2>
          <p className="mt-1 text-sm text-ink-muted">{dernier.quoi}</p>
          <p className="mt-2 text-sm text-ink-muted">
            <strong>
              {dernier.sens === "baisse"
                ? "Vos scores vont généralement baisser"
                : dernier.sens === "hausse"
                  ? "Vos scores vont généralement monter"
                  : "Vos chiffres peuvent bouger dans les deux sens"}
            </strong>{" "}
            et un classement de portefeuille peut se réordonner.{" "}
            <em>
              Ce n&apos;est pas une évolution de votre exposition : c&apos;est une correction de la
              façon de la calculer.
            </em>
          </p>
        </div>
        <button
          type="button"
          onClick={masquer}
          className="shrink-0 rounded-lg border border-line-strong bg-white px-3 py-1.5 text-sm font-medium text-ink-muted hover:bg-canvas"
        >
          J&apos;ai compris
        </button>
      </div>
      <details className="mt-3 border-t border-sky-200 pt-2">
        <summary className="cursor-pointer text-sm font-medium text-ink-muted">
          Pourquoi l&apos;ancien chiffre était faux
        </summary>
        <p className="mt-2 text-sm text-ink-subtle">{dernier.motif}</p>
        <p className="mt-2 text-xs text-ink-subtle">{modeleLigne()}</p>
      </details>
    </section>
  );
}

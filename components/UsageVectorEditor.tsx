"use client";

import { useCallback } from "react";
import { vectorSum } from "@/lib/siteProfile";
import type { LoadProfile, SiteUsage, SourceType } from "@/lib/sites";

// The site's usage vector, entered as a SPLIT rather than as cubic metres.
//
// Arbitrage of 2026-08-08: an operator can answer "80 % procédé, 15 %
// refroidissement, 5 % sanitaire" from memory, and cannot answer "how many m³
// did your cooling circuit take last year". Asking for shares is the difference
// between a form that gets filled and a form that stays empty — and shares are
// all `weightedLevel` needs, since weighting is scale-free.
//
// The m³ the VNP needs are derived from the share and the site total, and the
// derivation is LABELLED (`origine: "deduit_part"`) all the way to the export.
// A volume inferred from a declared share is not the same evidence as a volume
// declared per usage, and ADR-006 says the reader must be able to tell.

const SOURCES: { id: SourceType; label: string }[] = [
  { id: "AEP", label: "Réseau d'eau potable" },
  { id: "SUP", label: "Cours d'eau" },
  { id: "SOU", label: "Forage / nappe" },
];

const PROFILS: { id: LoadProfile; label: string }[] = [
  // `uniforme` first: it is the default, and it is the assumption the tool
  // already made silently before this field existed.
  { id: "uniforme", label: "Uniforme (hypothèse par défaut)" },
  { id: "journee_ouvree", label: "Journée ouvrée (8h-18h)" },
  { id: "deux_huit", label: "2×8" },
  { id: "continu", label: "Continu 24/7" },
];

// Suggestions, not a taxonomy. The Guide Sécheresse nomenclature is the target
// (§3.3) and is not wired yet; these are free-text hints so the field is
// usable today without inventing a competing vocabulary.
const SUGGESTIONS = [
  "Procédé",
  "Refroidissement",
  "Lavage / nettoyage",
  "Sanitaires",
  "Espaces verts",
  "Défense incendie",
];

export interface UsageVectorEditorProps {
  usages: SiteUsage[];
  onChange: (usages: SiteUsage[]) => void;
  /** the site's total annual volume, only used to show what a share is worth */
  volumeTotalM3?: number;
  disabled?: boolean;
}

const inputClass =
  "rounded-md border border-line bg-white px-2 py-1.5 text-sm text-ink " +
  "focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50";

let seq = 0;
const newId = () => `u${Date.now().toString(36)}${(seq++).toString(36)}`;

export default function UsageVectorEditor({
  usages,
  onChange,
  volumeTotalM3,
  disabled,
}: UsageVectorEditorProps) {
  const sum = vectorSum(usages);

  const update = useCallback(
    (id: string, patch: Partial<SiteUsage>) => {
      onChange(usages.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    },
    [usages, onChange],
  );

  const add = useCallback(() => {
    onChange([
      ...usages,
      { id: newId(), usageCode: "", sourceType: "AEP", loadProfile: "uniforme" },
    ]);
  }, [usages, onChange]);

  const remove = useCallback(
    (id: string) => onChange(usages.filter((u) => u.id !== id)),
    [usages, onChange],
  );

  return (
    <div className="mt-3">
      <p className="text-xs text-ink-subtle">
        Répartissez le volume du site entre ses usages, en pourcentages. C&apos;est cette répartition
        qui remplace le maximum des niveaux par un niveau <strong>pondéré</strong> : un site à 95 % sur
        le réseau n&apos;est pas en crise parce qu&apos;une rivière l&apos;est.
      </p>

      {usages.length > 0 && (
        <ul className="mt-3 space-y-2">
          {usages.map((u, i) => (
            <li key={u.id} className="rounded-lg border border-line bg-white p-2">
              <div className="grid gap-2 sm:grid-cols-[1fr_5rem_9rem]">
                <label className="flex flex-col gap-1 text-xs text-ink-muted">
                  <span className="sr-only sm:not-sr-only">Usage</span>
                  <input
                    type="text"
                    list="usage-suggestions"
                    disabled={disabled}
                    placeholder="ex. Refroidissement"
                    value={u.usageCode}
                    onChange={(e) => update(u.id, { usageCode: e.target.value })}
                    className={inputClass}
                    aria-label={`Usage ${i + 1}`}
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs text-ink-muted">
                  <span className="sr-only sm:not-sr-only">Part (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    inputMode="decimal"
                    disabled={disabled}
                    placeholder="80"
                    // Stored as a 0-1 share; typed as a percentage.
                    value={u.part === undefined ? "" : Math.round(u.part * 1000) / 10}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n = raw === "" ? undefined : Number(raw);
                      // Empty means "not stated", which is not 0 %: a row with
                      // no share stays out of the weighting instead of
                      // contributing a false zero.
                      const ok = n !== undefined && Number.isFinite(n) && n >= 0 && n <= 100;
                      update(u.id, { part: ok ? n / 100 : undefined });
                    }}
                    className={`${inputClass} tabular-nums`}
                    aria-label={`Part de l'usage ${i + 1}, en pourcentage`}
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs text-ink-muted">
                  <span className="sr-only sm:not-sr-only">Origine de l&apos;eau</span>
                  <select
                    disabled={disabled}
                    value={u.sourceType ?? ""}
                    onChange={(e) =>
                      update(u.id, { sourceType: (e.target.value || undefined) as SourceType })
                    }
                    className={inputClass}
                    aria-label={`Origine de l'eau pour l'usage ${i + 1}`}
                  >
                    <option value="">Non précisée</option>
                    {SOURCES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-muted">
                <label className="flex items-center gap-1.5">
                  <span>Charge</span>
                  <select
                    disabled={disabled}
                    value={u.loadProfile ?? "uniforme"}
                    onChange={(e) => update(u.id, { loadProfile: e.target.value as LoadProfile })}
                    className={`${inputClass} py-1`}
                    aria-label={`Profil de charge de l'usage ${i + 1}`}
                  >
                    {PROFILS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label
                  className="flex items-center gap-1.5"
                  title="Sécurité, défense incendie, santé publique et animale, salubrité, eau potable. Le volume exempté est déduit avant application de la restriction."
                >
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={u.isExempt ?? false}
                    onChange={(e) => update(u.id, { isExempt: e.target.checked || undefined })}
                    className="size-4 rounded border-line"
                  />
                  <span>Exempté</span>
                </label>

                <label
                  className="flex items-center gap-1.5"
                  title="Usage sans lequel le procédé s'arrête. Distingue une installation qui ralentit d'une installation qui s'arrête net."
                >
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={u.isProcessCritical ?? false}
                    onChange={(e) => update(u.id, { isProcessCritical: e.target.checked || undefined })}
                    className="size-4 rounded border-line"
                  />
                  <span>Critique</span>
                </label>

                {u.part !== undefined && volumeTotalM3 !== undefined && volumeTotalM3 > 0 && (
                  <span className="text-ink-subtle tabular-nums">
                    ≈ {Math.round(u.part * volumeTotalM3).toLocaleString("fr-FR")} m³/an{" "}
                    <span className="italic">(déduit de la part)</span>
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => remove(u.id)}
                  disabled={disabled}
                  className="ml-auto rounded px-2 py-1 text-ink-subtle hover:bg-slate-100 hover:text-ink"
                  aria-label={`Retirer l'usage ${i + 1}${u.usageCode ? ` (${u.usageCode})` : ""}`}
                >
                  Retirer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <datalist id="usage-suggestions">
        {SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={add}
          disabled={disabled}
          className="rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink-muted hover:bg-slate-50"
        >
          + Ajouter un usage
        </button>

        {/* The sum is REPORTED, never enforced. A vector at 85 % is not invalid —
            the operator may not have accounted for the rest — and refusing the
            input would throw away the 85 % that is known. */}
        {sum.renseignes > 0 && (
          <p
            className={`text-xs tabular-nums ${
              sum.complet ? "text-ink-subtle" : "text-amber-700"
            }`}
          >
            Total : {Math.round(sum.total * 1000) / 10} %
            {sum.complet
              ? " — réparti."
              : sum.ecart < 0
                ? ` — il manque ${Math.round(-sum.ecart * 1000) / 10} %. La pondération portera sur ce qui est décrit.`
                : ` — vous dépassez de ${Math.round(sum.ecart * 1000) / 10} %.`}
          </p>
        )}
      </div>
    </div>
  );
}

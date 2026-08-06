"use client";

import AddressAutocomplete from "./AddressAutocomplete";
import { SECTEURS } from "@/lib/secteur";
import { DEPENDANCES, ORIGINES } from "@/lib/exposition";
import type { Dependance, DonneesInternes, OrigineEau, Secteur } from "@/lib/sites";
import type { GeocodeResult } from "@/lib/types";

interface Props {
  secteur: Secteur;
  onSecteurChange: (s: Secteur) => void;
  origine: OrigineEau;
  onOrigineChange: (o: OrigineEau) => void;
  dependance: Dependance;
  onDependanceChange: (d: Dependance) => void;
  interne: DonneesInternes;
  onInterneChange: (d: DonneesInternes) => void;
  onSelect: (result: GeocodeResult) => void;
  disabled?: boolean;
}

/** Field spec for the internal-data block — one row per declared figure. */
const CHAMPS_INTERNES: Array<{
  key: keyof DonneesInternes;
  label: string;
  unit: string;
  placeholder: string;
  title: string;
}> = [
  {
    key: "volumeM3",
    label: "Volume prélevé",
    unit: "m³/an",
    placeholder: "ex. 36 500",
    title:
      "Volume annuel prélevé ou consommé par le site. C'est la donnée qui convertit les jours contraints en m³ non prélevables — aucune source publique ne la porte par site, seule votre entreprise la connaît.",
  },
  {
    key: "autonomieJours",
    label: "Autonomie",
    unit: "jours",
    placeholder: "ex. 3",
    title:
      "Nombre de jours d'activité que le site peut tenir sur ses réserves (bâche, cuve, retenue). Une restriction plus courte que cette autonomie gêne sans arrêter — l'outil le calcule épisode par épisode.",
  },
  {
    key: "coutJourEuros",
    label: "Coût d'un jour contraint",
    unit: "€/j",
    placeholder: "ex. 12 000",
    title:
      "Perte associée à une journée d'activité contrainte. Si vous ne l'avez pas, renseignez plutôt le chiffre d'affaires ci-dessous : l'outil appliquera un ordre de grandeur générique, clairement signalé comme tel.",
  },
  {
    key: "caAnnuelEuros",
    label: "CA annuel du site",
    unit: "€",
    placeholder: "ex. 8 000 000",
    title:
      "Utilisé uniquement en repli, quand le coût d'un jour contraint n'est pas renseigné : un jour d'interruption est alors estimé à 0,5 % du CA annuel (ordre de grandeur Swiss Re, tous périls confondus).",
  },
];

export default function AddressSearch({
  secteur,
  onSecteurChange,
  origine,
  onOrigineChange,
  dependance,
  onDependanceChange,
  interne,
  onInterneChange,
  onSelect,
  disabled,
}: Props) {
  const selectClass =
    "rounded-lg border border-slate-300 bg-white px-3 py-3 text-base shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <AddressAutocomplete onSelect={onSelect} disabled={disabled} />
      <select
        value={secteur}
        disabled={disabled}
        onChange={(e) => onSecteurChange(e.target.value as Secteur)}
        className={selectClass}
        aria-label="Secteur d'activité du site"
        title="Le secteur détermine les restrictions VigiEau applicables et l'interprétation de leur impact opérationnel. HydroVigie est conçu pour les sites professionnels ; l'usage domestique (particulier) reste disponible mais secondaire."
      >
        <optgroup label="Site professionnel">
          {SECTEURS.filter((o) => !o.domestic).map((o) => (
            <option key={o.id} value={o.id}>
              {o.icon} {o.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Usage domestique (secondaire)">
          {SECTEURS.filter((o) => o.domestic).map((o) => (
            <option key={o.id} value={o.id}>
              {o.icon} {o.label}
            </option>
          ))}
        </optgroup>
      </select>
      </div>

      {/* Second row: what the site draws from, and how much it depends on it.
          Kept off the address row so the address field keeps its width. Both
          are optional refinements of the constrained-days estimate — neither
          enters the composite score. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <span className="shrink-0">Origine de l&apos;eau</span>
          <select
            value={origine}
            disabled={disabled}
            onChange={(e) => onOrigineChange(e.target.value as OrigineEau)}
            className={`${selectClass} py-2 text-sm`}
            aria-label="Origine de l'eau du site"
            title="VigiEau publie un niveau de gravité distinct par type de zone (eaux superficielles, souterraines, eau potable). Un site raccordé au réseau n'est pas exposé à la nappe qu'il ne pompe pas : préciser l'origine cible la bonne zone au lieu de retenir la plus sévère."
          >
            {ORIGINES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <span className="shrink-0">Dépendance à l&apos;eau</span>
          <select
            value={dependance}
            disabled={disabled}
            onChange={(e) => onDependanceChange(e.target.value as Dependance)}
            className={`${selectClass} py-2 text-sm`}
            aria-label="Dépendance de l'activité à l'eau"
            title="Deux sites d'un même secteur ne sont pas également exposés : une tour de bureaux et un centre de données relèvent tous deux des services. Ce réglage module la part d'activité empêchée, sans jamais dépasser 100 %."
          >
            {DEPENDANCES.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Internal figures. Collapsed by default: they turn constrained days
          into m³ and euros, but a first-time visitor must not have to fill a
          form to get an answer. */}
      <details className="rounded-lg border border-line bg-slate-50/60 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-ink-muted select-none">
          Données internes du site{" "}
          <span className="font-normal text-ink-subtle">
            (optionnel — convertit les jours contraints en m³ et en €)
          </span>
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CHAMPS_INTERNES.map((c) => (
            <label key={c.key} className="flex flex-col gap-1 text-sm text-ink-muted" title={c.title}>
              <span>
                {c.label} <span className="text-ink-subtle">({c.unit})</span>
              </span>
              <input
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                disabled={disabled}
                placeholder={c.placeholder}
                value={interne[c.key] ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  // An emptied field means "not declared", which is not the
                  // same as zero: undefined keeps the site out of the totals
                  // instead of contributing a false 0 m³.
                  const n = raw === "" ? undefined : Number(raw);
                  onInterneChange({
                    ...interne,
                    [c.key]: n !== undefined && Number.isFinite(n) && n >= 0 ? n : undefined,
                  });
                }}
                className={`${selectClass} py-2 text-sm`}
                aria-label={`${c.label} (${c.unit})`}
              />
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-subtle">
          Ces chiffres restent dans votre navigateur, comme le reste de vos sites — ils ne sont
          envoyés à aucun serveur. Un champ laissé vide n&apos;est pas compté comme zéro : le site
          est simplement marqué non estimé.
        </p>
      </details>
    </div>
  );
}

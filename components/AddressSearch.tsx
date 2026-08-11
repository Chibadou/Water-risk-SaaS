"use client";

import AddressAutocomplete from "./AddressAutocomplete";
import UsageVectorEditor from "./UsageVectorEditor";
import { SECTEURS } from "@/lib/secteur";
import { REPONSES, ORIGINES } from "@/lib/exposition";
import type { DonneesInternes, OrigineEau, ResponseType, Secteur, SiteUsage } from "@/lib/sites";
import type { GeocodeResult } from "@/lib/types";
import InfoNote from "./ui/InfoNote";

interface Props {
  secteur: Secteur;
  onSecteurChange: (s: Secteur) => void;
  origine: OrigineEau;
  onOrigineChange: (o: OrigineEau) => void;
  reponse?: ResponseType;
  onReponseChange: (r: ResponseType | undefined) => void;
  interne: DonneesInternes;
  usages: SiteUsage[];
  onUsagesChange: (usages: SiteUsage[]) => void;
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
  /** upper bound for the input, when the field is a share rather than a volume */
  max?: number;
  /** factor from what the user types to what is stored (e.g. 95 % → 0.95) */
  scale?: number;
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
  {
    key: "tauxRestitution",
    label: "Part rejetée dans la même masse d'eau",
    unit: "%",
    placeholder: "ex. 95",
    max: 100,
    scale: 0.01,
    title:
      "Part du volume prélevé qui retourne au même cours d'eau ou à la même nappe. C'est la donnée qui distingue prélever de consommer : un refroidissement en circuit ouvert restitue presque tout, un procédé évaporatif presque rien — et le volume non prélevable change d'un ordre de grandeur entre les deux. Laissée vide, l'outil ne calcule pas de consommation plutôt que de supposer que vous consommez tout.",
  },
  {
    key: "tamponM3",
    label: "Réserve mobilisable",
    unit: "m³",
    placeholder: "ex. 1 200",
    title:
      "Volume stocké que le site peut consommer pendant une restriction (bâche, cuve, retenue). Version volumique de l'autonomie en jours : c'est elle qui absorbe les épisodes courts.",
  },
  {
    key: "seuilTechniqueM3",
    label: "Seuil technique d'arrêt",
    unit: "m³/j",
    placeholder: "ex. 40",
    title:
      "Volume journalier en dessous duquel le site ne peut plus fonctionner du tout. Une installation qui s'arrête net ne se comporte pas comme une installation qui ralentit — c'est ce seuil qui distingue les deux.",
  },
];

export default function AddressSearch({
  secteur,
  onSecteurChange,
  origine,
  onOrigineChange,
  reponse,
  onReponseChange,
  interne,
  onInterneChange,
  usages,
  onUsagesChange,
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
        {/* ⚠️ `min-w-0` on the label and `w-full` on the select are load-bearing.
            A <select> is sized by its LONGEST option, and "Par paliers (lignes de
            production)" made it 278 px wide — enough to push the row 90 px past a
            390 px viewport. Measured in the e2e overflow check, which caught it
            the moment the option list changed at Sprint 42b. */}
        <label className="flex min-w-0 items-center gap-2 text-sm text-ink-muted">
          <span className="shrink-0">Origine de l&apos;eau</span>
          <select
            value={origine}
            disabled={disabled}
            onChange={(e) => onOrigineChange(e.target.value as OrigineEau)}
            className={`${selectClass} w-full min-w-0 py-2 text-sm`}
            aria-label="Origine de l'eau du site"
          >
            {ORIGINES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 items-center gap-2 text-sm text-ink-muted">
          <span className="shrink-0">Réponse de la production</span>
          <select
            value={reponse ?? ""}
            disabled={disabled}
            onChange={(e) =>
              onReponseChange(e.target.value === "" ? undefined : (e.target.value as ResponseType))
            }
            className={`${selectClass} w-full min-w-0 py-2 text-sm`}
            aria-label="Comment la production réagit à un manque d'eau"
          >
            {/* ⚠️ The empty option is FIRST and is the default. "Non renseignée"
                is a real answer here: the engine applies `linear` and journals
                that it did, which the user can read and contest. Pre-selecting a
                shape would put that choice in their mouth. */}
            <option value="">Non renseignée</option>
            {REPONSES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* What the three selectors above actually do. This used to live in
          `title` attributes — invisible on a touch screen, which is exactly
          where a first-time visitor asks the question. */}
      <InfoNote label="À quoi servent ces trois réglages ?">
        <p>
          <strong>Secteur d&apos;activité</strong> — détermine à la fois les restrictions VigiEau
          qui vous sont applicables et l&apos;interprétation de leur impact opérationnel.
          HydroVigie vise les sites professionnels ; l&apos;usage domestique reste disponible mais
          secondaire.
        </p>
        <p className="mt-2">
          <strong>Origine de l&apos;eau</strong> — VigiEau publie un niveau de gravité distinct par
          type de zone (eaux superficielles, souterraines, eau potable). Un site raccordé au réseau
          n&apos;est pas exposé à la nappe qu&apos;il ne pompe pas : préciser l&apos;origine cible
          la bonne zone au lieu de retenir systématiquement la plus sévère.
        </p>
        <p className="mt-2">
          <strong>Réponse de la production</strong> — c&apos;est le réglage qui décide de
          l&apos;interruption d&apos;activité, et deux sites d&apos;un même secteur n&apos;y répondent
          pas pareil. Une tour de refroidissement perd 20 % de production pour 20 % d&apos;eau en
          moins ; une usine de semi-conducteurs ne tourne pas à 60 % de son eau ultrapure, elle
          s&apos;arrête. À nombre de jours de restriction égal, ces deux sites ne subissent pas le
          même arrêt.
        </p>
        <p className="mt-2">
          Laissez « non renseignée » si vous ne savez pas : l&apos;outil applique alors la réponse
          proportionnelle et l&apos;<strong>inscrit dans son journal d&apos;hypothèses</strong>, où
          vous pourrez le contester. Les formes « tout ou rien » et « par paliers » demandent
          respectivement un seuil technique et un nombre de paliers ; sans eux, l&apos;outil refuse de
          calculer plutôt que d&apos;inventer un chiffre.
        </p>
        <p className="mt-2">
          Ni l&apos;origine ni la réponse n&apos;entrent dans le score composite : elles affinent les
          trois sorties (jours sous statut, volume non prélevable, interruption d&apos;activité).
        </p>
      </InfoNote>

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
                max={c.max}
                step="any"
                inputMode="decimal"
                disabled={disabled}
                placeholder={c.placeholder}
                // Stored as a share (0-1), typed as a percentage: the scale is
                // undone here so the stored value stays in the engine's unit.
                value={
                  interne[c.key] === undefined
                    ? ""
                    : c.scale
                      ? Math.round((interne[c.key] as number) / c.scale)
                      : (interne[c.key] as number)
                }
                onChange={(e) => {
                  const raw = e.target.value;
                  // An emptied field means "not declared", which is not the
                  // same as zero: undefined keeps the site out of the totals
                  // instead of contributing a false 0 m³.
                  const n = raw === "" ? undefined : Number(raw);
                  const ok = n !== undefined && Number.isFinite(n) && n >= 0 && (c.max === undefined || n <= c.max);
                  onInterneChange({
                    ...interne,
                    [c.key]: ok ? (n as number) * (c.scale ?? 1) : undefined,
                  });
                }}
                className={`${selectClass} py-2 text-sm`}
                aria-label={`${c.label} (${c.unit})`}
              />
            </label>
          ))}
        </div>
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-sm font-medium text-ink-muted">Répartition par usage</p>
          <UsageVectorEditor
            usages={usages}
            onChange={onUsagesChange}
            volumeTotalM3={interne.volumeM3}
            disabled={disabled}
          />
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

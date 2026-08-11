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

/** Month labels for the monthly-split grid: short for the header, long for the a11y name. */
const MOIS_COURTS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MOIS_LONGS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

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

        {/* ⚠️ `paliers` appears HERE, inline and conditionally, rather than in the
            collapsed internal-data block below. Two reasons, and the first is a defect
            this fixes: the prose under this row already TELLS the reader that « par
            paliers » requires a step count, while the form offered nowhere to put one.
            Naming a requirement you do not let someone satisfy is worse than not
            mentioning it. Second, the question only exists because they just chose that
            response, so it belongs next to the choice and not two clicks away.

            ⚠️ No default (G17). `computeIa` refuses to compute rather than assume a
            number of steps, and the refusal is the point — see lib/ia.ts. */}
        {reponse === "stepwise" && (
          <label
            className="flex min-w-0 items-center gap-2 text-sm text-ink-muted"
            title="En combien de crans égaux la production tombe. Une usine à quatre lignes qui les arrête une par une a quatre paliers. Sans ce nombre, l'outil refuse de calculer l'interruption plutôt que d'en inventer un."
          >
            <span className="shrink-0">Nombre de paliers</span>
            <input
              type="number"
              min={2}
              step={1}
              inputMode="numeric"
              disabled={disabled}
              placeholder="ex. 4"
              value={interne.paliers ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                const n = raw === "" ? undefined : Number(raw);
                // ⚠️ Below 2 is not a stepwise site — it is all-or-nothing, and
                // `computeIa` journals exactly that. Stored as undefined so the
                // refusal fires rather than a 1-step computation nobody meant.
                const ok = n !== undefined && Number.isFinite(n) && n >= 2;
                onInterneChange({ ...interne, paliers: ok ? Math.floor(n as number) : undefined });
              }}
              className={`${selectClass} w-24 min-w-0 py-2 text-sm tabular-nums`}
              aria-label="Nombre de paliers de production"
            />
          </label>
        )}
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
        {/* Monthly split of the annual volume — G19.
            ⚠️ Twelve SHARES and not named presets, and that was already decided in
            `DonneesInternes.profilMensuel`: a preset ("pic estival") needs multipliers
            nobody measured, which is the invented coefficient this repository keeps
            removing. A share is the operator's own approximation.
            ⚠️ Answerable in practice because water is billed MONTHLY — this is a form
            someone fills from an invoice, not from memory.
            ⚠️ The sum is REPORTED, never enforced, exactly as the usage vector does: a
            profile at 80 % is a partial description, and refusing it would throw away
            the 80 % that is known. */}
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-sm font-medium text-ink-muted">
            Répartition mensuelle du volume{" "}
            <span className="font-normal text-ink-subtle">(optionnel — en %)</span>
          </p>
          <p className="mt-1 max-w-3xl text-xs text-ink-subtle">
            Sans elle, l&apos;outil suppose un besoin <strong>plat</strong> sur l&apos;année. Les
            restrictions tombent en été : pour un site qui consomme plus en été, l&apos;hypothèse
            plate <strong>sous-estime</strong> l&apos;impact. Vos factures d&apos;eau portent ce
            découpage.
          </p>
          <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12">
            {MOIS_COURTS.map((mois, i) => (
              <label key={mois} className="flex flex-col gap-1 text-xs text-ink-muted">
                <span className="text-center">{mois}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  inputMode="decimal"
                  disabled={disabled}
                  value={
                    interne.profilMensuel?.[i] === undefined
                      ? ""
                      : Math.round(interne.profilMensuel[i] * 1000) / 10
                  }
                  onChange={(e) => {
                    const raw = e.target.value;
                    const n = raw === "" ? undefined : Number(raw);
                    const ok = n !== undefined && Number.isFinite(n) && n >= 0 && n <= 100;
                    // ⚠️ The engine wants twelve entries or none (`length !== 12` falls
                    // back to flat), so an edit to one month materialises the whole
                    // vector — zeros for the months not yet typed. A zero here is a real
                    // statement ("nothing in February"), unlike an empty volume field.
                    const base = interne.profilMensuel?.length === 12
                      ? [...interne.profilMensuel]
                      : Array.from({ length: 12 }, () => 0);
                    base[i] = ok ? (n as number) / 100 : 0;
                    const vide = base.every((v) => v === 0);
                    onInterneChange({ ...interne, profilMensuel: vide ? undefined : base });
                  }}
                  className={`${selectClass} py-1.5 text-center text-sm tabular-nums`}
                  aria-label={`Part du volume au mois de ${MOIS_LONGS[i]}, en pourcentage`}
                />
              </label>
            ))}
          </div>
          {interne.profilMensuel?.length === 12 && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {(() => {
                const total = interne.profilMensuel.reduce((a, v) => a + v, 0);
                const pct = Math.round(total * 1000) / 10;
                const complet = Math.abs(total - 1) < 0.005;
                return (
                  <p className={`text-xs tabular-nums ${complet ? "text-ink-subtle" : "text-amber-700"}`}>
                    Total : {pct} %
                    {complet
                      ? " — réparti."
                      : total < 1
                        ? ` — il manque ${Math.round((1 - total) * 1000) / 10} %. La répartition portera sur ce qui est décrit.`
                        : ` — vous dépassez de ${Math.round((total - 1) * 1000) / 10} %.`}
                  </p>
                );
              })()}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onInterneChange({ ...interne, profilMensuel: undefined })}
                className="rounded px-2 py-1 text-xs text-ink-subtle hover:bg-slate-100 hover:text-ink"
              >
                Effacer la répartition
              </button>
            </div>
          )}
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

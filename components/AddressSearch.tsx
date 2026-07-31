"use client";

import { useEffect, useRef, useState } from "react";
import { SECTEURS } from "@/lib/secteur";
import { DEPENDANCES, ORIGINES } from "@/lib/exposition";
import type { Dependance, OrigineEau, Secteur } from "@/lib/sites";
import type { GeocodeResult } from "@/lib/types";

interface Props {
  secteur: Secteur;
  onSecteurChange: (s: Secteur) => void;
  origine: OrigineEau;
  onOrigineChange: (o: OrigineEau) => void;
  dependance: Dependance;
  onDependanceChange: (d: Dependance) => void;
  onSelect: (result: GeocodeResult) => void;
  disabled?: boolean;
}

export default function AddressSearch({
  secteur,
  onSecteurChange,
  origine,
  onOrigineChange,
  dependance,
  onDependanceChange,
  onSelect,
  disabled,
}: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const search = (q: string) => {
    setQuery(q);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as { results: GeocodeResult[]; message?: string };
        if (!res.ok) {
          setError(data.message ?? "Erreur de géocodage");
          setSuggestions([]);
        } else {
          setSuggestions(data.results);
          setOpen(true);
        }
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          setError("Service de géocodage injoignable");
        }
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const select = (r: GeocodeResult) => {
    setQuery(r.label);
    setOpen(false);
    setSuggestions([]);
    onSelect(r);
  };

  const selectClass =
    "rounded-lg border border-slate-300 bg-white px-3 py-3 text-base shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div ref={containerRef} className="relative flex-1">
        <input
          type="text"
          value={query}
          disabled={disabled}
          onChange={(e) => search(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="Adresse du site, ex. 12 rue de la République, Perpignan"
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base shadow-sm outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
          aria-label="Adresse du site"
        />
        {loading && (
          <span className="absolute right-3 top-3.5 text-xs text-slate-400">Recherche…</span>
        )}
        {open && suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
            {suggestions.map((s, i) => (
              <li key={`${s.label}-${i}`}>
                <button
                  type="button"
                  onClick={() => select(s)}
                  className="block w-full px-4 py-2.5 text-left text-sm hover:bg-sky-50"
                >
                  <span className="font-medium">{s.label}</span>
                  {s.context && <span className="ml-2 text-slate-400">{s.context}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
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
        <label className="flex items-center gap-2 text-sm text-slate-600">
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
        <label className="flex items-center gap-2 text-sm text-slate-600">
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
    </div>
  );
}

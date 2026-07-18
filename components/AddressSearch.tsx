"use client";

import { useEffect, useRef, useState } from "react";
import type { GeocodeResult, Profil } from "@/lib/types";

const PROFIL_OPTIONS: Array<{ value: Profil; label: string }> = [
  { value: "entreprise", label: "Entreprise" },
  { value: "collectivite", label: "Collectivité" },
  { value: "exploitation", label: "Exploitation agricole" },
  { value: "particulier", label: "Particulier" },
];

interface Props {
  profil: Profil;
  onProfilChange: (p: Profil) => void;
  onSelect: (result: GeocodeResult) => void;
  disabled?: boolean;
}

export default function AddressSearch({ profil, onProfilChange, onSelect, disabled }: Props) {
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

  return (
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
        value={profil}
        disabled={disabled}
        onChange={(e) => onProfilChange(e.target.value as Profil)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-3 text-base shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
        aria-label="Profil d'usager"
      >
        {PROFIL_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

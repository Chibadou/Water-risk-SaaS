"use client";

import { useEffect, useRef, useState } from "react";
import type { GeocodeResult } from "@/lib/types";

// BAN address autocomplete, extracted verbatim from AddressSearch so the map
// page can reuse it without inheriting the sector / origin / internal-data
// controls that belong to the site analysis form. Pure input + suggestions:
// it geocodes and calls back, nothing else.

interface Props {
  onSelect: (result: GeocodeResult) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}

export default function AddressAutocomplete({
  onSelect,
  disabled,
  placeholder = "Adresse du site, ex. 12 rue de la République, Perpignan",
  ariaLabel = "Adresse du site",
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

  return (
    <div ref={containerRef} className="relative flex-1">
      <input
        type="text"
        value={query}
        disabled={disabled}
        onChange={(e) => search(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base shadow-sm outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
        aria-label={ariaLabel}
      />
      {loading && <span className="absolute right-3 top-3.5 text-xs text-slate-400">Recherche…</span>}
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
  );
}

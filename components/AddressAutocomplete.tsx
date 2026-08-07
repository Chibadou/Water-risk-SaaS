"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { GeocodeResult } from "@/lib/types";

// BAN address autocomplete — the central control of the whole application:
// nothing happens on any page until an address has been picked here.
//
// It used to be a plain input with a list of buttons underneath. A sighted
// mouse user was served; nobody else was. There was no `combobox` role, so a
// screen reader announced a text field and never mentioned that a list had
// appeared, nor how many results it held. There was no arrow-key navigation, so
// a keyboard user could only tab blindly into an unannounced list, and pressing
// Enter in the field did nothing at all.
//
// This is the ARIA combobox pattern, in full:
//   - `role="combobox"` + `aria-expanded` + `aria-controls` on the input,
//   - `role="listbox"` / `role="option"` on the list,
//   - `aria-activedescendant` naming the highlighted option, so it is announced
//     WITHOUT focus ever leaving the input — which is what lets the user keep
//     typing while browsing the list,
//   - ArrowDown / ArrowUp / Enter / Escape / Home / End,
//   - a polite live region for "N adresses proposées".

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
  /** Index of the highlighted option, -1 = none. Never moves DOM focus. */
  const [active, setActive] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();
  const optionId = (i: number) => `${listboxId}-option-${i}`;

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActive(-1);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Keep the highlighted option in view when arrowing past the visible edge.
  useEffect(() => {
    if (active < 0 || !listRef.current) return;
    listRef.current.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const search = (q: string) => {
    setQuery(q);
    setError(null);
    setActive(-1);
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
          // Guarded, though every path of /api/geocode returns `results`: an
          // unguarded read here white-screens the ENTIRE page, and this is the
          // one control without which nothing else on any page can happen.
          const results = Array.isArray(data.results) ? data.results : [];
          setSuggestions(results);
          setOpen(results.length > 0);
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
    setActive(-1);
    onSelect(r);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const n = suggestions.length;
    // ArrowDown reopens a closed list rather than doing nothing: someone who
    // dismissed it with Escape should not have to retype to get it back.
    if (e.key === "ArrowDown" && !open && n > 0) {
      e.preventDefault();
      setOpen(true);
      setActive(0);
      return;
    }
    if (!open || n === 0) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => (i + 1) % n);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => (i <= 0 ? n - 1 : i - 1));
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(n - 1);
        break;
      case "Enter":
        // Only intercept Enter when an option is highlighted, so the key keeps
        // its ordinary meaning the rest of the time.
        if (active >= 0 && suggestions[active]) {
          e.preventDefault();
          select(suggestions[active]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        setActive(-1);
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative flex-1">
      <input
        type="text"
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? optionId(active) : undefined}
        autoComplete="off"
        value={query}
        disabled={disabled}
        onChange={(e) => search(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base shadow-sm outline-none placeholder:text-ink-subtle focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
        aria-label={ariaLabel}
      />
      {loading && (
        <span className="absolute top-3.5 right-3 text-xs text-ink-subtle">Recherche…</span>
      )}

      {/* Announced politely, so a screen-reader user learns the list appeared
          and how long it is — the input's own label cannot say that. */}
      <p className="sr-only" role="status" aria-live="polite">
        {open && suggestions.length > 0
          ? `${suggestions.length} adresse${suggestions.length > 1 ? "s" : ""} proposée${
              suggestions.length > 1 ? "s" : ""
            }, utilisez les flèches pour parcourir`
          : ""}
      </p>

      <ul
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label="Adresses proposées"
        hidden={!open || suggestions.length === 0}
        className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-line bg-surface shadow-lg"
      >
        {suggestions.map((s, i) => (
          <li
            key={`${s.label}-${i}`}
            id={optionId(i)}
            role="option"
            aria-selected={i === active}
            // Options must not be tabbable: focus stays in the input so the user
            // can keep typing while arrowing through the list. `onMouseDown`
            // preventDefault stops the click from stealing that focus.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => select(s)}
            onMouseEnter={() => setActive(i)}
            className={`cursor-pointer px-4 py-2.5 text-left text-sm ${
              i === active ? "bg-sky-50" : ""
            }`}
          >
            <span className="font-medium">{s.label}</span>
            {s.context && <span className="ml-2 text-ink-subtle">{s.context}</span>}
          </li>
        ))}
      </ul>

      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSavedSites } from "@/lib/sites";

export default function Shell({
  children,
  wide,
}: {
  children: React.ReactNode;
  /**
   * Widen the content column. Used by the site sheet, which carries a sticky
   * table of contents in a left rail: at the default max-w-5xl the rail would
   * have taken its 12rem out of the reading column instead of out of the page
   * margin, making every chapter narrower than before the redesign.
   */
  wide?: boolean;
}) {
  const pathname = usePathname();
  const { sites } = useSavedSites();

  const navLink = (href: string, label: string, badge?: number) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
          active ? "bg-sky-600 text-white" : "text-ink-muted hover:bg-slate-100"
        }`}
      >
        {label}
        {badge !== undefined && badge > 0 && (
          <span
            className={`ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold ${
              active ? "bg-white/25 text-white" : "bg-sky-100 text-sky-800"
            }`}
          >
            {badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">💧</span>
            <div>
              <p className="text-lg font-bold tracking-tight text-ink">HydroVigie</p>
              <p className="text-xs text-ink-subtle">Risque eau (quantité) par site — France</p>
            </div>
          </Link>
          <nav className="flex items-center gap-1">
            {navLink("/", "Recherche")}
            {navLink("/carte", "Carte")}
            {navLink("/sites", "Mes sites", sites.length)}
            {/* Was "Démo — Sprint 32": internal vocabulary, and "Démo" devalues
                the tool for the ESG reader it is written for. What replaces it
                is the thing that reader actually needs — how fresh the source
                is. Deliberately a statement about VigiEau's PUBLICATION CADENCE
                and not "à jour au <date>": no upstream response carries a
                timestamp (see ZonesResponse in lib/types.ts), so a dated claim
                would be invented. The real, measured date of each decree in
                force is shown on the site sheet, where it comes from the data. */}
            <span className="ml-2 hidden rounded-full bg-brand-wash px-3 py-1 text-xs font-medium text-brand-ink sm:inline">
              Données VigiEau — mise à jour quotidienne (j-1)
            </span>
          </nav>
        </div>
      </header>

      <main
        className={`mx-auto w-full flex-1 px-4 py-8 ${wide ? "max-w-7xl" : "max-w-5xl"}`}
      >
        {children}
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-5 text-xs leading-relaxed text-ink-subtle">
          <p>
            Sources : restrictions sécheresse{" "}
            <a href="https://vigieau.gouv.fr" className="underline" target="_blank" rel="noopener noreferrer">
              VigiEau
            </a>{" "}
            (Ministère de la Transition écologique, situation mise à jour quotidiennement, j-1) ·
            géocodage{" "}
            <a href="https://adresse.data.gouv.fr" className="underline" target="_blank" rel="noopener noreferrer">
              Base Adresse Nationale
            </a>{" "}
            (Géoplateforme IGN) · prévision des nappes{" "}
            <a
              href="https://meteeaunappes.brgm.fr/"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              MétéEAU des nappes
            </a>{" "}
            (BRGM, consultée à la source). Données publiées sous Licence Ouverte 2.0.
          </p>
          <p className="mt-1">
            Vos sites sont enregistrés uniquement dans votre navigateur (aucun compte, aucune donnée
            envoyée à un serveur). Les informations affichées ne se substituent pas aux arrêtés
            préfectoraux : seul le texte de l&apos;arrêté fait foi.{" "}
            <Link href="/methodologie" className="underline hover:text-ink-muted">
              Méthodologie
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

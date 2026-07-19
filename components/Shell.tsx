"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSavedSites } from "@/lib/sites";

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { sites } = useSavedSites();

  const navLink = (href: string, label: string, badge?: number) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
          active ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-slate-100"
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
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">💧</span>
            <div>
              <p className="text-lg font-bold tracking-tight text-slate-900">HydroVigie</p>
              <p className="text-xs text-slate-500">Risque eau (quantité) par site — France</p>
            </div>
          </Link>
          <nav className="flex items-center gap-1">
            {navLink("/", "Recherche")}
            {navLink("/sites", "Mes sites", sites.length)}
            <span className="ml-2 hidden rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-800 sm:inline">
              Démo — Sprint 4
            </span>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-5 text-xs leading-relaxed text-slate-500">
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
            (Géoplateforme IGN). Données publiées sous Licence Ouverte 2.0.
          </p>
          <p className="mt-1">
            Vos sites sont enregistrés uniquement dans votre navigateur (aucun compte, aucune donnée
            envoyée à un serveur). Les informations affichées ne se substituent pas aux arrêtés
            préfectoraux : seul le texte de l&apos;arrêté fait foi.{" "}
            <Link href="/methodologie" className="underline hover:text-slate-700">
              Méthodologie
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

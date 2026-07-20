import Link from "next/link";

// Landing content shown on the home page before any search: value
// proposition, trust/sources, and how it works. The search box above stays
// the primary call to action.

const FEATURES: { icon: string; title: string; body: string }[] = [
  {
    icon: "📍",
    title: "À l'adresse près",
    body: "Zones d'alerte sécheresse VigiEau (eaux superficielles, souterraines, eau potable) qui couvrent le site, et les usages restreints selon votre profil — pas à la maille du département.",
  },
  {
    icon: "📊",
    title: "Au-delà du réglementaire",
    body: "Un score de risque qui croise le statut VigiEau, la fréquence structurelle des restrictions sur 5 ans, l'état du débit (VCN10/QMNA5) et de la nappe (IPS), et les assecs Onde.",
  },
  {
    icon: "🔮",
    title: "Horizon 2050",
    body: "La disponibilité en eau projetée par bassin versant (Explore2 / DRIAS-Eau) : étiage, débit annuel et durée des basses eaux aux trajectoires +2, +2,7 et +4 °C.",
  },
  {
    icon: "🗂️",
    title: "Multi-sites, 100 % local",
    body: "Suivez tous vos sites dans un tableau de bord trié par risque. Aucun compte, aucune donnée envoyée à un serveur : vos sites vivent dans votre navigateur.",
  },
];

const SOURCES = ["VigiEau", "Hub'Eau", "Base Adresse Nationale", "Explore2 / DRIAS-Eau", "BNPE"];

export default function Landing() {
  return (
    <div className="mt-10">
      <div className="grid gap-4 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xl" aria-hidden>
                {f.icon}
              </span>
              <h2 className="text-base font-semibold text-slate-900">{f.title}</h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Construit sur les données publiques françaises
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SOURCES.map((s) => (
            <span
              key={s}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600"
            >
              {s}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Données ouvertes (Licence Ouverte 2.0), consultées à la demande. Les informations
          affichées ne se substituent pas aux arrêtés préfectoraux : seul le texte de l&apos;arrêté
          fait foi.{" "}
          <Link href="/methodologie" className="text-sky-700 underline hover:text-sky-900">
            Méthodologie et limites
          </Link>
        </p>
      </div>

      <div className="mt-8">
        <h2 className="text-base font-semibold text-slate-900">Comment ça marche</h2>
        <ol className="mt-2 grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
          <li className="rounded-lg border border-slate-200 bg-white p-4">
            <span className="font-semibold text-sky-700">1.</span> Recherchez l&apos;adresse
            d&apos;un site (siège, usine, agence…).
          </li>
          <li className="rounded-lg border border-slate-200 bg-white p-4">
            <span className="font-semibold text-sky-700">2.</span> L&apos;adresse est géocodée puis
            croisée avec les zones d&apos;alerte et les données physiques de la ressource à
            proximité.
          </li>
          <li className="rounded-lg border border-slate-200 bg-white p-4">
            <span className="font-semibold text-sky-700">3.</span> Vous obtenez le niveau de risque,
            les usages restreints, la projection 2050, et pouvez ajouter le site à votre tableau de
            bord.
          </li>
        </ol>
      </div>
    </div>
  );
}

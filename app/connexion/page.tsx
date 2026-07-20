"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Shell from "@/components/Shell";
import { getSupabaseBrowser } from "@/lib/supabase/client";

function ConnexionInner() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const supabase = getSupabaseBrowser();
  const urlError = searchParams.get("erreur");

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !email) return;
    setState("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/compte` },
    });
    setState(error ? "error" : "sent");
  };

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Connexion</h1>
      <p className="mt-2 text-sm text-slate-600">
        Un compte est <strong>optionnel</strong> : il sert uniquement aux alertes email et à
        l&apos;API. Vos sites restent utilisables sans compte, en local dans votre navigateur.
      </p>

      {!supabase && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Les comptes ne sont pas encore activés sur ce déploiement (variables Supabase absentes).
          Voir le README pour la mise en place. En attendant,{" "}
          <Link href="/" className="underline">
            l&apos;outil fonctionne intégralement sans compte
          </Link>
          .
        </p>
      )}

      {supabase && state !== "sent" && (
        <form onSubmit={send} className="mt-5 flex flex-col gap-3">
          {urlError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
              Lien de connexion invalide ou expiré — demandez-en un nouveau.
            </p>
          )}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@entreprise.fr"
            className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            aria-label="Adresse email"
          />
          <button
            type="submit"
            disabled={state === "sending"}
            className="rounded-lg bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
          >
            {state === "sending" ? "Envoi…" : "Recevoir un lien de connexion"}
          </button>
          {state === "error" && (
            <p className="text-sm text-red-600">Échec de l&apos;envoi — réessayez dans un instant.</p>
          )}
          <p className="text-xs text-slate-400">
            Connexion sans mot de passe : un lien à usage unique vous est envoyé par email.
          </p>
        </form>
      )}

      {state === "sent" && (
        <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Lien envoyé à <strong>{email}</strong> — ouvrez-le depuis cet appareil pour vous
          connecter.
        </p>
      )}
    </div>
  );
}

export default function ConnexionPage() {
  return (
    <Shell>
      <Suspense>
        <ConnexionInner />
      </Suspense>
    </Shell>
  );
}

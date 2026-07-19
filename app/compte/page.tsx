"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import Shell from "@/components/Shell";
import GraviteBadge from "@/components/GraviteBadge";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { siteKey, useSavedSites } from "@/lib/sites";

interface Org {
  id: string;
  name: string;
  alert_email: string | null;
}

interface ServerSite {
  id: string;
  label: string;
  lat: number;
  lon: number;
  citycode: string | null;
  profil: string;
  last_worst_level: string | null;
  last_checked_at: string | null;
}

interface ApiKeyRow {
  id: string;
  label: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `hv_${b64}`;
}

export default function ComptePage() {
  const supabase = getSupabaseBrowser();
  const { sites: localSites, addSite } = useSavedSites();

  const [session, setSession] = useState<Session | null>(null);
  // Ready immediately when accounts are not configured (nothing to load).
  const [ready, setReady] = useState(() => !supabase);
  const [org, setOrg] = useState<Org | null>(null);
  const [serverSites, setServerSites] = useState<ServerSite[]>([]);
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [alertEmail, setAlertEmail] = useState("");

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const [orgRes, sitesRes, keysRes] = await Promise.all([
      supabase.from("organizations").select("id,name,alert_email").limit(1),
      supabase.from("sites").select("*").order("created_at"),
      supabase.from("api_keys").select("id,label,key_prefix,created_at,last_used_at").order("created_at"),
    ]);
    const o = (orgRes.data?.[0] as Org | undefined) ?? null;
    setOrg(o);
    if (o?.alert_email) setAlertEmail(o.alert_email);
    setServerSites((sitesRes.data as ServerSite[] | null) ?? []);
    setKeys((keysRes.data as ApiKeyRow[] | null) ?? []);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
      if (data.session) void refresh();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) void refresh();
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase, refresh]);

  const pushLocalSites = useCallback(async () => {
    if (!supabase || !org) return;
    const rows = localSites.map((s) => ({
      org_id: org.id,
      label: s.label,
      lat: s.lat,
      lon: s.lon,
      citycode: s.citycode ?? null,
      profil: s.profil,
    }));
    if (rows.length === 0) return;
    const { error } = await supabase
      .from("sites")
      .upsert(rows, { onConflict: "org_id,lat,lon", ignoreDuplicates: true });
    setNotice(error ? `Erreur de synchronisation : ${error.message}` : "Sites locaux copiés vers le compte.");
    void refresh();
  }, [supabase, org, localSites, refresh]);

  const pullToBrowser = useCallback(() => {
    let added = 0;
    for (const s of serverSites) {
      if (!localSites.some((l) => l.id === siteKey(s.lon, s.lat))) {
        addSite({
          label: s.label,
          lon: s.lon,
          lat: s.lat,
          citycode: s.citycode ?? undefined,
          profil: (s.profil as typeof localSites[number]["profil"]) ?? "entreprise",
        });
        added++;
      }
    }
    setNotice(`${added} site${added > 1 ? "s" : ""} importé${added > 1 ? "s" : ""} dans ce navigateur.`);
  }, [serverSites, localSites, addSite]);

  const deleteServerSite = useCallback(
    async (id: string) => {
      if (!supabase) return;
      await supabase.from("sites").delete().eq("id", id);
      void refresh();
    },
    [supabase, refresh],
  );

  const saveAlertEmail = useCallback(async () => {
    if (!supabase || !org) return;
    const { error } = await supabase
      .from("organizations")
      .update({ alert_email: alertEmail || null })
      .eq("id", org.id);
    setNotice(error ? `Erreur : ${error.message}` : "Email d'alerte enregistré.");
  }, [supabase, org, alertEmail]);

  const createKey = useCallback(async () => {
    if (!supabase || !org) return;
    const key = generateApiKey();
    const { error } = await supabase.from("api_keys").insert({
      org_id: org.id,
      label: `clé du ${new Date().toLocaleDateString("fr-FR")}`,
      key_prefix: key.slice(0, 10),
      key_hash: await sha256Hex(key),
    });
    if (error) {
      setNotice(`Erreur de création de clé : ${error.message}`);
    } else {
      setNewKey(key);
      void refresh();
    }
  }, [supabase, org, refresh]);

  const deleteKey = useCallback(
    async (id: string) => {
      if (!supabase) return;
      await supabase.from("api_keys").delete().eq("id", id);
      void refresh();
    },
    [supabase, refresh],
  );

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    setOrg(null);
    setServerSites([]);
    setKeys([]);
  }, [supabase]);

  return (
    <Shell>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Compte</h1>

      {!supabase && (
        <p className="mt-4 max-w-2xl rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Les comptes ne sont pas encore activés sur ce déploiement (variables Supabase absentes) —
          voir le README. L&apos;outil reste intégralement utilisable sans compte.
        </p>
      )}

      {supabase && ready && !session && (
        <p className="mt-4 text-sm text-slate-600">
          <Link href="/connexion" className="text-sky-700 underline hover:text-sky-900">
            Connectez-vous
          </Link>{" "}
          pour activer les alertes email et l&apos;API. Sans compte, vos sites restent locaux à ce
          navigateur.
        </p>
      )}

      {supabase && session && (
        <div className="mt-6 flex max-w-3xl flex-col gap-6">
          {notice && (
            <p className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-800">{notice}</p>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Connecté</p>
                <p className="mt-0.5 font-medium text-slate-900">{session.user.email}</p>
              </div>
              <button
                type="button"
                onClick={signOut}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Se déconnecter
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <label className="flex-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Email de réception des alertes
                </span>
                <input
                  type="email"
                  value={alertEmail}
                  onChange={(e) => setAlertEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                />
              </label>
              <button
                type="button"
                onClick={saveAlertEmail}
                className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
              >
                Enregistrer
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">Sites suivis par le serveur (alertes email)</h2>
            <p className="mt-1 text-sm text-slate-500">
              Chaque matin, le niveau de restriction de ces sites est vérifié ; un email est envoyé à
              chaque changement. Vos sites du navigateur restent locaux tant que vous ne les copiez pas ici.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={pushLocalSites}
                disabled={localSites.length === 0}
                className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-40"
              >
                Copier mes {localSites.length} site{localSites.length > 1 ? "s" : ""} locaux vers le compte
              </button>
              <button
                type="button"
                onClick={pullToBrowser}
                disabled={serverSites.length === 0}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Importer les sites du compte dans ce navigateur
              </button>
            </div>
            {serverSites.length > 0 && (
              <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-100">
                {serverSites.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{s.label}</p>
                      <p className="text-xs text-slate-400">
                        {s.last_checked_at
                          ? `dernier contrôle : ${new Date(s.last_checked_at).toLocaleDateString("fr-FR")}`
                          : "pas encore contrôlé"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <GraviteBadge niveau={s.last_worst_level ?? undefined} />
                      <button
                        type="button"
                        onClick={() => deleteServerSite(s.id)}
                        className="text-xs font-medium text-slate-400 hover:text-red-600"
                      >
                        Supprimer
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">Clés d&apos;API</h2>
            <p className="mt-1 text-sm text-slate-500">
              Accès programmatique : <code className="rounded bg-slate-100 px-1">GET /api/v1/sites</code>{" "}
              avec l&apos;en-tête <code className="rounded bg-slate-100 px-1">Authorization: Bearer &lt;clé&gt;</code>{" "}
              renvoie vos sites serveur et leur statut courant.
            </p>
            {newKey && (
              <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
                Nouvelle clé (copiez-la maintenant, elle ne sera plus affichée) :{" "}
                <code className="font-mono font-semibold">{newKey}</code>
              </p>
            )}
            <button
              type="button"
              onClick={createKey}
              className="mt-3 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
            >
              Créer une clé
            </button>
            {keys.length > 0 && (
              <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-100">
                {keys.map((k) => (
                  <li key={k.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="font-mono text-slate-700">{k.key_prefix}…</span>
                    <span className="text-xs text-slate-400">
                      {k.last_used_at
                        ? `utilisée le ${new Date(k.last_used_at).toLocaleDateString("fr-FR")}`
                        : "jamais utilisée"}
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteKey(k.id)}
                      className="text-xs font-medium text-slate-400 hover:text-red-600"
                    >
                      Révoquer
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Shell>
  );
}

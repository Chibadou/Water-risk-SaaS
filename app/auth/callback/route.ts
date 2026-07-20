import { NextRequest, NextResponse } from "next/server";
import { getSupabaseRoute } from "@/lib/supabase/server";

// Magic-link landing: exchanges the auth code for a session cookie.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next") ?? "/compte";
  const redirect = (path: string) => NextResponse.redirect(new URL(path, request.url));

  if (!code) return redirect("/connexion?erreur=code_manquant");
  const supabase = await getSupabaseRoute();
  if (!supabase) return redirect("/");
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return redirect("/connexion?erreur=lien_invalide");
  // only allow internal redirects
  return redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/compte");
}

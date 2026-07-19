import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getSupabaseService } from "@/lib/supabase/server";
import { fetchZonesForPoint, worstLevel } from "@/lib/vigieau";

export const maxDuration = 60;

// Public API v1 — GET /api/v1/sites
// Authorization: Bearer <api key> (created on /compte). Returns the
// organization's server-side sites with their current restriction status.
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!key) {
    return NextResponse.json(
      { error: "unauthorized", message: "En-tête Authorization: Bearer <clé API> requis" },
      { status: 401 },
    );
  }
  const supabase = getSupabaseService();
  if (!supabase) {
    return NextResponse.json(
      { error: "unavailable", message: "API non configurée sur ce déploiement" },
      { status: 503 },
    );
  }

  const keyHash = createHash("sha256").update(key).digest("hex");
  const { data: keyRow } = await supabase
    .from("api_keys")
    .select("id,org_id")
    .eq("key_hash", keyHash)
    .maybeSingle();
  if (!keyRow) {
    return NextResponse.json({ error: "unauthorized", message: "Clé API inconnue" }, { status: 401 });
  }
  await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);

  const { data: sites, error } = await supabase
    .from("sites")
    .select("id,label,lat,lon,citycode,profil,last_worst_level,last_checked_at")
    .eq("org_id", keyRow.org_id)
    .order("created_at")
    .limit(100);
  if (error) {
    return NextResponse.json({ error: "server_error", message: error.message }, { status: 500 });
  }

  const results = await Promise.all(
    (sites ?? []).map(async (s) => {
      const { status, body } = await fetchZonesForPoint(s.lat, s.lon, s.profil);
      const ok = status === 200;
      return {
        id: s.id,
        label: s.label,
        lat: s.lat,
        lon: s.lon,
        citycode: s.citycode,
        profil: s.profil,
        statut: ok
          ? {
              niveau_gravite: worstLevel(body.zones),
              zones: body.zones.map((z) => ({
                code: z.code,
                type: z.type,
                niveau_gravite: z.niveauGravite,
                nom: z.nom,
              })),
              non_couvert: body.notCovered,
            }
          : { erreur: body.message ?? "statut indisponible" },
      };
    }),
  );

  return NextResponse.json({
    sites: results,
    source: "VigiEau (situation j-1)",
    avertissement: "Seul le texte de l'arrêté préfectoral fait foi.",
  });
}

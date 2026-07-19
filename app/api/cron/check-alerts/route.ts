import { NextRequest, NextResponse } from "next/server";
import { GRAVITE } from "@/lib/gravite";
import { getSupabaseService } from "@/lib/supabase/server";
import { fetchZonesForPoint, worstLevel } from "@/lib/vigieau";

export const maxDuration = 300;

interface SiteRow {
  id: string;
  label: string;
  lat: number;
  lon: number;
  profil: string;
  last_worst_level: string | null;
  organizations: { alert_email: string | null } | null;
}

function levelLabel(level: string | null): string {
  if (!level) return "aucune restriction";
  return GRAVITE[level as keyof typeof GRAVITE]?.label ?? level;
}

async function sendAlertEmail(
  to: string,
  site: SiteRow,
  oldLevel: string | null,
  newLevel: string | null,
): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return "skipped_no_api_key";
  const from = process.env.ALERT_FROM_EMAIL ?? "HydroVigie <onboarding@resend.dev>";
  const worse =
    (newLevel ? GRAVITE[newLevel as keyof typeof GRAVITE]?.rank ?? 0 : 0) >
    (oldLevel ? GRAVITE[oldLevel as keyof typeof GRAVITE]?.rank ?? 0 : 0);
  const subject = `${worse ? "⚠️" : "✅"} ${site.label} : ${levelLabel(newLevel)} (restrictions d'eau)`;
  const url = `https://water-risk-saa-s.vercel.app/?lat=${site.lat}&lon=${site.lon}&label=${encodeURIComponent(site.label)}&profil=${site.profil}`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text:
          `Le niveau de restriction sécheresse du site « ${site.label} » a changé :\n\n` +
          `  ${levelLabel(oldLevel)}  →  ${levelLabel(newLevel)}\n\n` +
          `Détail du site : ${url}\n\n` +
          `Source : VigiEau (situation de la veille). Seul le texte de l'arrêté préfectoral fait foi.\n` +
          `— HydroVigie`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok ? "sent" : `failed_${res.status}`;
  } catch {
    return "failed_network";
  }
}

// Daily Vercel Cron (see vercel.json). Vercel sends Authorization: Bearer CRON_SECRET.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, message: "Non autorisé" }, { status: 401 });
  }
  const supabase = getSupabaseService();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, message: "Supabase non configuré (SUPABASE_SERVICE_ROLE_KEY absent)" },
      { status: 503 },
    );
  }

  const { data, error } = await supabase
    .from("sites")
    .select("id,label,lat,lon,profil,last_worst_level,organizations(alert_email)")
    .limit(500);
  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }
  const sites = (data ?? []) as unknown as SiteRow[];

  let checked = 0;
  let changed = 0;
  let emailed = 0;
  for (const site of sites) {
    const { status, body } = await fetchZonesForPoint(site.lat, site.lon, site.profil);
    if (status !== 200) continue; // upstream failure: keep previous state, retry tomorrow
    checked++;
    const current = worstLevel(body.zones);
    const previous = site.last_worst_level;
    const changedNow = current !== previous;
    await supabase
      .from("sites")
      .update({ last_worst_level: current, last_checked_at: new Date().toISOString() })
      .eq("id", site.id);
    if (!changedNow) continue;
    changed++;
    let emailStatus = "skipped_no_recipient";
    const to = site.organizations?.alert_email;
    if (to) {
      emailStatus = await sendAlertEmail(to, site, previous, current);
      if (emailStatus === "sent") emailed++;
    }
    await supabase.from("alert_events").insert({
      site_id: site.id,
      old_level: previous,
      new_level: current,
      email_status: emailStatus,
    });
  }

  return NextResponse.json({ ok: true, sites: sites.length, checked, changed, emailed });
}

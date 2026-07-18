import { NextRequest, NextResponse } from "next/server";
import type { GeocodeResult } from "@/lib/types";

// Géoplateforme geocoding (BAN). The legacy api-adresse.data.gouv.fr endpoint
// is decommissioned since January 2026 — do not use it.
const BAN_SEARCH_URL = "https://data.geopf.fr/geocodage/search/";

interface BanFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    label?: string;
    citycode?: string;
    city?: string;
    postcode?: string;
    context?: string;
    score?: number;
    type?: string;
  };
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) {
    return NextResponse.json({ results: [] });
  }

  const url = new URL(BAN_SEARCH_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "6");
  url.searchParams.set("autocomplete", "1");

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { results: [], message: `Service de géocodage indisponible (${res.status})` },
        { status: 502 },
      );
    }
    const data = (await res.json()) as { features?: BanFeature[] };
    const results: GeocodeResult[] = (data.features ?? [])
      .filter((f) => Array.isArray(f.geometry?.coordinates) && f.properties?.label)
      .map((f) => ({
        label: f.properties!.label!,
        lon: f.geometry!.coordinates![0],
        lat: f.geometry!.coordinates![1],
        citycode: f.properties?.citycode,
        city: f.properties?.city,
        postcode: f.properties?.postcode,
        context: f.properties?.context,
        score: f.properties?.score,
        type: f.properties?.type,
      }));
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { results: [], message: "Service de géocodage injoignable" },
      { status: 502 },
    );
  }
}

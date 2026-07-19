import { NextRequest } from "next/server";

// Same-origin proxy for the official VigiEau PMTiles archive (vector tiles of
// the alert zones currently in force). The stable data.gouv.fr redirect URL is
// resolved once, then byte-range requests are forwarded to the final location.
const PMTILES_DATASET_URL =
  "https://www.data.gouv.fr/api/1/datasets/r/a101ef59-0999-4b9a-a682-6f9b79d53c7e";

let resolvedUrl: string | null = null;
let resolvedAt = 0;
const RESOLVE_TTL_MS = 6 * 3600 * 1000;

async function resolveFinalUrl(): Promise<string> {
  const now = Date.now();
  if (resolvedUrl && now - resolvedAt < RESOLVE_TTL_MS) return resolvedUrl;
  const res = await fetch(PMTILES_DATASET_URL, {
    method: "HEAD",
    redirect: "follow",
    cache: "no-store",
  });
  // res.url is the URL after redirects (the actual object storage location).
  resolvedUrl = res.url || PMTILES_DATASET_URL;
  resolvedAt = now;
  return resolvedUrl;
}

export async function GET(request: NextRequest) {
  try {
    const target = await resolveFinalUrl();
    const range = request.headers.get("range");
    const upstream = await fetch(target, {
      headers: range ? { Range: range } : undefined,
      cache: "no-store",
    });

    if (!upstream.ok && upstream.status !== 206) {
      return new Response("Tuiles indisponibles", { status: 502 });
    }

    const headers = new Headers();
    for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "etag"]) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    // Tiles are refreshed daily upstream; short-lived caching is fine.
    headers.set("cache-control", "public, max-age=3600");
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return new Response("Tuiles injoignables", { status: 502 });
  }
}

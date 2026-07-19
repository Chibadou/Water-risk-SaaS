import { NextRequest, NextResponse } from "next/server";
import { getHistory } from "@/lib/history";

// The restrictions CSV fallback weighs 10-15 MB: allow time to fetch+parse.
export const maxDuration = 60;

// GET /api/history?zones=CODE1,CODE2 → days-per-gravity-level per zone code.
// Add &debug=1 to see each source attempt (status, header line, parse diag).
export async function GET(request: NextRequest) {
  const zonesParam = request.nextUrl.searchParams.get("zones") ?? "";
  const codes = zonesParam
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 40)
    .slice(0, 100);
  if (codes.length === 0) {
    return NextResponse.json(
      { available: false, zones: {}, diag: { source: "unreachable" }, message: "Paramètre zones requis" },
      { status: 400 },
    );
  }
  const debug = request.nextUrl.searchParams.get("debug") === "1";
  const payload = await getHistory(codes, debug);
  return NextResponse.json(payload);
}

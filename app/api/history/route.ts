import { NextRequest, NextResponse } from "next/server";
import { getHistory } from "@/lib/history";

// GET /api/history?zones=CODE1,CODE2 → days-per-gravity-level per zone code.
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
  const payload = await getHistory(codes);
  return NextResponse.json(payload);
}

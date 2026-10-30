import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ service: "PLP Enrollment Admissions Integration", status: "reachable", method: "POST", intake: "/api/integration/admissions/intake" }, { headers: { "Cache-Control": "no-store" } });
}

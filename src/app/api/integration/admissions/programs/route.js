import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request) {
  const configured = process.env.ENROLLMENT_INTAKE_SECRET;
  const supplied = request.headers.get("authorization") || "";
  if (!configured || !supplied.startsWith("Bearer ")) return false;
  const token = supplied.slice(7).trim();
  if (!token || token.length !== configured.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i += 1) {
    diff |= token.charCodeAt(i) ^ configured.charCodeAt(i);
  }
  return diff === 0;
}

export async function GET(request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const [programResult, trackResult] = await Promise.all([
      admin.from("programs").select("code,name").eq("status", "Active").order("code"),
      admin.from("program_tracks").select("code,name,program_code").eq("status", "ACTIVE").order("code"),
    ]);
    if (programResult.error || trackResult.error) {
      return NextResponse.json({ error: "Program reference data is unavailable." }, { status: 500 });
    }
    return NextResponse.json(
      { programs: [...(programResult.data || []), ...(trackResult.data || []).map(({ code, name }) => ({ code, name }))] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Program reference data is unavailable." }, { status: 500 });
  }
}

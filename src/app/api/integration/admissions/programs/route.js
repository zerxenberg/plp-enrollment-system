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
    const [programResult, trackResult, aliasResult] = await Promise.all([
      admin.from("programs").select("code,name").eq("status", "Active").order("code"),
      admin.from("program_tracks").select("code,name,program_code").eq("status", "ACTIVE").order("code"),
      admin.from("admissions_program_code_map")
        .select("source_code,source_code_normalized,display_name,program_code,program_track_code")
        .eq("is_active", true).order("source_code_normalized"),
    ]);
    if (programResult.error || trackResult.error || aliasResult.error) {
      return NextResponse.json({ error: "Program reference data is unavailable. Apply the Admissions mapping migration first." }, { status: 500 });
    }
    return NextResponse.json(
      {
        programs: [...(programResult.data || []), ...(trackResult.data || []).map(({ code, name, program_code }) => ({ code, name, program_code }))],
        admissions_aliases: aliasResult.data || [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Program reference data is unavailable." }, { status: 500 });
  }
}

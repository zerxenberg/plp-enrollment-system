import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only the Admissions server knows this same shared handoff secret.
// No direct access to either project's database is needed by the other app.
function isAuthorized(request) {
  const secret = process.env.ENROLLMENT_INTAKE_SECRET;
  const value = request.headers.get("authorization") || "";
  if (!secret || !value.startsWith("Bearer ")) return false;
  const received = value.slice(7).trim();
  if (!received || received.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i += 1) diff |= secret.charCodeAt(i) ^ received.charCodeAt(i);
  return diff === 0;
}

export async function POST(request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let payload;
  try { payload = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const requested = payload?.applicant_refs;
  if (!Array.isArray(requested) || requested.length > 250 ||
      requested.some((ref) => typeof ref !== "string" || !/^ADM-20\d{2}-\d{6,9}$/.test(ref))) {
    return NextResponse.json({ error: "Expected up to 250 Admissions applicant references" }, { status: 422 });
  }
  const refs = [...new Set(requested)];
  if (!refs.length) return NextResponse.json({ records: [] }, { headers: { "Cache-Control": "no-store" } });

  try {
    const admin = createAdminClient();
    const handoffResult = await admin.from("admission_handoffs")
      .select("applicant_reference,student_id")
      .eq("source_name", "PLP Admissions").in("applicant_reference", refs);
    if (handoffResult.error) throw handoffResult.error;
    const handoffs = handoffResult.data || [];
    const studentIds = [...new Set(handoffs.map((row) => row.student_id).filter(Boolean))];
    const [profilesResult, enrollmentsResult] = await Promise.all([
      studentIds.length ? admin.from("student_profiles").select("id,student_number").in("id", studentIds)
        : Promise.resolve({ data: [], error: null }),
      studentIds.length ? admin.from("enrollments")
        .select("student_id,status,confirmed_at,created_at")
        .in("student_id", studentIds)
        .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (profilesResult.error || enrollmentsResult.error) throw (profilesResult.error || enrollmentsResult.error);
    const numbers = new Map((profilesResult.data || []).map((p) => [p.id, p.student_number]));
    const hasOfficialEnrollment = new Set((enrollmentsResult.data || [])
      .filter((e) => e.status === "CONFIRMED" && Boolean(e.confirmed_at))
      .map((e) => e.student_id));
    const records = handoffs.map((row) => ({
      applicant_ref: row.applicant_reference,
      student_number: numbers.get(row.student_id) || null,
      enrollment_status: hasOfficialEnrollment.has(row.student_id) ? "officially_enrolled" : "pending",
      stage: hasOfficialEnrollment.has(row.student_id) ? "enrolled" : "student",
    }));
    return NextResponse.json({ records }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Admissions REST status lookup failed", { code: error?.code, message: error?.message });
    return NextResponse.json({ error: "Enrollment status could not be retrieved" }, { status: 503 });
  }
}

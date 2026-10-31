import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAdmissionsEnrollmentStatus } from "@/features/admissions/admissions-enrollment-status.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The bearer secret is shared by the two trusted servers, never the browser.
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
    const empty = { data: [], error: null };
    const [profilesResult, enrollmentsResult, demoResult] = await Promise.all([
      studentIds.length ? admin.from("student_profiles").select("id,student_number").in("id", studentIds)
        : Promise.resolve(empty),
      studentIds.length ? admin.from("enrollments")
        .select("student_id,status,confirmed_at,updated_at,created_at")
        .in("student_id", studentIds).order("updated_at", { ascending: false })
        : Promise.resolve(empty),
      studentIds.length ? admin.from("admissions_phase8_demo_enrollments")
        .select("student_id,status,confirmed_at,updated_at,created_at,source_kind,is_official,simulation_only")
        .in("student_id", studentIds)
        .eq("source_kind", "ADMISSIONS_PHASE8_DEMONSTRATION")
        .eq("simulation_only", true).eq("is_official", false)
        .order("updated_at", { ascending: false })
        : Promise.resolve(empty),
    ]);
    if (profilesResult.error || enrollmentsResult.error || demoResult.error) {
      throw (profilesResult.error || enrollmentsResult.error || demoResult.error);
    }
    const numbers = new Map((profilesResult.data || []).map((p) => [p.id, p.student_number]));
    const officialByStudent = new Map();
    for (const entry of enrollmentsResult.data || []) {
      if (!officialByStudent.has(entry.student_id)) officialByStudent.set(entry.student_id, entry);
    }
    const demoByStudent = new Map();
    for (const entry of demoResult.data || []) {
      if (!demoByStudent.has(entry.student_id)) demoByStudent.set(entry.student_id, entry);
    }
    const records = handoffs.filter((row) => numbers.has(row.student_id)).map((row) => {
      const state = resolveAdmissionsEnrollmentStatus({
        official: officialByStudent.get(row.student_id),
        demonstration: demoByStudent.get(row.student_id),
      });
      return {
        applicant_ref: row.applicant_reference,
        student_number: numbers.get(row.student_id),
        ...state,
      };
    });
    return NextResponse.json({ records }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Admissions REST status lookup failed", { code: error?.code, message: error?.message });
    return NextResponse.json({ error: "Enrollment status could not be retrieved" }, { status: 503 });
  }
}

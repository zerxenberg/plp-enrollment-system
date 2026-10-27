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
  // Constant time comparison without adding a dependency.
  let diff = 0;
  for (let i = 0; i < token.length; i += 1) {
    diff |= token.charCodeAt(i) ^ configured.charCodeAt(i);
  }
  return diff === 0;
}

function response(status, body) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request) {
  if (!authorized(request)) return response(401, { error: "Unauthorized." });

  let body;
  try {
    body = await request.json();
  } catch {
    return response(400, { error: "A valid JSON payload is required." });
  }

  const payload = {
    applicantRef: String(body?.applicant_ref ?? "").trim(),
    fullName: String(body?.full_name ?? "").trim(),
    email: String(body?.email ?? "").trim().toLowerCase(),
    programCode: String(body?.program_code ?? "").trim(),
    admissionDate: String(body?.admission_date ?? "").trim(),
    admissionType: String(body?.admission_type ?? "").trim().toLowerCase(),
    sourceName: String(body?.source_name ?? "").trim(),
  };

  if (
    !/^ADM-20\d{2}-\d{6,9}$/.test(payload.applicantRef) ||
    payload.fullName.length < 2 ||
    payload.fullName.length > 200 ||
    payload.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) ||
    payload.programCode.length < 2 ||
    payload.programCode.length > 30 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(payload.admissionDate) ||
    !["new", "transferee"].includes(payload.admissionType) ||
    payload.sourceName !== "PLP Admissions"
  ) {
    return response(422, { error: "Applicant handoff details are incomplete or unsupported." });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("integration_accept_admissions_intake_v1", {
      p_applicant_ref: payload.applicantRef,
      p_full_name: payload.fullName,
      p_email: payload.email,
      p_program_code: payload.programCode,
      p_admission_date: payload.admissionDate,
      p_admission_type: payload.admissionType,
      p_source_name: payload.sourceName,
    });

    if (error) {
      const conflict = error.code === "23505";
      const invalid = ["22023", "23503", "23514"].includes(error.code);
      return response(conflict ? 409 : invalid ? 422 : 500, {
        error: conflict
          ? "This applicant conflicts with an existing Enrollment identity and requires manual review."
          : invalid
            ? "Enrollment could not accept the applicant details. Verify the program and admission information."
            : "Enrollment could not process this handoff.",
      });
    }

    const status = data?.status;
    if (!["created", "updated", "unchanged"].includes(status) || !data?.student_number) {
      return response(500, { error: "Enrollment returned an invalid handoff result." });
    }
    return response(status === "created" ? 201 : 200, {
      status,
      applicant_ref: payload.applicantRef,
      student_number: data.student_number,
    });
  } catch {
    return response(500, { error: "Enrollment intake is temporarily unavailable." });
  }
}

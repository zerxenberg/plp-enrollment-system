import { NextResponse } from "next/server";
import {
  hasValidAdmissionsApiKey,
  processAdmissionsHandoff,
} from "@/features/integration/admissions-handoff-server";

const MAX_BODY_BYTES = 32 * 1024;

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request) {
  if (!hasValidAdmissionsApiKey(request)) {
    return json({ ok: false, message: "Unauthorized." }, 401);
  }
  return json({
    ok: true,
    service: "PLP Enrollment Admissions Handoff API",
    version: "1",
    endpoint: "/api/integration/admissions/handoff",
    method: "POST",
    sourceSystem: "PLP Admissions",
  });
}

export async function POST(request) {
  if (!hasValidAdmissionsApiKey(request)) {
    return json({ ok: false, message: "Unauthorized." }, 401);
  }
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return json({ ok: false, message: "Request body is too large." }, 413);
  }
  let raw;
  try {
    raw = await request.text();
  } catch {
    return json({ ok: false, message: "Request body could not be read." }, 400);
  }
  if (!raw || Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return json({ ok: false, message: "A JSON admission handoff payload is required." }, 400);
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ ok: false, message: "Request body must be valid JSON." }, 400);
  }
  const result = await processAdmissionsHandoff(payload);
  return json({
    ok: result.ok,
    status: result.status,
    applicant_reference: result.applicantReference,
    student_number: result.studentNumber || undefined,
    student_status: result.studentStatus || undefined,
    account_ready_for_auth: result.accountReadyForAuth,
    academic_term: result.term || undefined,
    message: result.message,
  }, result.httpStatus);
}

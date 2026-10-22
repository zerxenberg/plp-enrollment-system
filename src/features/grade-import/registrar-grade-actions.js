"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import Papa from "papaparse";
import readXlsxFile from "read-excel-file/node";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const REQUIRED_HEADERS = new Set([
  "student_number",
  "subject_code",
  "grade_value",
  "completion_status",
  "source_record_reference",
]);
const SAFE_EXTENSIONS = new Set(["csv", "xlsx"]);

function parseRowsAsRecords(rows) {
  if (!rows.length) throw new Error("The grade file is empty.");
  const columns = rows[0].map((column) => String(column ?? "").trim().toLowerCase());
  if (new Set(columns).size !== columns.length ||
    [...REQUIRED_HEADERS].some((required) => !columns.includes(required))) {
    throw new Error("The grade file has missing or duplicate required headers.");
  }
  const records = rows.slice(1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) => Object.fromEntries(columns.map((name, index) =>
      [name, String(row[index] ?? "").trim()])));
  if (!records.length || records.length > 1500) {
    throw new Error("Grade imports must contain between 1 and 1,500 rows.");
  }
  if (records.some((row) => !row.student_number || !row.subject_code ||
    !row.grade_value || !row.source_record_reference || !row.completion_status)) {
    throw new Error("Every source row requires student, subject, grade, outcome and source reference.");
  }
  return records;
}

async function parseTrustedUpload(file) {
  if (!file || typeof file.arrayBuffer !== "function" ||
    file.size < 1 || file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Select a grade CSV or XLSX file smaller than 2 MB.");
  }
  const extension = String(file.name).toLowerCase().split(".").pop();
  if (!SAFE_EXTENSIONS.has(extension)) throw new Error("Only CSV and XLSX files are supported.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  let rows;
  if (extension === "xlsx") {
    rows = await readXlsxFile(bytes);
  } else {
    const parsed = Papa.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""), {
      skipEmptyLines: true,
    });
    if (parsed.errors.length) throw new Error("The CSV file could not be parsed safely.");
    rows = parsed.data;
  }
  return { checksum, rows: parseRowsAsRecords(rows) };
}

// The browser never receives a service key. All SQL actions execute with a
// genuine authenticated Registrar JWT and recheck role permissions in SQL.
export async function stageOfficialGradeImport(formData) {
  await requireRole("registrar");
  const file = formData.get("file");
  const payload = await parseTrustedUpload(file);
  const args = {
    p_term_id: String(formData.get("term_id") || ""),
    p_subject_code: String(formData.get("subject_code") || ""),
    p_section_id: formData.get("section_id") || null,
    p_source_system: String(formData.get("source_system") || ""),
    p_source_reference: String(formData.get("source_reference") || ""),
    p_issuer: String(formData.get("issuer") || ""),
    p_file_name: file.name,
    p_checksum: payload.checksum,
    p_rows: payload.rows,
  };
  if (!args.p_term_id || !args.p_subject_code || !args.p_source_system ||
    !args.p_source_reference || !args.p_issuer ||
    payload.rows.some((row) => row.subject_code !== args.p_subject_code)) {
    throw new Error("Provide matching term, subject and verified source information.");
  }
  const client = await createClient();
  const { data, error } = await client.rpc("registrar_stage_grade_batch_v1", args);
  if (error) throw new Error("Grade import staging was rejected by the trusted backend.");
  revalidatePath("/registrar/students");
  return { batchId: data, checksum: payload.checksum, stagedRows: payload.rows.length };
}

export async function validateOfficialGradeImport(batchId) {
  await requireRole("registrar");
  const client = await createClient();
  const { data, error } = await client.rpc("registrar_validate_grade_batch_v1",
    { p_batch_id: batchId });
  if (error) throw new Error("Grade import verification could not finish.");
  return data;
}

export async function attestOfficialGradeSource(batchId, sourceReference, checksum, method) {
  await requireRole("registrar");
  const client = await createClient();
  const { data, error } = await client.rpc("registrar_verify_grade_batch_v1", {
    p_batch_id: batchId,
    p_source_reference: sourceReference,
    p_checksum: checksum,
    p_method: method,
  });
  if (error || data !== true) throw new Error("Source verification was rejected.");
  return { verified: true };
}

export async function publishOfficialGradeImport(batchId) {
  await requireRole("registrar");
  const client = await createClient();
  const { data, error } = await client.rpc("registrar_publish_grade_batch_v1",
    { p_batch_id: batchId });
  if (error) throw new Error("Official grade publication failed. No partial results were committed.");
  revalidatePath("/registrar/students");
  return data;
}

export async function amendOfficialAcademicResult(resultId, newStatus, newGrade, evidence) {
  await requireRole("registrar");
  if (!evidence?.reference || !evidence?.verificationMethod || !evidence?.reason) {
    throw new Error("A verified source, verification method and correction reason are required.");
  }
  const client = await createClient();
  const { data, error } = await client.rpc("registrar_amend_academic_result_v1", {
    p_result_id: resultId,
    p_new_status: newStatus,
    p_new_grade: newGrade ?? null,
    p_source_reference: evidence.reference,
    p_verification_method: evidence.verificationMethod,
    p_reason: evidence.reason,
  });
  if (error) throw new Error("The trusted Registrar grade correction was rejected.");
  revalidatePath("/registrar/students");
  return { revisionId: data };
}

export async function recordTransferEvaluation(details) {
  await requireRole("registrar");
  if (!details?.studentId || !details?.curriculumCode || !details?.subjectCode ||
      !details?.sourceInstitution || !details?.externalSubjectReference ||
      !details?.evidenceReference) {
    throw new Error("Student, curriculum, course and verified transfer source are required.");
  }
  const client = await createClient();
  const { data, error } = await client.rpc("registrar_record_transfer_evaluation_v1", {
    p_student_id: details.studentId,
    p_curriculum_code: details.curriculumCode,
    p_subject_code: details.subjectCode,
    p_source_institution: details.sourceInstitution,
    p_external_subject_reference: details.externalSubjectReference,
    p_source_course_name: details.sourceCourseName ?? null,
    p_evidence_reference: details.evidenceReference,
    p_requested_units: details.requestedUnits ?? null,
  });
  if (error) throw new Error("The transfer evaluation could not be staged.");
  return { evaluationId: data, status: "PENDING" };
}

export async function decideTransferEvaluation(evaluationId, decision, creditedUnits, reason) {
  await requireRole("academic-coordinator");
  if (!["CREDITED", "DENIED", "REQUIRES_REVIEW"].includes(decision) || !reason) {
    throw new Error("A supported academic review decision and evidence reason are required.");
  }
  const client = await createClient();
  const { data, error } = await client.rpc("coordinator_decide_transfer_evaluation_v1", {
    p_evaluation_id: evaluationId,
    p_decision_status: decision,
    p_credited_units: creditedUnits ?? null,
    p_decision_reason: reason,
  });
  if (error || data !== true) throw new Error("Transfer credit decision was rejected.");
  return { saved: true };
}

export async function getOfficialRegistrationData(enrollmentId, role) {
  if (!["student", "registrar", "academic-coordinator"].includes(role)) {
    throw new Error("Unsupported role");
  }
  await requireRole(role);
  const client = await createClient();
  const { data, error } = await client.rpc("official_enrollment_cor_v1",
    { p_enrollment_id: enrollmentId });
  if (error) throw new Error("Official registration information is not available.");
  return data;
}

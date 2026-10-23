"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import Papa from "papaparse";
import readXlsxFile from "read-excel-file/node";
import { unzipSync, strFromU8 } from "fflate";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildConfirmedGradeBlocks, evaluateBlockGradeChecklist } from "./grade-block-checklist.mjs";
import { attachGradeBlockReleases } from "./grade-block-releases.mjs";

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
  if (records.some((row) => Object.values(row).some((value) => /^[=+@]/.test(value)))) {
    throw new Error("Spreadsheet formulas and executable cell expressions are not accepted.");
  }
  if (records.some((row) => !["COMPLETED", "FAILED", "INCOMPLETE"].includes(row.completion_status) ||
    (row.completion_status === "INCOMPLETE"
      ? !/^(INC|INCOMPLETE)$/i.test(row.grade_value)
      : !/^\d{1,3}(?:\.\d{1,3})?$/.test(row.grade_value)))) {
    throw new Error("Use a numeric grade for COMPLETED or FAILED, or INC for INCOMPLETE.");
  }
  if (new Set(records.map((row) => row.student_number.toLowerCase())).size !== records.length) {
    throw new Error("A student may appear only once per subject batch.");
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
    if (!bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
      throw new Error("The Excel file has an invalid workbook signature.");
    }
    const files = unzipSync(bytes, { filter: (entry) =>
      entry.originalSize <= 8 * 1024 * 1024 &&
      (entry.name === "xl/workbook.xml" || /^xl\/worksheets\/[^/]+\.xml$/.test(entry.name)) });
    const workbook = files["xl/workbook.xml"];
    if (!workbook || (strFromU8(workbook).match(/<(?:\w+:)?sheet\s/g) || []).length !== 1) {
      throw new Error("Use exactly one Excel worksheet.");
    }
    if (Object.entries(files).some(([name, content]) => name.startsWith("xl/worksheets/") &&
      /<(?:\w+:)?f(?:\s|>)/i.test(strFromU8(content)))) {
      throw new Error("Spreadsheet formulas are not permitted in grade uploads.");
    }
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

// Sensitive staging tables are private to the service account. The active
// Registrar is checked first, and every returned row is scoped to confirmed
// historical attempts. PROJECT_ONLY profiles are excluded unconditionally.
async function readGradeWorkspace() {
  await requireRole("registrar");
  const admin = createAdminClient();
  const stableOrders = {
    enrollments: ["id"], block_sections: ["id"],
    block_subject_sections: ["block_id", "section_id"], academic_terms: ["id"],
    subjects: ["code"], project_student_academic_placements: ["student_id"],
    enrollment_subjects: ["enrollment_id", "subject_code"],
    student_profiles: ["id"], app_users: ["id"], sections: ["id"],
    grade_import_batches: ["id"], academic_results: ["student_id", "term_id", "subject_code"],
    grade_import_rows: ["batch_id", "source_row_number"],
    grade_block_releases: ["id"],
  };
  async function list(table, columns, filter = (query) => query, limit = 5000) {
    const output = [];
    for (let start = 0; start <= limit; start += 1000) {
      let query = filter(admin.from(table).select(columns));
      for (const column of stableOrders[table] || []) query = query.order(column);
      const size = Math.min(1000, limit + 1 - start);
      const { data, error } = await query.range(start, start + size - 1);
      if (error || !Array.isArray(data)) {
        throw new Error("The protected grade records could not be read.");
      }
      output.push(...data);
      if (output.length > limit) {
        throw new Error("The protected grade records exceed the supported review range.");
      }
      if (data.length < size) return output;
    }
    return output;
  }
  async function byIds(table, columns, column, values) {
    const unique = [...new Set(values)].filter(Boolean);
    if (!unique.length) return [];
    const output = [];
    for (let index = 0; index < unique.length; index += 250) {
      output.push(...await list(table, columns,
        (query) => query.in(column, unique.slice(index, index + 250)), 5000));
    }
    return output;
  }
  const [enrollments, blockRecords, blockLinks, terms, subjectRecords, projectPlacements] = await Promise.all([
    list("enrollments", "id,student_id,term_id,status", (query) => query.eq("status", "CONFIRMED")),
    list("block_sections", "id,code,term_id,program_code,planning_status"),
    list("block_subject_sections", "block_id,section_id"),
    list("academic_terms", "id,label"),
    list("subjects", "code,name"),
    list("project_student_academic_placements", "student_id", (query) =>
      query.eq("project_cohort_id", "PLP_PROJECT_600_2026_1"), 600),
  ]);
  const enrollmentSubjects = await byIds("enrollment_subjects",
    "enrollment_id,subject_code,section_id,registration_status", "enrollment_id",
    enrollments.map((entry) => entry.id));
  const studentRecords = await byIds("student_profiles", "id,user_id,student_number,record_kind", "id",
    enrollments.map((row) => row.student_id));
  const [appUsers, sections, batchRecords, resultRecords, releaseRecords] = await Promise.all([
    byIds("app_users", "id,full_name", "id", studentRecords.map((row) => row.user_id)),
    byIds("sections", "id,section_code", "id", enrollmentSubjects.map((row) => row.section_id)),
    list("grade_import_batches",
      "id,term_id,subject_code,section_id,status,source_system,source_checksum,verified_checksum_sha256,verified_at,verified_by,source_reference,issuer,file_name,row_count,created_at,validated_at,published_at,verification_method,publication_reference"),
    list("academic_results", "student_id,term_id,subject_code",
      (query) => query.in("term_id", [...new Set(enrollments.map((e) => e.term_id))].length ?
        [...new Set(enrollments.map((e) => e.term_id))] : ["__NO_CONFIRMED_TERMS__"])),
    list("grade_block_releases",
      "id,block_id,term_id,status,expected_subject_snapshot,batch_ids,expected_subject_count,expected_result_count,published_by_user_id,publication_reference,published_at,created_at"),
  ]);
  const userNames = new Map(appUsers.map((row) => [row.id, row.full_name]));
  const sectionCodes = new Map(sections.map((row) => [row.id, row.section_code]));
  const blocks = buildConfirmedGradeBlocks({
    blocks: blockRecords, links: blockLinks, enrollments,
    enrollmentSubjects: enrollmentSubjects.map((row) => ({
      ...row, section_code: sectionCodes.get(row.section_id) || "",
    })),
    students: studentRecords.map((row) => ({
      ...row, full_name: userNames.get(row.user_id) || "",
    })),
    subjects: subjectRecords, terms, projectStudentIds: projectPlacements.map((row) => row.student_id),
  });
  const batchRows = await byIds("grade_import_rows",
    "batch_id,student_id,subject_code,section_id,source_student_number,validation_status,raw_grade_text,completion_status,error_details,source_record_reference,source_row_number",
    "batch_id", batchRecords.map((batch) => batch.id));
  const rowsByBatch = new Map();
  for (const row of batchRows) {
    const items = rowsByBatch.get(row.batch_id) || [];
    items.push(row);
    rowsByBatch.set(row.batch_id, items);
  }
  const publications = attachGradeBlockReleases({
    blocks,
    batches: batchRecords.map((batch) => ({ ...batch, rows: rowsByBatch.get(batch.id) || [] })),
    releases: releaseRecords, blockCatalog: blockRecords, terms,
  });
  return {
    ...publications,
    officialResults: resultRecords,
    projectOnlyExcluded: projectPlacements.length,
  };
}

export async function loadConfirmedGradeImportWorkspace() {
  try {
    const workspace = await readGradeWorkspace();
    return {
      ok: true,
      blocks: workspace.blocks.map(({ attempts, ...block }) => ({
        ...block,
        checklist: evaluateBlockGradeChecklist({ ...block, attempts },
          workspace.batches, workspace.officialResults),
      })),
      batches: workspace.batches,
      releases: workspace.releases,
      projectOnlyExcluded: workspace.projectOnlyExcluded,
    };
  } catch {
    return { ok: false, message: "Confirmed historical grade records could not be loaded. Verify Registrar access and grade import backend availability." };
  }
}

export async function stageConfirmedBlockGradeBatch(formData) {
  await requireRole("registrar");
  const workspace = await readGradeWorkspace();
  const block = workspace.blocks.find((item) => item.id === formData.get("block_id"));
  const subject = block?.subjects.find((item) => item.code === formData.get("subject_code"));
  if (!block || !subject || !subject.expected.length)
    throw new Error("Select a confirmed historical block and registered subject.");
  const sectionIds = [...new Set(subject.expected.map((row) => row.sectionId))];
  if (sectionIds.length !== 1 || !sectionIds[0])
    throw new Error("This subject spans multiple confirmed sections. Resolve the separate faculty offerings before importing.");
  const file = formData.get("file");
  const { rows } = await parseTrustedUpload(file);
  const expected = new Map(subject.expected.map((row) => [row.studentNumber, row]));
  if (rows.some((row) => !expected.has(row.student_number) ||
    row.term_id !== block.termId ||
    row.subject_code !== subject.code ||
    (expected.get(row.student_number).sectionCode &&
      row.section_code !== expected.get(row.student_number).sectionCode) ||
    (row.student_full_name && expected.get(row.student_number).studentName &&
      row.student_full_name.toLowerCase() !== expected.get(row.student_number).studentName.toLowerCase()))) {
    throw new Error("Source rows must match the confirmed historical term, student identity, subject and section roster.");
  }
  const used = new Set(workspace.batches.filter((batch) =>
    batch.term_id === block.termId && batch.subject_code === subject.code &&
    !["REQUIRES_CORRECTION", "FAILED", "CANCELLED"].includes(batch.status))
    .flatMap((batch) => batch.rows.map((row) => row.source_student_number)));
  if (rows.some((row) => used.has(row.student_number)))
    throw new Error("This student's subject attempt is already staged. Review the existing batch.");
  const upload = new FormData();
  upload.set("file", file);
  upload.set("term_id", block.termId);
  upload.set("subject_code", subject.code);
  upload.set("section_id", sectionIds[0]);
  for (const name of ["source_system", "source_reference", "issuer"]) {
    const value = String(formData.get(name) || "").trim();
    if (!value || value.length > 240) throw new Error("Complete the source institution, document reference and issuing faculty.");
    upload.set(name, value);
  }
  return stageOfficialGradeImport(upload);
}

export async function publishCompleteGradeBlock(blockId) {
  await requireRole("registrar");
  const workspace = await readGradeWorkspace();
  const block = workspace.blocks.find((item) => item.id === blockId);
  const checklist = evaluateBlockGradeChecklist(block, workspace.batches, workspace.officialResults);
  if (!block || !checklist.allVerified || !checklist.batchIds.length) {
    throw new Error("Every confirmed subject attempt must be validated and source verified before the whole block can be published.");
  }
  const client = await createClient();
  const { data, error } = await client.rpc("registrar_publish_grade_block_v1", {
    p_block_id: block.id,
    p_term_id: block.termId,
    p_batch_ids: checklist.batchIds,
  });
  if (error || data?.published !== true) {
    throw new Error("Atomic block publication is unavailable or rejected. No individual subject grades were published.");
  }
  revalidatePath("/registrar/students");
  revalidatePath("/student/academic-records");
  return data;
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
  void batchId;
  throw new Error("Individual subject publication is disabled. Complete and verify the whole confirmed block before collective grade publication.");
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

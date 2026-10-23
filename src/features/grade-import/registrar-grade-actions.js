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
  "student_full_name",
  "subject_code",
  "academic_year",
  "semester",
  "section_code",
  "grade_value",
  "completion_status",
  "source_record_reference",
]);
const OPTIONAL_HEADERS = new Set(["previous_block_section"]);
const SAFE_EXTENSIONS = new Set(["csv", "xlsx"]);
const COMPLETION_STATUSES = new Set(["COMPLETED", "FAILED", "INCOMPLETE", "CREDITED"]);
const INC_VALUES = new Set(["INC", "INCOMPLETE"]);

function normalize(value) {
  return String(value ?? "").trim();
}

function normalizeKey(value) {
  return normalize(value).toUpperCase();
}

function normalizeLoose(value) {
  return normalize(value).toLowerCase().replace(/\s+/g, " ");
}

function issue(code, message) {
  return { code, message };
}

function parseRowsAsRecords(rows) {
  if (!rows.length) throw new Error("The grade file is empty.");

  const columns = rows[0].map((column) => normalize(column).toLowerCase());
  const duplicateHeaders = new Set(columns).size !== columns.length;
  const missingHeaders = [...REQUIRED_HEADERS].filter((required) => !columns.includes(required));

  if (duplicateHeaders || missingHeaders.length) {
    const detail = missingHeaders.length
      ? ` Missing: ${missingHeaders.join(", ")}.`
      : "";
    throw new Error(`The grade file has missing or duplicate required headers.${detail}`);
  }

  const records = rows
    .slice(1)
    .filter((row) => row.some((cell) => normalize(cell) !== ""))
    .map((row, index) => ({
      source_row_number: index + 2,
      ...Object.fromEntries(
        columns.map((name, columnIndex) => [name, normalize(row[columnIndex])]),
      ),
    }));

  if (!records.length || records.length > 1500) {
    throw new Error("Grade imports must contain between 1 and 1,500 data rows.");
  }

  return { columns, records };
}

async function parseTrustedUpload(file) {
  if (
    !file ||
    typeof file.arrayBuffer !== "function" ||
    file.size < 1 ||
    file.size > MAX_UPLOAD_BYTES
  ) {
    throw new Error("Select a grade CSV or XLSX file smaller than 2 MB.");
  }

  const extension = normalize(file.name).toLowerCase().split(".").pop();
  if (!SAFE_EXTENSIONS.has(extension)) {
    throw new Error("Only CSV and XLSX files are supported.");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  let rows;

  if (extension === "xlsx") {
    rows = await readXlsxFile(bytes);
  } else {
    const parsed = Papa.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""), {
      skipEmptyLines: true,
    });
    if (parsed.errors.length) {
      throw new Error("The CSV file could not be parsed safely.");
    }
    rows = parsed.data;
  }

  const parsed = parseRowsAsRecords(rows);
  return { checksum, ...parsed };
}

function readContext(formData) {
  return {
    termId: normalize(formData.get("term_id")),
    academicYear: normalize(formData.get("academic_year")),
    semester: normalize(formData.get("semester")),
    collegeCode: normalize(formData.get("college_code")),
    programCode: normalize(formData.get("program_code")),
    previousBlockCode: normalize(formData.get("previous_block_code")),
    subjectCode: normalize(formData.get("subject_code")),
    sectionId: normalize(formData.get("section_id")),
    sectionCode: normalize(formData.get("section_code")),
    instructorId: normalize(formData.get("instructor_id")),
    instructorName: normalize(formData.get("instructor_name")),
    sourceSystem: normalize(formData.get("source_system")) || "OFFICIAL_GRADE_UPLOAD",
    sourceReference: normalize(formData.get("source_reference")),
    issuer: normalize(formData.get("issuer")),
  };
}

async function verifySelectedContext(client, context) {
  const required = [
    context.termId,
    context.academicYear,
    context.semester,
    context.collegeCode,
    context.programCode,
    context.subjectCode,
    context.sectionId,
    context.sectionCode,
    context.sourceReference,
    context.issuer,
  ];

  if (required.some((value) => !value)) {
    throw new Error(
      "Academic year, semester, college, program, subject, section and verified source information are required.",
    );
  }

  const [termResult, programResult, sectionResult] = await Promise.all([
    client
      .from("academic_terms")
      .select("id,academic_year,semester,label")
      .eq("id", context.termId)
      .maybeSingle(),
    client
      .from("programs")
      .select("code,name,organizational_unit_code")
      .eq("code", context.programCode)
      .maybeSingle(),
    client
      .from("sections")
      .select("id,term_id,subject_code,section_code,is_synthetic_demo")
      .eq("id", context.sectionId)
      .maybeSingle(),
  ]);

  if (termResult.error || !termResult.data) {
    throw new Error("The selected academic term is not available to the Registrar.");
  }
  if (programResult.error || !programResult.data) {
    throw new Error("The selected program is not available to the Registrar.");
  }
  if (sectionResult.error || !sectionResult.data) {
    throw new Error("The selected subject section is not available to the Registrar.");
  }

  if (
    normalizeLoose(termResult.data.academic_year) !== normalizeLoose(context.academicYear) ||
    normalizeLoose(termResult.data.semester) !== normalizeLoose(context.semester)
  ) {
    throw new Error("The selected academic year or semester does not match the academic term.");
  }

  if (programResult.data.organizational_unit_code !== context.collegeCode) {
    throw new Error("The selected college does not match the selected program.");
  }

  if (
    sectionResult.data.term_id !== context.termId ||
    sectionResult.data.subject_code !== context.subjectCode ||
    normalizeKey(sectionResult.data.section_code) !== normalizeKey(context.sectionCode) ||
    sectionResult.data.is_synthetic_demo === true
  ) {
    throw new Error("The selected term, subject and previous section do not resolve to one official section.");
  }

  const { data: enrollments, error: enrollmentError } = await client
    .from("enrollments")
    .select("id,student_id,program_code,term_id,status")
    .eq("term_id", context.termId)
    .eq("program_code", context.programCode)
    .eq("status", "CONFIRMED");

  if (enrollmentError) {
    throw new Error("Confirmed enrollment attempts could not be checked for the selected context.");
  }

  const enrollmentIds = (enrollments || []).map((row) => row.id);
  if (!enrollmentIds.length) {
    throw new Error("No confirmed official enrollment attempts exist for the selected program and term.");
  }

  const { data: attempts, error: attemptError } = await client
    .from("enrollment_subjects")
    .select("enrollment_id,subject_code,section_id,registration_status")
    .in("enrollment_id", enrollmentIds)
    .eq("subject_code", context.subjectCode)
    .eq("section_id", context.sectionId)
    .eq("registration_status", "CONFIRMED");

  if (attemptError) {
    throw new Error("Confirmed subject attempts could not be checked for the selected context.");
  }
  if (!attempts?.length) {
    throw new Error("No confirmed official subject attempts exist for the selected section.");
  }

  if (context.instructorId) {
    const { data: assignment, error: assignmentError } = await client
      .from("section_instructors")
      .select("section_id,instructor_id,assignment_role")
      .eq("section_id", context.sectionId)
      .eq("instructor_id", context.instructorId)
      .eq("assignment_role", "PRIMARY")
      .maybeSingle();

    if (assignmentError || !assignment) {
      throw new Error("The selected professor is not the recorded primary instructor for this section.");
    }
  }

  return {
    ...context,
    termLabel: termResult.data.label,
    programName: programResult.data.name,
    confirmedEnrollments: enrollments || [],
    confirmedAttemptEnrollmentIds: new Set((attempts || []).map((row) => row.enrollment_id)),
  };
}

async function prevalidateRows(client, context, records) {
  const studentNumbers = [...new Set(records.map((row) => row.student_number).filter(Boolean))];

  const { data: profiles, error: profileError } = studentNumbers.length
    ? await client
        .from("student_profiles")
        .select("id,student_number,is_synthetic_demo,record_kind")
        .in("student_number", studentNumbers)
    : { data: [], error: null };

  if (profileError) {
    throw new Error("Student identities could not be checked for this upload.");
  }

  const profileByNumber = new Map(
    (profiles || []).map((row) => [normalizeKey(row.student_number), row]),
  );
  const profileIds = (profiles || []).map((row) => row.id);

  const enrollmentByStudent = new Map();
  for (const enrollment of context.confirmedEnrollments) {
    if (context.confirmedAttemptEnrollmentIds.has(enrollment.id)) {
      enrollmentByStudent.set(enrollment.student_id, enrollment.id);
    }
  }

  const { data: existingResults, error: resultError } = profileIds.length
    ? await client
        .from("academic_results")
        .select("student_id,subject_code,term_id,result_status,official_grade_value")
        .in("student_id", profileIds)
        .eq("subject_code", context.subjectCode)
        .eq("term_id", context.termId)
    : { data: [], error: null };

  if (resultError) {
    throw new Error("Existing official results could not be checked for this upload.");
  }

  const existingResultStudents = new Set((existingResults || []).map((row) => row.student_id));
  const duplicateKeys = new Map();

  for (const row of records) {
    const key = `${normalizeKey(row.student_number)}|${normalizeKey(row.subject_code)}`;
    duplicateKeys.set(key, (duplicateKeys.get(key) || 0) + 1);
  }

  const previewRows = records.map((row) => {
    const issues = [];
    const studentNumber = normalize(row.student_number);
    const profile = profileByNumber.get(normalizeKey(studentNumber));
    const completionStatus = normalizeKey(row.completion_status);
    const rawGrade = normalize(row.grade_value);
    const duplicateKey = `${normalizeKey(studentNumber)}|${normalizeKey(row.subject_code)}`;

    for (const field of REQUIRED_HEADERS) {
      if (!normalize(row[field])) {
        issues.push(issue("MISSING_REQUIRED_INFORMATION", `${field} is required.`));
      }
    }

    if (normalizeKey(row.subject_code) !== normalizeKey(context.subjectCode)) {
      issues.push(issue("SUBJECT_MISMATCH", "Subject code does not match the selected subject."));
    }
    if (normalizeLoose(row.academic_year) !== normalizeLoose(context.academicYear)) {
      issues.push(issue("ACADEMIC_YEAR_MISMATCH", "Academic year does not match the selected term."));
    }
    if (normalizeLoose(row.semester) !== normalizeLoose(context.semester)) {
      issues.push(issue("SEMESTER_MISMATCH", "Semester does not match the selected term."));
    }
    if (normalizeKey(row.section_code) !== normalizeKey(context.sectionCode)) {
      issues.push(issue("SECTION_MISMATCH", "Section code does not match the selected section."));
    }
    if (
      context.previousBlockCode &&
      normalize(row.previous_block_section) &&
      normalizeKey(row.previous_block_section) !== normalizeKey(context.previousBlockCode)
    ) {
      issues.push(issue("BLOCK_MISMATCH", "Previous block section does not match the selected block."));
    }
    if (!COMPLETION_STATUSES.has(completionStatus)) {
      issues.push(issue("COMPLETION_STATUS_UNRECOGNIZED", "Completion status is not supported."));
    }
    if (!/^\d+(?:\.\d{1,3})?$/.test(rawGrade) && !INC_VALUES.has(normalizeKey(rawGrade))) {
      issues.push(issue("GRADE_FORMAT_UNRECOGNIZED", "Grade must be numeric or an incomplete marker."));
    }
    if ((duplicateKeys.get(duplicateKey) || 0) > 1) {
      issues.push(issue("DUPLICATE_SOURCE_ROW", "The same student and subject appear more than once in this file."));
    }
    if (!profile) {
      issues.push(issue("UNKNOWN_STUDENT", "Student number does not resolve to a student profile."));
    } else if (profile.record_kind === "PROJECT_ONLY" || profile.is_synthetic_demo === true) {
      issues.push(issue("PROJECT_ONLY_NOT_OFFICIAL", "PROJECT_ONLY students cannot be written to official grade imports."));
    } else if (!enrollmentByStudent.has(profile.id)) {
      issues.push(issue("CONFIRMED_ATTEMPT_MISSING", "No confirmed official attempt exists for this student in the selected subject section."));
    } else if (existingResultStudents.has(profile.id)) {
      issues.push(issue("OFFICIAL_RESULT_ALREADY_EXISTS", "An official result already exists for this student, term and subject."));
    }

    return {
      rowNumber: row.source_row_number,
      studentNumber,
      studentFullName: normalize(row.student_full_name),
      subjectCode: normalize(row.subject_code),
      academicYear: normalize(row.academic_year),
      semester: normalize(row.semester),
      previousBlockSection: normalize(row.previous_block_section) || "Not available",
      sectionCode: normalize(row.section_code),
      gradeValue: rawGrade,
      completionStatus,
      sourceRecordReference: normalize(row.source_record_reference),
      validationStatus: issues.length ? "REQUIRES_CORRECTION" : "PRECHECK_VALID",
      issues,
    };
  });

  return previewRows;
}

async function prepareUpload(formData) {
  await requireRole("registrar");
  const file = formData.get("file");
  const parsed = await parseTrustedUpload(file);
  const client = await createClient();
  const context = await verifySelectedContext(client, readContext(formData));
  const previewRows = await prevalidateRows(client, context, parsed.records);
  const invalidRows = previewRows.filter((row) => row.issues.length).length;

  return {
    client,
    file,
    parsed,
    context,
    previewRows,
    invalidRows,
  };
}

export async function previewOfficialGradeImport(formData) {
  const prepared = await prepareUpload(formData);

  return {
    checksum: prepared.parsed.checksum,
    fileName: prepared.file.name,
    rowCount: prepared.previewRows.length,
    validRows: prepared.previewRows.length - prepared.invalidRows,
    invalidRows: prepared.invalidRows,
    rows: prepared.previewRows,
    context: {
      termId: prepared.context.termId,
      termLabel: prepared.context.termLabel,
      academicYear: prepared.context.academicYear,
      semester: prepared.context.semester,
      collegeCode: prepared.context.collegeCode,
      programCode: prepared.context.programCode,
      programName: prepared.context.programName,
      previousBlockCode: prepared.context.previousBlockCode || "Not available",
      subjectCode: prepared.context.subjectCode,
      sectionId: prepared.context.sectionId,
      sectionCode: prepared.context.sectionCode,
      instructorName: prepared.context.instructorName || "Not available",
      issuer: prepared.context.issuer,
      sourceReference: prepared.context.sourceReference,
    },
    notes: {
      studentNameConsistency:
        "Student name is preserved in the source preview. Authoritative cross-check is not available under the current Registrar identity read contract.",
      databaseValidation:
        "Staging and protected database validation still recheck official enrollment attempts and existing results before publication.",
    },
  };
}

// The browser never receives a service key. All SQL actions execute with a
// genuine authenticated Registrar JWT and recheck role permissions in SQL.
export async function stageOfficialGradeImport(formData) {
  const prepared = await prepareUpload(formData);

  if (prepared.invalidRows > 0) {
    throw new Error(
      `The grade file has ${prepared.invalidRows} row${prepared.invalidRows === 1 ? "" : "s"} requiring correction. Fix the preview issues before staging.`,
    );
  }

  const args = {
    p_term_id: prepared.context.termId,
    p_subject_code: prepared.context.subjectCode,
    p_section_id: prepared.context.sectionId,
    p_source_system: prepared.context.sourceSystem,
    p_source_reference: prepared.context.sourceReference,
    p_issuer: prepared.context.issuer,
    p_file_name: prepared.file.name,
    p_checksum: prepared.parsed.checksum,
    p_rows: prepared.parsed.records.map(({ source_row_number, ...row }) => row),
  };

  const { data, error } = await prepared.client.rpc("registrar_stage_grade_batch_v1", args);
  if (error) {
    throw new Error(`Grade import staging was rejected by the trusted backend: ${error.message}`);
  }

  revalidatePath("/registrar/students");
  return {
    batchId: data,
    checksum: prepared.parsed.checksum,
    stagedRows: prepared.parsed.records.length,
    context: {
      termId: prepared.context.termId,
      academicYear: prepared.context.academicYear,
      semester: prepared.context.semester,
      programCode: prepared.context.programCode,
      previousBlockCode: prepared.context.previousBlockCode || "Not available",
      subjectCode: prepared.context.subjectCode,
      sectionCode: prepared.context.sectionCode,
      instructorName: prepared.context.instructorName || "Not available",
    },
  };
}

export async function validateOfficialGradeImport(batchId) {
  await requireRole("registrar");
  const client = await createClient();
  const { data, error } = await client.rpc("registrar_validate_grade_batch_v1", {
    p_batch_id: batchId,
  });
  if (error) {
    throw new Error(`Grade import validation could not finish: ${error.message}`);
  }
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
  if (error || data !== true) {
    throw new Error(error?.message || "Source verification was rejected.");
  }
  return { verified: true };
}

export async function publishOfficialGradeImport(batchId) {
  await requireRole("registrar");
  const client = await createClient();
  const { data, error } = await client.rpc("registrar_publish_grade_batch_v1", {
    p_batch_id: batchId,
  });
  if (error) {
    throw new Error(`Official grade publication failed. No partial results were committed. ${error.message}`);
  }
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
  if (
    !details?.studentId ||
    !details?.curriculumCode ||
    !details?.subjectCode ||
    !details?.sourceInstitution ||
    !details?.externalSubjectReference ||
    !details?.evidenceReference
  ) {
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
  const { data, error } = await client.rpc("official_enrollment_cor_v1", {
    p_enrollment_id: enrollmentId,
  });
  if (error) throw new Error("Official registration information is not available.");
  return data;
}

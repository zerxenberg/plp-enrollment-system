"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { REQUIRED_PROJECT_GRADE_COLUMNS, matchesProjectCanonicalGrade,
  parseProjectGradeSource, validateProjectGradeRows } from "./project-grade-source.mjs";
import { PROJECT_GRADE_WORKSPACE_PERMISSION_CODE, PROJECT_GRADE_WORKSPACE_PERMISSION_MESSAGE,
  unwrapProjectGradeWorkspaceQuery } from "./project-grade-workspace-contract.mjs";
import { readProjectGradeCatalog } from "./project-grade-catalog-server";

const CURRENT_BLOCK_ID = "456b850d-3241-505f-a718-f35ff3ce4be1";
const CURRENT_TERM_ID = "TERM-2026-1";
const HISTORY_TERM_ID = "TERM-2025-2";
const HISTORICAL_GROUP = "BSIT-1A";
const PROJECT_COHORT_ID = "PLP_PROJECT_600_2026_1";
const PROJECT_CURRICULUM = "P8F26-BSIT-V1";
const REQUIRED_COLUMNS = REQUIRED_PROJECT_GRADE_COLUMNS;
const normalize = (value) => String(value ?? "").trim();
const key = (value) => normalize(value).toUpperCase();

function failure(error, fallback) {
  // Supabase errors can contain SQL or privileged schema details. Keep those on the server.
  if (error?.code === PROJECT_GRADE_WORKSPACE_PERMISSION_CODE) {
    return { ok: false, message: PROJECT_GRADE_WORKSPACE_PERMISSION_MESSAGE };
  }
  if (error?.code === "PGRST202" || error?.code === "42883") {
    return { ok: false, message: "The protected project grade database contract is not installed yet." };
  }
  return { ok: false, message: fallback };
}

function assertResult(result, description) {
  return unwrapProjectGradeWorkspaceQuery(result, description);
}

// Approved, narrowly scoped service reader. The project tables are not granted
// to authenticated clients, so each call first requires the actual Registrar role.
async function readProtectedHistoricalWorkspace(admin) {
  const [target, historicalTerm, placementResult, existingBatches] = await Promise.all([
    admin.from("block_sections").select("id,code,term_id,program_code,curriculum_code")
      .eq("id", CURRENT_BLOCK_ID).single(),
    admin.from("academic_terms").select("id,label,academic_year,semester")
      .eq("id", HISTORY_TERM_ID).single(),
    admin.from("project_student_academic_placements")
      .select("student_id,term_id,project_cohort_id,curriculum_code")
      .eq("home_block_id", CURRENT_BLOCK_ID)
      .eq("project_cohort_id", PROJECT_COHORT_ID)
      .eq("term_id", CURRENT_TERM_ID),
    admin.from("project_grade_import_batches")
      .select("id,block_id,target_term_id,term_id,previous_block_code,subject_code,source_system,source_reference,issuer,file_name,source_checksum,row_count,status,verification_method,verified_at,published_at,publication_reference,created_at")
      .eq("project_cohort_id", PROJECT_COHORT_ID)
      .eq("block_id", CURRENT_BLOCK_ID).eq("term_id", HISTORY_TERM_ID)
      .order("created_at", { ascending: false }),
  ]);
  const block = assertResult(target, "The approved project block");
  const term = assertResult(historicalTerm, "The project historical term");
  const placements = assertResult(placementResult, "Project historical roster placements");
  const batches = assertResult(existingBatches, "Protected project grade batches") || [];
  if (block.code !== "BSIT-2A" || block.term_id !== CURRENT_TERM_ID ||
      block.program_code !== "BSIT" || block.curriculum_code !== PROJECT_CURRICULUM ||
      !placements.length || placements.length !== 15 ||
      placements.some((item) => item.curriculum_code !== PROJECT_CURRICULUM)) {
    throw new Error("The target project roster is not the approved BSIT 2A cohort");
  }
  const placementIds = placements.map((item) => item.student_id);
  const [profilesResult, sourceResults] = await Promise.all([
    admin.from("student_profiles").select("id,user_id,student_number,student_type,record_kind,project_cohort_id,is_synthetic_demo")
      .in("id", placementIds)
      .eq("record_kind", "PROJECT_ONLY").eq("project_cohort_id", PROJECT_COHORT_ID)
      .eq("is_synthetic_demo", true),
    admin.from("project_simulated_academic_results")
      .select("id,student_id,term_id,curriculum_code,subject_code,grade_value,result_status")
      .in("student_id", placementIds).eq("term_id", HISTORY_TERM_ID)
      .eq("curriculum_code", PROJECT_CURRICULUM),
  ]);
  const profiles = assertResult(profilesResult, "Project student profiles");
  const results = assertResult(sourceResults, "Protected project historical results");
  const continuing = profiles.filter((item) => item.student_type === "CONTINUING_STUDENT");
  if (profiles.length !== 15 || continuing.length !== 12 || results.length !== 96 ||
      results.some((item) => !continuing.some((student) => student.id === item.student_id))) {
    throw new Error("Historical source roster or canonical result counts do not match the approved project cohort");
  }
  const subjectCodes = [...new Set(results.map((item) => item.subject_code))].sort();
  if (subjectCodes.length !== 8 ||
      continuing.some((item) => results.filter((row) => row.student_id === item.id).length !== 8)) {
    throw new Error("Each historical continuing student must have exactly eight prior subject results");
  }
  const [appUsers, subjectRows, batchRows, acceptances, correctionRequests, historicalInstructors] = await Promise.all([
    admin.from("app_users").select("id,full_name").in("id", continuing.map((item) => item.user_id)),
    admin.from("subjects").select("code,name").in("code", subjectCodes),
    batches.length ? admin.from("project_grade_import_rows")
      .select("id,batch_id,source_row_number,source_student_number,raw_grade_text,completion_status,validation_status,error_details,canonical_result_id,student_id,original_row")
      .in("batch_id", batches.map((item) => item.id)).order("source_row_number")
      : Promise.resolve({ data: [], error: null }),
    admin.from("project_grade_result_acceptances").select("result_id,batch_id,accepted_at,source_kind")
      .in("result_id", results.map((item) => item.id)),
    batches.length ? admin.from("project_grade_correction_requests")
      .select("id,batch_id,source_row_id,canonical_result_id,previous_grade,previous_status,proposed_grade,proposed_status,reason,requested_at,status,reviewed_at,review_reference")
      .in("batch_id", batches.map((item) => item.id)).order("requested_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    admin.from("project_historical_subject_instructors")
      .select("subject_code,instructor_id,assignment_provenance,verified_institutionally")
      .eq("project_cohort_id", PROJECT_COHORT_ID)
      .eq("target_block_id", CURRENT_BLOCK_ID)
      .eq("prior_term_id", HISTORY_TERM_ID)
      .eq("curriculum_code", PROJECT_CURRICULUM)
      .eq("previous_block_code", HISTORICAL_GROUP),
  ]);
  const names = new Map(assertResult(appUsers, "Historical student names").map((item) => [item.id, item.full_name]));
  const subjects = new Map(assertResult(subjectRows, "Historical subject metadata").map((item) => [item.code, item.name]));
  const rows = assertResult(batchRows, "Protected historical import row details") || [];
  const accepted = assertResult(acceptances, "Project historical grade acceptance ledger") || [];
  const requests = assertResult(correctionRequests, "Protected project grade correction requests") || [];
  const historicalAssignments = assertResult(historicalInstructors, "Project historical instructor assignments") || [];
  if (historicalAssignments.length !== subjectCodes.length ||
      historicalAssignments.some((item) => !subjectCodes.includes(item.subject_code) || item.verified_institutionally !== false)) {
    throw new Error("Historical project instructor assignment scope is incomplete");
  }
  const instructorIds = historicalAssignments.map((item) => item.instructor_id).filter(Boolean);
  const professorResult = instructorIds.length ? await admin.from("instructors")
    .select("id,display_name,is_synthetic_demo,synthetic_source_key")
    .in("id", instructorIds) : { data: [], error: null };
  const demoProfessors = new Map(assertResult(professorResult, "Fictional project professors")
    .filter((item) => item.is_synthetic_demo === true &&
      item.synthetic_source_key?.startsWith("PROJECT_ONLY_BSIT1A_TERM2025_2:"))
    .map((item) => [item.id, item.display_name]));
  const professorBySubject = new Map(historicalAssignments.map((item) => [item.subject_code,
    item.assignment_provenance === "PROJECT_FICTIONAL_ASSIGNMENT" && item.instructor_id &&
      demoProfessors.has(item.instructor_id) ? demoProfessors.get(item.instructor_id) : null]));
  if (names.size !== 12 || subjects.size !== 8) throw new Error("Historical project academic identity metadata is incomplete");
  const students = continuing.map((item) => ({
    studentId: item.id,
    studentNumber: item.student_number,
    studentName: names.get(item.user_id),
    sectionCode: HISTORICAL_GROUP,
  })).sort((a, b) => a.studentNumber.localeCompare(b.studentNumber));
  const projectedSubjects = subjectCodes.map((code) => ({
    code,
    name: subjects.get(code),
    previousProfessor: professorBySubject.get(code)
      ? { name: professorBySubject.get(code), provenance: "PROJECT_FICTIONAL_ASSIGNMENT" }
      : null,
    expected: students.map((student) => {
      const canonical = results.find((item) => item.subject_code === code && item.student_id === student.studentId);
      return { ...student, canonicalResultId: canonical.id,
        canonicalResultStatus: canonical.result_status, canonicalGrade: canonical.grade_value };
    }),
  }));
  const mappedBatches = batches.map((batch) => {
    const items = rows.filter((item) => item.batch_id === batch.id);
    return { ...batch, rows: items,
      correctionRequests: requests.filter((item) => item.batch_id === batch.id),
      conflict_rows: items.filter((item) => item.validation_status === "CONFLICT").length };
  });
  const publicationRefs = [...new Set(batches.filter((batch) => batch.status === "PUBLISHED_PROJECT")
    .map((batch) => batch.publication_reference).filter(Boolean))];
  const releases = publicationRefs.map((reference) => {
    const published = batches.filter((batch) => batch.publication_reference === reference && batch.status === "PUBLISHED_PROJECT");
    return {
      id: published[0].id,
      block_id: CURRENT_BLOCK_ID,
      term_id: HISTORY_TERM_ID,
      publication_reference: reference,
      expected_subject_count: published.length,
      expected_result_count: accepted.filter((item) => published.some((batch) => batch.id === item.batch_id)).length,
      status: "PUBLISHED_PROJECT",
      published_at: published[0].published_at,
      batch_ids: published.map((batch) => batch.id),
    };
  });
  return {
    blocks: [{ id: CURRENT_BLOCK_ID, currentBlockCode: block.code,
      currentTermId: CURRENT_TERM_ID, code: HISTORICAL_GROUP, termId: HISTORY_TERM_ID,
      termLabel: term.label, academicYear: term.academic_year, semester: term.semester,
      programCode: "BSIT", subjects: projectedSubjects, roster: students,
      release: releases[0] || null }],
    batches: mappedBatches,
    releases,
    totalAcceptedResults: accepted.length,
    // The authenticated, role-bound and atomic publication RPC is installed.
    // The server still checks all selected batches before invoking it, and the
    // database rechecks the entire project scope in one locked transaction.
    publicationAvailable: true,
  };
}

async function readPagedProjectRows(factory, label) {
  const rows = [];
  for (let start = 0; ; start += 500) {
    const data = assertResult(await factory().range(start, start + 499), label) || [];
    rows.push(...data);
    if (data.length < 500) return rows;
    if (start >= 10000) throw new Error(`${label} exceeds the protected import history limit`);
  }
}

// Keep the already published BSIT 2A history intact while exposing all other
// eligible Phase 8 blocks. The protected catalog never guesses prior sections.
async function readAllProtectedHistoricalWorkspaces(admin) {
  const [legacy, catalog, additionalBatches] = await Promise.all([
    readProtectedHistoricalWorkspace(admin),
    readProjectGradeCatalog(admin),
    readPagedProjectRows(() => admin.from("project_grade_import_batches")
      .select("id,block_id,target_term_id,term_id,previous_block_code,subject_code,source_system,source_reference,issuer,file_name,source_checksum,row_count,status,verification_method,verified_at,published_at,publication_reference,created_at")
      .eq("project_cohort_id", PROJECT_COHORT_ID)
      .eq("source_system", "PROJECT_ONLY")
      .neq("block_id", CURRENT_BLOCK_ID).order("created_at", { ascending: false }),
    "Other protected project grade batches"),
  ]);
  const blockIds = new Set(catalog.map((item) => item.id));
  if (additionalBatches.some((item) => !blockIds.has(item.block_id) &&
      item.status !== "PUBLISHED_PROJECT")) {
    throw new Error("A project grade batch references an unapproved academic block");
  }
  const rows = [];
  const correctionRequests = [];
  const acceptances = [];
  for (let i = 0; i < additionalBatches.length; i += 60) {
    const ids = additionalBatches.slice(i, i + 60).map((item) => item.id);
    rows.push(...await readPagedProjectRows(() => admin.from("project_grade_import_rows")
      .select("id,batch_id,source_row_number,source_student_number,raw_grade_text,completion_status,validation_status,error_details,canonical_result_id,student_id,original_row")
      .in("batch_id", ids).order("source_row_number"), "Other protected grade source rows"));
    correctionRequests.push(...await readPagedProjectRows(() => admin.from("project_grade_correction_requests")
      .select("id,batch_id,source_row_id,canonical_result_id,previous_grade,previous_status,proposed_grade,proposed_status,reason,requested_at,status,reviewed_at,review_reference")
      .in("batch_id", ids).order("requested_at", { ascending: false }),
    "Other protected grade correction requests"));
    acceptances.push(...await readPagedProjectRows(() => admin.from("project_grade_result_acceptances")
      .select("result_id,batch_id,accepted_at,source_kind")
      .in("batch_id", ids).order("accepted_at"), "Other protected grade acceptances"));
  }
  const additional = additionalBatches.map((batch) => {
    const batchRows = rows.filter((row) => row.batch_id === batch.id);
    return {
      ...batch, rows: batchRows,
      correctionRequests: correctionRequests.filter((item) => item.batch_id === batch.id),
      conflict_rows: batchRows.filter((row) => row.validation_status === "CONFLICT").length,
    };
  });
  const newReleases = [...new Set(additional.filter((batch) => batch.status === "PUBLISHED_PROJECT")
    .map((batch) => `${batch.block_id}|${batch.term_id}|${batch.publication_reference}`))].map((keyValue) => {
    const [blockId, termId, reference] = keyValue.split("|");
    const published = additional.filter((batch) => batch.block_id === blockId &&
      batch.term_id === termId && batch.publication_reference === reference && batch.status === "PUBLISHED_PROJECT");
    const target = catalog.find((item) => item.id === blockId && item.termId === termId);
    const expectedCodes = new Set((target?.subjects || []).map((subject) => subject.code));
    const accepted = acceptances.filter((item) => published.some((batch) => batch.id === item.batch_id));
    const acceptedIds = new Set(accepted.map((item) => item.result_id));
    const sourceRows = published.flatMap((batch) => batch.rows || []);
    if (!reference || !target || published.length !== expectedCodes.size ||
        new Set(published.map((batch) => batch.subject_code)).size !== expectedCodes.size ||
        published.some((batch) => !expectedCodes.has(batch.subject_code) || !batch.verified_at ||
          !batch.published_at || !batch.row_count || batch.rows.length !== batch.row_count) ||
        accepted.length !== sourceRows.length || acceptedIds.size !== sourceRows.length ||
        sourceRows.some((row) => row.validation_status !== "ACCEPTED_PROJECT" ||
          !row.canonical_result_id || !acceptedIds.has(row.canonical_result_id))) {
      throw new Error("Protected project publication history is incomplete or its acceptance ledger is inconsistent");
    }
    return {
      id: published[0].id, block_id: blockId, term_id: termId,
      publication_reference: reference,
      expected_subject_count: published.length,
      expected_result_count: accepted.length,
      status: "PUBLISHED_PROJECT", published_at: published[0].published_at,
      batch_ids: published.map((batch) => batch.id),
    };
  });
  const releases = [...legacy.releases, ...newReleases];
  const releaseFor = (block) => releases.find((release) =>
    release.block_id === block.id && release.term_id === block.termId) || null;
  const archivedLegacy = blockIds.has(CURRENT_BLOCK_ID) ? [] : [{
    ...legacy.blocks[0],
    collegeCode: "ARCHIVE",
    collegeName: "Archived Project Grade Releases",
    programName: "BSIT Historical Release",
    yearLevel: 2,
    archived: true,
    mappingRequired: false,
  }];
  return {
    ...legacy,
    blocks: catalog.map((block) => block.id === CURRENT_BLOCK_ID
      ? { ...block, release: releaseFor(block), subjects: legacy.blocks[0].subjects,
        roster: legacy.blocks[0].roster, code: HISTORICAL_GROUP, mappingRequired: false }
      : { ...block, release: releaseFor(block) }).concat(archivedLegacy),
    batches: [...legacy.batches, ...additional],
    releases,
  };
}

async function projectWorkspace() {
  const actor = await requireRole("registrar");
  const client = await createClient();
  const admin = createAdminClient();
  const data = await readAllProtectedHistoricalWorkspaces(admin);
  return { client, admin, actor, data };
}

export async function loadProjectGradeWorkspace() {
  try {
    const { data } = await projectWorkspace();
    return { ok: true, data };
  } catch (error) {
    return failure(error, "The protected project grade workspace is currently unavailable.");
  }
}

/** Generate a source template from the same protected roster and field contract as validation. */
export async function downloadProjectGradeTemplate(blockId, subjectCode) {
  try {
    const { data } = await projectWorkspace();
    const block = data.blocks.find((item) => item.id === blockId);
    const subject = block?.subjects?.find((item) => item.code === subjectCode);
    if (!block || !subject || !Array.isArray(subject.expected) || !subject.expected.length) {
      return { ok: false, message: "A verified historical block and subject roster are required." };
    }
    const columns = [...REQUIRED_COLUMNS, "previous_block_section", "previous_subject_professor"];
    const quote = (value) => {
      const text = String(value ?? "");
      if (/^[=+@\t\r]/.test(text)) throw new Error("Unsafe source content");
      return `"${text.replaceAll('"', '""')}"`;
    };
    const matrix = [columns, ...subject.expected.map((student) => [
      student.studentNumber, student.studentName, subject.code,
      block.academicYear, block.semester, student.sectionCode,
      "", "", "", block.code, "NOT_VERIFIED_IN_SOURCE",
    ])];
    return {
      ok: true,
      data: {
        fileName: `${subject.code}_${block.code}_Project_Grade_Template.csv`,
        content: `${matrix.map((cells) => cells.map(quote).join(",")).join("\r\n")}\r\n`,
      },
      message: "The project grade CSV template was generated from the current verified roster.",
    };
  } catch {
    return { ok: false, message: "The authorized project grade template could not be generated." };
  }
}

async function prepareProjectUpload(formData) {
  const { client, data } = await projectWorkspace();
  const block = data.blocks.find((item) => item.id === normalize(formData.get("block_id")));
  const subject = block?.subjects?.find((item) => key(item.code) === key(formData.get("subject_code")));
  if (!block || !subject || !Array.isArray(subject.expected) || !subject.expected.length) {
    throw new Error("Choose a verified project block and subject with an assigned roster.");
  }
  if (block.mappingRequired || !block.code || !subject.previousProfessor ||
      subject.previousProfessor.provenance !== "PROJECT_FICTIONAL_ASSIGNMENT") {
    throw new Error("The historical section and professor mapping must be configured from approved source evidence before importing this subject.");
  }
  if (block.release) throw new Error("This project block already has a published grade release.");
  const file = formData.get("file");
  const parsed = await parseProjectGradeSource(file);
  const preview = validateProjectGradeRows(parsed, block, subject);
  return { client, block, subject, parsed, preview };
}

export async function previewProjectGradeFile(formData) {
  try {
    const { preview } = await prepareProjectUpload(formData);
    return { ok: true, data: preview, message: preview.invalidRows || preview.missingStudents.length
      ? "The file has roster or row issues. Correct them before staging."
      : preview.conflictRows
        ? `${preview.conflictRows} grade results conflict with existing project history. You may stage the file for protected review; publication remains blocked.`
        : "Every grade row matches its historical project roster and canonical result." };
  } catch (error) {
    return failure(error, error.message?.startsWith("Choose") || error.message?.startsWith("The ") || error.message?.startsWith("Upload") || error.message?.startsWith("Grade") || error.message?.startsWith("A grade")
      ? error.message : "The project grade file could not be previewed.");
  }
}

export async function stageProjectGradeFile(formData) {
  try {
    const { client, block, subject, parsed, preview } = await prepareProjectUpload(formData);
    if (preview.invalidRows || preview.missingStudents.length || preview.rowCount !== preview.requiredRows) {
      return { ok: false, message: "A complete matching subject roster is required before staging." };
    }
    const sourceSystem = normalize(formData.get("source_system"));
    const sourceReference = normalize(formData.get("source_reference"));
    const issuer = normalize(formData.get("issuer"));
    if (sourceSystem !== "PROJECT_ONLY" || sourceReference.length < 8 || issuer.length < 3 ||
        [sourceReference, issuer].some((value) => value.length > 240)) {
      return { ok: false, message: "PROJECT_ONLY source, document reference, and identifying issuer are required." };
    }
    const payload = {
      p_block_id: block.id,
      p_term_id: block.termId,
      p_target_term_id: block.currentTermId,
      p_previous_block_code: block.code,
      p_subject_code: subject.code,
      p_source_system: sourceSystem,
      p_source_reference: sourceReference,
      p_issuer: issuer,
      p_file_name: parsed.fileName,
      p_checksum: parsed.checksum,
      p_rows: parsed.records,
    };
    const legacyBlock = block.id === CURRENT_BLOCK_ID;
    const { data, error } = await client.rpc(
      legacyBlock ? "registrar_project_grade_stage_v1" :
        "registrar_project_grade_stage_dynamic_v1", payload);
    let batchId = data;
    if (!legacyBlock && error) {
      return failure(error, "The protected project grade staging transaction was rejected. Verify the historical roster and source mapping.");
    }
    if (legacyBlock && (error?.code === "PGRST202" || error?.code === "42883")) {
      // Without a transaction RPC, a batch is created in nonpublishable
      // VALIDATING state, then made UPLOADED only after all source rows persist.
      const { admin, actor, data: latest } = await projectWorkspace();
      const current = latest.blocks.find((item) => item.id === block.id && item.termId === block.termId);
      if (!current || current.release || latest.batches.some((item) =>
        item.subject_code === subject.code && !["CANCELLED", "FAILED"].includes(item.status))) {
        return { ok: false, message: "An active source batch already exists for this project subject. Review it before attempting another import." };
      }
      const inserted = await admin.from("project_grade_import_batches").insert({
        project_cohort_id: PROJECT_COHORT_ID,
        block_id: block.id,
        target_term_id: block.currentTermId,
        term_id: block.termId,
        curriculum_code: block.curriculumCode,
        previous_block_code: block.code,
        subject_code: subject.code,
        source_system: "PROJECT_ONLY",
        source_reference: sourceReference,
        issuer,
        file_name: parsed.fileName,
        source_checksum: parsed.checksum,
        row_count: parsed.records.length,
        status: "VALIDATING",
        uploaded_by_user_id: actor.id,
      }).select("id").single();
      if (inserted.error || !inserted.data?.id) {
        return failure(inserted.error, "The project grade source batch could not be staged.");
      }
      batchId = inserted.data.id;
      const sourceRows = parsed.records.map((row) => ({
        batch_id: batchId,
        source_row_number: row.source_row_number,
        source_student_number: row.student_number,
        source_student_name: row.student_full_name,
        source_subject_code: row.subject_code,
        source_section_code: row.section_code,
        source_record_reference: row.source_record_reference,
        raw_grade_text: row.grade_value,
        normalized_grade: /^\d+(?:\.\d{1,3})?$/.test(row.grade_value) ? Number(row.grade_value) : null,
        completion_status: key(row.completion_status),
        original_row: row,
        validation_status: "NEEDS_REVIEW",
        error_details: [],
      }));
      const rowsInsert = await admin.from("project_grade_import_rows").insert(sourceRows).select("id");
      if (rowsInsert.error || rowsInsert.data?.length !== parsed.records.length) {
        await admin.from("project_grade_import_batches")
          .update({ status: "FAILED" }).eq("id", batchId).eq("status", "VALIDATING");
        return { ok: false, message: "The grade source staging was incomplete. Its batch has been locked for review." };
      }
      const activated = await admin.from("project_grade_import_batches")
        .update({ status: "UPLOADED" }).eq("id", batchId).eq("status", "VALIDATING")
        .select("id").maybeSingle();
      if (activated.error || !activated.data) {
        await admin.from("project_grade_import_batches")
          .update({ status: "FAILED" }).eq("id", batchId).eq("status", "VALIDATING");
        return { ok: false, message: "The staged source rows require administrative review before validation." };
      }
    } else if (error) {
      return failure(error, "The protected project grade staging operation was rejected.");
    }
    revalidatePath("/registrar/students");
    return { ok: true, data: { batchId, stagedRows: parsed.records.length }, message: "Project grade source rows were staged for protected validation." };
  } catch (error) {
    return failure(error, "The project grade file could not be staged.");
  }
}

export async function validateProjectGradeBatch(batchId) {
  try {
    const { client, admin, data: workspace } = await projectWorkspace();
    if (!batchId) return { ok: false, message: "Choose a staged project grade batch." };
    const chosenBatch = workspace.batches.find((item) => item.id === batchId);
    if (!chosenBatch) return { ok: false, message: "The selected project grade batch is unavailable." };
    const legacyBatch = chosenBatch.block_id === CURRENT_BLOCK_ID;
    const { data, error } = await client.rpc(
      legacyBatch ? "registrar_project_grade_validate_v1" :
        "registrar_project_grade_validate_dynamic_v1", { p_batch_id: batchId });
    if (legacyBatch && (error?.code === "PGRST202" || error?.code === "42883")) {
      const batch = workspace.batches.find((item) => item.id === batchId &&
        item.source_system === "PROJECT_ONLY");
      const block = workspace.blocks.find((item) =>
        item.id === batch?.block_id && item.termId === batch?.term_id);
      const subject = block?.subjects?.find((item) => item.code === batch?.subject_code);
      if (!batch || !subject || !["UPLOADED", "REQUIRES_CORRECTION"].includes(batch.status) ||
          block.mappingRequired || batch.rows.length !== subject.expected.length) {
        return { ok: false, message: "This project source batch is not eligible for validation." };
      }
      const expectedByNumber = new Map(subject.expected.map((item) => [item.studentNumber, item]));
      const recordChecks = batch.rows.map((row) => {
        const canonical = expectedByNumber.get(row.source_student_number);
        if (!canonical) return { ...row, status: "INVALID", details: ["Student is outside the historical project source roster."] };
        const matches = matchesProjectCanonicalGrade(row.raw_grade_text, row.completion_status,
          canonical.canonicalGrade, canonical.canonicalResultStatus);
        return { ...row, studentId: canonical.studentId, resultId: canonical.canonicalResultId,
          status: matches ? "ALREADY_PRESENT" : "CONFLICT",
          details: matches ? [] : ["The workbook result differs from existing fictional history. Explicit academic approval is required."] };
      });
      const statusStart = await admin.from("project_grade_import_batches")
        .update({ status: "VALIDATING", validated_at: null, verified_by: null,
          verified_at: null, verification_method: null })
        .eq("id", batch.id).eq("status", batch.status).select("id").maybeSingle();
      if (statusStart.error || !statusStart.data) {
        return { ok: false, message: "This project source batch changed before validation." };
      }
      for (const row of recordChecks) {
        const updated = await admin.from("project_grade_import_rows").update({
          student_id: row.studentId || null,
          canonical_result_id: row.resultId || null,
          validation_status: row.status,
          error_details: row.details,
        }).eq("id", row.id).eq("batch_id", batch.id).select("id").maybeSingle();
        if (updated.error || !updated.data) {
          await admin.from("project_grade_import_batches").update({ status: "FAILED" })
            .eq("id", batch.id).eq("status", "VALIDATING");
          return { ok: false, message: "Project source validation did not complete. Batch locked for review." };
        }
      }
      const conflictRows = recordChecks.filter((row) => row.status === "CONFLICT").length;
      const invalidRows = recordChecks.filter((row) => row.status === "INVALID").length;
      const nextStatus = invalidRows ? "REQUIRES_CORRECTION" : conflictRows ? "CONFLICT_REVIEW" : "READY_FOR_REVIEW";
      const saved = await admin.from("project_grade_import_batches")
        .update({ status: nextStatus, validated_at: new Date().toISOString() })
        .eq("id", batch.id).eq("status", "VALIDATING").select("id").maybeSingle();
      if (saved.error || !saved.data) {
        return { ok: false, message: "Project source validation status could not be finalized." };
      }
      return { ok: true,
        data: { valid_rows: recordChecks.length - invalidRows, invalid_rows: invalidRows,
          already_present: recordChecks.filter((row) => row.status === "ALREADY_PRESENT").length,
          conflict_rows: conflictRows },
        message: conflictRows ? `${conflictRows} historical grade conflicts require approval; canonical project history was preserved.`
          : "Historical project grade sources were reconciled against existing canonical results." };
    }
    if (error) return failure(error, "Protected project grade validation was rejected.");
    return { ok: true, data, message: data?.invalid_rows ? "Some source rows need correction." : "Project grade rows passed protected validation." };
  } catch (error) {
    return failure(error, "Project grade validation is unavailable.");
  }
}

/** Submit discrepancies to the protected project-only request ledger; never approve or apply them here. */
export async function requestProjectGradeCorrections(batchId, reason) {
  try {
    const { client, data: workspace } = await projectWorkspace();
    const justification = normalize(reason);
    if (justification.length < 15 || justification.length > 2000) {
      return { ok: false, message: "Explain the requested academic correction in 15 to 2,000 characters." };
    }
    const batch = workspace.batches.find((item) => item.id === batchId &&
      ((item.block_id === CURRENT_BLOCK_ID && item.term_id === HISTORY_TERM_ID) ||
        workspace.blocks?.some((block) => block.id === item.block_id && block.termId === item.term_id)) &&
      item.source_system === "PROJECT_ONLY" && item.status === "CONFLICT_REVIEW");
    const unresolved = batch?.rows?.filter((row) => row.validation_status === "CONFLICT") || [];
    if (!batch || !unresolved.length || unresolved.some((row) => !row.canonical_result_id || !row.student_id)) {
      return { ok: false, message: "Only reconciled historical PROJECT_ONLY conflicts may be submitted for correction review." };
    }
    const { data, error } = await client.rpc(
      batch.block_id === CURRENT_BLOCK_ID
        ? "registrar_project_grade_request_corrections_v1"
        : "registrar_project_grade_request_corrections_dynamic_v1", {
      p_batch_id: batchId, p_reason: justification,
    });
    if (error) return failure(error, "The protected academic correction request was rejected.");
    if (data?.canonical_results_unchanged !== true || data?.request_status !== "REQUESTED" ||
        !Number.isInteger(data?.requests_created) || !Number.isInteger(data?.already_requested)) {
      return { ok: false, message: "The correction request result needs verification. Refresh protected project grade history." };
    }
    revalidatePath("/registrar/students");
    return {
      ok: true, data,
      message: `${data.requests_created} project grade correction request(s) submitted; ${data.already_requested} already recorded. Canonical grades were not changed.`,
    };
  } catch (error) {
    return failure(error, "Academic correction requests are currently unavailable.");
  }
}

/** Retain an academically rejected source for audit; Registrar may reupload a corrected workbook. */
export async function cancelProjectGradeBatch(batchId, reason) {
  try {
    const { client, data: workspace } = await projectWorkspace();
    const justification = normalize(reason);
    if (justification.length < 15 || justification.length > 2000)
      return { ok: false, message: "Explain why this conflicting source is being replaced in 15 to 2,000 characters." };
    const batch = workspace.batches.find((item) => item.id === batchId &&
      ((item.block_id === CURRENT_BLOCK_ID && item.term_id === HISTORY_TERM_ID) ||
        workspace.blocks?.some((block) => block.id === item.block_id && block.termId === item.term_id)) &&
      item.source_system === "PROJECT_ONLY" && item.status === "CONFLICT_REVIEW");
    const conflicts = batch?.rows?.filter((row) => row.validation_status === "CONFLICT") || [];
    const rejected = batch?.correctionRequests?.filter((request) =>
      request.status === "REJECTED") || [];
    if (!batch || !conflicts.length ||
        conflicts.some((row) => !rejected.some((request) => request.source_row_id === row.id)) ||
        batch.correctionRequests?.some((request) => request.status === "REQUESTED" ||
          request.status === "UNDER_REVIEW")) {
      return { ok: false, message: "Academic Coordinator must reject every disputed source row before the Registrar can replace this batch." };
    }
    const { data, error } = batch.block_id === CURRENT_BLOCK_ID
      ? await client.rpc("registrar_project_grade_cancel_batch_v1", {
        p_batch_id: batchId, p_reason: justification,
      })
      : await client.rpc("registrar_project_grade_cancel_batch_dynamic_v1", {
        p_batch_id: batchId, p_reason: justification,
      });
    if (error || data?.status !== "CANCELLED" ||
        data?.official_records_unchanged !== true || !normalize(data?.audit_reference)) {
      return { ok: false, message: "The project source replacement could not be verified. The previous batch remains protected." };
    }
    revalidatePath("/registrar/students");
    return { ok: true, data, message: "Conflicting project source preserved as cancelled. Upload a corrected workbook for this subject." };
  } catch {
    return { ok: false, message: "The project-only source replacement is currently unavailable." };
  }
}

export async function attestProjectGradeBatch({ batchId, sourceReference, checksum, method }) {
  try {
    const { client, admin, actor, data: workspace } = await projectWorkspace();
    if (!batchId || !normalize(sourceReference) || !/^[a-f0-9]{64}$/i.test(checksum || "") || !normalize(method)) {
      return { ok: false, message: "Verified source reference, checksum, and method are required." };
    }
    const selected = workspace.batches.find((item) => item.id === batchId);
    if (!selected) return { ok: false, message: "The selected project grade batch is unavailable." };
    const legacyBatch = selected.block_id === CURRENT_BLOCK_ID;
    const { data, error } = await client.rpc(
      legacyBatch ? "registrar_project_grade_verify_v1" :
        "registrar_project_grade_verify_dynamic_v1", {
      p_batch_id: batchId, p_source_reference: sourceReference, p_checksum: checksum, p_method: method,
    });
    if (legacyBatch && (error?.code === "PGRST202" || error?.code === "42883")) {
      const batch = workspace.batches.find((item) => item.id === batchId &&
        workspace.blocks.some((block) => block.id === item.block_id && block.termId === item.term_id));
      const block = workspace.blocks.find((item) =>
        item.id === batch?.block_id && item.termId === batch?.term_id);
      const subject = block?.subjects.find((item) => item.code === batch?.subject_code);
      if (!batch || batch.status !== "READY_FOR_REVIEW" || batch.verified_at ||
          batch.source_reference !== sourceReference || batch.source_checksum !== checksum ||
          block?.mappingRequired || batch.rows.length !== subject?.expected?.length ||
          batch.rows.some((row) => row.validation_status !== "ALREADY_PRESENT")) {
        return { ok: false, message: "This project source cannot be independently verified until its historical row conflicts are resolved." };
      }
      const verified = await admin.from("project_grade_import_batches").update({
        verified_by: actor.id, verified_at: new Date().toISOString(), verification_method: method.trim(),
      }).eq("id", batch.id).eq("status", "READY_FOR_REVIEW").is("verified_at", null)
        .select("id").maybeSingle();
      if (verified.error || !verified.data) return { ok: false, message: "Project source verification was rejected." };
      return { ok: true, message: "Independent project source verification was recorded." };
    }
    if (error || data !== true) return failure(error, "Independent project source verification was rejected.");
    return { ok: true, message: "The protected project grade batch is verified." };
  } catch (error) {
    return failure(error, "Project grade verification is unavailable.");
  }
}

export async function publishProjectGradeBlock(blockId, termId, batchIds) {
  try {
    const { client, data: workspace } = await projectWorkspace();
    if (workspace.publicationAvailable !== true) {
      return { ok: false, message: "Project grade publication requires the protected transactional database function. This source is preserved for review." };
    }
    const block = workspace.blocks.find((item) => item.id === blockId && item.termId === termId);
    if (!block || block.release || !Array.isArray(batchIds) || !batchIds.length) {
      return { ok: false, message: "Choose a verified project block with complete subject batches." };
    }
    const subjects = block.subjects || [];
    const chosen = workspace.batches.filter((batch) => batchIds.includes(batch.id) && batch.block_id === blockId && batch.term_id === termId);
    const uniqueSubjects = new Set(chosen.map((batch) => key(batch.subject_code)));
    if (chosen.length !== batchIds.length || chosen.some((batch) =>
      batch.status !== "READY_FOR_REVIEW" || !batch.verified_at || batch.conflict_rows > 0 ||
      batch.row_count !== subjects.find((subject) => subject.code === batch.subject_code)?.expected?.length ||
      batch.rows?.length !== batch.row_count ||
      batch.rows.some((row) => row.validation_status !== "ALREADY_PRESENT" || !row.canonical_result_id)) ||
        uniqueSubjects.size !== subjects.length || chosen.length !== subjects.length ||
        subjects.some((subject) => !uniqueSubjects.has(key(subject.code)))) {
      return { ok: false, message: "Every required project subject must have exactly one verified source batch before block publication." };
    }
    const expectedCount = subjects.reduce((sum, subject) => sum + subject.expected.length, 0);
    const { data, error } = await client.rpc(
      block.id === CURRENT_BLOCK_ID ? "registrar_project_grade_publish_block_v1" :
        "registrar_project_grade_publish_dynamic_v1", {
      p_block_id: blockId, p_term_id: termId, p_batch_ids: batchIds,
    });
    if (error) return failure(error, "The protected project block publication was rejected. Check conflicting results and source evidence.");
    if (data?.record_source !== "PROJECT_ONLY" || data?.expected_result_count !== expectedCount ||
        data?.accepted_rows !== expectedCount || !normalize(data?.publication_reference)) {
      return { ok: false, message: "The database publication response could not be verified. Refresh protected project grade history before proceeding." };
    }
    revalidatePath("/registrar/students");
    revalidatePath("/student/academic-records");
    revalidatePath("/student/enrollment");
    revalidatePath("/student/dashboard");
    revalidatePath("/student/class-schedule");
    return { ok: true, data, message: "The verified PROJECT_ONLY block grade release was published." };
  } catch (error) {
    return failure(error, "Project block publication is unavailable.");
  }
}

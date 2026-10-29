"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Registrar controls PROJECT_ONLY historical source attribution, not official
// faculty assignment or Academic Coordinator-owned academic master data.
const COHORT = "PLP_PROJECT_600_2026_1";
const MAX_ROWS = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const trim = (value) => typeof value === "string" ? value.trim() : "";
const validBlockCode = (value) => /^[A-Z0-9]+-[1-4][A-Z0-9]{1,8}$/.test(value);
const validReference = (value) => value.length >= 8 && value.length <= 240 &&
  !/[\u0000-\u001f\u007f]/.test(value) &&
  !/^(UNVERIFIED_SOURCE|NOT_VERIFIED_IN_SOURCE|NOT_RECORDED)$/i.test(value);
const hasProjectSource = (data) => data?.origin === "GENERATED_PROJECT" &&
  data.cohort_key === COHORT && data.verified_institutionally === false &&
  data.official_academic_record === false;

function records(result, description) {
  if (result?.error || !Array.isArray(result?.data) || result.data.length >= MAX_ROWS) {
    throw new Error(`Protected historical ${description} could not be verified`);
  }
  return result.data;
}

function single(result, description) {
  if (result?.error || !result?.data) {
    throw new Error(`Protected historical ${description} could not be verified`);
  }
  return result.data;
}

function termPosition(term) {
  const year = /^(\d{4})\b/.exec(trim(term?.academic_year));
  const semester = term?.semester === "First Semester" ? 1 :
    term?.semester === "Second Semester" ? 2 : null;
  return year && semester ? Number(year[1]) * 2 + semester : null;
}

function previousTerm(terms, currentTermId) {
  const current = terms.find((term) => term.id === currentTermId);
  const position = termPosition(current);
  if (!current || !position || terms.filter((term) => termPosition(term) === position).length !== 1) {
    throw new Error("Current academic term is missing or ambiguous");
  }
  const matches = terms.filter((term) => termPosition(term) === position - 1);
  if (matches.length !== 1) throw new Error("Previous academic term is missing or ambiguous");
  return { current, previous: matches[0] };
}

// All queries are server-side SELECTs. Scope is a single selected current-term
// block, never a guessed preceding section or a global fixed BSIT-2A identity.
async function readContext(admin, blockId) {
  const [blockResult, termsResult, windowsResult] = await Promise.all([
    admin.from("block_sections")
      .select("id,code,term_id,program_code,curriculum_code,year_level,planning_status,is_synthetic_demo")
      .eq("id", blockId).maybeSingle(),
    admin.from("academic_terms").select("id,label,academic_year,semester").limit(MAX_ROWS),
    admin.from("project_phase8_demo_enrollment_window")
      .select("project_cohort_id,term_id,source_type,verified_institutionally")
      .eq("project_cohort_id", COHORT).limit(MAX_ROWS),
  ]);
  const windows = records(windowsResult, "project enrollment window");
  if (windows.length !== 1 || windows[0].project_cohort_id !== COHORT ||
      windows[0].source_type !== "PROJECT_ONLY_FICTIONAL" ||
      windows[0].verified_institutionally !== false || !windows[0].term_id) {
    throw new Error("The project enrollment term has no uniquely verified configuration");
  }
  const block = single(blockResult, "block");
  const { current, previous } = previousTerm(records(termsResult, "academic terms"), windows[0].term_id);
  const placementsResult = await admin.from("project_student_academic_placements")
    .select("student_id,term_id,program_code,curriculum_code,year_level,project_cohort_id,source_metadata")
    .eq("project_cohort_id", COHORT).eq("home_block_id", blockId)
    .eq("term_id", current.id).limit(MAX_ROWS);
  const placements = records(placementsResult, "cohort placements");
  if (block.term_id !== current.id || !block.code || !block.curriculum_code ||
      !block.program_code || block.is_synthetic_demo !== true ||
      !Number.isInteger(Number(block.year_level)) ||
      Number(block.year_level) < 2 || Number(block.year_level) > 4 ||
      !placements.length || placements.some((row) =>
        row.term_id !== current.id || row.project_cohort_id !== COHORT ||
        row.program_code !== block.program_code ||
        row.curriculum_code !== block.curriculum_code ||
        Number(row.year_level) !== Number(block.year_level) ||
        !hasProjectSource(row.source_metadata))) {
    throw new Error("The selected block has no verified current Phase 8 project roster");
  }
  const studentIds = placements.map((row) => row.student_id);
  if (new Set(studentIds).size !== studentIds.length || studentIds.some((id) => !UUID.test(id))) {
    throw new Error("Project roster contains duplicate or invalid students");
  }
  const [profileResult, curriculumResult] = await Promise.all([
    admin.from("student_profiles")
      .select("id,user_id,student_type,record_kind,project_cohort_id,is_synthetic_demo")
      .in("id", studentIds).limit(MAX_ROWS),
    admin.from("phase8_fictional_curriculum_provenance")
      .select("curriculum_code,source_type,is_official")
      .eq("curriculum_code", block.curriculum_code).maybeSingle(),
  ]);
  const profiles = records(profileResult, "student profiles");
  const provenance = single(curriculumResult, "fictional curriculum");
  if (profiles.length !== placements.length || provenance.is_official !== false ||
      provenance.source_type !== "PROJECT_ONLY_FICTIONAL" ||
      profiles.some((student) => student.record_kind !== "PROJECT_ONLY" ||
        student.project_cohort_id !== COHORT || student.is_synthetic_demo !== true)) {
    throw new Error("Project roster or fictional curriculum provenance is invalid");
  }
  const continuing = profiles.filter((student) => student.student_type === "CONTINUING_STUDENT");
  if (!continuing.length || continuing.some((student) => !student.user_id)) {
    throw new Error("No verified continuing Phase 8 students belong to this block");
  }
  const accounts = records(await admin.from("app_users")
    .select("id,role_code,project_cohort_id,is_synthetic_demo")
    .in("id", continuing.map((student) => student.user_id)).limit(MAX_ROWS),
  "continuing student accounts");
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  if (accounts.length !== continuing.length || continuing.some((student) => {
    const account = accountById.get(student.user_id);
    return account?.role_code !== "student" ||
      account.project_cohort_id !== COHORT || account.is_synthetic_demo !== true;
  })) {
    throw new Error("Continuing student account identity is not verified");
  }

  // The previous curriculum year depends on the semester transition, not on
  // stripping a suffix from the current block code.
  const previousYear = Number(block.year_level) -
    (current.semester === "First Semester" ? 1 : 0);
  if (previousYear < 1 || previousYear > 4) {
    throw new Error("The block has no eligible previous-semester curriculum");
  }
  const [subjectResult, mappingResult, publishedResult, activeBatchesResult] = await Promise.all([
    admin.from("curriculum_subjects")
      .select("subject_code,year_level_number,semester")
      .eq("curriculum_code", block.curriculum_code)
      .eq("year_level_number", previousYear)
      .eq("semester", previous.semester).limit(MAX_ROWS),
    admin.from("project_historical_subject_instructors")
      .select("id,subject_code,instructor_id,previous_block_code,source_reference,assignment_provenance,verified_institutionally")
      .eq("project_cohort_id", COHORT).eq("target_block_id", blockId)
      .eq("prior_term_id", previous.id)
      .eq("curriculum_code", block.curriculum_code).limit(MAX_ROWS),
    admin.from("project_grade_import_batches").select("id")
      .eq("project_cohort_id", COHORT).eq("block_id", blockId)
      .eq("term_id", previous.id).eq("status", "PUBLISHED_PROJECT").limit(1),
    admin.from("project_grade_import_batches").select("subject_code,status")
      .eq("project_cohort_id", COHORT).eq("block_id", blockId)
      .eq("term_id", previous.id).limit(MAX_ROWS),
  ]);
  const subjects = records(subjectResult, "previous curriculum subjects");
  const mappings = records(mappingResult, "source mappings");
  const published = records(publishedResult, "publication status").length > 0;
  const activeBatches = records(activeBatchesResult, "active import batches");
  const subjectsWithActiveImport = new Set(activeBatches.filter((row) =>
    !["CANCELLED", "FAILED"].includes(row.status)).map((row) => row.subject_code));
  const subjectCodes = subjects.map((row) => row.subject_code);
  if (!subjects.length || new Set(subjectCodes).size !== subjectCodes.length ||
      mappings.some((row) => !subjectCodes.includes(row.subject_code) ||
        row.verified_institutionally !== false ||
        !["UNVERIFIED_SOURCE", "PROJECT_FICTIONAL_ASSIGNMENT"].includes(row.assignment_provenance))) {
    throw new Error("Historical curriculum or mapped subject provenance is invalid");
  }
  const mappingBySubject = new Map();
  const existingGroups = new Set();
  for (const row of mappings) {
    if (mappingBySubject.has(row.subject_code)) throw new Error("Duplicate historical source mapping");
    mappingBySubject.set(row.subject_code, row);
    if (row.previous_block_code) existingGroups.add(row.previous_block_code);
  }
  if (existingGroups.size > 1) throw new Error("Historical source blocks conflict");
  const names = records(await admin.from("subjects")
    .select("code,name").in("code", subjectCodes).limit(MAX_ROWS),
  "historical subject names");
  const subjectNames = new Map(names.map((row) => [row.code, row.name]));
  if (subjectNames.size !== subjectCodes.length || subjectCodes.some((code) => !subjectNames.get(code))) {
    throw new Error("Historical subject names are incomplete");
  }
  return {
    block, currentTermId: current.id, previous, published,
    subjectsWithActiveImport,
    previousBlockEvidence: existingGroups.size ? [...existingGroups][0] : null,
    subjects: subjectCodes.map((code) => ({
      code, name: subjectNames.get(code), mapping: mappingBySubject.get(code) || null,
    })),
    continuingStudentCount: continuing.length,
  };
}

async function readFictionalProfessors(admin) {
  const instructors = records(await admin.from("instructors")
    .select("id,display_name,app_user_id,is_synthetic_demo,synthetic_source_key")
    .eq("is_synthetic_demo", true).is("app_user_id", null)
    .order("display_name").limit(MAX_ROWS), "fictional instructor options");
  return instructors.filter((person) => UUID.test(person.id) &&
    person.is_synthetic_demo === true && person.app_user_id == null &&
    (person.synthetic_source_key?.startsWith("PROJECT_ONLY_") ||
      person.synthetic_source_key?.startsWith("PHASE8_FICTIONAL_SCHEDULE_V1:FACULTY:")) &&
    trim(person.display_name)).map((person) => ({
    id: person.id, displayName: person.display_name,
    syntheticSourceKey: person.synthetic_source_key,
  }));
}

/** List only existing fictional Phase 8 professors for the Registrar picker. */
export async function loadProjectHistoricalInstructorOptions() {
  await requireRole("registrar");
  try {
    const professors = await readFictionalProfessors(createAdminClient());
    return { ok: true, data: professors.map((person) => ({
      id: person.id, name: person.displayName,
    })) };
  } catch {
    return { ok: false, message: "Fictional professor options could not be loaded." };
  }
}

/** Read-only options for an authenticated Registrar; never synthesizes names. */
export async function loadProjectHistoricalMappingOptions(blockId) {
  await requireRole("registrar");
  if (!UUID.test(trim(blockId))) {
    return { ok: false, message: "Select a valid current academic block." };
  }
  try {
    const admin = createAdminClient();
    const [context, professorOptions] = await Promise.all([
      readContext(admin, trim(blockId)), readFictionalProfessors(admin),
    ]);
    return { ok: true, data: {
      blockId: context.block.id, currentBlockCode: context.block.code,
      currentTermId: context.currentTermId,
      targetTermId: context.currentTermId, previousTermId: context.previous.id,
      previousTermLabel: context.previous.label,
      curriculumCode: context.block.curriculum_code,
      previousBlockEvidence: context.previousBlockEvidence,
      continuingStudentCount: context.continuingStudentCount,
      published: context.published,
      subjects: context.subjects.map(({ code, name, mapping }) => ({
        code, name, assigned: Boolean(mapping?.instructor_id),
        activeImport: context.subjectsWithActiveImport.has(code),
        sourceReference: mapping?.source_reference || null,
        previousBlockCode: mapping?.previous_block_code || null,
      })),
      professorOptions,
    } };
  } catch {
    return { ok: false, message: "This block's historical source mapping options could not be verified. Confirm its Phase 8 placement and curriculum records." };
  }
}

/**
 * Required transactional database contract (not installed here):
 * public.registrar_project_historical_instructor_register_v1(
 *   p_project_cohort_id text, p_block_id uuid, p_target_term_id text,
 *   p_previous_term_id text, p_curriculum_code text, p_subject_code text,
 *   p_instructor_id uuid, p_previous_block_code text,
 *   p_source_reference text, p_attested boolean) RETURNS jsonb.
 *
 * The RPC must authenticate the Registrar again, lock/recheck all constraints,
 * require an explicit attested source grouping, reject duplicate or published
 * mappings, preserve original source evidence and official academic records,
 * and atomically record an audit_events row (actor_user_id, actor_label,
 * module, action, entity_type, entity_key, previous_value, new_value, result,
 * reason). Function EXECUTE must not be granted to PUBLIC/anon. Never perform
 * separate service-role mapping UPDATE and audit INSERT in this action.
 */
export async function registerProjectHistoricalInstructorMapping(input) {
  await requireRole("registrar");
  const blockId = trim(input?.blockId);
  const subjectCode = trim(input?.subjectCode);
  const instructorId = trim(input?.instructorId);
  const previousBlockCode = trim(input?.previousBlockCode);
  const sourceReference = trim(input?.sourceReference);
  if (!UUID.test(blockId) || !UUID.test(instructorId) ||
      !/^[A-Z0-9-]{3,64}$/.test(subjectCode) ||
      !validBlockCode(previousBlockCode) || !validReference(sourceReference) ||
      input?.attested !== true) {
    return { ok: false, message: "Select a valid block, subject and existing fictional professor. Enter the evidenced previous block and source reference, then explicitly attest both." };
  }
  try {
    const admin = createAdminClient();
    const [context, professors] = await Promise.all([
      readContext(admin, blockId), readFictionalProfessors(admin),
    ]);
    if (context.published) {
      return { ok: false, message: "This block's historical grades are already published. Its source mappings are locked." };
    }
    const selected = context.subjects.find((item) => item.code === subjectCode);
    if (!selected) {
      return { ok: false, message: "The subject is not in this block's previous-semester project curriculum." };
    }
    if (context.subjectsWithActiveImport.has(subjectCode)) {
      return { ok: false, message: "This subject already has an active grade import. Cancel or resolve the import before changing its source mapping." };
    }
    if (!professors.some((person) => person.id === instructorId)) {
      return { ok: false, message: "Select an existing, verified PROJECT_ONLY fictional professor." };
    }
    if (context.previousBlockEvidence && context.previousBlockEvidence !== previousBlockCode) {
      return { ok: false, message: "The supplied previous block conflicts with existing historical source evidence." };
    }
    if (selected.mapping?.instructor_id) {
      return { ok: false, message: "A historical professor is already assigned to this subject. Duplicate assignments are not allowed." };
    }
    if (selected.mapping && (selected.mapping.previous_block_code &&
        selected.mapping.previous_block_code !== previousBlockCode ||
        selected.mapping.source_reference &&
        selected.mapping.source_reference !== sourceReference ||
        selected.mapping.assignment_provenance !== "UNVERIFIED_SOURCE")) {
      return { ok: false, message: "The existing historical source reference must be preserved, not replaced." };
    }
    // Read checks are advisory. Only the RPC can lock and authorize the
    // concurrent source mapping and audit as one atomic operation.
    const client = await createClient();
    const { data, error } = await client.rpc("registrar_project_historical_instructor_register_v1", {
      p_project_cohort_id: COHORT,
      p_block_id: blockId,
      p_target_term_id: context.currentTermId,
      p_previous_term_id: context.previous.id,
      p_curriculum_code: context.block.curriculum_code,
      p_subject_code: subjectCode,
      p_instructor_id: instructorId,
      p_previous_block_code: previousBlockCode,
      p_source_reference: sourceReference,
      p_attested: true,
    });
    if (["PGRST202", "42883"].includes(error?.code)) {
      return { ok: false, message: "Historical source registration is not enabled yet. The protected transactional database function is required." };
    }
    if (error || data?.registered !== true || !UUID.test(trim(data.mapping_id)) ||
        !trim(data.audit_reference) || data.official_records_unchanged !== true ||
        data.assignment_provenance !== "PROJECT_FICTIONAL_ASSIGNMENT" ||
        data.verified_institutionally !== false ||
        data.subject_code !== subjectCode || data.instructor_id !== instructorId ||
        data.source_reference !== sourceReference) {
      return { ok: false, message: "Registration was not confirmed. Refresh this block's historical mappings before trying again." };
    }
    revalidatePath("/registrar/students");
    return { ok: true, data: {
      mappingId: data.mapping_id, auditReference: data.audit_reference,
    }, message: "The fictional historical professor was registered with source attestation and an audit record." };
  } catch {
    return { ok: false, message: "The selected project block's historical mapping could not be safely registered." };
  }
}

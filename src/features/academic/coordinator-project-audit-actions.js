"use server";

import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  filterProjectAcademicReviewRows, paginateProjectAcademicHistory,
} from "./coordinator-project-reads.mjs";

const TERM = "TERM-2026-1";
const COHORT = "PLP_PROJECT_600_2026_1";
const PAGE_SIZE = 1000;
const MAX_AUDIT_ROWS = 50000;
const MAX_REFERENCE_ROWS = 12000;
const REVIEW_COLUMNS = [
  "id", "enrollment_id", "review_status", "exception_type", "academic_reason",
  "subject_code", "failed_rule_code", "requested_reason", "decision_reason",
  "supporting_reference", "created_at", "decided_at", "applied_at",
  "coordinator_user_id",
  "enrollments!inner(id,reference,student_id,program_code,term_id,curriculum_code,status,submitted_at,current_correction_reason)",
].join(",");
const HISTORY_COLUMNS = [
  "id", "occurred_at", "actor_user_id", "actor_role_code", "module",
  "record_reference", "action", "previous_value", "new_value", "reason",
].join(",");

async function readPaged(makeQuery, limit = MAX_REFERENCE_ROWS) {
  const result = [];
  for (let offset = 0; offset < limit; offset += PAGE_SIZE) {
    const page = await makeQuery().range(offset, offset + PAGE_SIZE - 1);
    if (page.error || !Array.isArray(page.data)) {
      throw new Error("Authorized project academic records are unavailable.");
    }
    result.push(...page.data);
    if (page.data.length < PAGE_SIZE) return result;
  }
  throw new Error("Authorized project academic records exceeded the supported limit.");
}

async function readBoundedHistory(admin) {
  const createQuery = () => admin.from("academic_change_history")
    .select(HISTORY_COLUMNS)
    .in("module", ["Academic Setup", "Sections & Schedules", "Academic Review"])
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false });
  const totalResult = await admin.from("academic_change_history")
    .select("id", { count: "exact", head: true })
    .in("module", ["Academic Setup", "Sections & Schedules", "Academic Review"]);
  if (totalResult.error || !Number.isSafeInteger(totalResult.count) ||
      totalResult.count > MAX_AUDIT_ROWS) {
    throw new Error("Authorized project academic history is unavailable.");
  }
  const offsets = Array.from({ length: Math.ceil(totalResult.count / PAGE_SIZE) },
    (_, index) => index * PAGE_SIZE);
  const history = [];
  // Fetch independent, stable pages concurrently in small batches to avoid
  // serial remote round trips on every history search, without an unbounded
  // connection spike or truncating >1,000-row PostgREST datasets.
  for (let index = 0; index < offsets.length; index += 5) {
    const pages = await Promise.all(offsets.slice(index, index + 5).map((offset) =>
      createQuery().range(offset, offset + PAGE_SIZE - 1)));
    if (pages.some((page) => page.error || !Array.isArray(page.data))) {
      throw new Error("Authorized project academic history is unavailable.");
    }
    for (const page of pages) history.push(...page.data);
  }
  if (history.length !== totalResult.count) {
    // Concurrent audit inserts can move offset windows. Never present partial
    // history or inaccurate totals as though the scope were complete.
    throw new Error("Academic history changed during the read. Refresh to retry.");
  }
  return history;
}

// Server-only membership: never infer a fictional student from the term,
// program, curriculum name or a browser-supplied list.
async function loadProjectMembership(admin) {
  const [placements, profiles] = await Promise.all([
    readPaged(() => admin.from("project_student_academic_placements")
      .select("student_id,curriculum_code,home_block_id")
      .eq("term_id", TERM).eq("project_cohort_id", COHORT)
      .order("student_id", { ascending: true })),
    readPaged(() => admin.from("student_profiles").select("id")
      .eq("record_kind", "PROJECT_ONLY").eq("project_cohort_id", COHORT)
      .order("id", { ascending: true })),
  ]);
  const profileIds = new Set(profiles.map((item) => item.id));
  if (!placements.length || !profiles.length ||
      placements.some((item) => !profileIds.has(item.student_id) || !item.curriculum_code)) {
    throw new Error("Project academic provenance could not be verified.");
  }
  return {
    studentIds: new Set(placements.map((item) => item.student_id)),
    curriculumCodes: [...new Set(placements.map((item) => item.curriculum_code))],
    homeBlockIds: [...new Set(placements.map((item) => item.home_block_id).filter(Boolean))],
  };
}

export async function loadCoordinatorProjectAcademicReviewRows() {
  await requireRole("academic-coordinator");
  const admin = createAdminClient();
  const membership = await loadProjectMembership(admin);
  // An institutionally recorded review must belong to a real enrollment
  // owned by a verified PROJECT_ONLY student, not merely share their term.
  const enrollments = await readPaged(() => admin.from("enrollments")
    .select("id,student_id,curriculum_code").eq("term_id", TERM)
    .in("curriculum_code", membership.curriculumCodes)
    .order("id", { ascending: true }));
  const enrollmentIds = enrollments.filter((row) =>
    membership.studentIds.has(row.student_id)).map((row) => row.id);
  if (!enrollmentIds.length) return [];
  const reviews = await readPaged(() => admin.from("academic_reviews")
    .select(REVIEW_COLUMNS).in("enrollment_id", enrollmentIds)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false }));
  return filterProjectAcademicReviewRows(reviews, membership.studentIds);
}

async function loadProjectHistoryReferences(admin, membership) {
  const refs = new Set([...membership.curriculumCodes, ...membership.homeBlockIds]);
  const curriculumSubjects = await readPaged(() => admin.from("curriculum_subjects")
    .select("curriculum_code,subject_code").in("curriculum_code", membership.curriculumCodes)
    .order("curriculum_code").order("subject_code"));
  for (const subject of curriculumSubjects) refs.add(subject.subject_code);
  if (!membership.homeBlockIds.length) return refs;
  const [joins, allGeneratorSections, allSyntheticMeetings, assignments] = await Promise.all([
    readPaged(() => admin.from("block_subject_sections")
      .select("block_id,section_id").in("block_id", membership.homeBlockIds)
      .order("block_id").order("section_id")),
    readPaged(() => admin.from("sections").select("id,source_system,is_synthetic_demo")
      .eq("source_system", "PHASE8_FICTIONAL_GENERATOR")
      .eq("is_synthetic_demo", true).order("id")),
    readPaged(() => admin.from("section_meetings").select("id,section_id")
      .eq("is_synthetic_demo", true).order("id")),
    readPaged(() => admin.from("block_student_assignments")
      .select("id,block_id,student_id")
      .in("block_id", membership.homeBlockIds)
      .order("id")),
  ]);
  const linkedSectionIds = new Set(joins.map((row) => row.section_id));
  const projectSections = new Set(allGeneratorSections.filter((row) =>
    linkedSectionIds.has(row.id)).map((row) => row.id));
  for (const sectionId of projectSections) refs.add(sectionId);
  for (const meeting of allSyntheticMeetings) {
    if (projectSections.has(meeting.section_id)) refs.add(meeting.id);
  }
  for (const assignment of assignments) {
    if (membership.studentIds.has(assignment.student_id)) refs.add(assignment.id);
  }
  return refs;
}

export async function loadCoordinatorProjectAcademicHistoryPage(options = {}) {
  await requireRole("academic-coordinator");
  const page = options?.page ?? 1;
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) {
    throw new Error("Invalid academic history page.");
  }
  const admin = createAdminClient();
  const membership = await loadProjectMembership(admin);
  const references = await loadProjectHistoryReferences(admin, membership);
  // The existing change-history ledger stores untyped text references, not
  // foreign keys or a source marker. To avoid false 0-row histories, retain
  // the 600 cohort's UUID-keyed meetings, sections and roster events as well
  // as P8F26 subject/curriculum events. All rows stay on the server.
  const history = await readBoundedHistory(admin);
  return paginateProjectAcademicHistory(history, references, options);
}

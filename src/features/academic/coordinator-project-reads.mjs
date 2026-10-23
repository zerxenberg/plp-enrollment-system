import {
  ACADEMIC_HISTORY_MODULES, ACADEMIC_HISTORY_PAGE_SIZE,
  toAcademicHistoryRow,
} from "./academic-history-pagination.mjs";

// A record belongs to this classroom project only when its reference has
// first been resolved through the verified project cohort and its related
// curriculum/block/subject/meeting records. Term and module alone are unsafe.
export function filterProjectAcademicReviewRows(reviews, studentIds) {
  const authorized = new Set(studentIds);
  return reviews.filter((review) => authorized.has(review.enrollments?.student_id));
}

export function paginateProjectAcademicHistory(history, references, { page = 1, search = "" } = {}) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) {
    throw new Error("Invalid academic history page.");
  }
  const authorized = new Set(references);
  const needle = String(search ?? "").trim().slice(0, 80).toLowerCase();
  const modules = new Set(ACADEMIC_HISTORY_MODULES);
  const matches = history.filter((row) => {
    if (!modules.has(row.module) || !authorized.has(row.record_reference)) return false;
    if (!needle) return true;
    return [row.actor_role_code, row.module, row.record_reference, row.action,
      row.previous_value, row.new_value]
      .some((value) => String(value || "").toLowerCase().includes(needle));
  });
  matches.sort((a, b) => String(b.occurred_at || "").localeCompare(String(a.occurred_at || "")) ||
    String(b.id || "").localeCompare(String(a.id || "")));
  const byModule = Object.fromEntries(ACADEMIC_HISTORY_MODULES.map(
    (module) => [module, matches.filter((row) => row.module === module).length],
  ));
  const start = (page - 1) * ACADEMIC_HISTORY_PAGE_SIZE;
  return {
    rows: matches.slice(start, start + ACADEMIC_HISTORY_PAGE_SIZE).map(toAcademicHistoryRow),
    total: matches.length,
    byModule,
  };
}

// Dashboard's short activity preview is a different data path from Reports'
// server-paginated history. Keep it source-correct without changing either UI.
export function scopeCoordinatorProjectPreview(snapshot) {
  const curricula = snapshot?.academicCoordinatorData?.curricula || [];
  const projectCurricula = new Set(curricula.filter((row) => row.isProjectOnly === true)
    .map((row) => row.id));
  // Fail closed when the project provenance ledger was not delivered. Never
  // turn an absent marker into "official" or inherit the old demo preview.
  const references = new Set(projectCurricula);
  for (const subject of snapshot?.catalog?.subjects || []) {
    if (subject.isProjectOnly === true) references.add(subject.code);
  }
  const plan = snapshot?.blockPlanning || {};
  const blocks = (plan.blockSections || []).filter((block) =>
    block.termId === "TERM-2026-1" && projectCurricula.has(block.curriculumId));
  const blockIds = new Set(blocks.map((block) => block.id));
  for (const id of blockIds) references.add(id);
  const studentIds = new Set((plan.students || []).filter((student) =>
    projectCurricula.has(student.curriculumId)).map((student) => student.id));
  const classes = (plan.subjectClasses || []).filter((item) => blockIds.has(item.sectionId));
  const classIds = new Set(classes.map((item) => item.id));
  for (const item of classes) {
    // The normalized adapter encodes the underlying subject-section UUID as
    // block_uuid:section_uuid (not the same thing as the block section UUID).
    const sectionId = String(item.id || "").split(":")[1];
    if (sectionId) references.add(sectionId);
  }
  for (const meeting of plan.classMeetings || []) {
    if (!classIds.has(meeting.subjectClassId)) continue;
    const meetingId = String(meeting.id || "").split(":")[0];
    if (meetingId) references.add(meetingId);
  }
  for (const assignment of plan.assignments || []) {
    if (blockIds.has(assignment.sectionId) && studentIds.has(assignment.studentId)) {
      references.add(assignment.id);
    }
  }
  const recentHistory = (snapshot?.academicCoordinatorData?.history || []).filter((row) =>
    references.has(row.record));
  // Existing Coordinator notices have no project/cohort provenance. Do not
  // display old institutional-style review/capacity alerts as project notices;
  // future project notices must carry explicit verified provenance.
  const notices = (snapshot?.notifications?.["academic-coordinator"] || []).filter((row) =>
    row.isProjectOnly === true && row.dataOrigin === "GENERATED_PROJECT");
  return {
    ...snapshot,
    academicCoordinatorData: {
      ...snapshot.academicCoordinatorData,
      history: recentHistory,
    },
    notifications: {
      ...snapshot.notifications,
      "academic-coordinator": notices,
    },
  };
}

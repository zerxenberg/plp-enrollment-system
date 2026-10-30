/** Shared data-only checks for real Admissions academic placement. */
export function chooseAdmissionsTerm(terms, isoDate) {
  const open = (terms || []).filter((term) =>
    String(term.status).toLowerCase() === "open" &&
    term.enrollment_start && term.enrollment_end &&
    term.enrollment_start <= isoDate && isoDate <= term.enrollment_end);
  return open.length === 1 ? open[0] : null;
}

export function chooseInstitutionalBlock({ blocks, programCode, termId, yearLevel, curriculumCode }) {
  if (!yearLevel || !curriculumCode || !termId) return null;
  const matches = (blocks || []).filter((block) =>
    block.program_code === programCode && block.term_id === termId &&
    block.year_level === yearLevel && block.curriculum_code === curriculumCode &&
    block.is_synthetic_demo === false && block.planning_status === "PUBLISHED" &&
    Number.isInteger(block.capacity) && block.capacity > 0);
  // Block availability is only a proposal. Final capacity is checked under
  // a database lock when an authenticated student submits registration.
  return matches.length === 1 ? matches[0] : null;
}

export function admissionsAcademicBlockers({ student, term, curriculum, block, subjects, sections, enrollments }) {
  const reasons = [];
  if (!term) reasons.push("Academic Coordinator or Registrar must open exactly one valid enrollment term.");
  if (!student?.program_code) reasons.push("The approved Admissions program is missing.");
  if (student?.student_type === "TRANSFEREE" && !student.year_level_number) {
    reasons.push("The Academic Coordinator must evaluate and assign the Transferee's year level. Transfer credits are not assumed.");
  }
  if (student?.student_type === "NEW_STUDENT" && student.year_level_number !== 1) {
    reasons.push("Freshman year level must be verified as First Year.");
  }
  if (!curriculum) reasons.push("No uniquely applicable active curriculum matches the approved program and term.");
  if (!subjects?.length) reasons.push("The configured curriculum has no subjects for the student's year and semester.");
  if (!block) reasons.push("No published institutional block has been approved for the program, curriculum, year and term.");
  if (block && subjects?.length) {
    const missing = subjects.filter((s) =>
      !sections?.some((sec) => sec.subject_code === s.subject_code &&
        sec.status === "OPEN" && sec.schedule_status === "FINALIZED" &&
        sec.is_synthetic_demo === false && sec.meetings?.length > 0 &&
        sec.hasPrimaryInstructor && sec.hasVerifiedRooms));
    if (missing.length) reasons.push(
      `Academic Coordinator must finalize the real subject sections, rooms and instructors: ${missing.map((s) => s.subject_code).join(", ")}.`);
  }
  if (enrollments?.some((entry) => entry.status === "CONFIRMED")) return [];
  return reasons;
}

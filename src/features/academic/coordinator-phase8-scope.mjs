// Pure, provenance-based projection for the Coordinator's Phase 8 simulation.
// A PROJECT_ONLY student is admitted only through a protected block-roster
// snapshot, never by matching a name, code prefix, or unrelated student row.
export function scopeCoordinatorPhase8Records(raw, provenance, rosterSnapshots) {
  const projectCodes = new Set(provenance.filter((row) =>
    row.isOfficial === false && row.sourceType === "PROJECT_ONLY_FICTIONAL")
    .map((row) => row.curriculumCode));
  if (!projectCodes.size) throw new Error("The authorized project curriculum provenance is missing.");
  const curricula = raw.curricula.filter((row) => projectCodes.has(row.code));
  if (curricula.length !== projectCodes.size) {
    throw new Error("The authorized project curriculum records are incomplete.");
  }
  const placements = raw.placements.filter((row) => projectCodes.has(row.curriculum_code));
  if (!placements.length) throw new Error("The authorized project curriculum placements are missing.");
  const subjectCodes = new Set(placements.map((row) => row.subject_code));
  const subjects = raw.subjects.filter((row) => subjectCodes.has(row.code));
  if (subjects.length !== subjectCodes.size) {
    throw new Error("The authorized project subjects are incomplete.");
  }
  const prerequisites = raw.prerequisites.filter((row) =>
    projectCodes.has(row.curriculum_code) && subjectCodes.has(row.subject_code)
      && subjectCodes.has(row.prerequisite_subject_code));
  const blocks = raw.blocks.filter((row) => projectCodes.has(row.curriculum_code));
  if (!blocks.length) throw new Error("The authorized project block sections are missing.");
  const blockIds = new Set(blocks.map((row) => row.id));
  const blockById = new Map(blocks.map((row) => [row.id, row]));
  const joins = raw.joins.filter((row) => blockIds.has(row.block_id));
  if (!joins.length) throw new Error("The authorized project block schedule links are missing.");
  const linkedSectionIds = new Set(joins.map((row) => row.section_id));
  const sections = raw.sections.filter((row) =>
    linkedSectionIds.has(row.id) && subjectCodes.has(row.subject_code));
  const sectionIds = new Set(sections.map((row) => row.id));
  if (sections.length !== linkedSectionIds.size) {
    throw new Error("The authorized project schedule links are incomplete.");
  }
  const safeJoins = joins.filter((row) => sectionIds.has(row.section_id));
  const meetings = raw.meetings.filter((row) => sectionIds.has(row.section_id));
  const sectionInstructors = raw.sectionInstructors.filter((row) => sectionIds.has(row.section_id));
  const instructorIds = new Set(sectionInstructors.map((row) => row.instructor_id));
  const roomIds = new Set(meetings.map((row) => row.room_id).filter(Boolean));
  const instructors = raw.instructors.filter((row) => instructorIds.has(row.id));
  const rooms = raw.rooms.filter((row) => roomIds.has(row.id));
  const terms = raw.terms.filter((row) => blocks.some((block) => block.term_id === row.id));
  if (blocks.some((block) => !terms.some((term) => term.id === block.term_id))) {
    throw new Error("The authorized project academic term is missing.");
  }

  const memberById = new Map();
  for (const snapshot of rosterSnapshots) {
    if (!blockIds.has(snapshot.blockId) || !Array.isArray(snapshot.students)) {
      throw new Error("An unauthorized project roster was returned.");
    }
    const block = blockById.get(snapshot.blockId);
    for (const person of snapshot.students) {
      if (!person.student_id || !person.student_number || !person.full_name) {
        throw new Error("An authorized project roster entry is incomplete.");
      }
      if (memberById.has(person.student_id)) {
        throw new Error("A project student has overlapping block placements.");
      }
      memberById.set(person.student_id, {
        ...person, blockId: block.id, programCode: block.program_code,
        curriculumCode: block.curriculum_code,
        trackCode: block.program_track_code,
        yearLevel: person.year_level ?? block.year_level,
      });
    }
  }
  if (rosterSnapshots.length !== blocks.length) {
    throw new Error("The authorized project block rosters are incomplete.");
  }
  if (!memberById.size) {
    throw new Error("The authorized project student placements are missing.");
  }
  const assignments = raw.roster.filter((row) =>
    blockIds.has(row.block_id) && ["PROPOSED", "CONFIRMED"].includes(row.status));
  if (assignments.length !== memberById.size ||
      assignments.some((row) => memberById.get(row.student_id)?.blockId !== row.block_id)) {
    throw new Error("The project placement roster does not match proposed block assignments.");
  }
  const studentIds = new Set(memberById.keys());
  const students = raw.students.filter((row) => studentIds.has(row.id));
  if (students.length !== studentIds.size ||
      students.some((row) => row.student_number !== memberById.get(row.id).student_number)) {
    throw new Error("The authorized student identities do not match project placements.");
  }
  const enrollments = raw.enrollments.filter((row) =>
    studentIds.has(row.student_id) && projectCodes.has(row.curriculum_code));
  const enrollmentIds = new Set(enrollments.map((row) => row.id));
  const reviews = raw.reviews.filter((row) => enrollmentIds.has(row.enrollment_id));
  const enrollmentSubjects = raw.enrollmentSubjects.filter((row) =>
    enrollmentIds.has(row.enrollment_id) && subjectCodes.has(row.subject_code));
  const offerings = raw.offerings.filter((row) =>
    projectCodes.has(row.curriculum_code) && subjectCodes.has(row.subject_code));
  const historyKeys = new Set([
    ...projectCodes, ...subjectCodes, ...blocks.map((row) => row.code),
    ...studentIds, ...students.map((row) => row.student_number),
  ]);
  // Do not infer project provenance from arbitrary action/reason text.
  const history = raw.history.filter((row) => historyKeys.has(row.record_reference));
  const prices = raw.prices.filter((row) => subjectCodes.has(row.subject_code));
  const curriculumRates = raw.curriculumRates.filter((row) =>
    projectCodes.has(row.curriculum_code) && subjectCodes.has(row.subject_code));
  const estimates = raw.estimates.filter((row) => projectCodes.has(row.curriculum_code));
  return {
    curricula, placements, prerequisites, subjects, blocks, joins: safeJoins,
    sections, meetings, sectionInstructors, instructors, rooms, terms, assignments,
    students, memberById, enrollments, enrollmentSubjects, reviews, offerings,
    history, prices, curriculumRates, estimates,
  };
}

// The subject master has no department, program, semester, or prerequisite
// columns. Those relationships belong to each normalized curriculum version.
export function indexLiveAcademicSubjects(subjects = [], curricula = [], programs = []) {
  const placementsBySubject = new Map();
  const programByCode = new Map(programs.map((record) => [record.code, record]));
  for (const curriculum of curricula) {
    for (const assignment of curriculum.assignments || []) {
      const placements = placementsBySubject.get(assignment.subjectCode) || [];
      placements.push({
        curriculumId: curriculum.id,
        curriculumVersion: curriculum.version,
        isProjectOnly: Boolean(curriculum.isProjectOnly),
        program: curriculum.program,
        major: curriculum.major || "",
        department: curriculum.department || programByCode.get(curriculum.program)?.department || "",
        yearLevel: assignment.yearLevel,
        semester: assignment.semester,
        prerequisites: assignment.prerequisites || [],
      });
      placementsBySubject.set(assignment.subjectCode, placements);
    }
  }
  return subjects.map((subject) => {
    const placements = placementsBySubject.get(subject.code) || [];
    const applicablePrograms = [...new Set(placements.map((item) => item.program))];
    const departments = [...new Set(placements.map((item) => item.department).filter(Boolean))];
    const terms = [...new Set(placements.map((item) =>
      [item.yearLevel, item.semester].filter(Boolean).join(", ")).filter(Boolean))];
    const prerequisiteSets = [...new Set(placements.map((item) =>
      [...item.prerequisites].sort().join(", ")))];
    return {
      ...subject,
      programs: applicablePrograms,
      program: applicablePrograms[0] || "",
      department: departments.length === 1 ? departments[0] : "",
      departmentId: departments.length === 1 ? departments[0] : "",
      liveDepartments: departments,
      livePlacements: placements,
      livePlacementLabel: terms.length ? terms.join("; ") : "Not assigned to a curriculum",
      livePrerequisitesLabel: placements.length === 0 ? "Not assigned"
        : prerequisiteSets.length === 1 ? prerequisiteSets[0] || "None"
          : "Varies by curriculum",
    };
  });
}

const YEARS = ["1st Year", "2nd Year", "3rd Year", "4th Year"];
const SEMESTERS = ["First Semester", "Second Semester"];
const termIndex = (year, semester) => {
  const yearIndex = YEARS.indexOf(year);
  const semesterIndex = SEMESTERS.indexOf(semester);
  return yearIndex < 0 || semesterIndex < 0 ? -1 : yearIndex * SEMESTERS.length + semesterIndex;
};

// Mirrors the supported curriculum RPC contract and catches misleading edits
// before sending them. The database remains the final authority.
export function validateLiveCurriculumDraft(record, existing, catalog) {
  const errors = [];
  const program = (catalog.programs || []).find((item) => item.code === record.program);
  if (!program || program.status !== "Active" || program.department !== record.department) {
    errors.push("Select an active academic program in the chosen department.");
  }
  if (program?.majors?.length && !program.majors.includes(record.major)) {
    errors.push("Select a registered specialization for this academic program.");
  }
  if (!String(record.version || "").trim() || !/^\d{4} (?:to|-) \d{4}$/.test(record.effectiveAcademicYear || "")) {
    errors.push("Enter a version and valid effective academic year.");
  }
  if (existing && existing.status !== "Draft") {
    errors.push("Only Draft curriculum versions can be edited.");
  }
  const assignments = record.assignments || [];
  const originals = new Set((existing?.assignments || []).map((item) => item.subjectCode));
  const proposed = new Map(assignments.map((item) => [item.subjectCode, item]));
  const subjectMap = new Map((catalog.subjects || []).map((item) => [item.code, item]));
  for (const code of originals) {
    if (!proposed.has(code)) {
      errors.push("Existing draft subject placements cannot be removed through the approved transaction. Duplicate the version for a new plan.");
      break;
    }
  }
  const seen = new Set();
  for (const assignment of assignments) {
    const code = assignment.subjectCode;
    const subject = subjectMap.get(code);
    if (!subject || subject.status !== "Active") {
      errors.push("Assigned subject " + (code || "(missing)") + " is missing or inactive.");
      continue;
    }
    if (seen.has(code)) errors.push(code + " appears more than once.");
    seen.add(code);
    const index = termIndex(assignment.yearLevel, assignment.semester);
    if (index < 0) errors.push(code + " has an invalid curriculum semester.");
    const prerequisites = assignment.prerequisites || [];
    if (new Set(prerequisites).size !== prerequisites.length) {
      errors.push(code + " contains repeated prerequisites.");
    }
    for (const prerequisite of prerequisites) {
      const prior = proposed.get(prerequisite);
      if (!prior || index < 0 || termIndex(prior.yearLevel, prior.semester) >= index) {
        errors.push(code + " requires " + prerequisite + " in an earlier semester of the same curriculum.");
      }
    }
  }
  return [...new Set(errors)];
}

export function liveSubjectCandidates(subjects, assignments, search = "", programCode = "") {
  const assigned = new Set((assignments || []).map((row) => row.subjectCode));
  const query = search.trim().toLowerCase();
  return subjects.filter((subject) => subject.status === "Active" && !assigned.has(subject.code) &&
    (query || !(subject.programs || []).length || subject.programs.includes(programCode)) &&
    (subject.code + " " + subject.name).toLowerCase().includes(query));
}

export function liveTuitionEstimate(assignments = [], subjects = [], year = null, semester = null) {
  const byCode = new Map(subjects.map((subject) => [subject.code, subject]));
  let amount = 0;
  let missing = 0;
  let count = 0;
  for (const assignment of assignments) {
    if ((year && assignment.yearLevel !== year) || (semester && assignment.semester !== semester)) continue;
    count += 1;
    const subject = byCode.get(assignment.subjectCode);
    const rate = assignment.feePerUnit ?? subject?.feePerUnit;
    const units = assignment.unitsOverride ?? subject?.units;
    if (rate == null || units == null || !Number.isFinite(Number(rate)) || !Number.isFinite(Number(units))) {
      missing += 1;
      continue;
    }
    amount += Number(rate) * Number(units);
  }
  return { amount, missing, count };
}

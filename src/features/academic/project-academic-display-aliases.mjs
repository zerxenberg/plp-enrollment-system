// Presentation aliases for the protected Phase 8 academic simulation.
// Keep original curriculum and subject codes in every record, query, form value,
// permission check, foreign key, source key, and enrollment action.

const PROJECT_CURRICULA = Object.freeze({
  BEED: ["BEED-2026", "Elementary Education Curriculum 2026", "BEED"],
  BPA: ["BPA-2026", "Public Administration Curriculum 2026", "BPA"],
  BSA: ["BSA-2026", "Accountancy Curriculum 2026", "BSA"],
  BSBAENT: ["BSBA-ENT-2026", "Business Administration (Entrepreneurship) Curriculum 2026", "ENT"],
  BSBAHR: ["BSBA-HRM-2026", "Business Administration (Human Resource Management) Curriculum 2026", "HRM"],
  BSBAMM: ["BSBA-MM-2026", "Business Administration (Marketing Management) Curriculum 2026", "MKT"],
  BSCS: ["BSCS-2026", "Computer Science Curriculum 2026", "CS"],
  BSECE: ["BSECE-2026", "Electronics Engineering Curriculum 2026", "ECE"],
  BSEDENG: ["BSED-ENG-2026", "Secondary Education (English) Curriculum 2026", "EDENG"],
  BSEDFIL: ["BSED-FIL-2026", "Secondary Education (Filipino) Curriculum 2026", "EDFIL"],
  BSEDMATH: ["BSED-MATH-2026", "Secondary Education (Mathematics) Curriculum 2026", "EDMATH"],
  BSEDSCI: ["BSED-SCI-2026", "Secondary Education (Science) Curriculum 2026", "EDSCI"],
  BSHM: ["BSHM-2026", "Hospitality Management Curriculum 2026", "HM"],
  BSIT: ["BSIT-2026", "Information Technology Curriculum 2026", "IT"],
  BSN: ["BSN-2026", "Nursing Curriculum 2026", "NUR"],
  BSP: ["BSP-2026", "Psychology Curriculum 2026", "PSY"],
});

// Exact names currently stored in public.curricula for the 16 protected
// Phase 8 curricula. Map the persisted titles explicitly, including variants
// whose original specialization punctuation differs from the display title.
const ORIGINAL_CURRICULUM_TITLES = Object.freeze({
  BEED: "Elementary Education Curriculum 2026 - Version 1",
  BPA: "Public Administration Curriculum 2026 - Version 1",
  BSA: "Accountancy Curriculum 2026 - Version 1",
  BSBAENT: "Business Administration - Entrepreneurship Curriculum 2026 - Version 1",
  BSBAHR: "Business Administration - Human Resource Management Curriculum 2026 - Version 1",
  BSBAMM: "Business Administration - Marketing Management Curriculum 2026 - Version 1",
  BSCS: "Computer Science Curriculum 2026 - Version 1",
  BSECE: "Electronics Engineering Curriculum 2026 - Version 1",
  BSEDENG: "Secondary Education - English Curriculum 2026 - Version 1",
  BSEDFIL: "Secondary Education - Filipino Curriculum 2026 - Version 1",
  BSEDMATH: "Secondary Education - Mathematics Curriculum 2026 - Version 1",
  BSEDSCI: "Secondary Education - Science Curriculum 2026 - Version 1",
  BSHM: "Hospitality Management Curriculum 2026 - Version 1",
  BSIT: "Information Technology Curriculum 2026 - Version 1",
  BSN: "Nursing Curriculum 2026 - Version 1",
  BSP: "Psychology Curriculum 2026 - Version 1",
});

const CURRICULUM_BY_RAW = new Map();
const CURRICULUM_NAME_BY_SOURCE = new Map();
for (const [identity, [displayCode, title]] of Object.entries(PROJECT_CURRICULA)) {
  const curriculum = Object.freeze({
    code: displayCode,
    name: title,
  });
  CURRICULUM_BY_RAW.set(`P8F26-${identity}-V1`, curriculum);
  CURRICULUM_NAME_BY_SOURCE.set(`PHASE8_PROJECT_ONLY_FICTION_2026_V1 ${identity}`, curriculum.name);
  CURRICULUM_NAME_BY_SOURCE.set(
    ORIGINAL_CURRICULUM_TITLES[identity],
    curriculum.name,
  );
}

export function displayCurriculumCode(raw) {
  if (typeof raw !== "string") return raw;
  return CURRICULUM_BY_RAW.get(raw)?.code ?? raw;
}

export function displayCurriculumName(value) {
  if (typeof value === "string") {
    return CURRICULUM_BY_RAW.get(value)?.name
      ?? CURRICULUM_NAME_BY_SOURCE.get(value)
      ?? value;
  }
  // This helper can also consume an explicit curriculum object, but does not
  // coerce unrelated objects used by generic table or select components.
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const rawCode = value.code ?? value.curriculum_code ?? value.curriculumCode;
    if (typeof rawCode === "string" && CURRICULUM_BY_RAW.has(rawCode)) {
      return CURRICULUM_BY_RAW.get(rawCode).name;
    }
    const sourceName = value.name ?? value.curriculum_name ?? value.version_label;
    if (typeof sourceName === "string" && CURRICULUM_NAME_BY_SOURCE.has(sourceName)) {
      return CURRICULUM_NAME_BY_SOURCE.get(sourceName);
    }
  }
  return value;
}

export function displaySubjectCode(raw) {
  if (typeof raw !== "string") return raw;

  // Shared general education subjects use one identity in all 16 curricula.
  const generalEducation = /^P8F26-GE-T(0[1-8])-([1-3])$/.exec(raw);
  if (generalEducation) {
    const term = Number(generalEducation[1]);
    const year = Math.ceil(term / 2);
    const semester = term % 2 === 1 ? 1 : 2;
    const courseNumber = year * 100 + (semester === 2 ? 50 : 0) + Number(generalEducation[2]);
    return `GE ${courseNumber}`;
  }

  const major = /^P8F26-([A-Z]+)-T(0[1-8])-M([1-5])$/.exec(raw);
  if (!major) return raw;

  const projectCurriculum = PROJECT_CURRICULA[major[1]];
  if (!projectCurriculum) return raw;
  const term = Number(major[2]);
  const slot = Number(major[3]);
  // Actual Phase 8 plans have four majors in first semesters and five in
  // second semesters. Reject nonexistent lookalike codes.
  if (term % 2 === 1 && slot > 4) return raw;
  const year = Math.ceil(term / 2);
  const semester = term % 2 === 1 ? 1 : 2;
  const courseNumber = year * 100 + (semester === 2 ? 50 : 0) + slot;
  return `${projectCurriculum[2]} ${courseNumber}`;
}

export function displayAcademicReference(raw) {
  if (typeof raw !== "string") return raw;
  const curriculumCode = displayCurriculumCode(raw);
  if (curriculumCode !== raw) return curriculumCode;
  const subjectCode = displaySubjectCode(raw);
  if (subjectCode !== raw) return subjectCode;
  return displayCurriculumName(raw);
}

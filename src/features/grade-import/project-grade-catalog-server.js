import "server-only";

// This reader may only be called from an already authenticated, Registrar-only
// server action. It uses the server's protected Supabase client, never a browser
// supplied cohort, term, student ID, or curriculum code.
const COHORT_ID = "PLP_PROJECT_600_2026_1";
const PAGE_SIZE = 500;
const MAX_ROWS_PER_QUERY = 12000;
const ID_CHUNK_SIZE = 60;
const BLOCK_READ_CONCURRENCY = 5;

function verified(result, description) {
  if (result?.error || !Array.isArray(result?.data)) {
    throw new Error(`Protected project grade catalog ${description} is unavailable.`);
  }
  return result.data;
}

async function readPaged(makeQuery, description) {
  const records = [];
  for (let offset = 0; offset < MAX_ROWS_PER_QUERY; offset += PAGE_SIZE) {
    const page = verified(await makeQuery().range(offset, offset + PAGE_SIZE - 1), description);
    records.push(...page);
    if (page.length < PAGE_SIZE) return records;
  }
  throw new Error(`Protected project grade catalog ${description} exceeded its safe read limit.`);
}

async function readByIds(admin, table, column, ids, fields, orderBy = column) {
  const distinct = [...new Set(ids.filter(Boolean))];
  const rows = [];
  for (let offset = 0; offset < distinct.length; offset += ID_CHUNK_SIZE) {
    const chunk = distinct.slice(offset, offset + ID_CHUNK_SIZE);
    rows.push(...await readPaged(
      () => admin.from(table).select(fields).in(column, chunk).order(orderBy),
      table,
    ));
  }
  return rows;
}

function uniqueMap(rows, key, description) {
  const map = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!value || map.has(value)) {
      throw new Error(`Protected project grade catalog ${description} has missing or duplicate identities.`);
    }
    map.set(value, row);
  }
  return map;
}

function semesterIndex(value) {
  if (value === "First Semester") return 1;
  if (value === "Second Semester") return 2;
  return null;
}

function termPosition(row) {
  const firstYear = /^\s*(\d{4})\b/.exec(String(row.academic_year || ""));
  const semester = semesterIndex(row.semester);
  if (!firstYear || !semester) return null;
  return Number(firstYear[1]) * 2 + semester;
}

function previousAcademicTerm(terms, currentTermId) {
  const chronological = terms.map((term) => ({
    ...term, position: termPosition(term),
  })).filter((term) => term.position !== null)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const current = chronological.find((term) => term.id === currentTermId);
  if (!current || chronological.some((term) =>
    term.id !== current.id && term.position === current.position)) {
    throw new Error("The project current academic term cannot be uniquely verified.");
  }
  const previous = chronological.filter((term) => term.position === current.position - 1);
  if (previous.length !== 1) {
    throw new Error("The immediately preceding academic term is unavailable or ambiguous.");
  }
  return { current, previous: previous[0] };
}

function hasProjectProvenance(metadata) {
  return metadata?.origin === "GENERATED_PROJECT" &&
    metadata.cohort_key === COHORT_ID &&
    metadata.verified_institutionally === false &&
    metadata.official_academic_record === false;
}

function projectProfile(profile, account) {
  return profile?.record_kind === "PROJECT_ONLY" &&
    profile?.project_cohort_id === COHORT_ID &&
    profile?.is_synthetic_demo === true &&
    profile?.student_type === "CONTINUING_STUDENT" &&
    Boolean(profile.student_number && profile.user_id) &&
    account?.id === profile.user_id &&
    account.role_code === "student" &&
    account.project_cohort_id === COHORT_ID &&
    account.is_synthetic_demo === true &&
    Boolean(account.full_name);
}

async function historicalInstructorMappings(admin, block, prior, subjectCodes) {
  const mappings = await readPaged(() => admin.from("project_historical_subject_instructors")
    .select("subject_code,previous_block_code,instructor_id,source_reference,assignment_provenance,verified_institutionally")
    .eq("project_cohort_id", COHORT_ID)
    .eq("target_block_id", block.id)
    .eq("prior_term_id", prior.id)
    .eq("curriculum_code", block.curriculum_code)
    .order("subject_code"), "historical instructor mappings");
  const codes = new Set(subjectCodes);
  const map = uniqueMap(mappings, "subject_code", "historical instructor mappings");
  if (mappings.some((item) => !codes.has(item.subject_code) ||
    item.verified_institutionally !== false)) {
    throw new Error("Protected historical instructor mappings do not match the project curriculum.");
  }
  const blockCodes = [...new Set(mappings.map((item) => item.previous_block_code).filter(Boolean))];
  if (blockCodes.length > 1) {
    throw new Error("Protected historical instructor mappings disagree on previous block.");
  }
  // An incomplete mapping does not establish an entire historical grouping.
  const complete = map.size === subjectCodes.length && blockCodes.length === 1 &&
    mappings.every((item) => item.previous_block_code === blockCodes[0]);
  const previousBlockCode = complete ? blockCodes[0] : "";
  const instructorRows = await readByIds(admin, "instructors", "id",
    mappings.map((row) => row.instructor_id),
    "id,display_name,is_synthetic_demo,synthetic_source_key,app_user_id");
  const instructors = uniqueMap(instructorRows, "id", "fictional instructors");
  const names = new Map();
  for (const mapping of mappings) {
    const instructor = instructors.get(mapping.instructor_id);
    if (instructor &&
      mapping.assignment_provenance === "PROJECT_FICTIONAL_ASSIGNMENT" &&
      instructor.is_synthetic_demo === true &&
      instructor.app_user_id === null &&
      (instructor.synthetic_source_key?.startsWith("PROJECT_ONLY_") ||
        instructor.synthetic_source_key?.startsWith("PHASE8_FICTIONAL_SCHEDULE_V1:FACULTY:")) &&
      instructor.display_name) {
      names.set(mapping.subject_code, {
        name: instructor.display_name,
        provenance: "PROJECT_FICTIONAL_ASSIGNMENT",
        mappingOrigin: mapping.source_reference?.startsWith("PHASE8_AUTO_FICTIONAL_PRIOR_FACULTY_")
          ? "GENERATED_DEMONSTRATION" : "EXISTING_PROJECT_MAPPING",
      });
    }
  }
  // A known prior section does not establish that every subject has a
  // trustworthy fictional professor. Keep its verified section code visible,
  // but leave the mapping form available until each subject is attributed.
  const allProfessorsTrusted = subjectCodes.every((code) => names.has(code));
  return { previousBlockCode, mappingRequired: !complete || !allProfessorsTrusted, names };
}

async function buildBlock(admin, block, members, previous, current, program, college) {
  const previousYearLevel = Number(block.year_level) -
    (current.semester === "First Semester" ? 1 : 0);
  if (!Number.isInteger(previousYearLevel) || previousYearLevel < 1 ||
      previousYearLevel > 4) return null;

  const curriculumRows = await readPaged(() => admin.from("curriculum_subjects")
    .select("curriculum_code,subject_code,year_level_number,semester")
    .eq("curriculum_code", block.curriculum_code)
    .eq("year_level_number", previousYearLevel)
    .eq("semester", previous.semester)
    .order("subject_code"), "historical curriculum subjects");
  if (!curriculumRows.length ||
      curriculumRows.some((row) => row.curriculum_code !== block.curriculum_code ||
        Number(row.year_level_number) !== previousYearLevel ||
        row.semester !== previous.semester)) {
    throw new Error("The project block historical curriculum scope cannot be verified.");
  }
  const subjectCodes = curriculumRows.map((row) => row.subject_code);
  if (new Set(subjectCodes).size !== subjectCodes.length ||
      subjectCodes.some((code) => !code)) {
    throw new Error("The historical curriculum contains duplicate or missing subjects.");
  }
  const knownSubjects = await readByIds(admin, "subjects", "code", subjectCodes, "code,name");
  const subjectMap = uniqueMap(knownSubjects, "code", "historical subject names");
  if (subjectMap.size !== subjectCodes.length) {
    throw new Error("Historical project subject metadata is incomplete.");
  }

  const resultRows = [];
  for (let offset = 0; offset < members.length; offset += ID_CHUNK_SIZE) {
    const ids = members.slice(offset, offset + ID_CHUNK_SIZE).map((person) => person.studentId);
    resultRows.push(...await readPaged(() => admin.from("project_simulated_academic_results")
      .select("id,student_id,term_id,curriculum_code,subject_code,grade_value,result_status,source_metadata")
      .eq("term_id", previous.id)
      .eq("curriculum_code", block.curriculum_code)
      .in("student_id", ids)
      .order("id"), "historical project grades"));
  }
  const expectedSubjects = new Set(subjectCodes);
  const expectedStudentIds = new Set(members.map((person) => person.studentId));
  const resultByStudentAndSubject = new Map();
  for (const grade of resultRows) {
    if (!expectedSubjects.has(grade.subject_code)) continue;
    if (!expectedStudentIds.has(grade.student_id) ||
        grade.term_id !== previous.id ||
        grade.curriculum_code !== block.curriculum_code ||
        !hasProjectProvenance(grade.source_metadata) ||
        !["COMPLETED", "FAILED", "INCOMPLETE"].includes(grade.result_status)) {
      throw new Error("A previous project grade has conflicting academic provenance.");
    }
    const identity = `${grade.student_id}|${grade.subject_code}`;
    if (!grade.id || resultByStudentAndSubject.has(identity)) {
      throw new Error("Historical project grades have duplicate or missing result identities.");
    }
    resultByStudentAndSubject.set(identity, grade);
  }
  if (resultByStudentAndSubject.size !== members.length * subjectCodes.length) {
    // A partially generated project history must never be shown as a complete
    // subject roster or eligible for the collective grade publication path.
    throw new Error("The current project block has incomplete historical grade coverage.");
  }
  const mapping = await historicalInstructorMappings(admin, block, previous, subjectCodes);
  const roster = members.map((person) => ({
    ...person, sectionCode: mapping.previousBlockCode,
  })).sort((a, b) => a.studentNumber.localeCompare(b.studentNumber));
  const subjects = subjectCodes.map((code) => ({
    code,
    name: subjectMap.get(code).name,
    previousProfessor: mapping.names.get(code) || null,
    expected: roster.map((person) => {
      const canonical = resultByStudentAndSubject.get(`${person.studentId}|${code}`);
      return {
        ...person,
        canonicalResultId: canonical.id,
        canonicalResultStatus: canonical.result_status,
        canonicalGrade: canonical.grade_value,
      };
    }),
  }));
  return {
    id: block.id,
    currentBlockCode: block.code,
    currentTermId: current.id,
    code: mapping.previousBlockCode,
    mappingRequired: mapping.mappingRequired,
    termId: previous.id,
    termLabel: previous.label,
    academicYear: previous.academic_year,
    semester: previous.semester,
    programCode: block.program_code,
    programName: program.name,
    collegeCode: program.organizational_unit_code,
    collegeName: college.name,
    yearLevel: block.year_level,
    curriculumCode: block.curriculum_code,
    subjects,
    roster,
  };
}

/**
 * Reads historical importable contexts for the current Phase 8 cohort.
 * Caller must enforce requireRole("registrar") before creating/passing admin.
 * An inconsistent current block fails closed instead of returning a partial
 * historical grade roster. This function performs SELECT queries only.
 */
export async function readProjectGradeCatalog(admin) {
  if (!admin?.from) throw new Error("A protected project grade reader is required.");
  const [terms, windows] = await Promise.all([
    readPaged(() => admin.from("academic_terms")
      .select("id,label,academic_year,semester")
      .order("academic_year").order("semester").order("id"), "academic terms"),
    readPaged(() => admin.from("project_phase8_demo_enrollment_window")
      .select("project_cohort_id,term_id,source_type,verified_institutionally")
      .eq("project_cohort_id", COHORT_ID)
      .order("term_id"), "project enrollment window"),
  ]);
  if (windows.length !== 1 ||
      windows[0].project_cohort_id !== COHORT_ID ||
      windows[0].source_type !== "PROJECT_ONLY_FICTIONAL" ||
      windows[0].verified_institutionally !== false ||
      !windows[0].term_id) {
    throw new Error("The project enrollment term has no uniquely verified configuration.");
  }
  const { current, previous } = previousAcademicTerm(terms, windows[0].term_id);
  const placements = await readPaged(
    () => admin.from("project_student_academic_placements")
      .select("student_id,term_id,program_code,curriculum_code,year_level,home_block_id,project_cohort_id,source_metadata")
      .eq("project_cohort_id", COHORT_ID)
      .eq("term_id", current.id)
      .order("student_id"), "cohort placements");
  if (!placements.length) return [];
  const placementMap = uniqueMap(placements, "student_id", "project placements");
  const [profiles, allBlocks] = await Promise.all([
    readByIds(admin, "student_profiles", "id", [...placementMap.keys()],
      "id,user_id,student_number,student_type,record_kind,project_cohort_id,is_synthetic_demo"),
    readByIds(admin, "block_sections", "id", placements.map((person) => person.home_block_id),
      "id,code,term_id,program_code,curriculum_code,year_level,planning_status"),
  ]);
  const profileMap = uniqueMap(profiles, "id", "student profiles");
  const blockMap = uniqueMap(allBlocks, "id", "current block sections");
  const accounts = await readByIds(admin, "app_users", "id",
    profiles.filter((person) => person.student_type === "CONTINUING_STUDENT")
      .map((person) => person.user_id),
    "id,full_name,role_code,is_synthetic_demo,project_cohort_id");
  const accountMap = uniqueMap(accounts, "id", "project student accounts");
  const blockMembers = new Map();
  for (const placement of placements) {
    const profile = profileMap.get(placement.student_id);
    const block = blockMap.get(placement.home_block_id);
    if (!profile || placement.term_id !== current.id ||
        placement.project_cohort_id !== COHORT_ID ||
        !hasProjectProvenance(placement.source_metadata)) {
      throw new Error("Project student placement provenance is incomplete.");
    }
    if (!block && profile.student_type === "CONTINUING_STUDENT") {
      throw new Error("A continuing project student has no verified current block.");
    }
    if (block && (block.term_id !== current.id ||
        placement.program_code !== block.program_code ||
        placement.curriculum_code !== block.curriculum_code ||
        Number(placement.year_level) !== Number(block.year_level))) {
      throw new Error("Project block assignment does not match student placement.");
    }
    if (profile.student_type !== "CONTINUING_STUDENT") continue;
    const account = accountMap.get(profile.user_id);
    if (!projectProfile(profile, account)) {
      throw new Error("Project continuing student account identity could not be verified.");
    }
    const people = blockMembers.get(block.id) || [];
    people.push({
      studentId: profile.id,
      studentNumber: profile.student_number,
      studentName: account.full_name,
    });
    blockMembers.set(block.id, people);
  }
  if (!blockMembers.size) return [];
  const chosenBlocks = [...blockMembers.keys()].map((id) => blockMap.get(id));
  const curriculumCodes = [...new Set(chosenBlocks.map((block) => block.curriculum_code))];
  const [provenance, programs] = await Promise.all([
    readByIds(admin, "phase8_fictional_curriculum_provenance",
      "curriculum_code", curriculumCodes, "curriculum_code,source_type,is_official"),
    readByIds(admin, "programs", "code", chosenBlocks.map((block) => block.program_code),
      "code,name,organizational_unit_code"),
  ]);
  const provenanceMap = uniqueMap(provenance, "curriculum_code", "fictional curricula");
  const programMap = uniqueMap(programs, "code", "programs");
  const colleges = await readByIds(admin, "organizational_units", "code",
    programs.map((program) => program.organizational_unit_code), "code,name");
  const collegeMap = uniqueMap(colleges, "code", "colleges");
  for (const code of curriculumCodes) {
    const entry = provenanceMap.get(code);
    if (entry?.is_official !== false ||
        entry?.source_type !== "PROJECT_ONLY_FICTIONAL") {
      throw new Error("The current project block references an unverified curriculum.");
    }
  }
  const blocks = [];
  for (let offset = 0; offset < chosenBlocks.length; offset += BLOCK_READ_CONCURRENCY) {
    const chunk = chosenBlocks.slice(offset, offset + BLOCK_READ_CONCURRENCY);
    const results = await Promise.all(chunk.map(async (block) => {
      const program = programMap.get(block.program_code);
      const college = collegeMap.get(program?.organizational_unit_code);
      if (!program || !college || !block.code) {
        throw new Error("Project block program or college metadata is incomplete.");
      }
      return buildBlock(
        admin, block, blockMembers.get(block.id), previous, current, program, college,
      );
    }));
    blocks.push(...results.filter(Boolean));
  }
  return blocks.sort((a, b) =>
    a.programCode.localeCompare(b.programCode) ||
    Number(a.yearLevel) - Number(b.yearLevel) ||
    a.currentBlockCode.localeCompare(b.currentBlockCode));
}

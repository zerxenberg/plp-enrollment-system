import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

// Load the actual protected reader without bringing Next's server-only marker
// into a standalone Node test process. No Supabase credentials are used.
const file = readFileSync(new URL("./project-grade-catalog-server.js", import.meta.url), "utf8");
const executable = file.replace(/^import "server-only";\s*/, "")
  .replace("export async function readProjectGradeCatalog", "async function readProjectGradeCatalog");
const isolated = {};
runInNewContext(`${executable}\nthis.readCatalog = readProjectGradeCatalog;`, isolated);

const COHORT = "PLP_PROJECT_600_2026_1";
const METADATA = {
  origin: "GENERATED_PROJECT", cohort_key: COHORT,
  verified_institutionally: false, official_academic_record: false,
};
const CURRENT = "TERM-2026-1";
const PRIOR = "TERM-2025-2";

function record(studentId, subjectCode, curriculumCode, number) {
  return {
    id: `result-${studentId}-${subjectCode}`,
    student_id: studentId, term_id: PRIOR, curriculum_code: curriculumCode,
    subject_code: subjectCode, grade_value: number === 0 ? null : number,
    result_status: number === 0 ? "INCOMPLETE" : number > 3 ? "FAILED" : "COMPLETED",
    source_metadata: { ...METADATA },
  };
}

function makeFixture() {
  const placement = (id, block, program, curriculum, year) => ({
    student_id: id, term_id: CURRENT, program_code: program,
    curriculum_code: curriculum, year_level: year, home_block_id: block,
    project_cohort_id: COHORT, source_metadata: { ...METADATA },
  });
  const profile = (id, type) => ({
    id, user_id: `user-${id}`, student_number: `25-${id}`,
    student_type: type, record_kind: "PROJECT_ONLY", project_cohort_id: COHORT,
    is_synthetic_demo: true,
  });
  const user = (id) => ({
    id: `user-${id}`, full_name: `Project Student ${id}`,
    role_code: "student", project_cohort_id: COHORT, is_synthetic_demo: true,
  });
  const subjects = ["BSIT-S1", "BSIT-S2", "BSCS-S1"];
  return {
    project_phase8_demo_enrollment_window: [{
      project_cohort_id: COHORT, term_id: CURRENT,
      source_type: "PROJECT_ONLY_FICTIONAL", verified_institutionally: false,
    }],
    academic_terms: [
      { id: "TERM-2027-1", academic_year: "2027 to 2028", semester: "First Semester", label: "Later" },
      { id: PRIOR, academic_year: "2025 to 2026", semester: "Second Semester", label: "Prior Academic Term" },
      { id: CURRENT, academic_year: "2026 to 2027", semester: "First Semester", label: "Current Academic Term" },
      { id: "TERM-2025-1", academic_year: "2025 to 2026", semester: "First Semester", label: "Older" },
    ],
    project_student_academic_placements: [
      placement("IT01", "block-it", "BSIT", "CURR-BSIT", 2),
      placement("IT02", "block-it", "BSIT", "CURR-BSIT", 2),
      placement("IT-T", "block-it", "BSIT", "CURR-BSIT", 2),
      placement("CS01", "block-cs", "BSCS", "CURR-BSCS", 3),
    ],
    student_profiles: [
      profile("IT01", "CONTINUING_STUDENT"),
      profile("IT02", "CONTINUING_STUDENT"),
      profile("IT-T", "TRANSFEREE"),
      profile("CS01", "CONTINUING_STUDENT"),
    ],
    app_users: ["IT01", "IT02", "CS01"].map(user),
    block_sections: [
      { id: "block-it", code: "BSIT-2A", term_id: CURRENT, program_code: "BSIT",
        curriculum_code: "CURR-BSIT", year_level: 2, planning_status: "PUBLISHED" },
      { id: "block-cs", code: "BSCS-3A", term_id: CURRENT, program_code: "BSCS",
        curriculum_code: "CURR-BSCS", year_level: 3, planning_status: "PUBLISHED" },
    ],
    phase8_fictional_curriculum_provenance: [
      { curriculum_code: "CURR-BSIT", source_type: "PROJECT_ONLY_FICTIONAL", is_official: false },
      { curriculum_code: "CURR-BSCS", source_type: "PROJECT_ONLY_FICTIONAL", is_official: false },
    ],
    programs: [
      { code: "BSIT", name: "Information Technology", organizational_unit_code: "CCS" },
      { code: "BSCS", name: "Computer Science", organizational_unit_code: "CCS" },
    ],
    organizational_units: [{ code: "CCS", name: "College of Computer Studies" }],
    curriculum_subjects: [
      { curriculum_code: "CURR-BSIT", subject_code: "BSIT-S1", year_level_number: 1, semester: "Second Semester" },
      { curriculum_code: "CURR-BSIT", subject_code: "BSIT-S2", year_level_number: 1, semester: "Second Semester" },
      { curriculum_code: "CURR-BSIT", subject_code: "BSIT-CURRENT", year_level_number: 2, semester: "First Semester" },
      { curriculum_code: "CURR-BSCS", subject_code: "BSCS-S1", year_level_number: 2, semester: "Second Semester" },
      { curriculum_code: "CURR-BSCS", subject_code: "BSCS-WRONG-YEAR", year_level_number: 1, semester: "Second Semester" },
    ],
    subjects: subjects.map((code) => ({ code, name: `Subject ${code}` })),
    project_simulated_academic_results: [
      record("IT01", "BSIT-S1", "CURR-BSIT", 2),
      record("IT01", "BSIT-S2", "CURR-BSIT", 5),
      record("IT02", "BSIT-S1", "CURR-BSIT", 2),
      record("IT02", "BSIT-S2", "CURR-BSIT", 0),
      record("CS01", "BSCS-S1", "CURR-BSCS", 2),
    ],
    project_historical_subject_instructors: [
      { project_cohort_id: COHORT, target_block_id: "block-it", prior_term_id: PRIOR,
        curriculum_code: "CURR-BSIT", previous_block_code: "BSIT-1A",
        subject_code: "BSIT-S1", instructor_id: "synthetic-prof", verified_institutionally: false,
        assignment_provenance: "PROJECT_FICTIONAL_ASSIGNMENT" },
      { project_cohort_id: COHORT, target_block_id: "block-it", prior_term_id: PRIOR,
        curriculum_code: "CURR-BSIT", previous_block_code: "BSIT-1A",
        subject_code: "BSIT-S2", instructor_id: null, verified_institutionally: false,
        assignment_provenance: "UNVERIFIED_SOURCE" },
    ],
    instructors: [{ id: "synthetic-prof", display_name: "Project Professor",
      is_synthetic_demo: true, app_user_id: null,
      synthetic_source_key: "PROJECT_ONLY_BSIT1A_TERM2025_2:BSIT-S1" }],
  };
}

function database(tables) {
  const calls = [];
  return {
    calls,
    from(table) {
      const equals = [];
      const members = [];
      const ordering = [];
      return {
        select() { return this; },
        eq(field, value) { equals.push([field, value]); return this; },
        in(field, values) { members.push([field, values]); return this; },
        order(field) { ordering.push(field); return this; },
        async range(from, to) {
          calls.push({ table, from, to, equals: [...equals], members: [...members] });
          let records = tables[table] || [];
          for (const [field, value] of equals) {
            records = records.filter((row) => row[field] === value);
          }
          for (const [field, values] of members) {
            records = records.filter((row) => values.includes(row[field]));
          }
          records = [...records].sort((a, b) => {
            for (const field of ordering) {
              const order = String(a[field] ?? "").localeCompare(String(b[field] ?? ""));
              if (order) return order;
            }
            return 0;
          });
          return { data: records.slice(from, to + 1), error: null };
        },
      };
    },
  };
}

test("dynamic project catalog isolates continuing cohorts by block, curriculum year and historical term", async () => {
  const catalog = await isolated.readCatalog(database(makeFixture()));
  assert.equal(catalog.length, 2);
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const it = byId.get("block-it");
  const cs = byId.get("block-cs");
  assert.equal(it.code, "BSIT-1A");
  assert.equal(it.mappingRequired, true, "an unverified subject professor keeps mapping configurable");
  assert.equal(it.termId, PRIOR);
  assert.equal(it.currentTermId, CURRENT);
  assert.equal(it.collegeCode, "CCS");
  assert.equal(it.collegeName, "College of Computer Studies");
  assert.equal(it.programName, "Information Technology");
  assert.equal(it.yearLevel, 2);
  assert.equal(it.subjects.length, 2);
  assert.equal(it.subjects[0].expected.length, 2);
  assert.equal(it.roster.length, 2, "a transferee in the current block is excluded from the historical roster");
  assert.equal(it.subjects[0].previousProfessor.name, "Project Professor");
  assert.equal(it.subjects[1].previousProfessor, null);
  assert.equal(it.subjects[1].expected[1].canonicalResultStatus, "INCOMPLETE");
  assert.equal(it.subjects[1].expected[1].canonicalGrade, null);
  assert.equal(cs.code, "", "do not fabricate a historical BSCS-2A block from current BSCS-3A");
  assert.equal(cs.mappingRequired, true);
  assert.equal(cs.subjects.length, 1, "third year uses second year prior-semester curriculum only");
  assert.equal(cs.subjects[0].code, "BSCS-S1");
  assert.equal(cs.subjects[0].previousProfessor, null);
  assert.equal(cs.subjects[0].expected[0].sectionCode, "");
});

test("existing UNVERIFIED_SOURCE professor row keeps historical mapping configurable without losing known section", async () => {
  const fixture = makeFixture();
  const pending = fixture.project_historical_subject_instructors.find((row) =>
    row.subject_code === "BSIT-S2");
  assert.equal(pending.assignment_provenance, "UNVERIFIED_SOURCE");
  assert.equal(pending.instructor_id, null);
  const before = (await isolated.readCatalog(database(fixture)))
    .find((block) => block.id === "block-it");
  assert.equal(before.code, "BSIT-1A", "complete consistent section evidence remains visible");
  assert.equal(before.mappingRequired, true, "the missing professor must keep mapping form available");
  assert.equal(before.subjects.find((subject) => subject.code === "BSIT-S2").previousProfessor, null);
  assert.ok(before.roster.every((student) => student.sectionCode === "BSIT-1A"));

  // Once an explicitly attested fictional instructor is assigned to the
  // existing source slot, the same section becomes import ready.
  pending.instructor_id = "synthetic-prof-2";
  pending.assignment_provenance = "PROJECT_FICTIONAL_ASSIGNMENT";
  fixture.instructors.push({
    id: "synthetic-prof-2", display_name: "Second Project Professor",
    is_synthetic_demo: true, app_user_id: null,
    synthetic_source_key: "PHASE8_FICTIONAL_SCHEDULE_V1:FACULTY:BSIT-S2",
  });
  const after = (await isolated.readCatalog(database(fixture)))
    .find((block) => block.id === "block-it");
  assert.equal(after.code, "BSIT-1A");
  assert.equal(after.mappingRequired, false, "all required subjects now have trusted professors");
  assert.equal(after.subjects.find((subject) => subject.code === "BSIT-S2")
    .previousProfessor.name, "Second Project Professor");
});

test("missing canonical grade or mismatched canonical provenance fails closed", async () => {
  const partial = makeFixture();
  partial.project_simulated_academic_results.pop();
  await assert.rejects(isolated.readCatalog(database(partial)), /incomplete historical grade coverage/);
  const mismatched = makeFixture();
  mismatched.project_simulated_academic_results[0].source_metadata.cohort_key = "OTHER_COHORT";
  await assert.rejects(isolated.readCatalog(database(mismatched)), /conflicting academic provenance/);
});

test("wrong placement identity, curriculum provenance or unapproved historical mapping fails closed", async () => {
  const placement = makeFixture();
  placement.project_student_academic_placements[0].curriculum_code = "OTHER-CURRICULUM";
  await assert.rejects(isolated.readCatalog(database(placement)), /assignment does not match/);
  const curriculum = makeFixture();
  curriculum.phase8_fictional_curriculum_provenance[0].is_official = true;
  await assert.rejects(isolated.readCatalog(database(curriculum)), /unverified curriculum/);
  const mapping = makeFixture();
  mapping.project_historical_subject_instructors[1].previous_block_code = "OTHER-BLOCK";
  await assert.rejects(isolated.readCatalog(database(mapping)), /disagree on previous block/);
});

test("incomplete historical mapping keeps context but leaves previous block unknown", async () => {
  const fixture = makeFixture();
  fixture.project_historical_subject_instructors.pop();
  const catalog = await isolated.readCatalog(database(fixture));
  const item = catalog.find((row) => row.id === "block-it");
  assert.equal(item.mappingRequired, true);
  assert.equal(item.code, "");
  assert.ok(item.subjects.every((subject) => subject.expected.every((student) => student.sectionCode === "")));
});

test("fictional current Phase 8 instructors can be shown only after protected historical mapping", async () => {
  const fixture = makeFixture();
  fixture.instructors[0].synthetic_source_key = "PHASE8_FICTIONAL_SCHEDULE_V1:FACULTY:BSIT-S1";
  const catalog = await isolated.readCatalog(database(fixture));
  assert.equal(catalog.find((item) => item.id === "block-it").subjects[0].previousProfessor.name,
    "Project Professor");
  fixture.instructors[0].app_user_id = "some-real-faculty-account";
  const rejected = await isolated.readCatalog(database(fixture));
  assert.equal(rejected.find((item) => item.id === "block-it").subjects[0].previousProfessor, null,
    "the historical display must not imply a project instructor is a real faculty account");
  assert.equal(rejected.find((item) => item.id === "block-it").mappingRequired, true,
    "an untrusted professor must keep the mapping panel accessible");
});

test("current project term comes from the protected enrollment window, not a fixed term ID", async () => {
  const fixture = makeFixture();
  const futureCurrent = "TERM-2027-1";
  const futurePrior = "TERM-2026-2";
  fixture.academic_terms.push({
    id: futurePrior, label: "Second Semester 2026 to 2027",
    academic_year: "2026 to 2027", semester: "Second Semester",
  });
  fixture.project_phase8_demo_enrollment_window[0].term_id = futureCurrent;
  for (const placement of fixture.project_student_academic_placements) {
    placement.term_id = futureCurrent;
    placement.year_level++;
  }
  for (const block of fixture.block_sections) {
    block.term_id = futureCurrent;
    block.year_level++;
  }
  for (const grade of fixture.project_simulated_academic_results) grade.term_id = futurePrior;
  for (const mapping of fixture.project_historical_subject_instructors) {
    mapping.prior_term_id = futurePrior;
  }
  for (const row of fixture.curriculum_subjects) {
    if (row.semester === "Second Semester") row.year_level_number++;
  }
  const catalog = await isolated.readCatalog(database(fixture));
  assert.equal(catalog.length, 2);
  assert.ok(catalog.every((block) => block.currentTermId === futureCurrent &&
    block.termId === futurePrior && block.academicYear === "2026 to 2027"));
  assert.ok(catalog.some((block) => block.yearLevel === 3));
  assert.ok(catalog.some((block) => block.yearLevel === 4));
});

test("missing, ambiguous or institutionally verified project window fails closed", async () => {
  const missing = makeFixture();
  missing.project_phase8_demo_enrollment_window = [];
  await assert.rejects(isolated.readCatalog(database(missing)), /enrollment term/);
  const duplicate = makeFixture();
  duplicate.project_phase8_demo_enrollment_window.push({
    ...duplicate.project_phase8_demo_enrollment_window[0],
  });
  await assert.rejects(isolated.readCatalog(database(duplicate)), /enrollment term/);
  const invalid = makeFixture();
  invalid.project_phase8_demo_enrollment_window[0].verified_institutionally = true;
  await assert.rejects(isolated.readCatalog(database(invalid)), /enrollment term/);
});

test("reads more than the Supabase first-page limit without including transferees in grade roster", async () => {
  const fixture = makeFixture();
  const sourcePlacement = fixture.project_student_academic_placements[2];
  const sourceProfile = fixture.student_profiles[2];
  for (let index = 0; index < 500; index++) {
    const id = `extra-T-${index}`;
    fixture.project_student_academic_placements.push({
      ...sourcePlacement, student_id: id, source_metadata: { ...METADATA },
    });
    fixture.student_profiles.push({
      ...sourceProfile, id, user_id: `user-${id}`, student_number: `25-${id}`,
    });
  }
  const client = database(fixture);
  const catalog = await isolated.readCatalog(client);
  assert.equal(catalog.length, 2);
  const it = catalog.find((block) => block.id === "block-it");
  assert.equal(it.roster.length, 2);
  assert.ok(client.calls.some((entry) =>
    entry.table === "project_student_academic_placements" && entry.from === 500));
  assert.ok(client.calls.every((entry) => entry.to - entry.from < 500));
});

test("all 16 Phase 8 curricula resolve only their previous second-semester subjects and own continuing roster", async () => {
  // Derive the actual 16 identities from the application's current Phase 8
  // curriculum catalog so the fixture fails if that catalog expands or changes.
  const aliases = readFileSync(new URL("../academic/project-academic-display-aliases.mjs", import.meta.url), "utf8");
  const catalog = aliases.match(/const PROJECT_CURRICULA = Object\.freeze\(\{([\s\S]*?)\}\);/);
  assert.ok(catalog, "the Phase 8 curriculum registry exists");
  const identities = [...catalog[1].matchAll(/^\s{2}([A-Z]+):\s*\[/gm)].map((match) => match[1]);
  assert.equal(identities.length, 16, "cover every configured Phase 8 curriculum");
  assert.equal(new Set(identities).size, 16);

  const fixture = makeFixture();
  for (const table of [
    "project_student_academic_placements", "student_profiles", "app_users",
    "block_sections", "phase8_fictional_curriculum_provenance", "programs",
    "curriculum_subjects", "subjects", "project_simulated_academic_results",
    "project_historical_subject_instructors", "instructors",
  ]) fixture[table] = [];
  fixture.organizational_units = [{ code: "PHASE8", name: "Phase 8 Project Colleges" }];

  const expected = new Map();
  const knownSubjects = new Set();
  const seenPrograms = new Set();
  for (let index = 0; index < identities.length; index++) {
    const identity = identities[index];
    const curriculum = `P8F26-${identity}-V1`;
    const program = identity.startsWith("BSBA") ? "BSBA" :
      identity.startsWith("BSED") ? "BSED" : identity;
    if (!seenPrograms.has(program)) {
      fixture.programs.push({
        code: program, name: `Program ${program}`,
        organizational_unit_code: "PHASE8",
      });
      seenPrograms.add(program);
    }
    fixture.phase8_fictional_curriculum_provenance.push({
      curriculum_code: curriculum, source_type: "PROJECT_ONLY_FICTIONAL",
      is_official: false,
    });

    // There are 7 subjects per first semester, 8 per second semester,
    // mirroring the applied Phase 8 curriculum manifest for all four years.
    for (let semesterNumber = 1; semesterNumber <= 8; semesterNumber++) {
      const semester = semesterNumber % 2 ? "First Semester" : "Second Semester";
      const majorCount = semesterNumber % 2 ? 4 : 5;
      const yearLevel = Math.ceil(semesterNumber / 2);
      const codes = Array.from({ length: majorCount }, (_, offset) =>
        `P8F26-${identity}-T${String(semesterNumber).padStart(2, "0")}-M${offset + 1}`);
      codes.push(...Array.from({ length: 3 }, (_, offset) =>
        `P8F26-GE-T${String(semesterNumber).padStart(2, "0")}-${offset + 1}`));
      for (const subjectCode of codes) {
        fixture.curriculum_subjects.push({
          curriculum_code: curriculum, subject_code: subjectCode,
          year_level_number: yearLevel, semester,
        });
        if (!knownSubjects.has(subjectCode)) {
          knownSubjects.add(subjectCode);
          fixture.subjects.push({ code: subjectCode, name: `Subject ${subjectCode}` });
        }
      }
    }

    // Every curriculum appears at three continuing year levels, while a
    // first-year new entrant is present but has no prior PLP academic record.
    for (const yearLevel of [1, 2, 3, 4]) {
      const student = `${identity}-Y${yearLevel}`;
      const currentBlock = `${identity}-BLOCK-${yearLevel}`;
      fixture.block_sections.push({
        id: currentBlock, code: `${identity}-${yearLevel}A`,
        term_id: CURRENT, program_code: program,
        curriculum_code: curriculum, year_level: yearLevel,
        planning_status: "DRAFT",
      });
      fixture.project_student_academic_placements.push({
        student_id: student, term_id: CURRENT, program_code: program,
        curriculum_code: curriculum, year_level: yearLevel,
        home_block_id: currentBlock, project_cohort_id: COHORT,
        source_metadata: { ...METADATA },
      });
      fixture.student_profiles.push({
        id: student, user_id: `ACCOUNT-${student}`,
        student_number: `25-${index}-${yearLevel}`,
        student_type: yearLevel === 1 ? "NEW_STUDENT" : "CONTINUING_STUDENT",
        record_kind: "PROJECT_ONLY", project_cohort_id: COHORT,
        is_synthetic_demo: true,
      });
      if (yearLevel !== 1) {
        fixture.app_users.push({
          id: `ACCOUNT-${student}`, full_name: `Student ${student}`,
          role_code: "student", project_cohort_id: COHORT, is_synthetic_demo: true,
        });
        const priorSemester = (yearLevel - 1) * 2;
        const expectedSubjects = fixture.curriculum_subjects.filter((item) =>
          item.curriculum_code === curriculum &&
          item.year_level_number === yearLevel - 1 &&
          item.semester === "Second Semester");
        assert.equal(expectedSubjects.length, 8);
        for (const item of expectedSubjects) {
          fixture.project_simulated_academic_results.push(
            record(student, item.subject_code, curriculum, 2));
        }
        expected.set(currentBlock, {
          curriculum, subjectCodes: new Set(expectedSubjects.map((item) => item.subject_code)),
          student,
          priorSemester,
        });
      }
    }
  }

  assert.equal(fixture.curriculum_subjects.length, 16 * 60,
    "matches the applied 960 historical and current curriculum mappings");
  assert.equal(fixture.project_simulated_academic_results.length, 16 * 3 * 8);
  const client = database(fixture);
  const blocks = await isolated.readCatalog(client);
  assert.equal(blocks.length, 16 * 3, "every curriculum has three eligible continuing years");
  assert.equal(new Set(blocks.map((item) => item.curriculumCode)).size, 16);
  for (const block of blocks) {
    const entry = expected.get(block.id);
    assert.ok(entry, `unknown or first-year project block ${block.id}`);
    assert.equal(block.curriculumCode, entry.curriculum);
    assert.equal(block.termId, PRIOR);
    assert.equal(block.semester, "Second Semester");
    assert.equal(block.yearLevel - 1, entry.priorSemester / 2);
    assert.equal(block.subjects.length, 8);
    assert.deepEqual(new Set(block.subjects.map((subject) => subject.code)), entry.subjectCodes);
    assert.equal(block.roster.length, 1);
    assert.equal(block.roster[0].studentId, entry.student);
    assert.equal(block.mappingRequired, true);
    assert.equal(block.code, "", "do not invent historical physical block sections");
    for (const subject of block.subjects) {
      assert.equal(subject.previousProfessor, null);
      assert.equal(subject.expected.length, 1);
      assert.equal(subject.expected[0].studentId, entry.student);
      assert.equal(subject.expected[0].canonicalResultStatus, "COMPLETED");
      assert.equal(subject.expected[0].sectionCode, "");
    }
  }
  assert.equal(blocks.some((block) => block.yearLevel === 1), false,
    "new first year students have no previous PLP grade import context");
});

test("catalog query columns exist in the committed Phase 8 schema contracts", () => {
  const foundation = readFileSync(new URL("../../../supabase/migrations/20261022095000_project_phase8_simulation_foundation.sql", import.meta.url), "utf8");
  const manifest = readFileSync(new URL("../../../supabase/migrations/20261022095310_phase8_project_curriculum_import_rpc.sql", import.meta.url), "utf8");
  for (const [table, fields] of [
    ["project_student_academic_placements", [
      "student_id", "term_id", "program_code", "curriculum_code", "year_level",
      "home_block_id", "project_cohort_id", "source_metadata",
    ]],
    ["project_simulated_academic_results", [
      "id", "student_id", "term_id", "curriculum_code", "subject_code",
      "grade_value", "result_status", "source_metadata",
    ]],
  ]) {
    const creation = foundation.match(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table} \\(([\\s\\S]*?)\\n\\);`));
    assert.ok(creation, `${table} schema exists`);
    for (const name of fields) {
      assert.match(creation[1], new RegExp(`(?:^|\\n)\\s*${name}\\s`, "m"),
        `${name} exists in ${table}`);
    }
  }
  assert.match(manifest, /CREATE TABLE IF NOT EXISTS public\.phase8_fictional_curriculum_provenance/);
  assert.match(manifest, /curriculum_code text PRIMARY KEY/);
  assert.match(manifest, /source_type text NOT NULL DEFAULT 'PROJECT_ONLY_FICTIONAL'/);
  assert.match(manifest, /is_official boolean NOT NULL DEFAULT false/);
  assert.match(manifest, /year_level_number smallint/);
  assert.match(manifest, /semester text/);
  assert.match(foundation, /ENABLE ROW LEVEL SECURITY/);
  assert.match(foundation, /REVOKE ALL ON public\.project_student_academic_placements/);
});

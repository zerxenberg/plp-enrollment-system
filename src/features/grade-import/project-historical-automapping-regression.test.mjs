import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

// Exercise the real protected Registrar catalog with an isolated read-only
// Supabase double. These scenarios model the expected project-only rows after
// the controlled historical mapping operation, not a copy of live data.
const source = readFileSync(new URL("./project-grade-catalog-server.js", import.meta.url), "utf8");
const executable = source.replace(/^import "server-only";\s*/, "")
  .replace("export async function readProjectGradeCatalog", "async function readProjectGradeCatalog");
const sandbox = {};
runInNewContext(`${executable}\nthis.readCatalog = readProjectGradeCatalog;`, sandbox);

const aliases = readFileSync(new URL("../academic/project-academic-display-aliases.mjs", import.meta.url), "utf8");
const registry = aliases.match(/const PROJECT_CURRICULA = Object\.freeze\(\{([\s\S]*?)\}\);/);
assert.ok(registry, "the project curriculum registry must remain discoverable");
const identities = [...registry[1].matchAll(/^\s{2}([A-Z]+):\s*\[/gm)]
  .map((match) => match[1]);
assert.equal(identities.length, 16, "the Phase 8 registry currently has 16 curriculum identities");
const sampledIdentities = identities.slice(0, 14);
assert.ok(sampledIdentities.includes("BSIT") && sampledIdentities.includes("BSCS"));

const COHORT = "PLP_PROJECT_600_2026_1";
const CURRENT = "TERM-2026-1";
const PRIOR = "TERM-2025-2";
const GENERATED_REFERENCE = "PHASE8_AUTO_FICTIONAL_PRIOR_FACULTY_2025_2_V1";
const PROJECT_SOURCE = Object.freeze({
  origin: "GENERATED_PROJECT", cohort_key: COHORT,
  verified_institutionally: false, official_academic_record: false,
});
const LEGACY_PROFESSORS = [
  "Prof. Adrian Velasco", "Prof. Bianca Salazar", "Prof. Carlo Mercado",
  "Prof. Diana Navarro", "Prof. Emilio Bautista", "Prof. Francesca Rivera",
  "Prof. Gabriel Mendoza", "Prof. Helena Soriano",
];

function uuid(key) {
  const hex = createHash("sha256").update(key).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function previousSubjects(identity, year) {
  const semester = String((year - 1) * 2).padStart(2, "0");
  return [
    ...Array.from({ length: 5 }, (_, index) =>
      `P8F26-${identity}-T${semester}-M${index + 1}`),
    ...Array.from({ length: 3 }, (_, index) =>
      `P8F26-GE-T${semester}-${index + 1}`),
  ];
}

function makeFixture() {
  const rows = {
    academic_terms: [
      { id: PRIOR, label: "Prior term", academic_year: "2025 to 2026", semester: "Second Semester" },
      { id: CURRENT, label: "Current term", academic_year: "2026 to 2027", semester: "First Semester" },
    ],
    project_phase8_demo_enrollment_window: [{
      project_cohort_id: COHORT, term_id: CURRENT,
      source_type: "PROJECT_ONLY_FICTIONAL", verified_institutionally: false,
    }],
    block_sections: [], project_student_academic_placements: [],
    student_profiles: [], app_users: [],
    phase8_fictional_curriculum_provenance: [],
    programs: [], organizational_units: [{ code: "PHASE8", name: "Project College" }],
    curriculum_subjects: [], subjects: [], project_simulated_academic_results: [],
    project_historical_subject_instructors: [], instructors: [],
  };
  const expected = new Map();
  const knownPrograms = new Set();
  const knownSubjects = new Set();

  for (const identity of sampledIdentities) {
    const program = identity.startsWith("BSBA") ? "BSBA" :
      identity.startsWith("BSED") ? "BSED" : identity;
    const curriculum = `P8F26-${identity}-V1`;
    if (!knownPrograms.has(program)) {
      rows.programs.push({ code: program, name: `Program ${program}`,
        organizational_unit_code: "PHASE8" });
      knownPrograms.add(program);
    }
    rows.phase8_fictional_curriculum_provenance.push({
      curriculum_code: curriculum, source_type: "PROJECT_ONLY_FICTIONAL", is_official: false,
    });

    // Include new entrants to prove that only continuing students acquire
    // previous-semester grade import blocks.
    for (const year of [1, 2, 3, 4]) {
      const letter = identity === "BSCS" && year === 2 ? "C" : "A";
      const currentCode = `${identity}-${year}${letter}`;
      const previousCode = `${identity}-${year - 1}${letter}`;
      const blockId = uuid(`block:${currentCode}`);
      const studentId = uuid(`student:${currentCode}`);
      const userId = uuid(`user:${currentCode}`);
      rows.block_sections.push({ id: blockId, code: currentCode,
        term_id: CURRENT, program_code: program, curriculum_code: curriculum,
        year_level: year, planning_status: "PUBLISHED", is_synthetic_demo: true });
      rows.project_student_academic_placements.push({
        student_id: studentId, term_id: CURRENT, program_code: program,
        curriculum_code: curriculum, year_level: year, home_block_id: blockId,
        project_cohort_id: COHORT, source_metadata: { ...PROJECT_SOURCE },
      });
      rows.student_profiles.push({
        id: studentId, user_id: userId, student_number: `25-${identity}-${year}`,
        student_type: year === 1 ? "NEW_STUDENT" : "CONTINUING_STUDENT",
        record_kind: "PROJECT_ONLY", project_cohort_id: COHORT, is_synthetic_demo: true,
      });
      if (year === 1) continue;
      rows.app_users.push({ id: userId, full_name: `Student ${currentCode}`,
        role_code: "student", project_cohort_id: COHORT, is_synthetic_demo: true });

      const codes = previousSubjects(identity, year);
      assert.equal(codes.length, 8);
      expected.set(blockId, { currentCode, previousCode, curriculum, codes });
      for (const [index, code] of codes.entries()) {
        rows.curriculum_subjects.push({
          curriculum_code: curriculum, subject_code: code,
          year_level_number: year - 1, semester: "Second Semester",
        });
        if (!knownSubjects.has(code)) {
          rows.subjects.push({ code, name: `Subject ${code}` });
          knownSubjects.add(code);
        }
        rows.project_simulated_academic_results.push({
          id: uuid(`grade:${studentId}:${code}`), student_id: studentId,
          term_id: PRIOR, curriculum_code: curriculum, subject_code: code,
          grade_value: 2, result_status: "COMPLETED",
          source_metadata: { ...PROJECT_SOURCE },
        });

        const legacy = currentCode === "BSIT-2A";
        const instructorId = uuid(`faculty:${currentCode}:${code}`);
        const instructorName = legacy ? LEGACY_PROFESSORS[index] :
          `Project Faculty ${currentCode} ${index + 1}`;
        rows.instructors.push({
          id: instructorId, display_name: instructorName,
          app_user_id: null, is_synthetic_demo: true,
          synthetic_source_key: legacy
            ? `PROJECT_ONLY_BSIT1A_TERM2025_2:${code}`
            : `PHASE8_FICTIONAL_SCHEDULE_V1:FACULTY:${currentCode}:${code}`,
        });
        rows.project_historical_subject_instructors.push({
          id: uuid(`mapping:${currentCode}:${code}`),
          project_cohort_id: COHORT, target_block_id: blockId, prior_term_id: PRIOR,
          curriculum_code: curriculum, subject_code: code,
          previous_block_code: previousCode, instructor_id: instructorId,
          source_reference: legacy ? `PRESERVED_BSIT2A_SOURCE_${index + 1}` : GENERATED_REFERENCE,
          assignment_provenance: "PROJECT_FICTIONAL_ASSIGNMENT",
          verified_institutionally: false,
        });
      }
    }
  }
  return { rows, expected };
}

function mockCatalogClient(tables) {
  const reads = [];
  return {
    reads,
    from(table) {
      const eqs = [];
      const ins = [];
      const orders = [];
      return {
        select() { return this; },
        eq(key, value) { eqs.push([key, value]); return this; },
        in(key, values) { ins.push([key, values]); return this; },
        order(key) { orders.push(key); return this; },
        async range(from, to) {
          reads.push(table);
          let selected = tables[table] || [];
          for (const [key, value] of eqs) selected = selected.filter((row) => row[key] === value);
          for (const [key, values] of ins) selected = selected.filter((row) => values.includes(row[key]));
          selected = [...selected].sort((a, b) => {
            for (const key of orders) {
              const diff = String(a[key] ?? "").localeCompare(String(b[key] ?? ""));
              if (diff) return diff;
            }
            return 0;
          });
          return { data: selected.slice(from, to + 1), error: null };
        },
      };
    },
  };
}

test("42 continuing blocks resolve all 336 generated historical professor slots with no mappings outstanding", async () => {
  const { rows, expected } = makeFixture();
  assert.equal(expected.size, 42);
  assert.equal(rows.block_sections.length, 56, "14 first-year blocks have no historical grade import");
  assert.equal(rows.project_historical_subject_instructors.length, 336);
  assert.equal(rows.project_simulated_academic_results.length, 336);
  assert.equal(new Set(rows.project_historical_subject_instructors.map((item) =>
    `${item.target_block_id}:${item.subject_code}`)).size, 336);
  assert.ok(rows.project_historical_subject_instructors.every((item) =>
    item.project_cohort_id === COHORT && item.prior_term_id === PRIOR &&
    item.assignment_provenance === "PROJECT_FICTIONAL_ASSIGNMENT" &&
    item.verified_institutionally === false));
  assert.ok(rows.instructors.every((item) => item.is_synthetic_demo === true &&
    item.app_user_id === null && Boolean(item.synthetic_source_key)));

  const client = mockCatalogClient(rows);
  const catalog = await sandbox.readCatalog(client);
  assert.equal(catalog.length, 42);
  assert.ok(client.reads.includes("project_historical_subject_instructors"));
  for (const block of catalog) {
    const actual = expected.get(block.id);
    assert.ok(actual, `unexpected project block ${block.id}`);
    assert.equal(block.currentBlockCode, actual.currentCode);
    assert.equal(block.code, actual.previousCode,
      `historical grouping must be preserved for ${actual.currentCode}`);
    assert.equal(block.mappingRequired, false, `${actual.currentCode} has eight trusted professors`);
    assert.equal(block.termId, PRIOR);
    assert.equal(block.curriculumCode, actual.curriculum);
    assert.deepEqual(new Set(block.subjects.map((item) => item.code)), new Set(actual.codes));
    assert.equal(block.subjects.length, 8);
    assert.equal(block.roster.length, 1);
    assert.equal(block.roster[0].sectionCode, actual.previousCode);
    for (const subject of block.subjects) {
      assert.ok(subject.previousProfessor?.name, `${actual.currentCode}: ${subject.code} lacks professor`);
      assert.equal(subject.previousProfessor.provenance, "PROJECT_FICTIONAL_ASSIGNMENT");
      assert.equal(subject.expected.length, 1);
      assert.equal(subject.expected[0].canonicalResultStatus, "COMPLETED");
    }
  }
  assert.ok(catalog.every((block) => block.yearLevel >= 2),
    "no newly admitted first-year block is presented as a historical source");
});

test("established BSIT-2A eight mappings stay intact and BSCS-2C resolves its own BSCS-1C source", async () => {
  const { rows, expected } = makeFixture();
  const legacyBlock = [...expected.entries()].find(([, item]) => item.currentCode === "BSIT-2A");
  const csBlock = [...expected.entries()].find(([, item]) => item.currentCode === "BSCS-2C");
  assert.ok(legacyBlock && csBlock);
  const before = structuredClone(rows.project_historical_subject_instructors.filter((mapping) =>
    mapping.target_block_id === legacyBlock[0]));
  assert.equal(before.length, 8);
  assert.ok(before.every((item) => item.previous_block_code === "BSIT-1A" &&
    item.source_reference.startsWith("PRESERVED_BSIT2A_SOURCE_")));
  assert.ok(rows.project_historical_subject_instructors.filter((item) =>
    item.target_block_id === csBlock[0]).every((item) =>
    item.previous_block_code === "BSCS-1C" && item.source_reference === GENERATED_REFERENCE));

  const catalog = await sandbox.readCatalog(mockCatalogClient(rows));
  const it = catalog.find((item) => item.id === legacyBlock[0]);
  const cs = catalog.find((item) => item.id === csBlock[0]);
  assert.equal(it.code, "BSIT-1A");
  assert.deepEqual(Array.from(it.subjects, (item) => item.previousProfessor.name), LEGACY_PROFESSORS);
  assert.equal(it.mappingRequired, false);
  assert.equal(cs.currentBlockCode, "BSCS-2C");
  assert.equal(cs.code, "BSCS-1C");
  assert.equal(cs.mappingRequired, false);
  assert.ok(cs.subjects.every((item) => item.previousProfessor.name.startsWith("Project Faculty BSCS-2C")));
  assert.deepEqual(rows.project_historical_subject_instructors.filter((mapping) =>
    mapping.target_block_id === legacyBlock[0]), before,
  "catalog consultation does not alter the eight preserved BSIT-2A professor IDs or source references");
});

test("generated faculty must remain fictional and mapping provenance conflicts fail closed", async () => {
  const { rows, expected } = makeFixture();
  const targetBlock = [...expected.entries()].find(([, item]) => item.currentCode === "BSCS-2C")[0];
  const mapping = rows.project_historical_subject_instructors.find((item) =>
    item.target_block_id === targetBlock);
  const professor = rows.instructors.find((item) => item.id === mapping.instructor_id);
  professor.app_user_id = uuid("real-faculty-account");
  let catalog = await sandbox.readCatalog(mockCatalogClient(rows));
  const affected = catalog.find((item) => item.id === targetBlock);
  assert.equal(affected.mappingRequired, true);
  assert.equal(affected.subjects.find((item) => item.code === mapping.subject_code).previousProfessor, null);
  assert.ok(catalog.filter((item) => item.id !== targetBlock).every((item) =>
    item.mappingRequired === false), "one bad professor cannot affect another project block");

  professor.app_user_id = null;
  mapping.assignment_provenance = "UNVERIFIED_SOURCE";
  catalog = await sandbox.readCatalog(mockCatalogClient(rows));
  assert.equal(catalog.find((item) => item.id === targetBlock).mappingRequired, true);
  mapping.assignment_provenance = "PROJECT_FICTIONAL_ASSIGNMENT";
  mapping.verified_institutionally = true;
  await assert.rejects(sandbox.readCatalog(mockCatalogClient(rows)),
    /historical instructor mappings do not match/);
  mapping.verified_institutionally = false;
  mapping.previous_block_code = "BSCS-1A";
  await assert.rejects(sandbox.readCatalog(mockCatalogClient(rows)),
    /historical instructor mappings disagree on previous block/);
});

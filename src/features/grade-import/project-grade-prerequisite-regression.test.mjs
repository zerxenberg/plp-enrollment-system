import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { parse } from "@babel/parser";
import { evaluateAcademicReadiness, summarizeProjectTransferDecisions } from "../students/published-grade-readiness.mjs";

// Live baseline (read-only verified 2026-10-26): student 25-50004 has an
// APPROVED fictional FAILED Computer Programming 2, but no accepted project
// history. The generated eligibility snapshot still calls its current term
// dependent ELIGIBLE. Only acceptance-ledger evidence may change readiness.
const STUDENT = "f36200cd-6d88-4af9-b072-e19acc312fbf";
const CURRICULUM = "P8F26-BSIT-V1";
const COHORT = "PLP_PROJECT_600_2026_1";
const PREVIOUS_TERM = "TERM-2025-2";
const CURRENT_TERM = "TERM-2026-1";
const PREREQUISITE = "P8F26-BSIT-T02-M1"; // Computer Programming 2
const DEPENDENT = "P8F26-BSIT-T03-M1"; // Data Structures and Algorithms for IT
const UNRELATED = "P8F26-BSIT-T03-M2";
const HISTORICAL_CODES = [
  PREREQUISITE,
  "P8F26-BSIT-T02-M2",
  "P8F26-BSIT-T02-M3",
  "P8F26-BSIT-T02-M4",
  "P8F26-BSIT-T02-M5",
  "P8F26-GE-T02-1",
  "P8F26-GE-T02-2",
  "P8F26-GE-T02-3",
];

const source = readFileSync(new URL("../students/student-published-readiness-server.js", import.meta.url), "utf8");
const ast = parse(source, { sourceType: "module" });
function productionFunction(name) {
  const node = ast.program.body.find((item) =>
    item.type === "ExportNamedDeclaration" && item.declaration?.id?.name === name)?.declaration;
  assert.ok(node?.async, `Production ${name} must be an async exported server function`);
  return source.slice(node.start, node.end);
}
const sandbox = {
  PROJECT_COHORT: COHORT,
  PROJECT_PREVIOUS_TERM: PREVIOUS_TERM,
  PROJECT_CURRENT_TERM: CURRENT_TERM,
  evaluateAcademicReadiness,
  summarizeProjectTransferDecisions,
  loadValidatedProjectTransferDecisions: async () => [],
};
runInNewContext(`
  ${productionFunction("loadAcceptedProjectGradeResults")}
  ${productionFunction("loadStudentPublishedReadiness")}
  this.loadAccepted = loadAcceptedProjectGradeResults;
  this.loadReadiness = loadStudentPublishedReadiness;
`, sandbox);

function historicalRows({ failedPrerequisite = true } = {}) {
  return HISTORICAL_CODES.map((subject_code, i) => ({
    id: `historical-${i + 1}`,
    student_id: STUDENT,
    term_id: PREVIOUS_TERM,
    curriculum_code: CURRICULUM,
    subject_code,
    grade_value: subject_code === PREREQUISITE && failedPrerequisite ? 5 : 2,
    result_status: subject_code === PREREQUISITE && failedPrerequisite ? "FAILED" : "COMPLETED",
    academic_units: 3,
    source_metadata: {
      origin: "GENERATED_PROJECT", cohort_key: COHORT,
      official_academic_record: false, verified_institutionally: false,
    },
  }));
}

function projectAcceptanceRows(results) {
  return results.map((row) => ({
    result_id: row.id,
    student_id: STUDENT,
    term_id: row.term_id,
    curriculum_code: CURRICULUM,
    subject_code: row.subject_code,
    accepted_at: "2026-10-26T00:00:00+00:00",
    source_kind: "PROJECT_IMPORT_MATCHED",
    batch_id: "verified-block-batch",
  }));
}

function mockDatabase({
  canonical = historicalRows(),
  accepted = [],
  acceptanceError = null,
  prerequisites = [{ subject_code: DEPENDENT, prerequisite_subject_code: PREREQUISITE }],
} = {}) {
  const visited = [];
  const rows = {
    enrollments: [],
    academic_results: [],
    transfer_credit_evaluations: [],
    subject_prerequisites: prerequisites,
    project_simulated_academic_results: canonical,
    project_grade_result_acceptances: accepted,
    project_enrollment_academic_policy: { maximum_unresolved_failed_subjects: 3 },
  };
  function from(table) {
    const request = { table, columns: "", equals: [], in: [] };
    visited.push(request);
    const query = {
      select(value) { request.columns = value; return query; },
      eq(name, value) { request.equals.push([name, value]); return query; },
      neq() { return query; },
      not() { return query; },
      in(name, value) { request.in.push([name, value]); return query; },
      order() { return query; },
      limit() { return query; },
      maybeSingle() { return Promise.resolve(response()); },
      then(resolve, reject) { return Promise.resolve(response()).then(resolve, reject); },
    };
    function response() {
      if (table === "project_grade_result_acceptances" && acceptanceError) {
        return { data: null, error: acceptanceError };
      }
      let data = rows[table] ?? [];
      if (table === "project_simulated_academic_results") {
        const idFilter = request.in.find(([key]) => key === "id");
        if (idFilter) data = data.filter((row) => idFilter[1].includes(row.id));
        else data = data.filter((row) => row.term_id === PREVIOUS_TERM);
      }
      if (Array.isArray(data)) {
        for (const [field, value] of request.equals) {
          data = data.filter((row) => !(field in row) || row[field] === value);
        }
      }
      return { data, error: null };
    }
    return query;
  }
  return { admin: { from }, visited };
}

async function readiness(options = {}) {
  const db = mockDatabase(options);
  const result = await sandbox.loadReadiness({
    admin: db.admin, studentId: STUDENT, studentType: "CONTINUING_STUDENT",
  }, CURRENT_TERM, CURRICULUM, new Set([DEPENDENT, UNRELATED]));
  return { result, visited: db.visited };
}

test("APPLIED fictional grade without a published acceptance never satisfies previous-semester readiness", async () => {
  const { result, visited } = await readiness();
  assert.equal(result.readiness.ready, false);
  assert.equal(result.readiness.classification, "PENDING_EVALUATION");
  assert.equal(result.acceptedProjectResults.length, 0);
  assert.notEqual(result.subjectDecisions.get(DEPENDENT)?.eligibility, "ELIGIBLE");
  assert.equal(visited.filter((query) => query.table === "project_simulated_academic_results").length, 1,
    "unaccepted canonical history may identify required subjects, but must not be re-read as accepted grades");
  assert.equal(visited.some((query) => query.table === "project_subject_eligibility"), false,
    "student readiness must not trust the generated project eligibility snapshot");
});

test("after full Registrar publication, FAILED Computer Programming 2 blocks Data Structures but not unrelated subjects", async () => {
  const canonical = historicalRows({ failedPrerequisite: true });
  const { result } = await readiness({ canonical, accepted: projectAcceptanceRows(canonical) });
  assert.equal(result.readiness.ready, true);
  assert.equal(result.readiness.classification, "IRREGULAR");
  assert.ok(result.readiness.failed.includes(PREREQUISITE));
  assert.equal(result.acceptedProjectResults.length, HISTORICAL_CODES.length);
  assert.equal(result.subjectDecisions.get(DEPENDENT)?.eligibility, "RESTRICTED");
  assert.match(result.subjectDecisions.get(DEPENDENT)?.reason, /accepted passing result/i);
  assert.equal(result.subjectDecisions.get(UNRELATED)?.eligibility, "ELIGIBLE");
});

test("a properly published passing Computer Programming 2 may satisfy the precise dependent prerequisite", async () => {
  const canonical = historicalRows({ failedPrerequisite: false });
  const { result } = await readiness({ canonical, accepted: projectAcceptanceRows(canonical) });
  assert.equal(result.readiness.ready, true);
  assert.equal(result.readiness.classification, "REGULAR");
  assert.equal(result.subjectDecisions.get(DEPENDENT)?.eligibility, "ELIGIBLE");
});

test("missing, denied or malformed acceptance ledger fails closed rather than trusting approved canonical grades", async () => {
  for (const error of [
    { code: "42P01", message: "table missing" },
    { code: "PGRST205", message: "REST relation missing" },
  ]) {
    const { result } = await readiness({ acceptanceError: error });
    assert.equal(result.readiness.ready, false);
    assert.notEqual(result.subjectDecisions.get(DEPENDENT)?.eligibility, "ELIGIBLE");
  }
  for (const error of [{ code: "42501" }, { code: "PGRST999" }]) {
    await assert.rejects(readiness({ acceptanceError: error }), /Accepted project academic evidence cannot be verified/);
  }
  const canonical = historicalRows();
  const accepted = projectAcceptanceRows(canonical);
  accepted[0].term_id = "UNEXPECTED-TERM";
  await assert.rejects(readiness({ canonical, accepted }), /Accepted project academic provenance/);
});

test("accepted source must match signed-in student, curriculum, status, and generated-project provenance", async () => {
  const canonical = historicalRows();
  const accepted = projectAcceptanceRows(canonical);
  for (const alteration of [
    (rows) => { rows[0].student_id = "another-student"; },
    (rows) => { rows[0].curriculum_code = "UNRELATED-CURRICULUM"; },
    (rows) => { rows[0].source_metadata.cohort_key = "OTHER-COHORT"; },
    (rows) => { rows[0].source_metadata.official_academic_record = true; },
    (rows) => { rows[0].source_metadata.verified_institutionally = true; },
  ]) {
    const mutated = structuredClone(canonical);
    alteration(mutated);
    await assert.rejects(readiness({ canonical: mutated, accepted }),
      /Accepted project academic provenance|could not be reconciled/);
  }
});

test("enrollment server recalculates signed-in student decisions rather than trusting stale eligibility snapshot", () => {
  const enrollmentSource = readFileSync(new URL("../students/student-enrollment-server.js", import.meta.url), "utf8");
  const actionSource = readFileSync(new URL("../students/student-portal-actions.js", import.meta.url), "utf8");
  const enrollmentAST = parse(enrollmentSource, { sourceType: "module" });
  const loader = enrollmentAST.program.body.find((node) =>
    node.type === "ExportNamedDeclaration" && node.declaration.id?.name === "loadStudentEnrollmentForPage");
  assert.ok(loader, "protected student enrollment loader is present");
  assert.match(enrollmentSource, /await\s+loadStudentPublishedReadiness\s*\(/,
    "all displayed eligibility should come from fresh accepted/published evidence");
  assert.match(enrollmentSource, /subjectDecisions/,
    "current-term subject decisions derive from the evidence read");
  assert.doesNotMatch(enrollmentSource, /\.from\s*\(\s*["']project_subject_eligibility["']\s*\)/,
    "generated eligibility snapshots must never be the authoritative student UI decision");
  const registration = actionSource.indexOf('"project_phase8_register_prepared_subjects_v1"');
  const submission = actionSource.indexOf('p_action: "SUBMIT"');
  assert.ok(registration >= 0 && submission > registration,
    "normal student action requires revalidation by register RPC before SUBMIT");
  assert.match(actionSource, /registered\?\.error\s*\|\|\s*saved\?\.simulation_id/,
    "failed/rejected protected register RPC must block SUBMIT");
});

test("a stale prepared subject rejected by the registration RPC never reaches SUBMIT", async () => {
  const source = readFileSync(new URL("../students/student-portal-actions.js", import.meta.url), "utf8");
  const actionAST = parse(source, { sourceType: "module" });
  const node = actionAST.program.body.find((item) =>
    item.type === "ExportNamedDeclaration" &&
    item.declaration?.id?.name === "submitPreparedProjectEnrollment")?.declaration;
  assert.ok(node, "production student enrollment submit action exists");
  const events = [];
  const studentContext = {
    studentId: STUDENT,
    client: {
      rpc: async (name, args) => {
        events.push({ name, args });
        if (name === "project_phase8_student_portal_status_v1") {
          return { data: {
            project_only: true, verified_institutionally: false,
            curriculum_is_official: false, curriculum_code: CURRICULUM,
            simulation: { id: "existing-draft", term_id: CURRENT_TERM, status: "DRAFT" },
          } };
        }
        if (name === "project_phase8_register_prepared_subjects_v1") {
          return { error: { code: "23514", message: "The selected subject has an unmet prerequisite" } };
        }
        throw new Error(`Unexpected mutating RPC ${name}`);
      },
    },
  };
  const sandbox = {
    assertCanSubmitProjectEnrollment: async () => ({
      context: studentContext,
      proposedSubjects: [{ code: DEPENDENT }],
      termId: CURRENT_TERM,
      curriculumCode: CURRICULUM,
    }),
  };
  runInNewContext(`${source.slice(node.start, node.end)}\nthis.submit = submitPreparedProjectEnrollment;`, sandbox);
  await assert.rejects(sandbox.submit(),
    /prepared subjects could not be registered/i,
    "SQL's live prerequisite rejection must not be swallowed");
  assert.deepEqual(events.map(({ name }) => name), [
    "project_phase8_student_portal_status_v1",
    "project_phase8_register_prepared_subjects_v1",
  ], "SUBMIT must not execute after a stale-eligibility prerequisite rejection");
  assert.deepEqual([...events[1].args.p_subject_codes], [DEPENDENT]);
});

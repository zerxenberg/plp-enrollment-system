import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { parse } from "@babel/parser";

const source = readFileSync(new URL("./registrar-queries.js", import.meta.url), "utf8");
const ast = parse(source, { sourceType: "module" });
const declaration = ast.program.body.find((node) =>
  node.type === "ExportNamedDeclaration" &&
  node.declaration?.id?.name === "getRegistrarStudentRecordDetail")?.declaration;
assert.ok(declaration, "Registrar student detail loader exists");

const COHORT = "PLP_PROJECT_600_2026_1";
const TERM = "TERM-2026-1";
const STUDENT_ID = "student-1";
const ACCOUNT_ID = "account-1";

function queryClient(tables, reads) {
  return {
    from(table) {
      const conditions = [];
      return {
        select(columns) { reads.push({ table, columns }); return this; },
        eq(field, value) { conditions.push((record) => record[field] === value); return this; },
        order() { return this; },
        limit() { return this; },
        result() {
          const data = (tables[table] || []).filter((record) => conditions.every((matches) => matches(record)));
          return { data, error: null };
        },
        single() { return Promise.resolve({ data: this.result().data[0] || null, error: null }); },
        maybeSingle() { return this.single(); },
        then(resolve, reject) { return Promise.resolve(this.result()).then(resolve, reject); },
      };
    },
  };
}

function harness({ sex = "Male", project = true, accountOverride = {}, profileOverride = {}, deny = false } = {}) {
  const reads = [];
  const events = [];
  const fullName = "Juan Miguel Antonio Santos Jr.";
  const student = {
    id: STUDENT_ID, user_id: ACCOUNT_ID, student_number: "26-50001",
    record_kind: "PROJECT_ONLY", project_cohort_id: COHORT, is_synthetic_demo: true,
    ...profileOverride,
  };
  const account = {
    id: ACCOUNT_ID, full_name: fullName, sex, role_code: "student",
    project_cohort_id: COHORT, is_synthetic_demo: true, ...accountOverride,
  };
  const admin = queryClient({ student_profiles: [student], app_users: [account] }, reads);
  const ordinary = queryClient({
    student_profiles: [{ ...student, student_status: "ACTIVE" }],
    enrollments: [], academic_results: [], admission_handoffs: [],
  }, reads);
  ordinary.rpc = async (functionName, args) => {
    events.push(functionName);
    assert.equal(functionName, "project_phase8_student_snapshot_v2");
    assert.equal(args.p_student_id, STUDENT_ID);
    return { data: { student_number: student.student_number, student_name: fullName,
      project_only: true, verified_institutionally: false,
      data_origin: "GENERATED_PROJECT", term_id: TERM }, error: null };
  };
  const load = runInNewContext(`(${source.slice(declaration.start, declaration.end)})`, {
    requireRole: async (role) => {
      events.push(`requireRole:${role}`);
      if (deny) throw new Error("Unauthorized Registrar request");
    },
    createClient: async () => { events.push("createClient"); return ordinary; },
    createAdminClient: () => { events.push("createAdminClient"); return admin; },
    assertQuery: (error) => { if (error) throw error; },
    formatDateTime: (value) => value,
    PROJECT_COHORT_ID: COHORT,
    PROJECT_TERM_ID: TERM,
  });
  return { load: () => load(STUDENT_ID, project), reads, events };
}

test("Registrar project student detail reads trusted suffix-preserving full_name and Male sex", async () => {
  const { load, reads } = harness();
  const result = await load();
  assert.equal(result.source, "PROJECT_ONLY");
  assert.equal(result.profile.full_name, "Juan Miguel Antonio Santos Jr.");
  assert.equal(result.profile.sex, "Male");
  assert.ok(reads.some((query) => query.table === "app_users" &&
    query.columns.includes("sex") && query.columns.includes("full_name")));
});

test("Registrar accepts Female and null without guessing from student names", async () => {
  for (const sex of ["Female", null]) {
    const result = await harness({ sex }).load();
    assert.equal(result.profile.sex, sex);
    assert.equal(result.profile.full_name, "Juan Miguel Antonio Santos Jr.");
  }
});

test("Registrar institutional student detail reads sex from its linked account", async () => {
  const result = await harness({ sex: "Female", project: false }).load();
  assert.equal(result.source, "INSTITUTIONAL");
  assert.equal(result.profile.sex, "Female");
  assert.equal(result.profile.full_name, "Juan Miguel Antonio Santos Jr.");
});

test("Registrar project student detail refuses unverified account identity", async () => {
  await assert.rejects(harness({ accountOverride: { project_cohort_id: "another-cohort" } }).load(),
    /account identity is inconsistent/);
  await assert.rejects(harness({ profileOverride: { user_id: "another-user" } }).load(),
    /account identity is inconsistent/);
});

test("Registrar role check runs before privileged student detail reads", async () => {
  const { load, events, reads } = harness({ deny: true });
  await assert.rejects(load(), /Unauthorized Registrar request/);
  assert.deepEqual(events, ["requireRole:registrar"]);
  assert.equal(reads.length, 0);
});

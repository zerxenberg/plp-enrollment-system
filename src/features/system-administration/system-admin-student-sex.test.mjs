import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { parse } from "@babel/parser";

const source = readFileSync(new URL("./system-admin-queries.js", import.meta.url), "utf8");
const ast = parse(source, { sourceType: "module" });
const declaration = ast.program.body.find((node) =>
  node.type === "ExportNamedDeclaration" &&
  node.declaration?.id?.name === "getUsersAccessData")?.declaration;
assert.ok(declaration, "System Administrator accounts loader exists");

test("System Administrator account projection preserves canonical suffix and nullable sex", async () => {
  const calls = [];
  const tables = {
    app_users: [
      { id: "account-student", role_code: "student", full_name: "Juan Miguel Santos Jr.",
        sex: "Male", project_cohort_id: "PLP_PROJECT_600_2026_1", is_synthetic_demo: true },
      { id: "account-student-2", role_code: "student", full_name: "Maria Luisa Reyes",
        sex: null, project_cohort_id: "PLP_PROJECT_600_2026_1", is_synthetic_demo: true },
    ],
    student_profiles: [
      { id: "student-1", user_id: "account-student", student_number: "26-50001", program_code: "BSIT" },
      { id: "student-2", user_id: "account-student-2", student_number: "26-50002", program_code: "BSIT" },
    ],
    programs: [{ code: "BSIT", name: "Information Technology", organizational_unit_code: "CCS" }],
    organizational_units: [{ code: "CCS", name: "College of Computer Studies" }],
    roles: [{ code: "student", name: "Student" }],
  };
  const client = {
    from(table) {
      const filters = [];
      return {
        select(columns) { calls.push({ table, columns }); return this; },
        or() { return this; },
        in(field, values) { filters.push((row) => values.includes(row[field])); return this; },
        eq(field, value) { filters.push((row) => row[field] === value); return this; },
        order() { return this; },
        limit() { return this; },
        then(resolve, reject) {
          return Promise.resolve({ data: (tables[table] || [])
            .filter((row) => filters.every((filter) => filter(row))), error: null })
            .then(resolve, reject);
        },
      };
    },
  };
  const load = runInNewContext(`(${source.slice(declaration.start, declaration.end)})`, {
    createClient: async () => client,
    createAdminClient: () => client,
    currentAccountScope: (query) => query,
    CURRENT_PROJECT_COHORT_ID: "PLP_PROJECT_600_2026_1",
    CURRENT_TERM_ID: "TERM-2026-1",
    assertQuery: (error) => { if (error) throw error; },
    formatDateTime: (value) => value || "Not recorded",
  });
  const result = await load();
  assert.equal(result.users.length, 2);
  assert.equal(result.users[0].fullName, "Juan Miguel Santos Jr.");
  assert.equal(result.users[0].sex, "Male");
  assert.equal(result.users[0].student.student_number, "26-50001");
  assert.equal(result.users[1].sex, null);
  assert.ok(calls.some((call) => call.table === "app_users" &&
    call.columns.includes("full_name,sex,email")));
  const ui = readFileSync(new URL("../../components/system-administrator/SystemAdministratorUsersAccess.js", import.meta.url), "utf8");
  assert.match(ui, /\["Sex", selectedUser\.sex \?\? "Not available"\]/);
});

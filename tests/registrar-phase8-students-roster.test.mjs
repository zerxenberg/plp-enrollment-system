import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const { loadBindings, transform } = require("next/dist/build/swc");
await loadBindings();
const source = readFileSync(new URL(
  "../src/features/registrar/registrar-queries.js", import.meta.url,
), "utf8");
const compiled = await transform(source, {
  filename: "registrar-queries.js",
  jsc: { parser: { syntax: "ecmascript" }, target: "es2022" },
  module: { type: "commonjs" },
});

const cohort = "PLP_PROJECT_600_2026_1";
const term = "TERM-2026-1";
const generatedBlock = {
  id: "generated", term_id: term, code: "BSIT-1A",
  program_code: "BSIT", curriculum_code: "P8F26-BSIT-V1",
  year_level: 1, section_letter: "A", capacity: 40,
  planning_status: "PUBLISHED", is_synthetic_demo: true,
  synthetic_source_key: "PHASE8_PROJECT_2026:BSIT-1A",
};
const manualBlock = {
  ...generatedBlock, id: "manual", code: "BSIT-1M",
  section_letter: "M", planning_status: "DRAFT",
  is_synthetic_demo: false, synthetic_source_key: null,
};
const profiles = ["generated", "manual"].map((id, index) => ({
  id: `student-${id}`, user_id: `user-${id}`,
  student_number: `26-5000${index + 1}`,
  student_type: "CONTINUING_STUDENT", student_status: "ACTIVE",
  record_kind: "PROJECT_ONLY", project_cohort_id: cohort,
  is_synthetic_demo: true,
}));

function mockClient({ rejectManualRoster = false, repeatStudent = false, unknownSex = false } = {}) {
  const tables = {
    student_profiles: profiles,
    block_sections: [generatedBlock, manualBlock],
    academic_terms: [{ id: term, label: "First Semester" }],
    curricula: [{ code: "P8F26-BSIT-V1", program_code: "BSIT" }],
    enrollments: [],
    programs: [{ code: "BSIT", name: "Information Technology", organizational_unit_code: "IT" }],
    organizational_units: [{ code: "IT", name: "Information Technology College" }],
  };
  return {
    from(table) {
      const filters = [];
      const result = () => {
        const data = (tables[table] || []).filter((row) => filters.every((match) => match(row)));
        return { data, error: null };
      };
      return {
        select() { return this; },
        eq(field, value) { filters.push((row) => row[field] === value); return this; },
        in(field, values) { filters.push((row) => values.includes(row[field])); return this; },
        like(field, value) {
          filters.push((row) => String(row[field] || "").startsWith(value.replace(/%$/, "")));
          return this;
        },
        or(expression) {
          assert.equal(table, "block_sections");
          assert.match(expression, /and\(is_synthetic_demo\.eq\.true,synthetic_source_key\.like\.PHASE8_PROJECT_2026:\*\)/);
          assert.match(expression, /and\(is_synthetic_demo\.eq\.false,synthetic_source_key\.is\.null\)/);
          filters.push((row) => (
            (row.is_synthetic_demo === true && row.synthetic_source_key?.startsWith("PHASE8_PROJECT_2026:")) ||
            (row.is_synthetic_demo === false && row.synthetic_source_key === null)
          ));
          return this;
        },
        order() { return this; },
        maybeSingle() {
          const { data } = result();
          return Promise.resolve({ data: data[0] || null, error: null });
        },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
    },
    rpc(name, { p_block_id } = {}) {
      assert.equal(name, "project_phase8_block_roster_v1");
      if (p_block_id === "manual" && rejectManualRoster) {
        return Promise.resolve({ data: null, error: { code: "42501", message: "Denied" } });
      }
      const profile = profiles[p_block_id === "manual" && !repeatStudent ? 1 : 0];
      return Promise.resolve({
        error: null,
        data: {
          fictional_only: true, block_id: p_block_id,
          students: [{
            student_id: profile.id, student_number: profile.student_number,
            full_name: p_block_id === "generated" ? "Fictional Student Jr." : "Fictional Student",
            sex: unknownSex ? null : p_block_id === "generated" ? "Male" : "Female",
            year_level: 1,
            academic_classification: "REGULAR",
            enrollment_status: "NOT_CONFIRMED",
          }],
        },
      });
    },
  };
}

function getLoader(client) {
  const mod = { exports: {} };
  vm.runInNewContext(compiled.code, {
    module: mod, exports: mod.exports,
    console: { error() {} },
    require(name) {
      if (name === "server-only") return {};
      if (name === "@/lib/supabase/server") return { createClient: async () => client };
      if (name === "@/lib/supabase/admin") return { createAdminClient: () => {
        throw new Error("This roster test must not use privileged account reads");
      } };
      if (name === "@/lib/auth/require-role") return { requireRole: async (role) => {
        assert.equal(role, "registrar");
      } };
      if (name === "@/features/students/student-published-readiness-server") return {};
      if (name === "./registrar-project-enrollment-view.mjs") return {};
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  return mod.exports.getRegistrarStudentsData;
}

test("Registrar Students includes a student transferred into a manual Phase 8 draft block", async () => {
  const result = await getLoader(mockClient())();
  assert.equal(result.students.length, 2);
  assert.equal(result.groups.length, 2);
  assert.equal(result.groups.find((block) => block.blockSection === "BSIT-1M")?.assignedStudents, 1);
  assert.equal(result.students.find((student) => student.home_block === "BSIT-1M")?.student_number, "26-50002");
  assert.equal(result.students.find((student) => student.home_block === "BSIT-1M")?.sex, "Female");
  assert.equal(result.students.find((student) => student.home_block === "BSIT-1A")?.sex, "Male");
  assert.equal(result.students.find((student) => student.home_block === "BSIT-1A")?.full_name, "Fictional Student Jr.");
});

test("Registrar Phase 8 roster preserves unknown sex as NULL", async () => {
  const result = await getLoader(mockClient({ unknownSex: true }))();
  assert.equal(result.students.length, 2);
  assert.ok(result.students.every((student) => student.sex === null));
});

test("Registrar Students rejects a denied manual roster or duplicate student membership", async () => {
  await assert.rejects(getLoader(mockClient({ rejectManualRoster: true }))());
  await assert.rejects(getLoader(mockClient({ repeatStudent: true }))(),
    /roster and cohort profiles are inconsistent/);
});

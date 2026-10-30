import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { parse } from "@babel/parser";

const source = readFileSync(new URL("./live-institutional-enrollment-actions.js", import.meta.url), "utf8");
const ast = parse(source, { sourceType: "module" });

function action(name, mocks) {
  const node = ast.program.body.find((item) =>
    item.type === "ExportNamedDeclaration" && item.declaration?.id?.name === name);
  assert.ok(node, `Server action ${name} must exist`);
  return runInNewContext(`(${source.slice(node.declaration.start, node.declaration.end)})`, {
    blocked: (message) => ({ ok: false, message }),
    ...mocks,
  });
}

const valid = {
  kind: "ready",
  academic: { isOfficialCurriculum: true },
  student: { status: "ADMITTED", curriculum: "BSIT-2026-APPROVED" },
  term: { id: "TERM-2026-1" },
  enrollment: { canPrepare: true, subjects: [{
    code: "REAL101", active: true, sectionReady: true, sectionId: "section-1",
    eligibility: "PENDING_EVALUATION",
  }] },
};

test("a project-only identity cannot invoke institutional academic mutations", async () => {
  const prepare = action("prepareInstitutionalAcademicAssignment", {
    getStudentContext: async () => ({ kind: "project" }),
    createAdminClient: () => { throw Error("unauthorized admin access"); },
  });
  assert.equal((await prepare()).ok, false);
});

test("a fictional curriculum never invokes the institutional placement RPC", async () => {
  const prepare = action("prepareInstitutionalAcademicAssignment", {
    getStudentContext: async () => ({ kind: "live", studentId: "student-1" }),
    loadLiveInstitutionalEnrollmentForPage: async () => ({
      ...valid, academic: { isOfficialCurriculum: false },
    }),
    createAdminClient: () => { throw Error("fictional records must never enter mutation"); },
  });
  assert.equal((await prepare()).ok, false);
});

test("readiness drives one guarded placement before student-owned section selection", async () => {
  const calls = [];
  const prepare = action("prepareInstitutionalAcademicAssignment", {
    getStudentContext: async () => ({ kind: "live", studentId: "student-1" }),
    loadLiveInstitutionalEnrollmentForPage: async () => {
      calls.push("load");
      return calls.filter((c) => c === "load").length === 1 ? valid : {
        ...valid, student: { ...valid.student, status: "ACTIVE" },
        enrollment: { ...valid.enrollment, subjects: valid.enrollment.subjects.map((s) => ({
          ...s, eligibility: "ELIGIBLE",
        })) },
      };
    },
    createAdminClient: () => ({
      rpc: async (name, input) => {
        calls.push(`rpc:${name}:${input.p_student_id}`);
        return { data: {
          prepared: true, term_id: valid.term.id,
          curriculum_code: valid.student.curriculum,
        }, error: null };
      },
    }),
    openStudentEnrollment: async (term) => {
      calls.push(`open:${term}`);
      return { enrollmentId: "enrollment-1" };
    },
    selectStudentEnrollmentSubject: async (...args) => {
      calls.push(`select:${args.join(":")}`);
      return { selected: true };
    },
    revalidatePath: () => {},
  });
  assert.equal((await prepare()).ok, true);
  assert.deepEqual(calls, [
    "load",
    "rpc:system_prepare_verified_admissions_student_v1:student-1",
    "load",
    "open:TERM-2026-1",
    "select:enrollment-1:REAL101:section-1",
  ]);
});

test("student submission fails closed without genuine approved academic records", async () => {
  const submit = action("submitInstitutionalEnrollment", {
    getStudentContext: async () => ({ kind: "live", studentId: "student-1" }),
    loadLiveInstitutionalEnrollmentForPage: async () => ({
      ...valid, academic: { isOfficialCurriculum: false },
    }),
    submitStudentEnrollment: async () => { throw Error("must not submit"); },
  });
  assert.equal((await submit()).ok, false);
});

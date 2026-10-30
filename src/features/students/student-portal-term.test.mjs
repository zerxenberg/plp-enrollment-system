import assert from "node:assert/strict";
import test from "node:test";
import { admissionsStudentHeaderTerm } from "./student-portal-term.mjs";

const databaseTerm = {
  short_label: "1st Sem 2026",
  enrollment_start: "2026-10-01",
  enrollment_end: "2026-11-30",
};

test("Admissions students share Registrar's actual enrollment period and display format", () => {
  assert.deepEqual(admissionsStudentHeaderTerm(databaseTerm), {
    shortLabel: "1st Sem 2026",
    enrollmentStart: "Oct 1, 2026",
    enrollmentEnd: "Nov 30, 2026",
    isDemonstration: false,
  });
});

test("updated term dates and label remain sourced from the database", () => {
  const result = admissionsStudentHeaderTerm({
    short_label: "2nd Sem 2027",
    enrollment_start: "2027-01-18",
    enrollment_end: "2027-02-12",
  });
  assert.equal(result.shortLabel, "2nd Sem 2027");
  assert.equal(result.enrollmentStart, "Jan 18, 2027");
  assert.equal(result.enrollmentEnd, "Feb 12, 2027");
});

test("missing, invalid or reversed period data never fabricates enrollment dates", () => {
  assert.equal(admissionsStudentHeaderTerm(null), null);
  assert.equal(admissionsStudentHeaderTerm({ ...databaseTerm, short_label: "" }), null);
  assert.equal(admissionsStudentHeaderTerm({ ...databaseTerm, enrollment_start: null }), null);
  assert.equal(admissionsStudentHeaderTerm({ ...databaseTerm, enrollment_end: "2026-02-30" }), null);
  assert.equal(admissionsStudentHeaderTerm({ ...databaseTerm, enrollment_end: "2026-09-30" }), null);
});

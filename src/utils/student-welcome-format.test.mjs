import assert from "node:assert/strict";
import test from "node:test";
import {
  formatStudentType,
  formatStudentWelcomeDetails,
  formatStudentYearLevel,
} from "./student-welcome-format.mjs";

test("all four year levels use readable ordinal labels across numeric and project values", () => {
  for (const [value, label] of [[1, "1st Year"], [2, "2nd Year"], [3, "3rd Year"], [4, "4th Year"]]) {
    assert.equal(formatStudentYearLevel(value), label);
    assert.equal(formatStudentYearLevel(String(value)), label);
    assert.equal(formatStudentYearLevel(`Year ${value}`), label);
    assert.equal(formatStudentYearLevel(label), label);
  }
});

test("student types display names without changing stored status codes", () => {
  assert.equal(formatStudentType("NEW_STUDENT"), "Freshman");
  assert.equal(formatStudentType("TRANSFEREE"), "Transferee");
  assert.equal(formatStudentType("CONTINUING_STUDENT"), "Continuing Student");
  assert.equal(formatStudentType("UNVERIFIED"), "Student");
});

test("Manggi uses his own Freshman number, program and verified year", () => {
  const profile = { number: "26-50604", program: "BSIT", yearLevel: 1, type: "NEW_STUDENT" };
  assert.equal(formatStudentWelcomeDetails(profile), "26-50604 · BSIT · 1st Year · Freshman");
  assert.equal(profile.type, "NEW_STUDENT");
});

test("evaluated Transferees and Phase 8 Continuing Students use the same banner format", () => {
  assert.equal(formatStudentWelcomeDetails({ number: "26-50603", program: "BSIT",
    yearLevel: 2, type: "TRANSFEREE" }), "26-50603 · BSIT · 2nd Year · Transferee");
  assert.equal(formatStudentWelcomeDetails({ number: "25-50001", program: "BSIT",
    yearLevel: "2nd Year", type: "CONTINUING_STUDENT" }),
  "25-50001 · BSIT · 2nd Year · Continuing Student");
});

test("missing or invalid year level is never fabricated, especially for pending Transferees", () => {
  assert.equal(formatStudentYearLevel(null), null);
  assert.equal(formatStudentYearLevel("unknown"), null);
  assert.equal(formatStudentYearLevel(5), null);
  assert.equal(formatStudentWelcomeDetails({ number: "26-50603", program: "BSIT",
    yearLevel: null, type: "TRANSFEREE" }), "26-50603 · BSIT · Transferee");
});

import assert from "node:assert/strict";
import test from "node:test";
import { formatStudentName } from "./student-name.mjs";

test("preserves the complete first, middle and last names", () => {
  assert.equal(formatStudentName({
    firstName: "Juan", middleName: "Miguel Antonio", lastName: "Dela Cruz",
  }), "Juan Miguel Antonio Dela Cruz");
});

test("appends the optional Jr. suffix to structured names exactly once", () => {
  assert.equal(formatStudentName({
    firstName: "Juan", middleName: "Miguel Antonio", lastName: "Dela Cruz", suffix: "Jr",
  }), "Juan Miguel Antonio Dela Cruz Jr.");
  assert.equal(formatStudentName({
    firstName: "Juan", middleName: "Miguel Antonio", lastName: "Dela Cruz Jr.", suffix: "Jr.",
  }), "Juan Miguel Antonio Dela Cruz Jr.");
});

test("preserves existing canonical full names and their original middle names", () => {
  const fullName = "Maria Isabel Beatriz Santos";
  assert.equal(formatStudentName({ fullName }), fullName);
  assert.equal(formatStudentName({
    fullName,
    firstName: "Different", middleName: "Initial", lastName: "Identity",
  }), fullName);
});

test("does not duplicate an existing Jr. suffix in canonical full_name", () => {
  assert.equal(formatStudentName({ fullName: "Juan Miguel Santos Jr.", suffix: "Jr." }),
    "Juan Miguel Santos Jr.");
  assert.equal(formatStudentName({ fullName: "Juan Miguel Santos, Jr", suffix: "jr" }),
    "Juan Miguel Santos, Jr");
  assert.equal(formatStudentName({ fullName: "Juan Miguel Santos", suffix: "Jr." }),
    "Juan Miguel Santos Jr.");
});

test("supports other recognized suffixes without shortening middle names", () => {
  for (const [suffix, expected] of [
    ["Sr", "Sr."], ["sr.", "Sr."], ["ii", "II"], ["III", "III"], ["iv", "IV"],
  ]) {
    assert.equal(formatStudentName({ firstName: "Juan", middleName: "Miguel Antonio",
      lastName: "Santos", suffix }), `Juan Miguel Antonio Santos ${expected}`);
  }
});

test("never appends a duplicate or conflicting recognized suffix", () => {
  assert.equal(formatStudentName({ fullName: "Juan Miguel Santos Sr.", suffix: "sr" }),
    "Juan Miguel Santos Sr.");
  assert.equal(formatStudentName({ fullName: "Juan Miguel Santos III", suffix: "III" }),
    "Juan Miguel Santos III");
  assert.equal(formatStudentName({ fullName: "Juan Miguel Santos II", suffix: "IV" }),
    "Juan Miguel Santos II");
});

test("supports names without middle names and incomplete legacy name data", () => {
  assert.equal(formatStudentName({ firstName: "Ana", lastName: "Reyes" }), "Ana Reyes");
  assert.equal(formatStudentName({ fullName: "   ", firstName: "Ana", lastName: "Reyes" }),
    "Ana Reyes");
  assert.equal(formatStudentName({}), "");
  assert.equal(formatStudentName(), "");
});

test("ignores unrecognized suffixes and does not rewrite legacy names", () => {
  assert.equal(formatStudentName({ fullName: "Ana  Maria Reyes", suffix: "MD" }),
    "Ana  Maria Reyes");
});

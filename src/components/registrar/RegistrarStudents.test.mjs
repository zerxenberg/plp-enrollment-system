import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const component = readFileSync(new URL("./RegistrarStudents.js", import.meta.url), "utf8");
const admittedPanel = component.match(/\{tab === "admissions" \? \([\s\S]*?columns=\{\[([\s\S]*?)\]\}/)?.[1];

test("Registrar Admitted Students renders all ten independent institutional fields", () => {
  assert.ok(admittedPanel, "Expected an Admitted Students table");
  const keys = [...admittedPanel.matchAll(/\{ key: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(keys, [
    "student_number", "full_name", "student_type", "program_code", "year_level",
    "assigned_block", "admission_status", "demonstration_review_status",
    "official_enrollment_status", "account_status",
  ]);
  assert.match(component, /rows=\{studentsData\.admittedStudents \|\| \[\]\}/);
});

test("missing assignments and statuses remain explicit rather than implying confirmation", () => {
  assert.match(admittedPanel, /yearLabel\(row\.year_level\)/);
  assert.match(admittedPanel, /row\.assigned_block \|\| "Not assigned"/);
  for (const status of ["admission_status", "demonstration_review_status", "official_enrollment_status", "account_status"]) {
    assert.match(admittedPanel, new RegExp(`statusCell\\(row\\.${status}\\)`));
  }
  assert.match(component, /value === null \|\| value === undefined \|\| value === ""/);
  assert.match(component, /value === "NOT_CONFIRMED" \? "unknown" : value/,
    "Not confirmed must use a neutral badge instead of confirmed styling");
});

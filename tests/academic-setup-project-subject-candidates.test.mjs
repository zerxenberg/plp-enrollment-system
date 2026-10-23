import assert from "node:assert/strict";
import test from "node:test";
import {
  indexLiveAcademicSubjects, liveSubjectCandidates,
} from "../src/features/academic/academic-setup-normalized.js";

test("official curriculum picker excludes project-only subjects without hiding catalog details", () => {
  const subjects = [
    { code: "PLP101", name: "Official Subject", status: "Active" },
    { code: "P8F26-101", name: "Fictional Subject", status: "Active", isProjectOnly: true },
    { code: "PLP102", name: "Already Assigned", status: "Active" },
    { code: "PLP103", name: "Inactive Subject", status: "Inactive" },
  ];
  const curricula = [{
    id: "P8F26-SIM", version: "P8F26 Draft", program: "BSIT", isProjectOnly: true,
    assignments: [{ subjectCode: "P8F26-101", yearLevel: "1st Year", semester: "First Semester", prerequisites: [] }],
  }];
  const catalog = indexLiveAcademicSubjects(subjects, curricula, [{ code: "BSIT", department: "CCS" }]);
  assert.equal(catalog.length, subjects.length);
  assert.equal(catalog.find((subject) => subject.code === "P8F26-101").isProjectOnly, true);
  assert.equal(catalog.find((subject) => subject.code === "P8F26-101").livePlacements.length, 1);
  const selected = [{ subjectCode: "PLP102" }];
  assert.deepEqual(liveSubjectCandidates(catalog, selected, "", "BSIT").map((subject) => subject.code), ["PLP101"]);
  assert.deepEqual(liveSubjectCandidates(catalog, selected, "P8F26", "BSIT"), []);
});

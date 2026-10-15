// Counts the active built-in academic planning demonstration fixtures.
// Run from the project root with: node scripts/report-block-planning-demo.mjs
import { readFileSync } from "node:fs";
import { buildMockAcademicReferences } from "../src/features/academic/academic-reference.js";
import { buildBlockPlanningSeed } from "../src/features/block-planning/block-planning-seed.js";

const catalog = JSON.parse(readFileSync(new URL("../src/data/mock/catalog.json", import.meta.url), "utf8"));
const master = buildMockAcademicReferences(catalog.subjects, catalog.programs);
const demo = buildBlockPlanningSeed(master, master.curricula);
const current = demo.terms.find((item) => item.status === "CURRENT")?.id;
const payload = {
  colleges: demo.colleges.length,
  degreePrograms: demo.programs.length,
  tracks: demo.curricula.length,
  academicTerms: demo.terms.length,
  blockSections: demo.blockSections.length,
  currentTermSections: demo.blockSections.filter((item) => item.termId === current).length,
  students: demo.students.length,
  proposedStudentAssignments: demo.assignments.filter((item) => item.status === "PROPOSED").length,
  confirmedStudentAssignments: demo.assignments.filter((item) => item.status === "CONFIRMED").length,
  professors: demo.professors.length,
  rooms: demo.rooms.length,
  subjectClasses: demo.subjectClasses.length,
  classMeetings: demo.classMeetings.length,
  publishedBlockSchedules: demo.blockSections.filter((item) => item.status === "PUBLISHED").length,
  draftBlockSchedules: demo.blockSections.filter((item) => item.status === "DRAFT").length,
};
console.log(JSON.stringify(payload, null, 2));

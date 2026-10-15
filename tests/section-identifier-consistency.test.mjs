import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (name) => JSON.parse(readFileSync(path.join(root, "src", "data", "mock", name), "utf8"));
const catalog = fixture("catalog.json");
const registrar = fixture("registrar.json");
const student = fixture("student.json");
const validBlockCode = /^[A-Z][A-Z0-9]*-[1-4][A-Z]$/;

test("active catalog subject offerings have canonical block labels and stable unique IDs", () => {
  assert.equal(new Set(catalog.sections.map((section) => section.id)).size, catalog.sections.length);
  catalog.sections.forEach((section) => {
    assert.match(section.section, validBlockCode, `catalog subject class ${section.id}`);
    assert.ok(catalog.subjects.some((subject) => subject.code === section.subjectCode));
    assert.ok(Number(section.capacity) > 0);
  });
});

test("registrar section references and submitted enrollment subjects use canonical labels", () => {
  assert.equal(new Set(registrar.sections.map((section) => section.code)).size, registrar.sections.length);
  registrar.sections.forEach((section) => assert.match(section.code, validBlockCode));
  registrar.enrollments.forEach((enrollment) => {
    enrollment.subjects.forEach((subject) => assert.match(subject.section, validBlockCode, enrollment.reference));
  });
});

test("student subject selections keep valid offering foreign keys", () => {
  Object.entries(student.enrollment.selectedSections).forEach(([subjectCode, selectedId]) => {
    const offering = catalog.sections.find((section) => section.id === selectedId);
    assert.ok(offering, `missing offering ${selectedId}`);
    assert.equal(offering.subjectCode, subjectCode);
  });
  student.confirmedSchedule.items.forEach((meeting) => assert.match(meeting.section, validBlockCode));
});

test("room names are distinct from block labels and preserved as room references", () => {
  const roomNames = catalog.sections.map((item) => item.room);
  assert.ok(roomNames.some((room) => /\b(?:CTC|AB)\s+\d{3}\b/.test(room)), "demo classroom names remain available");
});

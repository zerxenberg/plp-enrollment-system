import test from "node:test";
import assert from "node:assert/strict";
import { buildMockAcademicReferences } from "./academic-reference.js";
import { transitionCurriculumVersion } from "./curriculum-lifecycle.js";

const catalog = buildMockAcademicReferences();
const first = catalog.curricula.find((record) => record.program === "BSIT");
const otherTrack = catalog.curricula.find((record) => record.program === "BSED" && record.major === "English");
const options = (id, action) => ({ id, action, actor: "Academic Coordinator", dateTime: "Oct 13, 2026", eventId: "TEST" });
const nextVersion = (status = "Inactive") => ({ ...structuredClone(first), id: "CUR-BSIT-NEW", version: "BSIT Curriculum 2027", status });
const dataWith = (...versions) => ({ curricula: versions, history: [] });
const apply = (data, id, action) => transitionCurriculumVersion(data, catalog, options(id, action));

test("activates a valid Draft when there is no current Active version", () => {
  const draft = nextVersion("Draft");
  const result = apply(dataWith(draft), draft.id, "activate");
  assert.equal(result.ok, true);
  assert.equal(result.record.status, "Active");
  assert.equal(result.events.length, 1);
  assert.equal(draft.status, "Draft");
});

test("switches active curricula in one snapshot and records both events", () => {
  const old = structuredClone(first);
  const replacement = nextVersion();
  const data = dataWith(old, replacement, structuredClone(otherTrack));
  const result = apply(data, replacement.id, "activate");
  assert.equal(result.ok, true);
  assert.equal(result.next.curricula.find((item) => item.id === old.id).status, "Inactive");
  assert.equal(result.next.curricula.find((item) => item.id === replacement.id).status, "Active");
  assert.equal(result.next.curricula.find((item) => item.id === otherTrack.id).status, otherTrack.status);
  assert.equal(result.next.curricula.filter((item) => item.program === old.program && !item.major && item.status === "Active").length, 1);
  assert.deepEqual(result.next.curricula.find((item) => item.id === old.id).assignments, old.assignments);
  assert.deepEqual(result.next.curricula.find((item) => item.id === replacement.id).assignments, replacement.assignments);
  assert.deepEqual(data.curricula, [old, replacement, otherTrack]);
  assert.deepEqual(result.events.map((event) => event.action), ["Curriculum automatically deactivated", "Curriculum activated"]);
  assert.deepEqual(result.events.map((event) => event.record), [old.version, replacement.version]);
});

test("invalid Draft validation prevents any status changes", () => {
  const invalid = { ...nextVersion("Draft"), assignments: [] };
  const data = dataWith(structuredClone(first), invalid);
  const result = apply(data, invalid.id, "activate");
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("must include at least one")));
  assert.equal(data.curricula[0].status, "Active");
  assert.equal(data.curricula[1].status, "Draft");
  assert.equal(data.history.length, 0);
});

test("inactive curricula must pass current validation on reactivation", () => {
  const invalid = { ...nextVersion(), assignments: [] };
  assert.equal(apply(dataWith(invalid), invalid.id, "activate").ok, false);
  assert.equal(apply(dataWith(nextVersion()), "CUR-BSIT-NEW", "activate").ok, true);
});

test("manual deactivation allows temporarily having no active curriculum", () => {
  const result = apply(dataWith(structuredClone(first)), first.id, "deactivate");
  assert.equal(result.ok, true);
  assert.equal(result.record.status, "Inactive");
  assert.equal(result.events[0].previousStatus, "Active");
});

test("only Inactive versions can be archived, and Restore returns to Inactive", () => {
  const active = structuredClone(first);
  const initial = dataWith(active, nextVersion());
  assert.equal(apply(initial, first.id, "archive").ok, false);
  const archived = apply(initial, "CUR-BSIT-NEW", "archive");
  assert.equal(archived.ok, true);
  assert.equal(archived.record.status, "Archived");
  assert.equal(apply(archived.next, "CUR-BSIT-NEW", "activate").ok, false);
  const restored = apply(archived.next, "CUR-BSIT-NEW", "restore");
  assert.equal(restored.ok, true);
  assert.equal(restored.record.status, "Inactive");
  assert.equal(restored.next.curricula.find((item) => item.id === first.id).status, "Active");
  assert.deepEqual(restored.record.assignments, archived.record.assignments);
});

test("same program specializations keep independent active versions", () => {
  const mathematics = structuredClone(catalog.curricula.find((record) => record.program === "BSED" && record.major === "Mathematics"));
  const english = structuredClone(otherTrack);
  const mathReplacement = { ...structuredClone(mathematics), id: "CUR-MATH-NEW", status: "Inactive" };
  const result = apply(dataWith(mathematics, english, mathReplacement), mathReplacement.id, "activate");
  assert.equal(result.ok, true);
  assert.equal(result.next.curricula.find((item) => item.id === mathematics.id).status, "Inactive");
  assert.equal(result.next.curricula.find((item) => item.id === english.id).status, "Active");
});

test("preexisting duplicate Active versions block switching without mutation", () => {
  const conflicting = { ...structuredClone(first), id: "CUR-DUPLICATE", version: "BSIT Duplicate" };
  const data = dataWith(structuredClone(first), conflicting, nextVersion());
  const result = apply(data, "CUR-BSIT-NEW", "activate");
  assert.equal(result.ok, false);
  assert.deepEqual(data.history, []);
  assert.equal(data.curricula.filter((item) => item.status === "Active").length, 2);
});

test("unknown curriculum and invalid action never change state", () => {
  const data = dataWith(structuredClone(first));
  assert.equal(apply(data, "MISSING", "activate").ok, false);
  assert.equal(apply(data, first.id, "unrecognized").ok, false);
  assert.deepEqual(data.history, []);
});

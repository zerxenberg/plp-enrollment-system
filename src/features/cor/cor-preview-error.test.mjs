import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const preview = readFileSync(
  new URL("../../components/cor/CorDocumentPreview.js", import.meta.url), "utf8");
const studentRoute = readFileSync(
  new URL("../../app/api/student/project-cor/route.js", import.meta.url), "utf8");
const registrarRoute = readFileSync(
  new URL("../../app/api/registrar/project-cor/[simulationId]/route.js", import.meta.url), "utf8");

test("both project COR routes report session mismatches instead of disguising redirects as missing documents", () => {
  for (const source of [studentRoute, registrarRoute]) {
    assert.match(source, /NEXT_REDIRECT;/);
    assert.match(source, /SESSION_ROLE/);
    assert.match(source, /status: roleMismatch \? 401 : 422/);
    assert.match(source, /verifiedCorResponse/);
    assert.match(source, /Cache-Control.*private, no-store/);
  }
});

test("shared COR preview verifies PDF before embedding it and never displays raw JSON in an iframe", () => {
  assert.match(preview, /credentials: "same-origin"/);
  assert.match(preview, /response\.headers\.get\("content-type"\).*application\/pdf/);
  assert.match(preview, /blob\.slice\(0, 5\)\.text\(\) !== "%PDF-"/);
  assert.match(preview, /URL\.createObjectURL\(blob\)/);
  assert.match(preview, /URL\.revokeObjectURL\(objectUrl\)/);
  assert.match(preview, /role="alert"/);
  assert.match(preview, /Download PDF/);
  assert.doesNotMatch(preview, /src=\{\s*documentUrl/);
});

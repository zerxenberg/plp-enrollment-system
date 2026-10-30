import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const route = readFileSync(new URL(
  "../../app/api/registrar/admissions-demo-cor/[enrollmentId]/route.js", import.meta.url), "utf8");
const component = readFileSync(new URL(
  "../../components/registrar/RegistrarEnrollment.js", import.meta.url), "utf8");

test("Admissions demo COR PDF is Registrar authorized and uses the verified shared PDF document", () => {
  const authorize = route.indexOf('await requireRole("registrar")');
  const loadAdmin = route.indexOf("createAdminClient()");
  assert.ok(authorize >= 0 && authorize < loadAdmin);
  assert.match(route, /admissionsDemoCorDocument\(createAdminClient\(\), enrollmentId\)/);
  assert.match(route, /verifiedCorResponse\(request, document\)/);
  assert.match(route, /status: roleMismatch \? 401 : 422/);
  assert.match(route, /Cache-Control": "private, no-store"/);
  assert.doesNotMatch(route, /getStudentContext|officialCorDocument|registrarProjectCorDocument/);
});

test("Registrar history only exposes the Admissions demonstration preview for confirmed ledger records", () => {
  assert.match(component, /selectedCase\.status === "CONFIRMED_SIMULATION" &&\s*selectedCase\.confirmed_at && selectedCase\.admissions_ledger_id/);
  assert.match(component, /setAdmissionsDemoCorId\(selectedCase\.admissions_ledger_id\)/);
  assert.match(component, /\/api\/registrar\/admissions-demo-cor\/\$\{encodeURIComponent\(admissionsDemoCorId\)\}/);
  assert.match(component, /<CorDocumentPreview[\s\S]*?project[\s\S]*?onClose=\{\(\) => setAdmissionsDemoCorId\(null\)\}/);
  assert.match(component, /displaySubjectCode\(row\.code \|\| row\.subject_code\)/);
});

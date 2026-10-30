import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAcademicReadiness } from "../src/features/students/published-grade-readiness.mjs";
const codes = ["A","B","C","D","E","F","G"];
const scenario = (failureCount, publishedCount = 7) =>
  evaluateAcademicReadiness({ studentType:"CONTINUING_STUDENT", requiredSubjectCodes: codes,
    publishedRows: codes.slice(0,publishedCount).map((code,index) => ({
      subject_code:code, result_status:index < failureCount ? "FAILED" : "COMPLETED" })) });
test("normal passing history becomes regular", () => {
  assert.deepEqual([scenario(0).ready,scenario(0).classification],[true,"REGULAR"]);
});
test("one through three distinct failed subjects remain eligible and irregular", () => {
  for (const count of [1,2,3]) {
    assert.equal(scenario(count).ready,true);
    assert.equal(scenario(count).classification,"IRREGULAR");
    assert.equal(scenario(count).failed.length,count);
  }
});
test("four failed subject requirements prevent enrollment", () => {
  assert.equal(scenario(4).ready,false);
});
test("incomplete or missing grade publications do not imply passing", () => {
  assert.equal(scenario(0,6).classification,"PENDING_EVALUATION");
  const incomplete = evaluateAcademicReadiness({studentType:"CONTINUING_STUDENT",
    requiredSubjectCodes:["A"], publishedRows:[{subject_code:"A",result_status:"INCOMPLETE"}]});
  assert.equal(incomplete.ready,true);
  assert.equal(incomplete.classification,"IRREGULAR");
  assert.deepEqual(incomplete.incomplete,["A"]);
});
test("new students need no previous PLP grade publication", () => {
  assert.equal(evaluateAcademicReadiness({studentType:"NEW_STUDENT"}).ready,true);
});
test("transferees require an approved evaluation before enrolling", () => {
  assert.equal(evaluateAcademicReadiness({studentType:"TRANSFEREE"}).ready,false);
  assert.equal(evaluateAcademicReadiness({studentType:"TRANSFEREE",approvedCredits:["BSIT101"]}).ready,true);
});

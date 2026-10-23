import assert from "node:assert/strict";
import test from "node:test";
import {
  mapAdmissionsApplicantType,
  mapAdmissionsProgram,
  normalizeAdmissionsHandoffPayload,
  normalizeAdmissionsSchoolYear,
} from "../src/features/integration/admissions-handoff-policy.mjs";

test("school year maps to Enrollment AY and 26 prefix", () => {
  assert.deepEqual(normalizeAdmissionsSchoolYear("2026-2027"), {
    source:"2026-2027", enrollment:"2026 to 2027", studentNumberPrefix:"26",
  });
});
test("applicant types map safely", () => {
  assert.equal(mapAdmissionsApplicantType("freshman").studentType,"NEW_STUDENT");
  assert.equal(mapAdmissionsApplicantType("transferee").studentType,"TRANSFEREE");
  assert.equal(mapAdmissionsApplicantType("foreign").status,"review");
});
test("program mappings are explicit", () => {
  assert.equal(mapAdmissionsProgram("BS Information Technology").curriculumCode,"P8F26-BSIT-V1");
  assert.equal(mapAdmissionsProgram("BS Entrepreneurship").trackCode,"BSBAENT");
  assert.equal(mapAdmissionsProgram("AB Psychology").programCode,"BSP");
  assert.equal(mapAdmissionsProgram("BSED English").trackCode,"BSEDENG");
  assert.equal(mapAdmissionsProgram("Unknown Degree").status,"review");
});
test("only released accepted confirmed applicants are eligible", () => {
  const base={
    applicant_id:101,user_id:201,applicant_type:"freshman",
    course_applied:"BS Information Technology",school_year:"2026-2027",
    first_name:"Juan",last_name:"Dela Cruz",email:"juan@example.edu.ph",
    overall_status:"released",admission_result:"accepted",
    enrollment_intent:"confirmed",released_at:"2026-10-24T01:00:00+08:00",
  };
  const eligible=normalizeAdmissionsHandoffPayload(base);
  assert.equal(eligible.eligible,true);
  assert.equal(eligible.applicantReference,"ADMISSIONS:2026-2027:101");
  assert.equal(normalizeAdmissionsHandoffPayload({...base,enrollment_intent:"declined"}).eligible,false);
});

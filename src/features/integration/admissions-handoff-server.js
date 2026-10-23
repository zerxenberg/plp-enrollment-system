import "server-only";

import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeAdmissionsHandoffPayload } from "./admissions-handoff-policy.mjs";

const SOURCE_SYSTEM = "PLP Admissions";
const ENDPOINT_PATH = "/api/integration/admissions/handoff";

function safeSummary(value, limit = 500) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
function reference(prefix) {
  return `${prefix}-${crypto.randomUUID().replaceAll("-", "").toUpperCase()}`;
}
export function hasValidAdmissionsApiKey(request) {
  const configured = process.env.PLP_ADMISSIONS_API_KEY;
  const supplied = request.headers.get("x-plp-admissions-key") || "";
  if (!configured || configured.length < 32 || !supplied) return false;
  const expected = Buffer.from(configured);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
async function recordRequest(admin, values) {
  const { data, error } = await admin.from("integration_requests").insert(values).select("id").single();
  if (error || !data?.id) throw new Error(`Integration request could not be recorded: ${error?.message || "unknown error"}`);
  return data.id;
}
async function updateRequest(admin, id, values) {
  const { error } = await admin.from("integration_requests").update(values).eq("id", id);
  if (error) console.error("[Admissions Integration][Request Log][ERROR]", { integrationRequestId:id, message:error.message });
}
async function recordReviewEvent(admin, { integrationRequestId, applicantReference, reason }) {
  const { error } = await admin.from("synchronization_events").insert({
    sync_reference: reference("ADM-SYNC"),
    integration_request_id: integrationRequestId,
    applicant_reference: applicantReference,
    direction: "ADMISSIONS_TO_ENROLLMENT",
    status: "Requires Review",
    result: safeSummary(reason),
    attempt_number: 1,
  });
  if (error) console.error("[Admissions Integration][Review Event][ERROR]", { applicantReference, message:error.message });
}
async function resolveCurrentTerm(admin, academicYear) {
  const { data, error } = await admin.from("academic_terms")
    .select("id,label,academic_year,semester,status,enrollment_start,enrollment_end")
    .eq("academic_year", academicYear).eq("status","Open")
    .order("enrollment_start",{ascending:false,nullsFirst:false}).limit(2);
  if (error) throw new Error(`Academic term lookup failed: ${error.message}`);
  if (!data?.length) throw new Error(`No open Enrollment academic term exists for ${academicYear}.`);
  if (data.length > 1) throw new Error(`More than one open Enrollment academic term exists for ${academicYear}.`);
  return data[0];
}
async function verifyAcademicMapping(admin, normalized, term) {
  const [programResult,curriculumResult]=await Promise.all([
    admin.from("programs").select("code,name,status").eq("code",normalized.programCode).maybeSingle(),
    admin.from("curricula").select("code,program_code,program_track_code,status,effective_academic_year")
      .eq("code",normalized.curriculumCode).maybeSingle(),
  ]);
  if(programResult.error||!programResult.data||String(programResult.data.status).toLowerCase()!=="active")
    throw new Error(`Mapped program ${normalized.programCode} is not active in Enrollment.`);
  const curriculum=curriculumResult.data;
  if(curriculumResult.error||!curriculum||String(curriculum.status).toLowerCase()!=="active"||
      curriculum.program_code!==normalized.programCode||
      curriculum.effective_academic_year!==normalized.schoolYear.enrollment||
      (normalized.trackCode||null)!==(curriculum.program_track_code||null))
    throw new Error(`Mapped curriculum ${normalized.curriculumCode} is not valid for this admission.`);
  if(term.academic_year!==normalized.schoolYear.enrollment)
    throw new Error("Admissions school year does not match the active Enrollment term.");
}
export async function processAdmissionsHandoff(payload) {
  const started=Date.now();
  const admin=createAdminClient();
  let normalized, requestId=null;
  const requestReference=reference("ADM-HANDOFF");
  try {
    normalized=normalizeAdmissionsHandoffPayload(payload);
    requestId=await recordRequest(admin,{
      request_reference:requestReference,
      request_type:"Admission Handoff",
      source_system:SOURCE_SYSTEM,
      endpoint_path:ENDPOINT_PATH,
      external_reference:normalized.applicantReference,
      status:"Processing",
      request_summary:`Admissions applicant ${normalized.applicantReference}`,
    });
    if(!normalized.eligible){
      const responseCode=normalized.reviewRequired?202:409;
      const status=normalized.reviewRequired?"Requires Review":"Not Eligible";
      await updateRequest(admin,requestId,{
        response_code:responseCode,status,processing_time_ms:Date.now()-started,response_summary:normalized.reviewReason,
      });
      if(normalized.reviewRequired) await recordReviewEvent(admin,{
        integrationRequestId:requestId, applicantReference:normalized.applicantReference, reason:normalized.reviewReason,
      });
      return {ok:false,httpStatus:responseCode,status,applicantReference:normalized.applicantReference,message:normalized.reviewReason};
    }
    const term=await resolveCurrentTerm(admin,normalized.schoolYear.enrollment);
    await verifyAcademicMapping(admin,normalized,term);
    const {data,error}=await admin.rpc("integration_provision_admission_student_v1",{
      p_applicant_reference:normalized.applicantReference,
      p_external_user_reference:normalized.externalUserReference,
      p_student_number_prefix:normalized.schoolYear.studentNumberPrefix,
      p_student_type:normalized.studentType,
      p_full_name:normalized.fullName,
      p_first_name:normalized.firstName,
      p_middle_name:normalized.middleName,
      p_last_name:normalized.lastName,
      p_email:normalized.email,
      p_contact_number:normalized.phone,
      p_address:normalized.address,
      p_program_code:normalized.programCode,
      p_curriculum_code:normalized.curriculumCode,
      p_term_id:term.id,
      p_admission_date:normalized.admissionDate,
      p_source_name:SOURCE_SYSTEM,
      p_integration_request_id:requestId,
    });
    if(error) throw new Error(error.message||"Enrollment provisioning was rejected.");
    const result=data&&typeof data==="object"?data:{};
    await updateRequest(admin,requestId,{
      response_code:200,status:"Successful",processing_time_ms:Date.now()-started,
      response_summary:result.created
        ? `Enrollment student ${result.student_number} was preprovisioned.`
        : `Enrollment student ${result.student_number} was synchronized.`,
    });
    return {
      ok:true,httpStatus:200,status:result.created?"CREATED":"UPDATED",
      applicantReference:normalized.applicantReference,studentNumber:result.student_number||null,
      studentStatus:result.student_status||null,accountReadyForAuth:result.auth_user_id==null,
      term:term.label,message:result.created
        ?"Admissions student was created in the Enrollment System."
        :"Admissions student was synchronized with the existing Enrollment record.",
    };
  } catch(error) {
    const message=error instanceof Error?error.message:"Unexpected admission synchronization error.";
    console.error("[Admissions Integration][Handoff][ERROR]",{
      applicantReference:normalized?.applicantReference||null,integrationRequestId:requestId,message,
    });
    if(requestId){
      await updateRequest(admin,requestId,{
        response_code:422,status:"Failed",processing_time_ms:Date.now()-started,response_summary:safeSummary(message),
      });
      if(normalized?.applicantReference) await recordReviewEvent(admin,{
        integrationRequestId:requestId,applicantReference:normalized.applicantReference,reason:message,
      });
    }
    return {
      ok:false,httpStatus:422,status:"FAILED",applicantReference:normalized?.applicantReference||null,
      message:"The admission handoff could not be synchronized. Review the System Integration record for details.",
    };
  }
}

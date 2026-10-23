"use server";

import { revalidatePath } from "next/cache";
import { requireProjectStudentContext, requireStudentContext } from "./student-context-server";
import { assertCanSubmitProjectEnrollment } from "./student-enrollment-server";
import { estimateProjectSnapshotSelection, selectedProjectSnapshotSubjects } from "./project-fee-estimate.mjs";
import { loadVerifiedProjectSubjectPrices } from "./project-fee-prices-server";
import {
  openStudentEnrollment,
  selectStudentEnrollmentSubject,
  submitStudentEnrollment,
} from "./official-enrollment-actions";

function refreshStudentViews() {
  for (const path of [
    "/student/dashboard","/student/enrollment","/student/class-schedule",
    "/student/academic-records","/student/student-profile",
  ]) revalidatePath(path);
}
function uuid(value) {
  return typeof value==="string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value:null;
}
function subjectCode(value) {
  return typeof value==="string" && /^[A-Za-z0-9 .:_/-]{1,80}$/.test(value)?value:null;
}

export async function submitPreparedProjectEnrollment() {
  const context=await assertCanSubmitProjectEnrollment();
  const previous=await context.client.rpc("project_phase8_student_portal_status_v1",{p_student_id:context.studentId});
  if(previous.error||previous.data?.project_only!==true||previous.data?.verified_institutionally!==false)
    throw new Error("Could not verify current enrollment status.");

  if(!previous.data.simulation){
    const opened=await context.client.rpc("project_phase8_simulated_enrollment_action_v1",{
      p_student_id:context.studentId,p_action:"OPEN",p_reason:null,
    });
    if(opened.error) throw new Error("Unable to prepare your enrollment at this time.");
  }
  const submitted=await context.client.rpc("project_phase8_simulated_enrollment_action_v1",{
    p_student_id:context.studentId,p_action:"SUBMIT",p_reason:null,
  });
  if(submitted.error||submitted.data?.status!=="SUBMITTED")
    throw new Error("Submission was not accepted. Refresh and review the current academic requirements.");
  refreshStudentViews();
  return {ok:true,status:"SUBMITTED",simulationOnly:true};
}

export async function getConfirmedProjectDemonstrationCor() {
  const context=await requireProjectStudentContext();
  const {data:status,error}=await context.client.rpc(
    "project_phase8_student_portal_status_v1",{p_student_id:context.studentId});
  const simulation=status?.simulation;
  if(error||status?.project_only!==true||status?.verified_institutionally!==false||
      status?.curriculum_is_official!==false||simulation?.status!=="CONFIRMED_SIMULATION")
    throw new Error("Registrar confirmation of the demonstration enrollment is required before viewing this registration document.");

  const result=await context.client.rpc("project_phase8_demonstration_cor_v1",{p_simulation_id:simulation.id});
  if(result.error||result.data?.simulation_only!==true||result.data.official!==false||
      result.data.student?.student_number!==context.studentNumber||
      result.data.student?.curriculum_code!==status.curriculum_code)
    throw new Error("The demonstration registration document could not be loaded.");

  const selected=selectedProjectSnapshotSubjects(result.data.student);
  const prices=await loadVerifiedProjectSubjectPrices(context.admin,status.curriculum_code,selected);
  const projectFeeEstimate=estimateProjectSnapshotSelection(result.data.student,prices);
  if(!projectFeeEstimate.subjectCount)
    throw new Error("No eligible scheduled subjects are available for this registration demonstration.");
  return {...result.data,projectFeeEstimate};
}

export async function startInstitutionalEnrollment() {
  const context=await requireStudentContext();
  if(context.kind!=="institutional"||!context.profile.current_term_id)
    return {ok:false,message:"Your institutional enrollment record is not ready."};
  try {
    const result=await openStudentEnrollment(context.profile.current_term_id);
    refreshStudentViews();
    return {ok:true,enrollmentId:result.enrollmentId,message:"Your enrollment workspace is ready."};
  } catch(error) {
    console.error("[Student Portal][Official Enrollment][OPEN][ERROR]",{message:error.message});
    return {ok:false,message:"Enrollment could not be started. Review the current requirements and try again."};
  }
}

export async function selectInstitutionalEnrollmentSubject(enrollmentId,code,sectionId) {
  const context=await requireStudentContext();
  const enrollment=uuid(enrollmentId),section=uuid(sectionId),subject=subjectCode(code);
  if(context.kind!=="institutional"||!enrollment||!section||!subject)
    return {ok:false,message:"The subject selection is invalid."};
  try {
    const result=await selectStudentEnrollmentSubject(enrollment,subject,section);
    if(!result.selected) throw new Error("Selection rejected");
    refreshStudentViews();
    return {ok:true,message:`${subject} was added to your enrollment.`};
  } catch(error) {
    console.error("[Student Portal][Official Enrollment][SELECT SUBJECT][ERROR]",{
      subject,message:error.message,
    });
    return {ok:false,message:"This class section could not be selected. Capacity, eligibility, or schedule conditions may have changed."};
  }
}

export async function submitInstitutionalEnrollment(enrollmentId) {
  const context=await requireStudentContext();
  const enrollment=uuid(enrollmentId);
  if(context.kind!=="institutional"||!enrollment)
    return {ok:false,message:"The enrollment record is invalid."};
  try {
    const result=await submitStudentEnrollment(enrollment);
    if(!result.submitted) throw new Error("Submission rejected");
    refreshStudentViews();
    return {ok:true,message:"Your enrollment was submitted for Registrar processing."};
  } catch(error) {
    console.error("[Student Portal][Official Enrollment][SUBMIT][ERROR]",{message:error.message});
    return {ok:false,message:"Your enrollment could not be submitted. Refresh the page and review your subject choices."};
  }
}

export async function getInstitutionalOfficialCor(enrollmentId) {
  const context=await requireStudentContext();
  const enrollment=uuid(enrollmentId);
  if(context.kind!=="institutional"||!enrollment)
    throw new Error("Official registration record is unavailable.");
  const {data,error}=await context.client.rpc("official_enrollment_cor_v1",{p_enrollment_id:enrollment});
  if(error||data?.official!==true||data?.student_number!==context.studentNumber){
    console.error("[Student Portal][Official COR][ERROR]",{
      message:error?.message||"COR ownership/status validation failed",
    });
    throw new Error("Your official registration record is not available yet.");
  }
  return data;
}

function validNotificationId(value) {
  return typeof value==="string" && /^[A-Za-z0-9][A-Za-z0-9:_./-]{0,127}$/.test(value);
}
export async function markStudentNotificationRead(notificationId,read=true) {
  if(!validNotificationId(notificationId)) return {ok:false,message:"Invalid notification."};
  const context=await requireStudentContext();
  const {data,error}=await context.client.from("user_notifications")
    .update({is_read:Boolean(read),read_at:read?new Date().toISOString():null})
    .eq("user_id",context.appUserId).eq("notification_id",notificationId)
    .select("notification_id");
  if(error||!data?.length) return {ok:false,message:"The notification could not be updated."};
  revalidatePath("/student/notifications"); revalidatePath("/student/dashboard");
  return {ok:true};
}
export async function markAllStudentNotificationsRead() {
  const context=await requireStudentContext();
  const {error}=await context.client.from("user_notifications")
    .update({is_read:true,read_at:new Date().toISOString()})
    .eq("user_id",context.appUserId).eq("is_read",false);
  if(error) return {ok:false,message:"Notifications could not be updated."};
  revalidatePath("/student/notifications"); revalidatePath("/student/dashboard");
  return {ok:true};
}

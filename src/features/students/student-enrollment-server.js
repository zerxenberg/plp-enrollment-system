import "server-only";

import { getStudentContext, requireProjectStudentContext } from "./student-context-server";
import { loadInstitutionalEnrollment } from "./institutional-student-server";
import { estimateProjectSelectedSubjects, selectedProjectSubjectCodes } from "./project-fee-estimate.mjs";
import { loadVerifiedProjectSubjectPrices } from "./project-fee-prices-server";

const TERM_ID = "TERM-2026-1";
const PROJECT_COHORT = "PLP_PROJECT_600_2026_1";

function manilaCalendarDate() {
  const parts=new Intl.DateTimeFormat("en-US",{
    timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit",
  }).formatToParts(new Date());
  const values=Object.fromEntries(parts.map((part)=>[part.type,part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function mapSchedule(meetings) {
  const bySubject=new Map();
  for(const item of meetings||[]) {
    if(!item.subject_code) continue;
    const list=bySubject.get(item.subject_code)||[];
    list.push({
      day:item.day,start:item.start_time,end:item.end_time,
      room:item.room||"To be announced",instructor:item.instructor||"To be announced",
      component:item.component||null,
    });
    bySubject.set(item.subject_code,list);
  }
  return bySubject;
}
function preparedSubjects(snapshot,sectionCodes) {
  const meetings=mapSchedule(snapshot.class_schedule);
  const subjects=(snapshot.subjects||[]).map((item)=>({
    code:item.subject_code,name:item.subject_name,units:item.academic_units,
    eligibility:item.eligibility||"RESTRICTED",reason:item.reason||null,
    section:sectionCodes.get(item.subject_code)||null,
    meetings:meetings.get(item.subject_code)||[],
  }));
  const eligible=subjects.filter((item)=>
    ["ELIGIBLE","RETAKE"].includes(item.eligibility)&&Boolean(item.section)&&item.meetings.length>0);
  return {subjects,eligible};
}
export function buildStudentEnrollmentSummary({
  context,snapshot,term,simulation,sectionCodes,correctionReason=null,
  demoWindow=null,priceRows,asOfDate=manilaCalendarDate(),
}) {
  const {subjects,eligible}=preparedSubjects(snapshot,sectionCodes);
  const projectFeeEstimate=estimateProjectSelectedSubjects(eligible,priceRows);
  const validDemoWindow=demoWindow?.project_cohort_id===PROJECT_COHORT &&
    demoWindow?.term_id===(term?.id||TERM_ID) &&
    demoWindow?.source_type==="PROJECT_ONLY_FICTIONAL" &&
    demoWindow?.verified_institutionally===false;
  const demoStart=validDemoWindow?demoWindow.start_date:null;
  const demoEnd=validDemoWindow?demoWindow.end_date:null;
  const termStart=demoStart&&demoEnd?demoStart:term?.enrollment_start||null;
  const termEnd=demoStart&&demoEnd?demoEnd:term?.enrollment_end||null;
  const today=asOfDate;
  const originalOpen=term?.status==="Open"&&Boolean(term?.enrollment_start&&term?.enrollment_end)&&
    today>=term.enrollment_start&&today<=term.enrollment_end;
  const demonstrationOpen=validDemoWindow&&demoWindow.status==="OPEN"&&Boolean(demoStart&&demoEnd)&&
    today>=demoStart&&today<=demoEnd;
  const windowOpen=validDemoWindow?demonstrationOpen:originalOpen;
  const ready=snapshot.schedule_validated_for_project===true&&eligible.length>0;
  const blockingReasons=[];
  if(!ready) blockingReasons.push("The prepared timetable or eligible subjects are not ready.");
  if(!windowOpen) blockingReasons.push("The configured enrollment period is not currently open.");
  const simulationStatus=simulation?.status||null;
  const canSubmit=ready&&windowOpen&&(simulationStatus===null||["DRAFT","RETURNED"].includes(simulationStatus));

  return {
    kind:"ready",mode:"project",
    student:{
      name:snapshot.student_name,number:snapshot.student_number||context.studentNumber,
      type:context.studentType,program:snapshot.program_code,track:snapshot.program_track_code,
      curriculum:snapshot.curriculum_code,yearLevel:snapshot.year_level,
      classification:snapshot.academic_classification,progression:snapshot.progression_status,
    },
    term:{
      id:term?.id||snapshot.term_id||TERM_ID,label:term?.label||snapshot.term_id||TERM_ID,
      academicYear:term?.academic_year||null,semester:term?.semester||null,
      enrollmentStart:termStart,enrollmentEnd:termEnd,
      status:validDemoWindow?(demoWindow.status==="OPEN"?"Open":"Closed"):term?.status||"Unknown",
      windowOpen,demonstrationWindow:validDemoWindow,
    },
    homeBlock:snapshot.home_block||null,homeBlockStatus:snapshot.block_planning_status||null,
    timetableReady:snapshot.schedule_validated_for_project===true,
    simulation:simulation?{
      id:simulation.id,status:simulation.status,submittedAt:simulation.submitted_at,
      confirmedAt:simulation.confirmed_at,
      correctionReason:simulation.status==="RETURNED"?correctionReason:null,
    }:null,
    officialStatus:"NOT_CONFIRMED",subjects,proposedSubjects:eligible,
    proposedUnits:projectFeeEstimate.totalUnits,projectFeeEstimate,
    previousResults:snapshot.previous_results||[],transferCredits:snapshot.transfer_credits||[],
    blockingReasons,canSubmit,
  };
}
async function loadProjectEnrollment(context) {
  const [snapshotResult,termResult,statusResult,placementResult,windowResult]=await Promise.all([
    context.client.rpc("project_phase8_student_snapshot_v2",{p_student_id:context.studentId}),
    context.admin.from("academic_terms")
      .select("id,label,academic_year,semester,enrollment_start,enrollment_end,status")
      .eq("id",TERM_ID).maybeSingle(),
    context.client.rpc("project_phase8_student_portal_status_v1",{p_student_id:context.studentId}),
    context.admin.from("project_student_academic_placements")
      .select("home_block_id").eq("student_id",context.studentId).eq("term_id",TERM_ID).maybeSingle(),
    context.admin.from("project_phase8_demo_enrollment_window")
      .select("project_cohort_id,term_id,start_date,end_date,status,source_type,verified_institutionally")
      .eq("project_cohort_id",PROJECT_COHORT).maybeSingle(),
  ]);
  if(snapshotResult.error||snapshotResult.data?.project_only!==true||
      snapshotResult.data?.verified_institutionally!==false||
      snapshotResult.data?.data_origin!=="GENERATED_PROJECT"||
      snapshotResult.data?.student_number!==context.studentNumber||
      snapshotResult.data?.term_id!==TERM_ID||termResult.error||!termResult.data||
      statusResult.error||statusResult.data?.project_only!==true||
      statusResult.data?.verified_institutionally!==false||
      statusResult.data?.curriculum_is_official!==false||
      statusResult.data?.curriculum_code!==snapshotResult.data?.curriculum_code||
      placementResult.error||!placementResult.data||windowResult.error) return {kind:"unavailable"};

  const sectionCodes=new Map();
  const blockId=placementResult.data.home_block_id;
  if(blockId){
    const {data:links,error:linkError}=await context.admin.from("block_subject_sections")
      .select("section_id").eq("block_id",blockId);
    if(!linkError&&links?.length){
      const ids=[...new Set(links.map((entry)=>entry.section_id).filter(Boolean))];
      const {data:sections,error:sectionsError}=await context.admin.from("sections")
        .select("id,section_code,subject_code").in("id",ids);
      if(!sectionsError) for(const section of sections||[])
        if(section.subject_code&&section.section_code) sectionCodes.set(section.subject_code,section.section_code);
    }
  }
  const simulation=statusResult.data.simulation||null;
  const {eligible}=preparedSubjects(snapshotResult.data,sectionCodes);
  const selectedCodes=selectedProjectSubjectCodes(eligible);
  const priceRows=await loadVerifiedProjectSubjectPrices(context.admin,snapshotResult.data.curriculum_code,eligible);
  if(priceRows.length!==selectedCodes.length) return {kind:"unavailable"};

  return buildStudentEnrollmentSummary({
    context,snapshot:snapshotResult.data,term:termResult.data,simulation,sectionCodes,priceRows,
    demoWindow:windowResult.data,correctionReason:simulation?.correction_reason||null,
  });
}
export async function loadStudentEnrollmentForPage() {
  const context=await getStudentContext();
  try {
    if(context.kind==="project") return await loadProjectEnrollment(context);
    if(context.kind==="institutional") return await loadInstitutionalEnrollment(context);
    return {kind:"unavailable"};
  } catch(error) {
    console.error("[Student Portal][Enrollment Loader][ERROR]",{
      mode:context.kind,message:error instanceof Error?error.message:String(error),
    });
    return {kind:"unavailable"};
  }
}
export async function loadStudentEnrollmentSummary() {
  return loadStudentEnrollmentForPage();
}
export async function assertCanSubmitProjectEnrollment() {
  const context=await requireProjectStudentContext();
  const data=await loadStudentEnrollmentForPage();
  if(data.kind!=="ready"||data.mode!=="project"||!data.canSubmit)
    throw new Error(data.blockingReasons?.[0]||"Your enrollment is not currently eligible for submission.");
  return context;
}

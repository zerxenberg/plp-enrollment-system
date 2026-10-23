import "server-only";

import { getStudentContext } from "./student-context-server";
import { loadInstitutionalAcademic } from "./institutional-student-server";

const UNAVAILABLE = Object.freeze({ mode: "unavailable" });

async function loadProjectAcademic(context) {
  const {data:snapshot,error:snapshotError}=await context.client.rpc(
    "project_phase8_student_snapshot_v2",{p_student_id:context.studentId});
  if(snapshotError||!snapshot||snapshot.project_only!==true||
      snapshot.verified_institutionally!==false||
      snapshot.data_origin!=="GENERATED_PROJECT"||
      snapshot.student_number!==context.studentNumber||!snapshot.curriculum_code) return UNAVAILABLE;

  const {data:provenance,error:provenanceError}=await context.client.rpc(
    "project_phase8_student_portal_status_v1",{p_student_id:context.studentId});
  if(provenanceError||provenance?.project_only!==true||
      provenance?.verified_institutionally!==false||
      provenance?.curriculum_is_official!==false||
      provenance?.curriculum_code!==snapshot.curriculum_code) return UNAVAILABLE;

  const {data:curriculumRows,error:curriculumError}=await context.admin
    .from("curriculum_subjects")
    .select("subject_code,year_level_number,semester,display_order,is_required,units_override")
    .eq("curriculum_code",snapshot.curriculum_code)
    .order("year_level_number",{ascending:true})
    .order("semester",{ascending:true})
    .order("display_order",{ascending:true});
  if(curriculumError||!curriculumRows?.length) return UNAVAILABLE;

  const codes=[...new Set(curriculumRows.map((row)=>row.subject_code))];
  const {data:subjects,error:subjectsError}=await context.admin.from("subjects")
    .select("code,name,units").in("code",codes);
  if(subjectsError||!subjects||subjects.length!==codes.length) return UNAVAILABLE;
  const byCode=new Map(subjects.map((subject)=>[subject.code,subject]));
  const curriculum=curriculumRows.map((row)=>({
    code:row.subject_code,name:byCode.get(row.subject_code)?.name??row.subject_code,
    units:row.units_override??byCode.get(row.subject_code)?.units??null,
    yearLevel:row.year_level_number,semester:row.semester,required:row.is_required,
  }));

  const {data:enrollments,error:enrollmentError}=await context.admin.from("enrollments")
    .select("id,term_id,confirmed_at").eq("student_id",context.studentId)
    .eq("status","CONFIRMED").order("confirmed_at",{ascending:false}).limit(1);
  if(enrollmentError) return UNAVAILABLE;

  let officialSchedule=null;
  if(enrollments?.length&&enrollments[0].confirmed_at){
    const {data:cor,error:corError}=await context.client.rpc(
      "official_enrollment_cor_v1",{p_enrollment_id:enrollments[0].id});
    if(!corError&&cor?.official===true&&cor.schedule_complete===true&&
        cor.ready_to_print===true&&cor.enrollment_id===enrollments[0].id&&
        cor.student_number===context.studentNumber&&Boolean(cor.confirmation_reference)&&
        Boolean(cor.confirmed_at)){
      officialSchedule={
        term:cor.academic_term||cor.term_id,reference:cor.confirmation_reference,
        homeBlock:cor.home_block,items:Array.isArray(cor.schedule)?cor.schedule:[],
        subjects:Array.isArray(cor.subjects)?cor.subjects:[],
      };
    }
  }

  return {
    mode:"project",
    snapshot:{
      studentNumber:snapshot.student_number,program:snapshot.program_code,
      track:snapshot.program_track_code,curriculumCode:snapshot.curriculum_code,
      yearLevel:snapshot.year_level,classification:snapshot.academic_classification,
      term:snapshot.term_id,
      previousResults:Array.isArray(snapshot.previous_results)?snapshot.previous_results:[],
      transferCredits:Array.isArray(snapshot.transfer_credits)?snapshot.transfer_credits:[],
      eligibility:Array.isArray(snapshot.subjects)?snapshot.subjects:[],curriculum,
    },
    officialSchedule,
  };
}

export async function loadStudentAcademicForPage() {
  const context=await getStudentContext();
  try {
    if(context.kind==="project") return await loadProjectAcademic(context);
    if(context.kind==="institutional") return await loadInstitutionalAcademic(context);
    return UNAVAILABLE;
  } catch(error) {
    console.error("[Student Portal][Academic Loader][ERROR]",{
      mode:context.kind,message:error instanceof Error?error.message:String(error),
    });
    return UNAVAILABLE;
  }
}

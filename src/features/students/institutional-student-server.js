import "server-only";

function formatDate(value) {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat("en-PH", {
      year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Manila",
    }).format(new Date(value));
  } catch { return String(value); }
}
function formatDateTime(value) {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat("en-PH", {
      year: "numeric", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila",
    }).format(new Date(value));
  } catch { return String(value); }
}
function termIsOpen(term) {
  if (!term || String(term.status).toLowerCase() !== "open" ||
      !term.enrollment_start || !term.enrollment_end) return false;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit",
  }).format(new Date());
  return today >= term.enrollment_start && today <= term.enrollment_end;
}
async function subjectMap(admin,codes) {
  const unique=[...new Set((codes||[]).filter(Boolean))];
  if(!unique.length) return new Map();
  const {data,error}=await admin.from("subjects").select("code,name,units,status").in("code",unique);
  if(error) throw error;
  return new Map((data||[]).map((row)=>[row.code,row]));
}
async function termMap(admin,ids) {
  const unique=[...new Set((ids||[]).filter(Boolean))];
  if(!unique.length) return new Map();
  const {data,error}=await admin.from("academic_terms")
    .select("id,label,academic_year,semester").in("id",unique);
  if(error) throw error;
  return new Map((data||[]).map((row)=>[row.id,row]));
}
async function loadSectionChoices(admin,profile,term,eligibleCodes) {
  if(!profile.current_curriculum_code||!profile.program_code||!term?.id||!eligibleCodes.length)
    return new Map();

  const {data:offerings,error:offeringError}=await admin.from("subject_offerings")
    .select("id,subject_code,status,is_synthetic_demo")
    .eq("term_id",term.id)
    .eq("program_code",profile.program_code)
    .eq("curriculum_code",profile.current_curriculum_code)
    .eq("status","ACTIVE").eq("is_synthetic_demo",false)
    .in("subject_code",eligibleCodes);
  if(offeringError) throw offeringError;
  const offeringIds=(offerings||[]).map((row)=>row.id);
  if(!offeringIds.length) return new Map();

  const {data:sections,error:sectionError}=await admin.from("sections")
    .select("id,subject_code,section_code,capacity,status,schedule_status,subject_offering_id,is_synthetic_demo")
    .in("subject_offering_id",offeringIds).eq("term_id",term.id)
    .eq("is_synthetic_demo",false).eq("schedule_status","FINALIZED");
  if(sectionError) throw sectionError;
  if(!sections?.length) return new Map();

  const sectionIds=sections.map((row)=>row.id);
  const [meetingsResult,instructorsResult]=await Promise.all([
    admin.from("section_meetings")
      .select("section_id,day_of_week,start_time,end_time,room_id,meeting_component_type,meeting_status")
      .in("section_id",sectionIds).eq("meeting_status","ACTIVE").eq("is_synthetic_demo",false),
    admin.from("section_instructors")
      .select("section_id,instructor_id,assignment_role")
      .in("section_id",sectionIds).eq("assignment_role","PRIMARY"),
  ]);
  if(meetingsResult.error) throw meetingsResult.error;
  if(instructorsResult.error) throw instructorsResult.error;

  const roomIds=[...new Set((meetingsResult.data||[]).map((row)=>row.room_id).filter(Boolean))];
  const instructorIds=[...new Set((instructorsResult.data||[]).map((row)=>row.instructor_id).filter(Boolean))];
  const [roomsResult,instructorNamesResult]=await Promise.all([
    roomIds.length
      ? admin.from("rooms").select("id,room_code").in("id",roomIds).eq("is_synthetic_demo",false)
      : Promise.resolve({data:[],error:null}),
    instructorIds.length
      ? admin.from("instructors").select("id,display_name").in("id",instructorIds).eq("is_synthetic_demo",false)
      : Promise.resolve({data:[],error:null}),
  ]);
  if(roomsResult.error) throw roomsResult.error;
  if(instructorNamesResult.error) throw instructorNamesResult.error;

  const rooms=new Map((roomsResult.data||[]).map((row)=>[row.id,row.room_code]));
  const instructors=new Map((instructorNamesResult.data||[]).map((row)=>[row.id,row.display_name]));
  const instructorBySection=new Map((instructorsResult.data||[]).map((row)=>
    [row.section_id,instructors.get(row.instructor_id)||"To be announced"]));
  const meetingsBySection=new Map();
  for(const meeting of meetingsResult.data||[]) {
    const list=meetingsBySection.get(meeting.section_id)||[];
    list.push({
      day:meeting.day_of_week,start:meeting.start_time,end:meeting.end_time,
      room:rooms.get(meeting.room_id)||"To be announced",
      component:meeting.meeting_component_type||"Class",
    });
    meetingsBySection.set(meeting.section_id,list);
  }
  const bySubject=new Map();
  for(const section of sections) {
    const list=bySubject.get(section.subject_code)||[];
    list.push({
      id:section.id,code:section.section_code,capacity:section.capacity,status:section.status,
      instructor:instructorBySection.get(section.id)||"To be announced",
      meetings:meetingsBySection.get(section.id)||[],
    });
    bySubject.set(section.subject_code,list);
  }
  return bySubject;
}

export async function loadInstitutionalEnrollment(context) {
  const admin=context.admin, profile=context.profile;
  const [termResult,handoffResult,enrollmentResult]=await Promise.all([
    profile.current_term_id
      ? admin.from("academic_terms")
          .select("id,label,short_label,academic_year,semester,enrollment_start,enrollment_end,status")
          .eq("id",profile.current_term_id).maybeSingle()
      : Promise.resolve({data:null,error:null}),
    admin.from("admission_handoffs")
      .select("applicant_reference,approved_program_code,admission_status,admission_date,admission_type,synchronization_status,received_at,source_name")
      .eq("student_id",context.studentId)
      .order("received_at",{ascending:false,nullsFirst:false}).limit(1).maybeSingle(),
    admin.from("enrollments")
      .select("id,reference,term_id,program_code,curriculum_code,status,eligibility_status,declared_units,submitted_at,last_validated_at,confirmation_reference,confirmed_at,current_correction_reason,created_at")
      .eq("student_id",context.studentId).order("created_at",{ascending:false}),
  ]);
  if(termResult.error||handoffResult.error||enrollmentResult.error)
    throw new Error("Institutional enrollment data is unavailable.");

  const term=termResult.data, handoff=handoffResult.data, enrollments=enrollmentResult.data||[];
  const current=term?enrollments.find((row)=>row.term_id===term.id)||null:null;

  const curriculumQuery=profile.current_curriculum_code&&profile.year_level_number&&term?.semester
    ? admin.from("curriculum_subjects")
        .select("subject_code,year_level_number,semester,display_order,is_required,units_override")
        .eq("curriculum_code",profile.current_curriculum_code)
        .eq("year_level_number",profile.year_level_number).ilike("semester",term.semester)
        .order("display_order")
    : Promise.resolve({data:[],error:null});
  const eligibilityQuery=term
    ? admin.from("student_subject_eligibility")
        .select("subject_code,eligibility_status,display_category,restriction_reason,evaluated_at")
        .eq("student_id",context.studentId).eq("term_id",term.id)
    : Promise.resolve({data:[],error:null});
  const [curriculumResult,eligibilityResult]=await Promise.all([curriculumQuery,eligibilityQuery]);
  if(curriculumResult.error||eligibilityResult.error) throw new Error("Enrollment eligibility is unavailable.");

  const curriculumRows=curriculumResult.data||[], eligibilityRows=eligibilityResult.data||[];
  const codes=[...new Set([...curriculumRows.map((r)=>r.subject_code),...eligibilityRows.map((r)=>r.subject_code)])];
  const subjects=await subjectMap(admin,codes);
  const eligibilityByCode=new Map(eligibilityRows.map((row)=>[row.subject_code,row]));
  const eligibleCodes=eligibilityRows
    .filter((row)=>["ELIGIBLE","RETAKE"].includes(row.eligibility_status))
    .map((row)=>row.subject_code);
  const sectionChoices=await loadSectionChoices(admin,profile,term,eligibleCodes);

  let selectedRows=[];
  if(current){
    const {data,error}=await admin.from("enrollment_subjects")
      .select("subject_code,section_id,units_at_enrollment,registration_status")
      .eq("enrollment_id",current.id);
    if(error) throw error;
    selectedRows=data||[];
  }
  const selectedByCode=new Map(selectedRows.map((row)=>[row.subject_code,row]));
  const preparedSubjects=curriculumRows.map((row)=>{
    const subject=subjects.get(row.subject_code), eligibility=eligibilityByCode.get(row.subject_code);
    const selected=selectedByCode.get(row.subject_code);
    return {
      code:row.subject_code,name:subject?.name||row.subject_code,
      units:row.units_override??subject?.units??null,
      eligibility:eligibility?.eligibility_status||"NOT_EVALUATED",
      reason:eligibility?.restriction_reason||null,
      selectedSectionId:selected?.section_id||null,
      registrationStatus:selected?.registration_status||null,
      sections:sectionChoices.get(row.subject_code)||[],
    };
  });

  const historyTerms=await termMap(admin,enrollments.map((row)=>row.term_id));
  const history=enrollments.map((row)=>({
    id:row.id,reference:row.reference,
    academicYear:historyTerms.get(row.term_id)?.academic_year||row.term_id,
    semester:historyTerms.get(row.term_id)?.semester||null,
    term:historyTerms.get(row.term_id)?.label||row.term_id,
    status:row.status,units:row.declared_units,
    submittedAt:formatDateTime(row.submitted_at),confirmedAt:formatDateTime(row.confirmed_at),
    confirmationReference:row.confirmation_reference,
  }));

  let officialCor=null;
  if(current?.status==="CONFIRMED"){
    const {data,error}=await context.client.rpc("official_enrollment_cor_v1",{p_enrollment_id:current.id});
    if(!error&&data?.official===true&&data?.student_number===context.studentNumber) officialCor=data;
  }

  const blockers=[];
  if(!handoff||handoff.admission_status!=="COMPLETED")
    blockers.push("Your verified Admission handoff has not been completed.");
  if(profile.student_status==="ADMITTED")
    blockers.push(profile.student_type==="TRANSFEREE"
      ?"Your transfer evaluation and academic placement are still being prepared."
      :"Your academic enrollment record is still being prepared.");
  else if(profile.student_status!=="ACTIVE")
    blockers.push("Your student record is not currently active for enrollment.");
  if(!profile.current_curriculum_code||!profile.current_term_id)
    blockers.push("Your curriculum or academic term has not been assigned.");
  if(profile.student_type==="TRANSFEREE"&&!profile.year_level_number)
    blockers.push("Your transferee year-level placement is still pending.");
  if(!termIsOpen(term)) blockers.push("The Registrar enrollment period is not currently open.");
  if(profile.student_status==="ACTIVE"&&!preparedSubjects.some((row)=>
      ["ELIGIBLE","RETAKE"].includes(row.eligibility)))
    blockers.push("No subjects are currently cleared for enrollment.");

  return {
    kind:"ready",mode:"institutional",
    student:{
      name:context.account.full_name,number:context.studentNumber,type:profile.student_type,
      status:profile.student_status,program:profile.program_code,curriculum:profile.current_curriculum_code,
      yearLevel:profile.year_level_number||profile.year_level,
      classification:profile.academic_classification,progression:profile.progression_status,
    },
    admission:handoff?{
      applicantReference:handoff.applicant_reference,type:handoff.admission_type,
      status:handoff.admission_status,program:handoff.approved_program_code,
      date:formatDate(handoff.admission_date),source:handoff.source_name,
      synchronizationStatus:handoff.synchronization_status,
    }:null,
    term:term?{
      id:term.id,label:term.label,academicYear:term.academic_year,semester:term.semester,
      enrollmentStart:term.enrollment_start,enrollmentEnd:term.enrollment_end,
      status:term.status,windowOpen:termIsOpen(term),
    }:null,
    enrollment:current?{
      id:current.id,reference:current.reference,status:current.status,
      declaredUnits:current.declared_units,submittedAt:formatDateTime(current.submitted_at),
      validatedAt:formatDateTime(current.last_validated_at),
      correctionReason:current.current_correction_reason,
      confirmationReference:current.confirmation_reference,confirmedAt:formatDateTime(current.confirmed_at),
    }:null,
    subjects:preparedSubjects,
    selectedSubjects:preparedSubjects.filter((row)=>row.registrationStatus),
    history,officialCor,
    canStart:!current&&blockers.length===0,
    canEdit:current?.status==="IN_PROGRESS",
    canSubmit:current?.status==="IN_PROGRESS"&&
      selectedRows.some((row)=>row.registration_status==="SELECTED")&&blockers.length===0,
    blockingReasons:blockers,
  };
}

export async function loadInstitutionalAcademic(context) {
  const admin=context.admin, profile=context.profile;
  const [curriculumResult,resultsResult,transferResult,eligibilityResult,enrollmentsResult]=await Promise.all([
    profile.current_curriculum_code
      ? admin.from("curriculum_subjects")
          .select("subject_code,year_level_number,semester,display_order,is_required,units_override")
          .eq("curriculum_code",profile.current_curriculum_code)
          .order("year_level_number").order("semester").order("display_order")
      : Promise.resolve({data:[],error:null}),
    admin.from("academic_results")
      .select("id,subject_code,term_id,units,result_status,official_grade_value,created_at")
      .eq("student_id",context.studentId).order("created_at",{ascending:false}),
    admin.from("transfer_credit_evaluations")
      .select("id,target_subject_code,source_institution,source_course_name,credited_units,decision_status,decision_reason,decided_at")
      .eq("student_id",context.studentId).order("created_at",{ascending:false}),
    profile.current_term_id
      ? admin.from("student_subject_eligibility")
          .select("subject_code,eligibility_status,restriction_reason")
          .eq("student_id",context.studentId).eq("term_id",profile.current_term_id)
      : Promise.resolve({data:[],error:null}),
    admin.from("enrollments").select("id,term_id,confirmed_at,status")
      .eq("student_id",context.studentId).eq("status","CONFIRMED")
      .order("confirmed_at",{ascending:false}).limit(1),
  ]);
  for(const response of [curriculumResult,resultsResult,transferResult,eligibilityResult,enrollmentsResult])
    if(response.error) throw response.error;

  const curriculumRows=curriculumResult.data||[],results=resultsResult.data||[],transfers=transferResult.data||[];
  const codes=[...new Set([
    ...curriculumRows.map((r)=>r.subject_code),
    ...results.map((r)=>r.subject_code),
    ...transfers.map((r)=>r.target_subject_code),
  ])];
  const subjects=await subjectMap(admin,codes);
  const terms=await termMap(admin,results.map((row)=>row.term_id));

  let officialSchedule=null;
  const latestConfirmed=enrollmentsResult.data?.[0];
  if(latestConfirmed){
    const {data:cor,error}=await context.client.rpc("official_enrollment_cor_v1",{p_enrollment_id:latestConfirmed.id});
    if(!error&&cor?.official===true&&cor?.student_number===context.studentNumber){
      officialSchedule={
        term:cor.academic_term||cor.term_id,reference:cor.confirmation_reference,
        homeBlock:cor.home_block,items:Array.isArray(cor.schedule)?cor.schedule:[],
        subjects:Array.isArray(cor.subjects)?cor.subjects:[],
      };
    }
  }

  return {
    mode:"live",
    snapshot:{
      studentNumber:context.studentNumber,program:profile.program_code,track:null,
      curriculumCode:profile.current_curriculum_code,
      yearLevel:profile.year_level_number||profile.year_level,
      classification:profile.academic_classification,term:profile.current_term_id,
      previousResults:results.map((row)=>({
        id:row.id,subject_code:row.subject_code,
        subject_name:subjects.get(row.subject_code)?.name||row.subject_code,
        units:row.units??subjects.get(row.subject_code)?.units??null,
        term:terms.get(row.term_id)?.label||row.term_id||"Not recorded",
        grade:row.official_grade_value,result:row.result_status,
      })),
      transferCredits:transfers.map((row)=>({
        id:row.id,target_subject:row.target_subject_code,source_course:row.source_course_name,
        source_institution:row.source_institution,credited_units:row.credited_units,
        decision_status:row.decision_status,decision_reason:row.decision_reason,decided_at:row.decided_at,
      })),
      eligibility:(eligibilityResult.data||[]).map((row)=>({
        subject_code:row.subject_code,eligibility:row.eligibility_status,reason:row.restriction_reason,
      })),
      curriculum:curriculumRows.map((row)=>({
        code:row.subject_code,name:subjects.get(row.subject_code)?.name||row.subject_code,
        units:row.units_override??subjects.get(row.subject_code)?.units??null,
        yearLevel:row.year_level_number,semester:row.semester,required:row.is_required,
      })),
    },
    officialSchedule,
  };
}

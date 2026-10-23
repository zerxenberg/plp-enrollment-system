import "server-only";

import { getStudentContext } from "./student-context-server";
import { isOwnStudentPhotoPath } from "./student-profile-photo-path.mjs";

async function loadContactAndPhoto(context) {
  // The alternate contact column was added by a newer migration. Keep the
  // profile readable if a local database has not applied it yet, while
  // retaining the authenticated user's ownership filter.
  let contactResult = await context.client.from("student_profiles")
    .select("contact_number,alternate_contact_number,address")
    .eq("id",context.studentId).eq("user_id",context.appUserId).single();

  if (contactResult.error?.code === "42703") {
    const fallback = await context.client.from("student_profiles")
      .select("contact_number,address")
      .eq("id",context.studentId).eq("user_id",context.appUserId).single();
    if (!fallback.error && fallback.data) {
      contactResult = {
        data: { ...fallback.data, alternate_contact_number: null },
        error: null,
      };
    } else {
      contactResult = fallback;
    }
  }

  const [{data:contact,error:contactError},{data:photo,error:photoError}]=await Promise.all([
    Promise.resolve(contactResult),
    context.admin.from("student_profile_photos")
      .select("object_path").eq("student_id",context.studentId).maybeSingle(),
  ]);
  if(contactError||!contact) throw contactError||new Error("Student contact is unavailable.");
  if(photoError) throw photoError;

  let photoUrl=null;
  if(photo?.object_path&&isOwnStudentPhotoPath(photo.object_path,context.authUser.id)){
    const {data:signed}=await context.admin.storage.from("student-profile-photos")
      .createSignedUrl(photo.object_path,900);
    photoUrl=signed?.signedUrl||null;
  }
  return {
    contact:{
      contactNumber:contact.contact_number||"",
      alternateContactNumber:contact.alternate_contact_number||"",
      address:contact.address||"",
    },
    photoUrl,
  };
}

async function loadProjectProfile(context) {
  const [{data:snapshot,error:snapshotError},{data:portalStatus,error:statusError}]=await Promise.all([
    context.client.rpc("project_phase8_student_snapshot_v2",{p_student_id:context.studentId}),
    context.client.rpc("project_phase8_student_portal_status_v1",{p_student_id:context.studentId}),
  ]);
  if(snapshotError||statusError||snapshot?.project_only!==true||
      snapshot?.verified_institutionally!==false||snapshot?.student_number!==context.studentNumber)
    return {mode:"unavailable"};

  const extras=await loadContactAndPhoto(context);
  const projectEligible=snapshot.schedule_validated_for_project===true&&
    Array.isArray(snapshot.subjects)&&snapshot.subjects.some((s)=>["ELIGIBLE","RETAKE"].includes(s.eligibility));

  return {
    mode:"project",
    profile:{
      studentNumber:context.studentNumber,fullName:context.account.full_name,email:context.account.email,
      program:snapshot.program_code,yearLevel:snapshot.year_level,studentType:context.studentType,
      curriculum:snapshot.curriculum_code,major:snapshot.program_track_code,
      academicClassification:snapshot.academic_classification?`Simulated: ${snapshot.academic_classification}`:"Not verified",
      studentStatus:null,accountStatus:"Active (demonstration account)",
      enrollmentEligibility:projectEligible?"Prepared for demonstration enrollment":"Demonstration validation pending",
      projectEnrollmentStatus:portalStatus?.simulation?.status
        ? `Demonstration: ${portalStatus.simulation.status}`:"Demonstration: Not started",
      contactEditingReady:true,contact:extras.contact,photoUrl:extras.photoUrl,admission:null,
    },
  };
}

async function loadInstitutionalProfile(context) {
  const [extras,handoffResult,enrollmentResult]=await Promise.all([
    loadContactAndPhoto(context),
    context.admin.from("admission_handoffs")
      .select("applicant_reference,approved_program_code,admission_status,admission_date,admission_type,synchronization_status,source_name")
      .eq("student_id",context.studentId).order("received_at",{ascending:false,nullsFirst:false})
      .limit(1).maybeSingle(),
    context.admin.from("enrollments")
      .select("id,reference,term_id,status,confirmation_reference,confirmed_at,created_at")
      .eq("student_id",context.studentId).order("created_at",{ascending:false})
      .limit(1).maybeSingle(),
  ]);
  if(handoffResult.error||enrollmentResult.error)
    throw new Error("Institutional Student profile is incomplete.");

  const profile=context.profile,handoff=handoffResult.data,enrollment=enrollmentResult.data;
  let enrollmentEligibility="Academic preparation in progress";
  if(profile.student_status==="ACTIVE"&&handoff?.admission_status==="COMPLETED")
    enrollmentEligibility="Ready for enrollment";
  else if(profile.student_type==="TRANSFEREE"&&!profile.year_level_number)
    enrollmentEligibility="Transfer evaluation and placement pending";

  return {
    mode:"live",
    profile:{
      studentNumber:context.studentNumber,fullName:context.account.full_name,email:context.account.email,
      program:profile.program_code,
      yearLevel:profile.year_level||(profile.year_level_number?`Year ${profile.year_level_number}`:null),
      studentType:profile.student_type,curriculum:profile.current_curriculum_code,major:null,
      academicClassification:profile.academic_classification,studentStatus:profile.student_status,
      accountStatus:context.account.account_status,enrollmentEligibility,
      officialEnrollmentStatus:enrollment?.status||"NOT_STARTED",
      enrollmentReference:enrollment?.reference||null,
      contactEditingReady:true,contact:extras.contact,photoUrl:extras.photoUrl,
      admission:handoff?{
        applicantReference:handoff.applicant_reference,source:handoff.source_name,
        decision:handoff.admission_status,type:handoff.admission_type,
        program:handoff.approved_program_code,date:handoff.admission_date,
        synchronizationStatus:handoff.synchronization_status,
      }:null,
    },
  };
}

export async function loadStudentProfileForPage() {
  const context=await getStudentContext();
  try {
    if(context.kind==="project") return await loadProjectProfile(context);
    if(context.kind==="institutional") return await loadInstitutionalProfile(context);
    return {mode:"unavailable"};
  } catch(error) {
    console.error("[Student Portal][Profile Loader][ERROR]",{
      mode:context.kind,message:error instanceof Error?error.message:String(error),
    });
    return {mode:"unavailable"};
  }
}

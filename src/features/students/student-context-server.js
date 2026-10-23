import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getProjectOnlyInitialPasswordState } from "@/lib/auth/project-only-first-login-server";

const PROJECT_COHORT = "PLP_PROJECT_600_2026_1";

async function resolveProjectContext(state) {
  if (state.kind !== "complete" || state.account?.role_code !== "student" ||
      !state.admin || !state.supabase || !state.user?.id) return null;

  const { data: link, error: linkError } = await state.admin
    .from("project_auth_student_links")
    .select("student_id,auth_user_id,app_user_id,cohort_id,state,initial_password_changed_at")
    .eq("app_user_id", state.account.id).eq("auth_user_id", state.user.id).maybeSingle();
  if (linkError || !link || link.state !== "ACTIVE" ||
      !link.initial_password_changed_at || !link.student_id ||
      link.auth_user_id !== state.user.id || link.app_user_id !== state.account.id) return null;

  const { data: profile, error: profileError } = await state.admin
    .from("student_profiles")
    .select("id,user_id,student_number,record_kind,project_cohort_id,student_type,is_synthetic_demo")
    .eq("id", link.student_id).eq("user_id", state.account.id).maybeSingle();
  if (profileError || !profile || profile.id !== link.student_id ||
      profile.user_id !== state.account.id || !link.cohort_id ||
      profile.record_kind !== "PROJECT_ONLY" ||
      profile.project_cohort_id !== PROJECT_COHORT ||
      profile.is_synthetic_demo !== true) return null;

  return {
    kind:"project",studentId:profile.id,studentNumber:profile.student_number,
    studentType:profile.student_type,appUserId:state.account.id,
    account:state.account,profile,authUser:state.user,client:state.supabase,admin:state.admin,
  };
}

async function resolveInstitutionalContext(state) {
  if (state.kind !== "legacy" || state.account?.role_code !== "student" ||
      !state.supabase || !state.user?.id) return null;

  const admin=createAdminClient();
  const { data: profile, error } = await admin.from("student_profiles")
    .select(`id,user_id,student_number,program_code,current_term_id,current_curriculum_code,
      contact_number,address,emergency_contact_name,emergency_contact_number,
      alternate_contact_number,year_level,year_level_number,student_type,student_status,
      academic_classification,progression_status,record_kind,project_cohort_id,
      is_synthetic_demo,institutional_verified_at`)
    .eq("user_id",state.account.id).maybeSingle();

  if(error||!profile||profile.user_id!==state.account.id||
      profile.record_kind==="PROJECT_ONLY"||profile.is_synthetic_demo===true||
      !profile.student_number) return null;

  return {
    kind:"institutional",studentId:profile.id,studentNumber:profile.student_number,
    studentType:profile.student_type,appUserId:state.account.id,
    account:state.account,profile,authUser:state.user,client:state.supabase,admin,
  };
}

export async function getStudentContext() {
  try {
    const state=await getProjectOnlyInitialPasswordState();
    const project=await resolveProjectContext(state);
    if(project) return project;
    const institutional=await resolveInstitutionalContext(state);
    if(institutional) return institutional;
    return {kind:"unavailable"};
  } catch(error) {
    console.error("[Student Portal][Context][ERROR]", {
      message:error instanceof Error?error.message:String(error),
    });
    return {kind:"unavailable"};
  }
}

export async function requireStudentContext() {
  const context=await getStudentContext();
  if(!["project","institutional"].includes(context.kind))
    throw new Error("Student account verification is required.");
  return context;
}

export async function requireProjectStudentContext() {
  const context=await getStudentContext();
  if(context.kind!=="project")
    throw new Error("This action is available only for the classroom demonstration account.");
  return context;
}

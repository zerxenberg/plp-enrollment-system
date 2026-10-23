import "server-only";

import { getProjectOnlyInitialPasswordState } from "@/lib/auth/project-only-first-login-server";

const PROJECT_COHORT = "PLP_PROJECT_600_2026_1";

/**
 * Resolve a Student's immutable Auth -> app_user -> project link -> profile
 * chain on the server. Student IDs supplied by the browser are never trusted.
 */
export async function getStudentContext() {
  try {
    const state = await getProjectOnlyInitialPasswordState();
    if (state.kind !== "complete" || state.account?.role_code !== "student" ||
        !state.admin || !state.supabase || !state.user?.id) {
      return { kind: "unavailable" };
    }

    const { data: link, error: linkError } = await state.admin
      .from("project_auth_student_links")
      .select("student_id,auth_user_id,app_user_id,cohort_id,state,initial_password_changed_at")
      .eq("app_user_id", state.account.id)
      .eq("auth_user_id", state.user.id)
      .maybeSingle();
    if (linkError || !link || link.state !== "ACTIVE" ||
        !link.initial_password_changed_at || !link.student_id ||
        link.auth_user_id !== state.user.id ||
        link.app_user_id !== state.account.id) {
      return { kind: "unavailable" };
    }

    const { data: profile, error: profileError } = await state.admin
      .from("student_profiles")
      .select("id,user_id,student_number,record_kind,project_cohort_id,student_type,is_synthetic_demo")
      .eq("id", link.student_id)
      .eq("user_id", state.account.id)
      .maybeSingle();
    if (profileError || !profile || profile.id !== link.student_id ||
        profile.user_id !== state.account.id ||
        !link.cohort_id || profile.record_kind !== "PROJECT_ONLY" ||
        profile.project_cohort_id !== PROJECT_COHORT ||
        profile.is_synthetic_demo !== true) {
      return { kind: "unavailable" };
    }

    return {
      kind: "project",
      studentId: profile.id,
      studentNumber: profile.student_number,
      studentType: profile.student_type,
      appUserId: state.account.id,
      account: state.account,
      authUser: state.user,
      client: state.supabase,
      admin: state.admin,
    };
  } catch {
    return { kind: "unavailable" };
  }
}

export async function requireStudentContext() {
  const context = await getStudentContext();
  if (context.kind !== "project") {
    throw new Error("Student account verification is required.");
  }
  return context;
}

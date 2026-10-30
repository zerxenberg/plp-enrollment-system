import PortalLayout from "@/components/layout/PortalLayout";
import { redirect } from "next/navigation";
import { getProjectOnlyInitialPasswordState } from "@/lib/auth/project-only-first-login-server";
import ProjectOnlyStudentModuleBoundary from "@/components/student/ProjectOnlyStudentModuleBoundary";
import { getStudentContext } from "@/features/students/student-context-server";
import { loadStudentNotifications } from "@/features/students/student-notifications-server";

export default async function StudentPortalLayout({ children }) {
  const state = await getProjectOnlyInitialPasswordState()
    .catch(() => ({ kind: "denied" }));
  if (state.kind === "required") redirect("/student/change-password");
  if (state.kind === "anonymous" || state.kind === "denied" ||
      (state.kind === "legacy" && state.account.role_code !== "student")) {
    redirect("/");
  }
  const projectOnly = state.kind === "complete";
  const liveInstitutional = state.kind === "legacy" && state.account?.role_code === "student";
  let accountDisplay;
  let term;
  let notifications;
  if (liveInstitutional) {
    const context = await getStudentContext();
    if (context.kind === "live") {
      const { data: identity } = await context.admin.from("app_users")
        .select("full_name").eq("id", context.appUserId).maybeSingle();
      accountDisplay = {
        full_name: identity?.full_name || context.studentNumber,
        source_account_key: context.studentNumber,
      };
      const messages = await loadStudentNotifications({ limit: 5 });
      notifications = messages.kind === "ready" ? messages.items : [];
    }
  }
  if (projectOnly) {
    const context = await getStudentContext();
    if (context.kind === "project") {
      const [accountResult, termResult, notificationResult, windowResult] = await Promise.all([
        context.admin.from("app_users").select("full_name").eq("id", context.appUserId).maybeSingle(),
        context.admin.from("academic_terms")
          .select("short_label,enrollment_start,enrollment_end")
          .eq("id", "TERM-2026-1").maybeSingle(),
        loadStudentNotifications({ limit: 5 }),
        context.admin.from("project_phase8_demo_enrollment_window")
          .select("project_cohort_id,term_id,start_date,end_date,status,source_type,verified_institutionally")
          .eq("project_cohort_id", "PLP_PROJECT_600_2026_1").maybeSingle(),
      ]);
      if (!accountResult.error && accountResult.data) {
        accountDisplay = { full_name: accountResult.data.full_name, source_account_key: context.studentNumber };
      }
      if (!termResult.error && termResult.data) {
        const demo = !windowResult.error && windowResult.data?.term_id === "TERM-2026-1" &&
          windowResult.data?.source_type === "PROJECT_ONLY_FICTIONAL" &&
          windowResult.data?.verified_institutionally === false ? windowResult.data : null;
        term = { shortLabel: termResult.data.short_label || "TERM-2026-1",
          enrollmentStart: demo?.start_date || termResult.data.enrollment_start,
          enrollmentEnd: demo?.end_date || termResult.data.enrollment_end,
          isDemonstration: Boolean(demo) };
      }
      notifications = notificationResult.kind === "ready" ? notificationResult.items.map((item) => ({
        ...item, date: item.date ? new Date(item.date).toLocaleString("en-PH") : "",
      })) : [];
    }
  }
  return (
    <PortalLayout role="student" projectOnly={projectOnly} institutionalStudent={liveInstitutional}
      authUser={accountDisplay} portalTerm={term} portalNotifications={notifications}>
      <ProjectOnlyStudentModuleBoundary authenticatedProfile={{
        mode: projectOnly ? "project" : liveInstitutional ? "live" : "unavailable",
      }}>
        {children}
      </ProjectOnlyStudentModuleBoundary>
    </PortalLayout>
  );
}

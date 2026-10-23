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
  let accountDisplay;
  let term;
  let notifications;
  if (projectOnly) {
    const context = await getStudentContext();
    if (context.kind === "project") {
      const [accountResult, termResult, notificationResult] = await Promise.all([
        context.admin.from("app_users").select("full_name").eq("id", context.appUserId).maybeSingle(),
        context.admin.from("academic_terms")
          .select("short_label,enrollment_start,enrollment_end")
          .eq("id", "TERM-2026-1").maybeSingle(),
        loadStudentNotifications({ limit: 5 }),
      ]);
      if (!accountResult.error && accountResult.data) {
        accountDisplay = { full_name: accountResult.data.full_name, source_account_key: context.studentNumber };
      }
      if (!termResult.error && termResult.data) {
        term = { shortLabel: termResult.data.short_label || "TERM-2026-1",
          enrollmentStart: termResult.data.enrollment_start,
          enrollmentEnd: termResult.data.enrollment_end };
      }
      notifications = notificationResult.kind === "ready" ? notificationResult.items.map((item) => ({
        ...item, date: item.date ? new Date(item.date).toLocaleString("en-PH") : "",
      })) : [];
    }
  }
  return (
    <PortalLayout role="student" projectOnly={projectOnly}
      authUser={accountDisplay} portalTerm={term} portalNotifications={notifications}>
      <ProjectOnlyStudentModuleBoundary authenticatedProfile={{
        mode: projectOnly ? "project" : "demo",
      }}>
        {children}
      </ProjectOnlyStudentModuleBoundary>
    </PortalLayout>
  );
}

import PortalLayout from "@/components/layout/PortalLayout";
import { redirect } from "next/navigation";
import { getProjectOnlyInitialPasswordState } from "@/lib/auth/project-only-first-login-server";
import ProjectOnlyStudentModuleBoundary from "@/components/student/ProjectOnlyStudentModuleBoundary";

export default async function StudentPortalLayout({ children }) {
  const state = await getProjectOnlyInitialPasswordState()
    .catch(() => ({ kind: "denied" }));
  if (state.kind === "required") redirect("/student/change-password");
  if (state.kind === "anonymous" || state.kind === "denied" ||
      (state.kind === "legacy" && state.account.role_code !== "student")) {
    redirect("/");
  }
  const projectOnly = state.kind === "complete";
  return (
    <PortalLayout role="student" projectOnly={projectOnly}>
      <ProjectOnlyStudentModuleBoundary authenticatedProfile={{
        mode: projectOnly ? "project" : "demo",
      }}>
        {children}
      </ProjectOnlyStudentModuleBoundary>
    </PortalLayout>
  );
}

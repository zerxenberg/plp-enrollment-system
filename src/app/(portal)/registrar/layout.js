import PortalLayout from "@/components/layout/PortalLayout";
import { requireRole } from "@/lib/auth/require-role";
import { loadProjectEnrollmentWindowForStaff } from "@/features/academic/project-enrollment-window-actions";

export default async function RegistrarPortalLayout({ children }) {
  const authUser = await requireRole("registrar");
  const period = await loadProjectEnrollmentWindowForStaff("registrar");
  return <PortalLayout role="registrar" authUser={authUser} portalTerm={{
    shortLabel: period.shortLabel,
    enrollmentStart: period.enrollmentStart,
    enrollmentEnd: period.enrollmentEnd,
    isDemonstration: true,
  }}>{children}</PortalLayout>;
}

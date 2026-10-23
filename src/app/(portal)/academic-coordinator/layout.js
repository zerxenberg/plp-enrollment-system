import PortalLayout from "@/components/layout/PortalLayout";
import { requireRole } from "@/lib/auth/require-role";
import { loadProjectEnrollmentWindowForStaff } from "@/features/academic/project-enrollment-window-actions";

export default async function AcademicCoordinatorPortalLayout({ children }) {
  const authUser = await requireRole("academic-coordinator");
  const period = await loadProjectEnrollmentWindowForStaff("academic-coordinator");
  return <PortalLayout role="academic-coordinator" authUser={authUser} portalTerm={{
    shortLabel: period.shortLabel,
    enrollmentStart: period.enrollmentStart,
    enrollmentEnd: period.enrollmentEnd,
    isDemonstration: true,
  }}>{children}</PortalLayout>;
}

import PortalLayout from "@/components/layout/PortalLayout";
import { requireRole } from "@/lib/auth/require-role";

export default async function AcademicCoordinatorPortalLayout({ children }) {
  const authUser = await requireRole("academic-coordinator");
  return <PortalLayout role="academic-coordinator" authUser={authUser}>{children}</PortalLayout>;
}

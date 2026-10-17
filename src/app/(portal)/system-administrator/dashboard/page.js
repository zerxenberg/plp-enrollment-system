import SystemAdministratorDashboard from "@/components/system-administrator/SystemAdministratorDashboard";
import { getSystemAdministratorDashboardData } from "@/features/system-administration/system-admin-queries";
import { requireRole } from "@/lib/auth/require-role";

export const metadata = { title: "System Administrator Dashboard" };
export const dynamic = "force-dynamic";

export default async function SystemAdministratorDashboardPage() {
  const authUser = await requireRole("system-administrator");
  const dashboardData = await getSystemAdministratorDashboardData(authUser.id);
  return <SystemAdministratorDashboard dashboardData={dashboardData} />;
}

import SystemAdministratorAuditMonitoring from "@/components/system-administrator/SystemAdministratorAuditMonitoring";
import { getAuditMonitoringData } from "@/features/system-administration/system-admin-queries";
import { requireRole } from "@/lib/auth/require-role";

export const metadata = { title: "Audit & Monitoring" };
export const dynamic = "force-dynamic";

export default async function SystemAdministratorAuditMonitoringPage() {
  await requireRole("system-administrator");
  const auditData = await getAuditMonitoringData();
  return <SystemAdministratorAuditMonitoring auditData={auditData} />;
}

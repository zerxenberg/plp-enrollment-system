import SystemAdministratorAuditMonitoring from "@/components/system-administrator/SystemAdministratorAuditMonitoring";
import { getAuditMonitoringData } from "@/features/system-administration/system-admin-queries";

export const metadata = { title: "Audit & Monitoring" };
export const dynamic = "force-dynamic";

export default async function SystemAdministratorAuditMonitoringPage() {
  const auditData = await getAuditMonitoringData();
  return <SystemAdministratorAuditMonitoring auditData={auditData} />;
}

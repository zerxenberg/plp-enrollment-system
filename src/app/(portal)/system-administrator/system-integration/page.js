import SystemAdministratorIntegration from "@/components/system-administrator/SystemAdministratorIntegration";
import { getSystemIntegrationData } from "@/features/system-administration/system-admin-queries";
import { requireRole } from "@/lib/auth/require-role";

export const metadata = { title: "System Integration" };
export const dynamic = "force-dynamic";

export default async function SystemAdministratorIntegrationPage() {
  await requireRole("system-administrator");
  const integrationData = await getSystemIntegrationData();
  return <SystemAdministratorIntegration integrationData={integrationData} />;
}

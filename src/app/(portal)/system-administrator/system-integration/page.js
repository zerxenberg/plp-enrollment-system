import SystemAdministratorIntegration from "@/components/system-administrator/SystemAdministratorIntegration";
import { getSystemIntegrationData } from "@/features/system-administration/system-admin-queries";

export const metadata = { title: "System Integration" };
export const dynamic = "force-dynamic";

export default async function SystemAdministratorIntegrationPage() {
  const integrationData = await getSystemIntegrationData();
  return <SystemAdministratorIntegration integrationData={integrationData} />;
}

import SystemAdministratorAdministration from "@/components/system-administrator/SystemAdministratorAdministration";
import { getSystemAdministrationData } from "@/features/system-administration/system-admin-queries";
import { requireRole } from "@/lib/auth/require-role";

export const metadata = { title: "System Administration" };
export const dynamic = "force-dynamic";

export default async function SystemAdministratorAdministrationPage() {
  await requireRole("system-administrator");
  const administrationData = await getSystemAdministrationData();
  return <SystemAdministratorAdministration administrationData={administrationData} />;
}

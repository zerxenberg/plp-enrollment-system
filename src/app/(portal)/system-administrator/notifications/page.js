import SystemAdministratorNotifications from "@/components/system-administrator/SystemAdministratorNotifications";
import { getSystemAdministratorNotificationsData } from "@/features/system-administration/system-admin-queries";
import { requireRole } from "@/lib/auth/require-role";

export const metadata = { title: "Technical Alerts" };
export const dynamic = "force-dynamic";

export default async function SystemAdministratorNotificationsPage() {
  const authUser = await requireRole("system-administrator");
  const notifications = await getSystemAdministratorNotificationsData(authUser.id);
  return <SystemAdministratorNotifications notifications={notifications} />;
}

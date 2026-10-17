import SystemAdministratorPortalLayout from "@/components/system-administrator/SystemAdministratorPortalLayout";
import { markSystemAdministratorNotification } from "@/features/system-administration/system-admin-actions";
import { getSystemAdministratorShellData } from "@/features/system-administration/system-admin-queries";
import { requireRole } from "@/lib/auth/require-role";

export default async function SystemAdministratorPortalRouteLayout({
  children,
}) {
  const authUser = await requireRole("system-administrator");
  const shellData = await getSystemAdministratorShellData(authUser.id);

  return (
    <SystemAdministratorPortalLayout
      authUser={authUser}
      shellData={shellData}
      markNotificationAction={markSystemAdministratorNotification}
    >
      {children}
    </SystemAdministratorPortalLayout>
  );
}

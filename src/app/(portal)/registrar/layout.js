import RegistrarPortalLayout from "@/components/registrar/RegistrarPortalLayout";
import { markRegistrarNotification } from "@/features/registrar/registrar-actions";
import { getRegistrarShellData } from "@/features/registrar/registrar-queries";
import { requireRole } from "@/lib/auth/require-role";

export default async function RegistrarPortalRouteLayout({ children }) {
  const authUser = await requireRole("registrar");
  const shellData = await getRegistrarShellData(authUser.id);

  return (
    <RegistrarPortalLayout
      authUser={authUser}
      shellData={shellData}
      markNotificationAction={markRegistrarNotification}
    >
      {children}
    </RegistrarPortalLayout>
  );
}

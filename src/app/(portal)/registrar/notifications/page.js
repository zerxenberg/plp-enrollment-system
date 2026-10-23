import RegistrarNotifications from "@/components/registrar/RegistrarNotifications";
import { getRegistrarNotificationsData } from "@/features/registrar/registrar-queries";
import { requireRole } from "@/lib/auth/require-role";

export const metadata = { title: "Registrar Notifications" };

export default async function RegistrarNotificationsPage() {
  const actor = await requireRole("registrar");
  const notificationsData = await getRegistrarNotificationsData(actor.id);
  return <RegistrarNotifications notificationsData={notificationsData} />;
}

import RoleNotifications from "@/components/shared/RoleNotifications";

export const metadata = { title: "System Administrator Notifications" };

export default function SystemAdministratorNotificationsPage() {
  return <RoleNotifications role="system-administrator" />;
}

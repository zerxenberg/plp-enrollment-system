import SystemAdministratorUsersAccess from "@/components/system-administrator/SystemAdministratorUsersAccess";
import { getUsersAccessData } from "@/features/system-administration/system-admin-queries";
import { requireRole } from "@/lib/auth/require-role";

export const metadata = { title: "Users & Access" };
export const dynamic = "force-dynamic";

export default async function SystemAdministratorUsersAccessPage() {
  await requireRole("system-administrator");
  const usersAccessData = await getUsersAccessData();
  return <SystemAdministratorUsersAccess usersAccessData={usersAccessData} />;
}

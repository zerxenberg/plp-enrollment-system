import SystemAdministratorUsersAccess from "@/components/system-administrator/SystemAdministratorUsersAccess";
import { getUsersAccessData } from "@/features/system-administration/system-admin-queries";

export const metadata = { title: "Users & Access" };
export const dynamic = "force-dynamic";

export default async function SystemAdministratorUsersAccessPage() {
  const usersAccessData = await getUsersAccessData();
  return <SystemAdministratorUsersAccess usersAccessData={usersAccessData} />;
}

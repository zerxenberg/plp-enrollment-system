import SystemAdministratorProfile from "@/components/system-administrator/SystemAdministratorProfile";
import { getSystemAdministratorProfileData } from "@/features/system-administration/system-admin-queries";
import { requireRole } from "@/lib/auth/require-role";

export const metadata = { title: "System Administrator Profile" };
export const dynamic = "force-dynamic";

export default async function SystemAdministratorProfilePage() {
  const authUser = await requireRole("system-administrator");
  const profileData = await getSystemAdministratorProfileData(authUser.id);
  return <SystemAdministratorProfile profileData={profileData} />;
}

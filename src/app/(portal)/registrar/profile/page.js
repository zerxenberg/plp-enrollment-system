import RegistrarProfile from "@/components/registrar/RegistrarProfile";
import { getRegistrarProfileData } from "@/features/registrar/registrar-queries";
import { requireRole } from "@/lib/auth/require-role";

export const metadata = { title: "Registrar Profile" };

export default async function RegistrarProfilePage() {
  const actor = await requireRole("registrar");
  const profileData = await getRegistrarProfileData(actor.id);
  return <RegistrarProfile profileData={profileData} />;
}

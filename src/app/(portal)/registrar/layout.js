import PortalLayout from "@/components/layout/PortalLayout";
import { requireRole } from "@/lib/auth/require-role";

export default async function RegistrarPortalLayout({ children }) {
  const authUser = await requireRole("registrar");
  return <PortalLayout role="registrar" authUser={authUser}>{children}</PortalLayout>;
}

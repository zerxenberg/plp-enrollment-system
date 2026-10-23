import RegistrarDashboard from "@/components/registrar/RegistrarDashboard";
import { getRegistrarDashboardData } from "@/features/registrar/registrar-queries";

export const metadata = { title: "Registrar Dashboard" };

export default async function RegistrarDashboardPage() {
  const dashboardData = await getRegistrarDashboardData();
  return <RegistrarDashboard dashboardData={dashboardData} />;
}

import RegistrarReports from "@/components/registrar/RegistrarReports";
import { getRegistrarReportsData } from "@/features/registrar/registrar-queries";

export const metadata = { title: "Reports & Monitoring" };

export default async function RegistrarReportsPage() {
  const reportsData = await getRegistrarReportsData();
  return <RegistrarReports reportsData={reportsData} />;
}

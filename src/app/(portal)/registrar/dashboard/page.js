import RegistrarDashboard from "@/components/registrar/RegistrarDashboard";
import { loadRegistrarProjectRoster } from "@/features/registrar/registrar-project-roster";

export const metadata = {title:"Registrar Dashboard"};

export default async function RegistrarDashboardPage() {
  const projectRoster = await loadRegistrarProjectRoster();
  return <RegistrarDashboard projectRoster={projectRoster} />;
}

import RegistrarAcademic from "@/components/registrar/RegistrarAcademic";
import { loadRegistrarProjectRoster } from "@/features/registrar/registrar-project-roster";

export const metadata = {title:"Academic & Scheduling"};

export default async function RegistrarAcademicPage() {
  const projectRoster = await loadRegistrarProjectRoster();
  return <RegistrarAcademic projectRoster={projectRoster} />;
}

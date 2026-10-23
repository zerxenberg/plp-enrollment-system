import RegistrarStudents from "@/components/registrar/RegistrarStudents";
import { loadRegistrarProjectRoster } from "@/features/registrar/registrar-project-roster";

export const metadata = {title:"Registrar Students"};

export default async function RegistrarStudentsPage() {
  const projectRoster = await loadRegistrarProjectRoster();
  return <RegistrarStudents projectRoster={projectRoster} />;
}

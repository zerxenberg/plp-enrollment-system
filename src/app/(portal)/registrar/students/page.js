import RegistrarStudents from "@/components/registrar/RegistrarStudents";
import { getRegistrarStudentsData } from "@/features/registrar/registrar-queries";

export const metadata = { title: "Registrar Students" };

export default async function RegistrarStudentsPage() {
  const studentsData = await getRegistrarStudentsData();
  return <RegistrarStudents studentsData={studentsData} />;
}

import RegistrarAcademic from "@/components/registrar/RegistrarAcademic";
import { getRegistrarAcademicData } from "@/features/registrar/registrar-queries";

export const metadata = { title: "Academic & Scheduling" };

export default async function RegistrarAcademicPage() {
  const academicData = await getRegistrarAcademicData();
  return <RegistrarAcademic academicData={academicData} />;
}

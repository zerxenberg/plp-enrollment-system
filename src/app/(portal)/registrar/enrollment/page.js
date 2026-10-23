import RegistrarEnrollment from "@/components/registrar/RegistrarEnrollment";
import { getRegistrarEnrollmentData } from "@/features/registrar/registrar-queries";

export const metadata = { title: "Registrar Enrollment" };

export default async function RegistrarEnrollmentPage() {
  const enrollmentData = await getRegistrarEnrollmentData();
  return <RegistrarEnrollment enrollmentData={enrollmentData} />;
}

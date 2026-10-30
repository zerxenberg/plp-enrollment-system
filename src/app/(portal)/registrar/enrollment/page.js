import RegistrarEnrollment from "@/components/registrar/RegistrarEnrollment";
import { getRegistrarEnrollmentData } from "@/features/registrar/registrar-queries";
import { listRegistrarAdmissionsPhase8Demo } from "@/features/admissions/admissions-phase8-demo-actions";

export const metadata = { title: "Registrar Enrollment" };

export default async function RegistrarEnrollmentPage() {
  const [enrollmentData, admissionsDemo] = await Promise.all([
    getRegistrarEnrollmentData(),
    listRegistrarAdmissionsPhase8Demo(),
  ]);
  return <RegistrarEnrollment enrollmentData={enrollmentData} admissionsDemo={admissionsDemo} />;
}

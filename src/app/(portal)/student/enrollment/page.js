import StudentEnrollmentWorkspace from "@/components/student/StudentEnrollmentWorkspace";
import { loadStudentEnrollmentForPage } from "@/features/students/student-enrollment-server";

export default async function StudentEnrollmentPage() {
  const data = await loadStudentEnrollmentForPage();
  return <StudentEnrollmentWorkspace data={data} />;
}

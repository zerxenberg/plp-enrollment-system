import { getStudentContext } from "@/features/students/student-context-server";
import { LiveStudentInstitutionalPage } from "@/components/student/LiveStudentInstitutionalPage";
import StudentEnrollmentWorkspace from "@/components/student/StudentEnrollmentWorkspace";
import { loadStudentEnrollmentForPage } from "@/features/students/student-enrollment-server";

export default async function StudentEnrollmentPage() {
  const student = await getStudentContext();
  if (student.kind === "live") return <LiveStudentInstitutionalPage section="Enrollment" />;
  const data = await loadStudentEnrollmentForPage();
  return <StudentEnrollmentWorkspace data={data} />;
}

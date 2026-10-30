import { getStudentContext } from "@/features/students/student-context-server";
import { LiveStudentInstitutionalPage } from "@/components/student/LiveStudentInstitutionalPage";
import StudentAcademicRecords from "@/components/student/StudentAcademicRecords";
import { loadStudentAcademicForPage } from "@/features/students/student-academic-server";

export default async function StudentAcademicRecordsPage() {
  const student = await getStudentContext();
  if (student.kind === "live") return <LiveStudentInstitutionalPage section="Academic Records" />;
  const academicView = await loadStudentAcademicForPage();
  return <StudentAcademicRecords {...academicView} />;
}

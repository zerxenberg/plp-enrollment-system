import StudentAcademicRecords from "@/components/student/StudentAcademicRecords";
import { loadStudentAcademicForPage } from "@/features/students/student-academic-server";

export default async function StudentAcademicRecordsPage() {
  const academicView = await loadStudentAcademicForPage();
  return <StudentAcademicRecords {...academicView} />;
}

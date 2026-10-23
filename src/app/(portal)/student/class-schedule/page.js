import StudentClassSchedule from "@/components/student/StudentClassSchedule";
import { loadStudentAcademicForPage } from "@/features/students/student-academic-server";

export default async function StudentClassSchedulePage() {
  const academicView = await loadStudentAcademicForPage();
  return <StudentClassSchedule {...academicView} />;
}

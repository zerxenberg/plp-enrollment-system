import { getStudentContext } from "@/features/students/student-context-server";
import { LiveStudentInstitutionalPage } from "@/components/student/LiveStudentInstitutionalPage";
import StudentClassSchedule from "@/components/student/StudentClassSchedule";
import { loadStudentAcademicForPage } from "@/features/students/student-academic-server";

export default async function StudentClassSchedulePage() {
  const student = await getStudentContext();
  if (student.kind === "live") return <LiveStudentInstitutionalPage section="Class Schedule" />;
  const academicView = await loadStudentAcademicForPage();
  return <StudentClassSchedule {...academicView} />;
}

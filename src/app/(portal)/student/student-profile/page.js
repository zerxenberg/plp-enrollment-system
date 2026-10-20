import StudentProfile from "@/components/student/StudentProfile";
import { loadStudentProfileForPage } from "@/features/students/student-profile-server";

export default async function StudentProfilePage() {
  const profileView = await loadStudentProfileForPage();
  return <StudentProfile {...profileView} />;
}

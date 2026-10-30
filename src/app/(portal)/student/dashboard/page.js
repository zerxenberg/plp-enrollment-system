import { getStudentContext } from "@/features/students/student-context-server";
import { LiveStudentInstitutionalPage } from "@/components/student/LiveStudentInstitutionalPage";
import StudentDashboardLive from "@/components/student/StudentDashboardLive";
import { loadStudentEnrollmentSummary } from "@/features/students/student-enrollment-server";
import { loadStudentNotifications } from "@/features/students/student-notifications-server";

export default async function StudentDashboardPage() {
  const student = await getStudentContext();
  if (student.kind === "live") return <LiveStudentInstitutionalPage section="Dashboard" />;
  const [enrollment, notices] = await Promise.all([
    loadStudentEnrollmentSummary(), loadStudentNotifications({ limit: 15 }),
  ]);
  return <StudentDashboardLive enrollment={enrollment} notices={notices} />;
}

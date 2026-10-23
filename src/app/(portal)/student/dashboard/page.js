import StudentDashboardLive from "@/components/student/StudentDashboardLive";
import { loadStudentEnrollmentSummary } from "@/features/students/student-enrollment-server";
import { loadStudentNotifications } from "@/features/students/student-notifications-server";

export default async function StudentDashboardPage() {
  const [enrollment, notices] = await Promise.all([
    loadStudentEnrollmentSummary(), loadStudentNotifications({ limit: 15 }),
  ]);
  return <StudentDashboardLive enrollment={enrollment} notices={notices} />;
}

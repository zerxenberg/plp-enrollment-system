import StudentNotificationsLive from "@/components/student/StudentNotificationsLive";
import { loadStudentNotifications } from "@/features/students/student-notifications-server";

export default async function StudentNotificationsPage() {
  const data = await loadStudentNotifications();
  return <StudentNotificationsLive data={data} />;
}

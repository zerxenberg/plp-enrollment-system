import "server-only";

import LiveStudentInstitutionalView from "./LiveStudentInstitutionalView";
import StudentDashboardLive from "./StudentDashboardLive";
import StudentEnrollmentWorkspace from "./StudentEnrollmentWorkspace";
import StudentAcademicRecords from "./StudentAcademicRecords";
import StudentClassSchedule from "./StudentClassSchedule";
import { admissionsDemonstrationSharedData } from "./admissions-demonstration-shared.mjs";
import { loadStudentNotifications } from "@/features/students/student-notifications-server";
import { loadLiveInstitutionalEnrollmentForPage } from
  "@/features/students/live-institutional-enrollment-server";
import {
  prepareInstitutionalAcademicAssignment,
  submitInstitutionalEnrollment,
  reopenInstitutionalEnrollmentForCorrection,
} from "@/features/students/live-institutional-enrollment-actions";
import {
  autoAssignAdmissionsPhase8Demo,
  submitAdmissionsPhase8Demo,
  reopenAdmissionsPhase8Demo,
} from "@/features/admissions/admissions-phase8-demo-actions";

// The institutional loader resolves the authenticated student identity and
// verifies database provenance before returning the serializable view model.
export async function LiveStudentInstitutionalPage({ section }) {
  const data = await loadLiveInstitutionalEnrollmentForPage();
  const shared = admissionsDemonstrationSharedData(data);
  if (shared) {
    switch (section) {
      case "Dashboard": {
        const notices = await loadStudentNotifications({ limit: 15 });
        return <StudentDashboardLive enrollment={shared.enrollment} notices={notices} />;
      }
      case "Enrollment":
        return <StudentEnrollmentWorkspace data={shared.enrollment}
          submitEnrollmentAction={submitAdmissionsPhase8Demo}
          prepareEnrollmentAction={autoAssignAdmissionsPhase8Demo}
          reopenEnrollmentAction={reopenAdmissionsPhase8Demo}
          demonstrationCorUrl={shared.registrationUrl} />;
      case "Academic Records":
        return <StudentAcademicRecords mode="project" snapshot={shared.academic} />;
      case "Class Schedule":
        return <StudentClassSchedule mode="project"
          projectSchedule={shared.projectSchedule}
          proposedSchedule={shared.proposedSchedule}
          demonstrationCorUrl={shared.registrationUrl} />;
      default:
        break;
    }
  }
  return <LiveStudentInstitutionalView section={section} data={data}
    prepareAction={prepareInstitutionalAcademicAssignment}
    submitAction={submitInstitutionalEnrollment}
    reopenAction={reopenInstitutionalEnrollmentForCorrection}
    prepareDemonstrationAction={autoAssignAdmissionsPhase8Demo}
    submitDemonstrationAction={submitAdmissionsPhase8Demo}
    reopenDemonstrationAction={reopenAdmissionsPhase8Demo} />;
}

"use server";

import { revalidatePath } from "next/cache";
import { requireStudentContext } from "./student-context-server";
import { assertCanSubmitProjectEnrollment } from "./student-enrollment-server";
import {
  estimateProjectSelectedSubjects,
} from "./project-fee-estimate.mjs";
import { loadVerifiedProjectSubjectPrices } from "./project-fee-prices-server";

function refreshStudentEnrollmentViews() {
  for (const path of ["/student/dashboard", "/student/enrollment",
    "/student/class-schedule", "/student/academic-records"]) {
    revalidatePath(path);
  }
}

export async function submitPreparedProjectEnrollment() {
  const { context, proposedSubjects, termId, curriculumCode } =
    await assertCanSubmitProjectEnrollment();
  const subjectCodes = proposedSubjects.map((subject) => subject.code);
  const previous = await context.client.rpc("project_phase8_student_portal_status_v1", {
    p_student_id: context.studentId,
  });
  if (previous.error || previous.data?.project_only !== true ||
      previous.data?.verified_institutionally !== false ||
      previous.data?.curriculum_is_official !== false ||
      previous.data?.curriculum_code !== curriculumCode ||
      (previous.data?.simulation &&
        (previous.data.simulation.term_id !== termId ||
          !["DRAFT", "RETURNED"].includes(previous.data.simulation.status)))) {
    throw new Error("Could not verify current enrollment status.");
  }

  // OPEN reuses an existing draft under the database's unique(student,term)
  // constraint. A trusted subject selection must be persisted before SUBMIT.
  let simulationId = previous.data.simulation?.id;
  if (!previous.data.simulation) {
    const opened = await context.client.rpc("project_phase8_simulated_enrollment_action_v1", {
      p_student_id: context.studentId, p_action: "OPEN", p_reason: null,
    });
    if (opened.error || opened.data?.status !== "DRAFT" ||
        opened.data?.fictional_only !== true || !opened.data?.simulation_id) {
      throw new Error("Unable to prepare your enrollment at this time.");
    }
    simulationId = opened.data.simulation_id;
  }
  if (!simulationId || !subjectCodes.length) {
    throw new Error("A verified enrollment draft and subject selection are required.");
  }
  // The authenticated database function must revalidate the curriculum,
  // academic readiness, offered OPEN sections and schedule immediately before
  // storing the selected subjects. Missing RPCs and partial results fail closed.
  let registered;
  try {
    registered = await context.client.rpc("project_phase8_register_prepared_subjects_v1", {
      p_student_id: context.studentId,
      p_subject_codes: subjectCodes,
    });
  } catch {
    throw new Error("Your prepared subjects could not be registered. Refresh enrollment and try again.");
  }
  const saved = registered?.data;
  if (registered?.error || saved?.simulation_id !== simulationId ||
      saved?.fictional_only !== true ||
      saved?.ready_to_submit !== true ||
      saved?.selected_subject_count !== subjectCodes.length) {
    throw new Error("Your prepared subjects could not be registered. Refresh enrollment and try again.");
  }
  const submitted = await context.client.rpc("project_phase8_simulated_enrollment_action_v1", {
    p_student_id: context.studentId, p_action: "SUBMIT", p_reason: null,
  });
  if (submitted.error || submitted.data?.status !== "SUBMITTED") {
    throw new Error("Submission was not accepted. Refresh and review the current academic requirements.");
  }
  refreshStudentEnrollmentViews();
  return { status: "SUBMITTED", simulationOnly: true };
}

export async function getConfirmedProjectDemonstrationCor() {
  const context = await requireStudentContext();
  const { data: status, error } = await context.client.rpc(
    "project_phase8_student_portal_status_v1", { p_student_id: context.studentId },
  );
  const simulation = status?.simulation;
  if (error || status?.project_only !== true ||
      status?.verified_institutionally !== false ||
      status?.curriculum_is_official !== false ||
      simulation?.status !== "CONFIRMED_SIMULATION") {
    throw new Error("Registrar confirmation of the fictional enrollment record is required before viewing this demonstration registration document.");
  }
  const result = await context.client.rpc("project_phase8_demonstration_cor_v1", {
    p_simulation_id: simulation.id,
  });
  if (result.error || result.data?.simulation_only !== true ||
      result.data.official !== false ||
      result.data.certificate_of_official_registration !== false ||
      result.data.registration_snapshot_complete !== true ||
      result.data.simulation_id !== simulation.id ||
      result.data.student?.student_number !== context.studentNumber ||
      result.data.student?.curriculum_code !== status.curriculum_code ||
      !Array.isArray(result.data.registered_subjects) ||
      !result.data.registered_subjects.length ||
      !Array.isArray(result.data.registered_schedule) ||
      !result.data.registered_schedule.length) {
    throw new Error("The demonstration registration document could not be loaded.");
  }
  // The registered subjects are persisted by the Registrar confirmation
  // transaction. Recomputing selection from the live project curriculum would
  // silently change the COR if eligibility or scheduling changes afterwards.
  const selected = result.data.registered_subjects.map((item) => ({
    code: item.subject_code, name: item.subject_name, units: item.academic_units,
    section: item.section_code,
  }));
  const codes = new Set(selected.map((subject) => subject.code));
  if (codes.size !== selected.length || selected.some((item) =>
    !item.code || !item.name || !item.section) ||
      result.data.registered_schedule.some((item) =>
        !codes.has(item.subject_code) || item.day_of_week == null ||
        !item.start_time || !item.end_time) ||
      selected.some((item) => !result.data.registered_schedule.some(
        (meeting) => meeting.subject_code === item.code))) {
    throw new Error("The confirmed registration snapshot is incomplete.");
  }
  const prices = await loadVerifiedProjectSubjectPrices(
    context.admin, status.curriculum_code, selected);
  const projectFeeEstimate = estimateProjectSelectedSubjects(selected, prices);
  if (projectFeeEstimate.totalUnits !== Number(result.data.registered_units)) {
    throw new Error("The confirmed units could not be verified against the registration snapshot.");
  }
  return { ...result.data, projectFeeEstimate };
}

function validNotificationId(value) {
  return typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9:_./-]{0,127}$/.test(value);
}

export async function markStudentNotificationRead(notificationId, read = true) {
  if (!validNotificationId(notificationId)) {
    return { ok: false, message: "Invalid notification." };
  }
  const context = await requireStudentContext();
  const { data, error } = await context.client.from("user_notifications")
    .update({ is_read: Boolean(read), read_at: read ? new Date().toISOString() : null })
    .eq("user_id", context.appUserId)
    .eq("notification_id", notificationId)
    .select("notification_id");
  if (error || !data?.length) {
    return { ok: false, message: "The notification could not be updated." };
  }
  revalidatePath("/student/notifications");
  revalidatePath("/student/dashboard");
  return { ok: true };
}

export async function markAllStudentNotificationsRead() {
  const context = await requireStudentContext();
  const { error } = await context.client.from("user_notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", context.appUserId).eq("is_read", false);
  if (error) return { ok: false, message: "Notifications could not be updated." };
  revalidatePath("/student/notifications");
  revalidatePath("/student/dashboard");
  return { ok: true };
}

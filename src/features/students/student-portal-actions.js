"use server";

import { revalidatePath } from "next/cache";
import { requireStudentContext } from "./student-context-server";
import { assertCanSubmitProjectEnrollment } from "./student-enrollment-server";

function refreshStudentEnrollmentViews() {
  for (const path of ["/student/dashboard", "/student/enrollment",
    "/student/class-schedule", "/student/academic-records"]) {
    revalidatePath(path);
  }
}

export async function submitPreparedProjectEnrollment() {
  const context = await assertCanSubmitProjectEnrollment();
  const previous = await context.client.rpc("project_phase8_student_portal_status_v1", {
    p_student_id: context.studentId,
  });
  if (previous.error || previous.data?.project_only !== true ||
      previous.data?.verified_institutionally !== false) {
    throw new Error("Could not verify current enrollment status.");
  }

  // OPEN reuses an existing draft under the database's unique(student,term)
  // constraint. Only a deliberate confirmation can invoke SUBMIT.
  if (!previous.data.simulation) {
    const opened = await context.client.rpc("project_phase8_simulated_enrollment_action_v1", {
      p_student_id: context.studentId, p_action: "OPEN", p_reason: null,
    });
    if (opened.error) throw new Error("Unable to prepare your enrollment at this time.");
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
      simulation?.status !== "CONFIRMED_SIMULATION") {
    throw new Error("A Registrar confirmed project simulation is required before a demonstration registration document can be viewed.");
  }
  const result = await context.client.rpc("project_phase8_demonstration_cor_v1", {
    p_simulation_id: simulation.id,
  });
  if (result.error || !result.data?.simulation_only || result.data.official !== false) {
    throw new Error("The demonstration registration document could not be loaded.");
  }
  return result.data;
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

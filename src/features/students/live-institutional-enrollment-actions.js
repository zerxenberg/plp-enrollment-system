"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStudentContext } from "./student-context-server";
import { loadLiveInstitutionalEnrollmentForPage } from "./live-institutional-enrollment-server";
import {
  openStudentEnrollment, selectStudentEnrollmentSubject,
  submitStudentEnrollment,
} from "./official-enrollment-actions";

const blocked = (reason) => ({ ok: false, message: reason || "Academic preparation requires validated official records." });

export async function prepareInstitutionalAcademicAssignment() {
  // Always re-resolve and revalidate current student identity from Auth, never
  // take a browser student ID, arbitrary section, or academic term.
  const context = await getStudentContext();
  if (context.kind !== "live") return blocked("An authenticated institutional student account is required.");
  const view = await loadLiveInstitutionalEnrollmentForPage();
  if (view.kind !== "ready" || view.academic?.isOfficialCurriculum !== true ||
      view.enrollment?.canPrepare !== true || !view.term?.id) {
    return blocked(view.enrollment?.blockingReasons?.[0]);
  }
  const proposed = view.enrollment.subjects || [];
  if (!proposed.length || proposed.some((item) =>
    !item.active || !item.sectionReady || !item.sectionId)) {
    return blocked("The Academic Coordinator must finalize real subject offerings and schedules.");
  }
  try {
    if (view.enrollment.academicPrepared !== true) {
      // Atomic, service-role-only preparation validates the genuine approved
      // block and records term/curriculum/eligibility under database locks.
      const { data: placement, error: placementError } = await createAdminClient().rpc(
        "system_prepare_verified_admissions_student_v1",
        { p_student_id: context.studentId },
      );
      if (placementError || placement?.prepared !== true ||
          placement.term_id !== view.term.id ||
          placement.curriculum_code !== view.student.curriculum) {
        return blocked("Academic assignment could not be approved. The Academic Coordinator and Registrar must verify the published institutional sections and the student's eligibility.");
      }
    }
    const refreshed = await loadLiveInstitutionalEnrollmentForPage();
    const planned = refreshed.enrollment?.subjects || [];
    if (refreshed.kind !== "ready" || refreshed.student.status !== "ACTIVE" ||
        refreshed.academic?.isOfficialCurriculum !== true ||
        !planned.length || planned.some((item) =>
          !item.active || !item.sectionReady || !item.sectionId ||
          !["ELIGIBLE", "RETAKE"].includes(item.eligibility))) {
      return blocked("The academic placement is recorded, but subject readiness could not be reverified. Contact the Registrar.");
    }
    const opened = await openStudentEnrollment(refreshed.term.id);
    for (const item of planned) {
      // Each RPC independently verifies curriculum, Auth ownership, section,
      // capacity, unit load and schedule conflicts. Partial selections remain
      // an editable IN_PROGRESS enrollment and are never auto-confirmed.
      const selected = await selectStudentEnrollmentSubject(opened.enrollmentId, item.code, item.sectionId);
      if (selected.selected !== true) {
        return blocked("A verified subject could not be registered in its assigned section. Retry the preparation or contact the Registrar.");
      }
    }
    revalidatePath("/student/enrollment");
    revalidatePath("/student/class-schedule");
    revalidatePath("/student/dashboard");
    return { ok: true, message: "Your approved class sections are prepared. Review them before submitting." };
  } catch {
    return blocked("Your academic preparation could not be completed. Review the current sections and contact the Registrar.");
  }
}

export async function submitInstitutionalEnrollment() {
  const context = await getStudentContext();
  if (context.kind !== "live") return blocked("An authenticated institutional student account is required.");
  const view = await loadLiveInstitutionalEnrollmentForPage();
  if (view.kind !== "ready" || view.academic?.isOfficialCurriculum !== true ||
      view.enrollment?.canSubmit !== true || !view.enrollment.id) {
    return blocked(view.enrollment?.blockingReasons?.[0]);
  }
  try {
    const submitted = await submitStudentEnrollment(view.enrollment.id);
    if (submitted.submitted !== true) {
      return blocked("The Enrollment System did not confirm submission. Review your subjects or contact the Registrar.");
    }
    // Transition SUBMITTED -> FOR_VALIDATION is SYSTEM-only in the official
    // status matrix. The trusted RPC atomically validates original source
    // provenance, enrollment eligibility, and real final meetings and logs
    // the transition. It never validates or confirms for the Registrar.
    const { data: queued, error: queueError } = await createAdminClient().rpc(
      "system_queue_verified_enrollment_v1",
      { p_enrollment_id: view.enrollment.id },
    );
    for (const route of ["/student/dashboard", "/student/enrollment",
      "/student/class-schedule", "/registrar/enrollment"]) revalidatePath(route);
    return { ok: true, message: !queueError && queued === true
      ? "Enrollment submitted to the Registrar validation queue. Official confirmation is still required."
      : "Enrollment submitted, but the verified Registrar queue could not accept it yet. Contact the Registrar; it has not been officially confirmed." };
  } catch {
    return blocked("Submission was rejected because academic eligibility or section readiness changed. Please contact the Registrar.");
  }
}

export async function reopenInstitutionalEnrollmentForCorrection() {
  const context = await getStudentContext();
  if (context.kind !== "live") return blocked("An institutional student account is required.");
  const view = await loadLiveInstitutionalEnrollmentForPage();
  if (view.kind !== "ready" || view.enrollment?.status !== "REQUIRES_CORRECTION" ||
      !view.enrollment?.id) {
    return blocked("No Registrar-returned enrollment is available for correction.");
  }
  const { data, error } = await context.client.rpc(
    "student_reopen_admissions_correction_v1",
    { p_enrollment_id: view.enrollment.id },
  );
  if (error || data?.reopened !== true ||
      data.enrollment_id !== view.enrollment.id || data.status !== "IN_PROGRESS") {
    return blocked("The returned enrollment could not be reopened. Contact the Registrar.");
  }
  revalidatePath("/student/enrollment");
  revalidatePath("/student/dashboard");
  return {
    ok: true,
    message: "Your enrollment is editable again. Review your subjects before resubmitting for Registrar validation.",
  };
}

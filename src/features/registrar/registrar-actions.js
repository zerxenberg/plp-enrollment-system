"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import {
  readProjectDemonstrationCOR,
  simulateProjectEnrollmentAction,
} from "@/features/academic/project-phase8-actions";
import {
  amendOfficialAcademicResult,
  attestOfficialGradeSource,
  getOfficialRegistrationData,
  previewOfficialGradeImport,
  publishOfficialGradeImport,
  stageOfficialGradeImport,
  validateOfficialGradeImport,
} from "@/features/grade-import/registrar-grade-actions";
import {
  confirmRegistrarValidatedEnrollment,
} from "@/features/students/official-enrollment-actions";
import {
  getRegistrarProjectEnrollmentDetail,
  getRegistrarStudentRecordDetail,
} from "./registrar-queries";

function success(message, data = null) {
  return { ok: true, message, data };
}

function failure(message, data = null) {
  return { ok: false, message, data };
}

function messageFromError(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function revalidateRegistrar(...paths) {
  for (const path of paths) revalidatePath(path);
}

export async function markRegistrarNotification(notificationId, read = true) {
  try {
    const actor = await requireRole("registrar");
    const supabase = await createClient();
    const { error } = await supabase
      .from("user_notifications")
      .update({
        is_read: Boolean(read),
        read_at: read ? new Date().toISOString() : null,
      })
      .eq("notification_id", notificationId)
      .eq("user_id", actor.id);

    if (error) return failure(error.message || "Notification state could not be updated.");
    revalidateRegistrar("/registrar/notifications", "/registrar/dashboard");
    return success(read ? "Notification marked as read." : "Notification marked as unread.");
  } catch (error) {
    return failure(messageFromError(error, "Notification update failed."));
  }
}

export async function markAllRegistrarNotifications() {
  try {
    const actor = await requireRole("registrar");
    const supabase = await createClient();
    const { error } = await supabase
      .from("user_notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq("user_id", actor.id)
      .eq("is_read", false);

    if (error) return failure(error.message || "Notifications could not be updated.");
    revalidateRegistrar("/registrar/notifications", "/registrar/dashboard");
    return success("All Registrar notifications were marked as read.");
  } catch (error) {
    return failure(messageFromError(error, "Notification update failed."));
  }
}

export async function performProjectEnrollmentAction(payload) {
  try {
    const studentId = payload?.studentId;
    const action = String(payload?.action || "").toUpperCase();
    const reason = String(payload?.reason || "").trim();

    if (!studentId || !["VALIDATE", "RETURN", "CONFIRM"].includes(action)) {
      return failure("Select a supported demonstration enrollment action.");
    }

    if (["RETURN", "CONFIRM"].includes(action) && !reason) {
      return failure("A reason or source reference is required.");
    }

    const data = await simulateProjectEnrollmentAction(studentId, action, reason);
    revalidateRegistrar("/registrar/enrollment", "/registrar/dashboard", "/registrar/reports-monitoring", "/registrar/students");

    const label =
      action === "CONFIRM"
        ? "Project enrollment was confirmed for demonstration only."
        : action === "RETURN"
          ? "Project enrollment was returned for correction."
          : "Project enrollment was validated.";

    return success(label, data);
  } catch (error) {
    return failure(messageFromError(error, "Project enrollment action was rejected."));
  }
}

export async function recoverRegistrarLegacyProjectEnrollment(payload) {
  try {
    await requireRole("registrar");
    const studentId = payload?.studentId;
    const reason = String(payload?.reason || "").trim();
    if (!studentId || reason.length < 20 || reason.length > 1000) {
      return failure("A detailed recovery explanation of at least 20 characters is required.");
    }
    const client = await createClient();
    const { data, error } = await client.rpc("project_phase8_recover_legacy_registration_v1", {
      p_student_id: studentId,
      p_reason: reason,
    });
    if (error || data?.project_only !== true || data.recovered !== true ||
        data.student_id !== studentId || data.status !== "RETURNED") {
      return failure("Legacy demonstration enrollment recovery was not authorized or the record no longer qualifies.");
    }
    for (const route of ["/registrar/enrollment", "/registrar/dashboard",
      "/student/dashboard", "/student/enrollment", "/student/class-schedule"]) revalidatePath(route);
    return success("Legacy project confirmation was preserved in audit history and enrollment was returned for a new student registration.", data);
  } catch (error) {
    return failure(messageFromError(error, "Authorized project enrollment recovery was rejected."));
  }
}

export async function confirmProjectEnrollmentBatch(studentIds, sourceReference) {
  try {
    await requireRole("registrar");
    const ids = Array.isArray(studentIds)
      ? [...new Set(studentIds.filter(Boolean))]
      : [];
    const reference = String(sourceReference || "").trim();

    if (!ids.length) return failure("Select at least one validated project enrollment.");
    if (!reference) return failure("A batch confirmation source reference is required.");

    const results = [];
    for (const studentId of ids) {
      try {
        const data = await simulateProjectEnrollmentAction(
          studentId,
          "CONFIRM",
          reference,
        );
        results.push({
          studentId,
          ok: true,
          status: data?.status,
          simulationId: data?.simulation_id,
        });
      } catch (error) {
        results.push({
          studentId,
          ok: false,
          message: messageFromError(error, "Confirmation rejected."),
        });
      }
    }

    revalidateRegistrar(
      "/registrar/enrollment",
      "/registrar/dashboard",
      "/registrar/reports-monitoring",
    );

    const succeeded = results.filter((item) => item.ok).length;
    const failed = results.length - succeeded;

    return {
      ok: failed === 0,
      message: `${succeeded} project enrollment${succeeded === 1 ? "" : "s"} confirmed for demonstration. ${failed} remained unconfirmed.`,
      data: { results, succeeded, failed },
    };
  } catch (error) {
    return failure(messageFromError(error, "Batch project confirmation failed."));
  }
}

export async function confirmOfficialEnrollment(payload) {
  try {
    const enrollmentId = payload?.enrollmentId;
    const sourceReference = String(payload?.sourceReference || "").trim();

    if (!enrollmentId || !sourceReference) {
      return failure("Enrollment and official validation source reference are required.");
    }

    const data = await confirmRegistrarValidatedEnrollment(
      enrollmentId,
      sourceReference,
    );

    revalidateRegistrar(
      "/registrar/enrollment",
      "/registrar/dashboard",
      "/registrar/reports-monitoring",
    );

    return success("Official institutional enrollment was confirmed.", data);
  } catch (error) {
    return failure(messageFromError(error, "Official enrollment confirmation was rejected."));
  }
}

function requireVerifiedRows(result, message) {
  if (result.error || !Array.isArray(result.data)) throw new Error(message);
  return result.data;
}

const OFFICIAL_REVIEW_REFUSALS = new Set([
  "Official subject, eligibility, or schedule evidence could not be verified.",
  "The enrollment is not linked to a verified institutional 2026 academic record.",
  "Submitted subjects or declared academic units are incomplete.",
  "The submitted subjects require current institutional eligibility and OPEN finalized sections.",
  "The subject offerings are not verified institutional offerings.",
  "Every selected section requires recorded active meetings, rooms, and primary instructors.",
  "The current class timetable has unverified room or faculty assignments.",
  "The student's registered classes have overlapping meetings.",
  "The official section capacity could not be verified.",
  "A selected class section has reached its approved capacity.",
]);

async function verifyOfficialRegistrarSelection(client, enrollment) {
  const unavailable = "Official subject, eligibility, or schedule evidence could not be verified.";
  const [profileResult, termResult, curriculumResult, selectionResult] = await Promise.all([
    client.from("student_profiles")
      .select("id,user_id,record_kind,is_synthetic_demo,student_status,program_code,current_curriculum_code,current_term_id")
      .eq("id", enrollment.student_id).maybeSingle(),
    client.from("academic_terms")
      .select("id,academic_year,semester").eq("id", enrollment.term_id).maybeSingle(),
    client.from("curricula")
      .select("code,program_code,status").eq("code", enrollment.curriculum_code).maybeSingle(),
    client.from("enrollment_subjects")
      .select("enrollment_id,subject_code,section_id,registration_status,units_at_enrollment")
      .eq("enrollment_id", enrollment.id),
  ]);
  const student = profileResult.data;
  const term = termResult.data;
  const curriculum = curriculumResult.data;
  if (profileResult.error || termResult.error || curriculumResult.error ||
      !student || !term || !curriculum ||
      student.record_kind === "PROJECT_ONLY" || student.is_synthetic_demo !== false ||
      student.student_status !== "ACTIVE" ||
      student.program_code !== enrollment.program_code ||
      student.current_curriculum_code !== enrollment.curriculum_code ||
      student.current_term_id !== enrollment.term_id ||
      curriculum.program_code !== enrollment.program_code ||
      String(curriculum.status || "").toLowerCase() !== "active" ||
      !String(term.academic_year || "").startsWith("2026")) {
    throw new Error("The enrollment is not linked to a verified institutional 2026 academic record.");
  }

  const selected = requireVerifiedRows(selectionResult, unavailable);
  if (!selected.length || selected.some((row) =>
    row.registration_status !== "SELECTED" || !row.section_id || !row.subject_code ||
    !Number.isInteger(Number(row.units_at_enrollment)) ||
    Number(row.units_at_enrollment) <= 0) ||
    new Set(selected.map((row) => row.subject_code)).size !== selected.length ||
    new Set(selected.map((row) => row.section_id)).size !== selected.length ||
    selected.reduce((sum, row) => sum + Number(row.units_at_enrollment), 0) !==
      Number(enrollment.declared_units)) {
    throw new Error("Submitted subjects or declared academic units are incomplete.");
  }
  const codes = selected.map((row) => row.subject_code);
  const sectionIds = selected.map((row) => row.section_id);
  const [eligibilityResult, placementResult, sectionResult] = await Promise.all([
    client.from("student_subject_eligibility")
      .select("subject_code,eligibility_status,source_name")
      .eq("student_id", student.id).eq("term_id", term.id).in("subject_code", codes),
    client.from("curriculum_subjects")
      .select("subject_code").eq("curriculum_code", curriculum.code).in("subject_code", codes),
    client.from("sections")
      .select("id,subject_code,term_id,status,schedule_status,capacity,subject_offering_id,is_synthetic_demo")
      .in("id", sectionIds),
  ]);
  const eligibility = requireVerifiedRows(eligibilityResult, unavailable);
  const placements = requireVerifiedRows(placementResult, unavailable);
  const sections = requireVerifiedRows(sectionResult, unavailable);
  const eligibilityByCode = new Map(eligibility.map((row) => [row.subject_code, row]));
  const sectionById = new Map(sections.map((row) => [row.id, row]));
  if (eligibilityByCode.size !== codes.length || sections.length !== codes.length ||
      !codes.every((code) => placements.some((row) => row.subject_code === code)) ||
      selected.some((row) => {
        const allowed = eligibilityByCode.get(row.subject_code);
        const section = sectionById.get(row.section_id);
        return !allowed || !["ELIGIBLE", "RETAKE"].includes(allowed.eligibility_status) ||
          !allowed.source_name || /PROJECT_ONLY|FICTIONAL|SYNTHETIC|PHASE8/i.test(allowed.source_name) ||
          !section || section.is_synthetic_demo !== false ||
          section.term_id !== term.id || section.subject_code !== row.subject_code ||
          section.status !== "OPEN" || section.schedule_status !== "FINALIZED" ||
          !section.subject_offering_id || !Number.isInteger(Number(section.capacity)) ||
          Number(section.capacity) <= 0;
      })) {
    throw new Error("The submitted subjects require current institutional eligibility and OPEN finalized sections.");
  }

  const offeringIds = [...new Set(sections.map((section) => section.subject_offering_id))];
  const [offeringsResult, meetingsResult, instructorLinksResult, occupiedResult] = await Promise.all([
    client.from("subject_offerings")
      .select("id,term_id,program_code,curriculum_code,subject_code,status,is_synthetic_demo")
      .in("id", offeringIds),
    client.from("section_meetings")
      .select("section_id,day_of_week,start_time,end_time,room_id,meeting_status,is_synthetic_demo")
      .in("section_id", sectionIds).eq("meeting_status", "ACTIVE"),
    client.from("section_instructors")
      .select("section_id,instructor_id,assignment_role")
      .in("section_id", sectionIds).eq("assignment_role", "PRIMARY"),
    client.from("enrollment_subjects")
      .select("enrollment_id,section_id,registration_status")
      .in("section_id", sectionIds).eq("registration_status", "CONFIRMED"),
  ]);
  const offerings = requireVerifiedRows(offeringsResult, unavailable);
  const meetings = requireVerifiedRows(meetingsResult, unavailable);
  const links = requireVerifiedRows(instructorLinksResult, unavailable);
  const occupied = requireVerifiedRows(occupiedResult, unavailable);
  const offeringById = new Map(offerings.map((row) => [row.id, row]));
  if (offerings.length !== offeringIds.length || sections.some((section) => {
    const offering = offeringById.get(section.subject_offering_id);
    return !offering || offering.is_synthetic_demo !== false || offering.status !== "ACTIVE" ||
      offering.term_id !== term.id || offering.subject_code !== section.subject_code ||
      offering.program_code !== enrollment.program_code ||
      offering.curriculum_code !== curriculum.code;
  })) {
    throw new Error("The subject offerings are not verified institutional offerings.");
  }

  const roomIds = [...new Set(meetings.map((row) => row.room_id).filter(Boolean))];
  const instructorIds = [...new Set(links.map((row) => row.instructor_id).filter(Boolean))];
  if (!roomIds.length || !instructorIds.length || meetings.some((row) =>
    row.is_synthetic_demo !== false || row.day_of_week == null ||
    !row.start_time || !row.end_time || row.start_time >= row.end_time || !row.room_id) ||
    sections.some((section) => !meetings.some((row) => row.section_id === section.id) ||
      !links.some((row) => row.section_id === section.id && row.instructor_id))) {
    throw new Error("Every selected section requires recorded active meetings, rooms, and primary instructors.");
  }
  const [roomsResult, instructorsResult] = await Promise.all([
    client.from("rooms").select("id,is_active,is_synthetic_demo").in("id", roomIds),
    client.from("instructors").select("id,is_synthetic_demo,display_name").in("id", instructorIds),
  ]);
  const rooms = requireVerifiedRows(roomsResult, unavailable);
  const instructors = requireVerifiedRows(instructorsResult, unavailable);
  if (rooms.length !== roomIds.length || instructors.length !== instructorIds.length ||
      rooms.some((room) => !room.is_active || room.is_synthetic_demo !== false) ||
      instructors.some((teacher) => teacher.is_synthetic_demo !== false || !teacher.display_name)) {
    throw new Error("The current class timetable has unverified room or faculty assignments.");
  }

  for (let index = 0; index < meetings.length; index++) {
    for (let next = index + 1; next < meetings.length; next++) {
      const first = meetings[index];
      const second = meetings[next];
      if (first.section_id !== second.section_id &&
          first.day_of_week === second.day_of_week &&
          first.start_time < second.end_time && second.start_time < first.end_time) {
        throw new Error("The student's registered classes have overlapping meetings.");
      }
    }
  }

  const occupiedEnrollmentIds = [...new Set(occupied.map((row) => row.enrollment_id)
    .filter((id) => id !== enrollment.id))];
  const activeEnrollmentRows = occupiedEnrollmentIds.length
    ? requireVerifiedRows(await client.from("enrollments")
      .select("id,student_id,term_id,status").in("id", occupiedEnrollmentIds), unavailable)
    : [];
  if (activeEnrollmentRows.length !== occupiedEnrollmentIds.length) {
    throw new Error("The official section capacity could not be verified.");
  }
  for (const section of sections) {
    const participants = new Set(occupied.filter((row) =>
      row.section_id === section.id && row.enrollment_id !== enrollment.id)
      .flatMap((row) => activeEnrollmentRows.filter((item) =>
        item.id === row.enrollment_id && item.term_id === term.id &&
        item.status === "CONFIRMED").map((item) => item.student_id)));
    if (participants.size >= Math.min(Number(section.capacity), 40)) {
      throw new Error("A selected class section has reached its approved capacity.");
    }
  }
}

export async function reviewOfficialEnrollment(payload) {
  try {
    await requireRole("registrar");
    const enrollmentId = String(payload?.enrollmentId || "");
    const action = String(payload?.action || "");
    const reason = String(payload?.reason || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(enrollmentId) ||
        !["VALIDATE", "RETURN"].includes(action)) {
      return failure("Select a valid official enrollment and Registrar review action.");
    }
    if (reason.length < 10 || reason.length > 1000) {
      return failure("A Registrar review reason of 10 to 1000 characters is required.");
    }
    const client = await createClient();
    const { data: enrollment, error: readError } = await client.from("enrollments")
      .select("id,student_id,program_code,term_id,curriculum_code,status,declared_units")
      .eq("id", enrollmentId).maybeSingle();
    if (readError || !enrollment || enrollment.status !== "FOR_VALIDATION" ||
        !enrollment.curriculum_code) {
      return failure("Only an eligible official enrollment awaiting Registrar validation can be reviewed.");
    }
    if (action === "VALIDATE") {
      await verifyOfficialRegistrarSelection(client, enrollment);
    } else {
      const [profileResult, termResult, curriculumResult] = await Promise.all([
        client.from("student_profiles")
          .select("id,record_kind,is_synthetic_demo,program_code,current_curriculum_code,current_term_id")
          .eq("id", enrollment.student_id).maybeSingle(),
        client.from("academic_terms")
          .select("id,academic_year").eq("id", enrollment.term_id).maybeSingle(),
        client.from("curricula")
          .select("code,program_code,status").eq("code", enrollment.curriculum_code).maybeSingle(),
      ]);
      const profile = profileResult.data;
      const term = termResult.data;
      const curriculum = curriculumResult.data;
      const profileError = profileResult.error || termResult.error || curriculumResult.error;
      if (profileError || !profile || profile.record_kind === "PROJECT_ONLY" ||
          profile.is_synthetic_demo !== false || profile.program_code !== enrollment.program_code ||
          profile.current_curriculum_code !== enrollment.curriculum_code ||
          profile.current_term_id !== enrollment.term_id ||
          !term || !String(term.academic_year || "").startsWith("2026") ||
          !curriculum || curriculum.code !== enrollment.curriculum_code ||
          curriculum.program_code !== enrollment.program_code ||
          String(curriculum.status || "").toLowerCase() !== "active") {
        return failure("The institutional student record could not be verified.");
      }
    }
    const newStatus = action === "VALIDATE" ? "VALIDATED" : "REQUIRES_CORRECTION";
    // The authenticated, Registrar-only transaction must recheck the live
    // selection and persist the enrollment transition with its audit history.
    const { data: changed, error: actionError } = await client.rpc(
      "registrar_review_verified_admissions_enrollment_v1", {
        p_enrollment_id: enrollmentId, p_action: action, p_reason: reason,
      });
    if (actionError || changed?.enrollment_id !== enrollmentId ||
        changed?.status !== newStatus || changed?.reviewed !== true) {
      return failure("Registrar review was not saved or its audit history could not be verified.");
    }
    revalidateRegistrar("/registrar/enrollment", "/registrar/dashboard",
      "/registrar/reports-monitoring", "/student/enrollment", "/student/dashboard");
    return success(action === "VALIDATE"
      ? "Official enrollment passed Registrar validation and is ready for separate confirmation."
      : "Official enrollment was returned for correction with the recorded reason.",
    { enrollmentId, status: newStatus });
  } catch (error) {
    return failure(OFFICIAL_REVIEW_REFUSALS.has(error?.message)
      ? error.message : "Registrar official enrollment review could not be completed.");
  }
}

export async function loadRegistrarProjectEnrollmentDetail(studentId) {
  try {
    await requireRole("registrar");
    const data = await getRegistrarProjectEnrollmentDetail(studentId);
    return success("Project enrollment detail loaded.", data);
  } catch (error) {
    return failure(messageFromError(error, "Project enrollment detail is unavailable."));
  }
}

export async function loadRegistrarStudentRecordDetail(studentId, projectOnly = false) {
  try {
    await requireRole("registrar");
    const data = await getRegistrarStudentRecordDetail(studentId, projectOnly);
    return success("Student record loaded.", data);
  } catch (error) {
    return failure(messageFromError(error, "Student record is unavailable."));
  }
}

export async function previewRegistrarGradeImport(formData) {
  try {
    const data = await previewOfficialGradeImport(formData);
    return success(
      data.invalidRows
        ? `Preview completed with ${data.invalidRows} row${data.invalidRows === 1 ? "" : "s"} requiring correction.`
        : "Preview completed. All rows passed the pre-stage checks.",
      data,
    );
  } catch (error) {
    return failure(messageFromError(error, "Grade file preview failed."));
  }
}

export async function stageRegistrarGradeImport(formData) {
  try {
    const data = await stageOfficialGradeImport(formData);
    revalidateRegistrar("/registrar/students");
    return success(
      "Official grade file was staged. Keep this batch reference open while you validate, verify, and publish it.",
      data,
    );
  } catch (error) {
    return failure(messageFromError(error, "Official grade file could not be staged."));
  }
}

export async function validateRegistrarGradeImport(batchId) {
  try {
    if (!batchId) return failure("Grade import batch reference is required.");
    const data = await validateOfficialGradeImport(batchId);
    revalidateRegistrar("/registrar/students");

    return success(
      data?.invalid_rows
        ? `Validation completed with ${data.invalid_rows} invalid row${data.invalid_rows === 1 ? "" : "s"}.`
        : "All grade records passed validation. Verify the official source before publishing.",
      data,
    );
  } catch (error) {
    return failure(messageFromError(error, "Grade import validation failed."));
  }
}

export async function verifyRegistrarGradeSource(payload) {
  try {
    const batchId = payload?.batchId;
    const sourceReference = String(payload?.sourceReference || "").trim();
    const checksum = String(payload?.checksum || "").trim();
    const method = String(payload?.method || "").trim();

    if (!batchId || !sourceReference || !checksum || !method) {
      return failure("Grade source verification information is incomplete.");
    }

    const data = await attestOfficialGradeSource(
      batchId,
      sourceReference,
      checksum,
      method,
    );

    revalidateRegistrar("/registrar/students");
    return success(
      "Official source verification was recorded. The grade file is ready for final publication.",
      data,
    );
  } catch (error) {
    return failure(messageFromError(error, "Official source verification failed."));
  }
}

export async function publishRegistrarGradeImport(batchId) {
  try {
    if (!batchId) return failure("Grade import batch reference is required.");
    const data = await publishOfficialGradeImport(batchId);
    revalidateRegistrar(
      "/registrar/students",
      "/registrar/reports-monitoring",
    );
    return success(
      "Official grades were published successfully.",
      data,
    );
  } catch (error) {
    return failure(
      messageFromError(
        error,
        "Official grade publication failed. No partial result should be treated as published.",
      ),
    );
  }
}

export async function amendRegistrarAcademicResult(payload) {
  try {
    const data = await amendOfficialAcademicResult(
      payload?.resultId,
      payload?.newStatus,
      payload?.newGrade,
      {
        reference: payload?.sourceReference,
        verificationMethod: payload?.verificationMethod,
        reason: payload?.reason,
      },
    );
    revalidateRegistrar("/registrar/students", "/registrar/reports-monitoring");
    return success(
      "Authorized academic result amendment was recorded without deleting prior history.",
      data,
    );
  } catch (error) {
    return failure(messageFromError(error, "Academic result amendment was rejected."));
  }
}

export async function changeRegistrarPassword(payload) {
  try {
    await requireRole("registrar");
    const password = String(payload?.newPassword || "");
    const confirmation = String(payload?.confirmPassword || "");

    if (password.length < 12) {
      return failure("New password must contain at least 12 characters.");
    }
    if (password !== confirmation) {
      return failure("Password confirmation does not match.");
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return failure(error.message || "Password could not be changed.");

    return success("Password changed successfully.");
  } catch (error) {
    return failure(messageFromError(error, "Password change failed."));
  }
}

export async function updateRegistrarPreferences(preferences) {
  try {
    const actor = await requireRole("registrar");
    const allowed = [
      "enrollment_alerts",
      "grade_import_alerts",
      "announcement_alerts",
      "correction_alerts",
    ];

    const rows = allowed.map((key) => ({
      user_id: actor.id,
      preference_key: key,
      preference_value: {
        enabled: Boolean(preferences?.[key]),
      },
      updated_at: new Date().toISOString(),
    }));

    const supabase = await createClient();
    const { error } = await supabase
      .from("user_preferences")
      .upsert(rows, {
        onConflict: "user_id,preference_key",
      });

    if (error) return failure(error.message || "Registrar preferences could not be saved.");

    revalidateRegistrar("/registrar/profile");
    return success("Registrar notification preferences were saved.");
  } catch (error) {
    return failure(messageFromError(error, "Registrar preferences could not be saved."));
  }
}

export async function readRegistrarProjectCOR(simulationId) {
  try {
    const data = await readProjectDemonstrationCOR(simulationId, "registrar");
    return success("Demonstration COR loaded.", data);
  } catch (error) {
    return failure(messageFromError(error, "Demonstration COR is unavailable."));
  }
}

export async function readRegistrarOfficialCOR(enrollmentId) {
  try {
    const data = await getOfficialRegistrationData(enrollmentId, "registrar");
    return success("Official COR loaded.", data);
  } catch (error) {
    return failure(messageFromError(error, "Official COR is unavailable."));
  }
}

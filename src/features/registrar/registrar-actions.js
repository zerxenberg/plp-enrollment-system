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
      return failure("A supported PROJECT_ONLY enrollment action is required.");
    }

    if (["RETURN", "CONFIRM"].includes(action) && !reason) {
      return failure("A reason or source reference is required.");
    }

    const data = await simulateProjectEnrollmentAction(studentId, action, reason);
    revalidateRegistrar("/registrar/enrollment", "/registrar/dashboard", "/registrar/reports-monitoring");

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
        : "All staged rows passed technical validation. Official source verification is still required.",
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
      return failure("Batch, source reference, checksum, and verification method are required.");
    }

    const data = await attestOfficialGradeSource(
      batchId,
      sourceReference,
      checksum,
      method,
    );

    revalidateRegistrar("/registrar/students");
    return success(
      "Official source verification was recorded. The batch can be published if all protected checks remain valid.",
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
      "Official grades were published transactionally to Academic Records.",
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

    return success("Registrar password was changed through Supabase Auth.");
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

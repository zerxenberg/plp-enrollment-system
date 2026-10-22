"use server";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

// This module is a future GUI integration adapter, not a live UI redesign.
// Source records are generated fictional PROJECT_ONLY data. Real confirmed
// enrollments and institutional grade publication remain separate.
export async function readProjectAcademicStudent(studentId, role = "student") {
  if (!["student", "registrar", "academic-coordinator"].includes(role)) {
    throw new Error("Unsupported role for academic records");
  }
  await requireRole(role);
  const db = await createClient();
  const { data, error } = await db.rpc("project_phase8_student_snapshot_v2", {
    p_student_id: studentId,
  });
  if (error) throw new Error("The protected project academic record is unavailable.");
  return data;
}

export async function readProjectBlockRoster(blockId, role = "registrar") {
  if (!["registrar", "academic-coordinator"].includes(role)) {
    throw new Error("Authorized academic staff required");
  }
  await requireRole(role);
  const db = await createClient();
  const { data, error } = await db.rpc("project_phase8_block_roster_v1", {
    p_block_id: blockId,
  });
  if (error) throw new Error("The protected project block roster is unavailable.");
  return data;
}

export async function simulateProjectEnrollmentAction(studentId, action, reason = "") {
  const normalized = String(action ?? "").toUpperCase().trim();
  const role = ["OPEN", "SUBMIT"].includes(normalized) ? "student"
    : ["VALIDATE", "RETURN", "CONFIRM"].includes(normalized) ? "registrar" : null;
  if (!role || !studentId) throw new Error("Unrecognized enrollment simulation action");
  await requireRole(role);
  const db = await createClient();
  const { data, error } = await db.rpc("project_phase8_simulated_enrollment_action_v1", {
    p_student_id: studentId,
    p_action: normalized,
    p_reason: reason,
  });
  if (error) throw new Error("The authorized project enrollment transition was denied.");
  return data;
}

export async function readProjectDemonstrationCOR(simulationId, role = "student") {
  if (!["student", "registrar"].includes(role)) throw new Error("Unsupported role");
  await requireRole(role);
  const db = await createClient();
  const { data, error } = await db.rpc("project_phase8_demonstration_cor_v1", {
    p_simulation_id: simulationId,
  });
  if (error) throw new Error("Registration demonstration is not confirmed or accessible.");
  return data;
}

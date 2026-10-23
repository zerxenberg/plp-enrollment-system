"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const PROJECT_TERM = "TERM-2026-1";
const PROJECT_COHORT = "PLP_PROJECT_600_2026_1";
const PROJECT_SOURCE_PREFIX = "PROJECT_ONLY:TERM-2026-1:";
const MAX_PROJECT_RECORDS = 600;
const ACTION_NEXT_STATUS = Object.freeze({
  VALIDATE: { SUBMITTED: "VALIDATED" },
  RETURN: { SUBMITTED: "RETURNED", VALIDATED: "RETURNED" },
  CONFIRM: { VALIDATED: "CONFIRMED_SIMULATION" },
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Only the Registrar can query the service client. Browser and anonymous
// users never receive table access or a way to choose a student profile.
export async function loadRegistrarProjectSimulationQueue() {
  await requireRole("registrar");
  try {
    const client = await createClient();
    const { data: result, error } = await client.rpc(
      "project_phase8_registrar_simulation_queue_v1",
    );
    const simulations = result?.records;
    if (error || result?.fictional_only !== true ||
        result?.verified_institutionally !== false ||
        !Array.isArray(simulations) || simulations.length > MAX_PROJECT_RECORDS) {
      return { kind: "unavailable", records: [] };
    }
    if (!simulations.length) return { kind: "ready", records: [] };
    const records = simulations.flatMap((sim) => {
      if (sim.term_id !== PROJECT_TERM ||
          sim.source_provenance !== "GENERATED_PROJECT" ||
          sim.verified_institutionally !== false ||
          !sim.student_number || !sim.student_name) return [];
      return [{
        id: sim.id,
        studentNumber: sim.student_number,
        studentName: sim.student_name,
        term: sim.term_id,
        status: sim.status,
        submittedAt: sim.submitted_at,
        validatedAt: sim.validated_at,
        confirmedAt: sim.confirmed_at,
        source: "GENERATED_PROJECT",
      }];
    });
    return { kind: "ready", records };
  } catch {
    return { kind: "unavailable", records: [] };
  }
}

// Only simulation IDs from this server-controlled queue are accepted.
// The database RPC checks the authenticated Registrar and transitions again
// under its transaction lock, so stale views cannot force a status change.
export async function performRegistrarProjectSimulationAction(simulationId, action, reason = "") {
  await requireRole("registrar");
  const normalizedAction = typeof action === "string" ? action.trim().toUpperCase() : "";
  const normalizedReason = typeof reason === "string" ? reason.trim() : "";
  const allowedFrom = ACTION_NEXT_STATUS[normalizedAction];
  if (!UUID.test(String(simulationId || "")) || !allowedFrom) {
    return { ok: false, message: "Invalid project enrollment action." };
  }
  if (normalizedReason.length > 1000 ||
      ((normalizedAction === "RETURN" || normalizedAction === "CONFIRM") &&
        normalizedReason.length === 0)) {
    return { ok: false, message: "Provide a reason of up to 1,000 characters." };
  }
  try {
    const client = await createClient();
    // The simulation table is intentionally not readable through the service
    // role. Registrar's authenticated, role-scoped RPC provides its metadata.
    const { data: queue, error: queueError } = await client.rpc(
      "project_phase8_registrar_simulation_queue_v1",
    );
    if (queueError || queue?.fictional_only !== true ||
        !Array.isArray(queue.records) || queue.records.length > MAX_PROJECT_RECORDS) {
      return { ok: false, message: "Project simulation queue is unavailable." };
    }
    const sim = queue.records.find((record) => record.id === simulationId);
    if (!sim || sim.term_id !== PROJECT_TERM ||
        sim.source_provenance !== "GENERATED_PROJECT" ||
        sim.verified_institutionally !== false) {
      return { ok: false, message: "Project simulation not found." };
    }
    const admin = createAdminClient();
    if (!allowedFrom[sim.status]) {
      return { ok: false, message: "This simulated enrollment is no longer in the required state. Refresh the queue." };
    }

    const [profileResult, placementResult] = await Promise.all([
      admin.from("student_profiles").select("id,user_id,student_number")
        .eq("id", sim.student_id).eq("record_kind", "PROJECT_ONLY")
        .eq("project_cohort_id", PROJECT_COHORT).maybeSingle(),
      admin.from("project_student_academic_placements").select("student_id,home_block_id")
        .eq("student_id", sim.student_id).eq("term_id", PROJECT_TERM)
        .eq("project_cohort_id", PROJECT_COHORT).maybeSingle(),
    ]);
    if (profileResult.error || placementResult.error || !profileResult.data ||
        !placementResult.data ||
        placementResult.data.home_block_id !== sim.home_block_id) {
      return { ok: false, message: "Project student record could not be verified." };
    }
    const { data: account, error: accountError } = await admin.from("app_users")
      .select("id,role_code,is_synthetic_demo,source_account_key")
      .eq("id", profileResult.data.user_id)
      .eq("role_code", "student")
      .eq("is_synthetic_demo", true)
      .maybeSingle();
    if (accountError || !account ||
        account.source_account_key !== PROJECT_SOURCE_PREFIX + profileResult.data.student_number) {
      return { ok: false, message: "Project student identity could not be verified." };
    }

    const { data: result, error: transitionError } = await client
      .rpc("project_phase8_simulated_enrollment_action_v1", {
        p_student_id: sim.student_id,
        p_action: normalizedAction,
        p_reason: normalizedReason || null,
      });
    if (transitionError || result?.fictional_only !== true ||
        result?.verified_institutionally !== false ||
        result?.status !== allowedFrom[sim.status] || result?.changed !== true) {
      return { ok: false, message: "The simulated transition was denied. Refresh the queue and try again." };
    }
    for (const path of [
      "/registrar/enrollment",
      "/student/enrollment",
      "/student/dashboard",
      "/student/class-schedule",
    ]) revalidatePath(path);
    return { ok: true, status: result.status, simulationOnly: true };
  } catch {
    return { ok: false, message: "Project enrollment could not be processed. Try again later." };
  }
}

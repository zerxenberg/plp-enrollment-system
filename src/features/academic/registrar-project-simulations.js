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
    const admin = createAdminClient();
    const [{ data: result, error }, windowResult] = await Promise.all([
      client.rpc("project_phase8_registrar_simulation_queue_v1"),
      admin.from("project_phase8_demo_enrollment_window")
        .select("project_cohort_id,term_id,start_date,end_date,status,source_type,verified_institutionally")
        .eq("project_cohort_id", PROJECT_COHORT).maybeSingle(),
    ]);
    const demoWindow = !windowResult.error &&
      windowResult.data?.project_cohort_id === PROJECT_COHORT &&
      windowResult.data?.term_id === PROJECT_TERM &&
      windowResult.data?.verified_institutionally === false &&
      windowResult.data?.source_type === "PROJECT_ONLY_FICTIONAL"
        ? windowResult.data : null;
    const simulations = result?.records;
    if (error || result?.fictional_only !== true ||
        result?.verified_institutionally !== false ||
        !Array.isArray(simulations) || simulations.length > MAX_PROJECT_RECORDS) {
      return { kind: "unavailable", records: [] };
    }
    if (!simulations.length) return { kind: "ready", records: [], demoWindow };
    const records = simulations.flatMap((sim) => {
      if (sim.term_id !== PROJECT_TERM ||
          sim.source_provenance !== "GENERATED_PROJECT" ||
          sim.verified_institutionally !== false ||
          !sim.student_number || !sim.student_name) return [];
      return [{
        id: sim.id,
        homeBlockId: sim.home_block_id,
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
    return { kind: "ready", records, demoWindow };
  } catch {
    return { kind: "unavailable", records: [] };
  }
}

export async function loadRegistrarProjectSimulationHistory() {
  await requireRole("registrar");
  try {
    const client = await createClient();
    const { data, error } = await client.rpc("project_phase8_registrar_simulation_events_v1");
    if (error || data?.fictional_only !== true ||
        data?.verified_institutionally !== false ||
        data?.term_id !== PROJECT_TERM || !Array.isArray(data.records) ||
        data.records.length > 500) {
      return { kind: "unavailable", records: [] };
    }
    return { kind: "ready", records: data.records };
  } catch {
    return { kind: "unavailable", records: [] };
  }
}

// One selected classroom block can be processed in a bounded batch. Each
// enrollment remains an independent guarded database transaction, so an
// invalid student never masks successful confirmations of other students.
export async function performRegistrarProjectSimulationBatchAction(simulationIds, action, reason = "") {
  await requireRole("registrar");
  if (action !== "CONFIRM" || !Array.isArray(simulationIds) ||
      simulationIds.length === 0 || simulationIds.length > 40 ||
      new Set(simulationIds).size !== simulationIds.length ||
      simulationIds.some((id) => !UUID.test(String(id)))) {
    return { ok: false, message: "Select up to 40 unique enrollments for batch confirmation." };
  }
  if (typeof reason !== "string" || !reason.trim() || reason.length > 1000) {
    return { ok: false, message: "Provide an authorized confirmation reason." };
  }
  const queue = await loadRegistrarProjectSimulationQueue();
  if (queue.kind !== "ready") return { ok: false, message: "The protected Registrar queue is unavailable." };
  const queueById = new Map(queue.records.map((row) => [row.id, row]));
  const selected = simulationIds.map((id) => queueById.get(id));
  if (selected.some((row) => !row || !row.homeBlockId) ||
      new Set(selected.map((row) => row.homeBlockId)).size !== 1) {
    return { ok: false, message: "Select enrollments from one verified block section." };
  }
  const results = [];
  for (const id of simulationIds) {
    const row = queueById.get(id);
    if (row.status !== "VALIDATED") {
      results.push({ id, studentNumber: row.studentNumber, ok: false,
        message: "Only individually validated enrollments can be confirmed." });
      continue;
    }
    const outcome = await performRegistrarProjectSimulationAction(id, action, reason.trim());
    results.push({ id, studentNumber: row.studentNumber, ok: outcome.ok === true,
      status: outcome.status || row.status,
      message: outcome.ok ? "Demonstration enrollment confirmed." : outcome.message });
  }
  return { ok: true, simulationOnly: true, total: results.length,
    confirmed: results.filter((row) => row.ok).length,
    failed: results.filter((row) => !row.ok).length, results };
}

// The window is separate from the institutional academic term dates.
// Only a signed-in Registrar can invoke the protected PostgreSQL transition.
export async function saveRegistrarDemonstrationWindow(startDate, endDate, status) {
  await requireRole("registrar");
  const validDate = /^\d{4}-\d{2}-\d{2}$/;
  if (!validDate.test(String(startDate || "")) ||
      !validDate.test(String(endDate || "")) ||
      !["OPEN", "CLOSED"].includes(status)) {
    return { ok: false, message: "Enter a valid demonstration period and status." };
  }
  try {
    const client = await createClient();
    const { data, error } = await client.rpc("project_phase8_manage_demo_window_v1", {
      p_start: startDate, p_end: endDate, p_status: status,
    });
    if (error || data?.ok !== true || data?.simulation_only !== true ||
      data?.official !== false || data.status !== status) {
      return { ok: false, message: "The demonstration window was not accepted. Check the dates and Registrar permissions." };
    }
    for (const route of ["/registrar/enrollment", "/student/enrollment",
      "/student/dashboard", "/student/class-schedule"]) revalidatePath(route);
    return { ok: true, status: data.status, message: "Demonstration enrollment window updated." };
  } catch {
    return { ok: false, message: "Unable to update the demonstration window." };
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
      return { ok: false, message: "Project enrollment review queue is unavailable." };
    }
    const sim = queue.records.find((record) => record.id === simulationId);
    if (!sim || sim.term_id !== PROJECT_TERM ||
        sim.source_provenance !== "GENERATED_PROJECT" ||
        sim.verified_institutionally !== false) {
      return { ok: false, message: "Project enrollment record was not found." };
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

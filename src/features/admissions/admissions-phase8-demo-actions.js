"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/require-role";
import { getStudentContext } from "@/features/students/student-context-server";
import { loadAdmissionsPhase8DemoForStudent } from "./admissions-phase8-demo-server";

const STUDENT_REF = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const denied = (message) => ({ ok: false, message });
const refresh = () => {
  for (const path of [
    "/student/dashboard", "/student/enrollment", "/student/class-schedule",
    "/student/academic-records", "/academic-coordinator/sections-schedules",
    "/registrar/enrollment", "/registrar/dashboard", "/registrar/students",
  ]) revalidatePath(path);
};

export async function listAdmissionsPhase8Candidates({ blockId } = {}) {
  try {
    await requireRole("academic-coordinator");
    if (blockId && !STUDENT_REF.test(blockId)) return denied("Choose a valid Phase 8 block.");
    const admin = createAdminClient();
    // The project database contains thousands of Phase 8 accounts, but only
    // transferred Admissions identities belong in this roster. Unscoped
    // Supabase reads silently stop at the default 1,000-row response limit,
    // which hid new Admissions students and their existing reservations.
    const handoffs = await admin.from("admission_handoffs")
      .select("student_id,applicant_reference,admission_status,synchronization_status,approved_program_code,source_name")
      .eq("source_name", "PLP Admissions")
      .eq("admission_status", "ACCEPTED")
      .eq("synchronization_status", "Successful");
    if (handoffs.error) {
      return denied("Admissions demonstration candidates cannot be loaded.");
    }
    const studentIds = [...new Set((handoffs.data || []).map((h) => h.student_id).filter(Boolean))];
    if (!studentIds.length) {
      return { ok: true, students: [], message: "No verified PLP Admissions handoffs are available." };
    }
    // Keep the source-id list bounded. Never return an incomplete roster if
    // Admissions grows beyond one query's supported PostgREST response size.
    if (studentIds.length > 500) return denied("Admissions roster exceeds the verified query limit.");
    const [students, sources, rows] = await Promise.all([
      admin.from("student_profiles")
        .select("id,user_id,student_number,student_type,program_code,year_level_number,record_kind,is_synthetic_demo,student_status")
        .in("id", studentIds),
      admin.from("admissions_student_source_details")
        .select("student_id,inputted_gwa,gwa_verified").in("student_id", studentIds),
      admin.from("admissions_phase8_demo_enrollments")
        .select("student_id,block_id,term_id,status").in("student_id", studentIds),
    ]);
    if ([students, sources, rows].some((r) => r.error)) {
      return denied("Admissions demonstration student records cannot be loaded.");
    }
    const accountIds = [...new Set((students.data || []).map((p) => p.user_id).filter(Boolean))];
    const blockIds = [...new Set([
      ...rows.data.map((r) => r.block_id).filter(Boolean),
      ...(blockId ? [blockId] : []),
    ])];
    const [accounts, blocks] = await Promise.all([
      accountIds.length ? admin.from("app_users")
        .select("id,full_name,role_code,account_status,login_enabled,auth_user_id")
        .in("id", accountIds) : Promise.resolve({ data: [], error: null }),
      blockIds.length ? admin.from("block_sections")
        .select("id,code,term_id,program_code,year_level,is_synthetic_demo,planning_status")
        .in("id", blockIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (accounts.error || blocks.error) {
      return denied("Admissions demonstration assignment references cannot be loaded.");
    }
    const selected = blockId && blocks.data.find((b) => b.id === blockId);
    if (blockId && (!selected || selected.is_synthetic_demo !== true || selected.planning_status !== "PUBLISHED")) {
      return denied("Choose a published Phase 8 demonstration block.");
    }
    const byStudent = new Map(students.data.map((r) => [r.id, r]));
    const byAccount = new Map(accounts.data.map((r) => [r.id, r]));
    const byGwa = new Map(sources.data.map((r) => [r.student_id, r]));
    const byBlock = new Map(blocks.data.map((r) => [r.id, r]));
    const assigned = new Map(rows.data.map((r) => [r.student_id, r]));
    const people = handoffs.data.filter((h) =>
      h.admission_status === "ACCEPTED" && h.synchronization_status === "Successful")
      .map((h) => {
        const p = byStudent.get(h.student_id);
        const u = byAccount.get(p?.user_id);
        if (!p || !u || p.is_synthetic_demo !== false || p.record_kind === "PROJECT_ONLY" ||
            p.program_code !== h.approved_program_code || u.role_code !== "student") return null;
        const prior = assigned.get(p.id);
        const gwa = byGwa.get(p.id);
        const needsGwaVerification = p.student_type === "TRANSFEREE" &&
          (!gwa?.gwa_verified || gwa.inputted_gwa == null);
        return {
          id: p.id, studentNumber: p.student_number, name: u.full_name,
          programCode: p.program_code, yearLevel: p.year_level_number,
          type: p.student_type,
          active: u.account_status === "Active" && u.login_enabled === true && Boolean(u.auth_user_id),
          needsGwaVerification,
          assignedBlockCode: byBlock.get(prior?.block_id)?.code || null,
          assignedBlockId: prior?.block_id || null,
          assignedStatus: prior?.status || null,
          eligibleForSelectedBlock: Boolean(!selected ||
            (p.program_code === selected.program_code &&
              p.year_level_number === selected.year_level &&
              (!prior || (prior.term_id === selected.term_id &&
                ["PROPOSED", "RETURNED"].includes(prior.status))))),
        };
      }).filter(Boolean);
    return { ok: true, students: people, message: `${people.length} verified Admissions students found.` };
  } catch {
    return denied("Coordinator authorization or Admissions student roster is unavailable.");
  }
}

export async function assignAdmissionsPhase8Demo({ studentId, blockId, reason = "" } = {}) {
  try {
    const actor = await requireRole("academic-coordinator");
    if (!STUDENT_REF.test(String(studentId)) || !STUDENT_REF.test(String(blockId))) {
      return denied("Select a valid admitted student and Phase 8 block.");
    }
    const { data, error } = await createAdminClient().rpc("admissions_phase8_demo_assign_v1", {
      p_student_id: studentId,
      p_block_id: blockId,
      p_actor_user_id: actor.id,
      p_reason: String(reason || "Academic Coordinator proposed a Phase 8 project demonstration block.").slice(0, 700),
    });
    if (error || data?.assigned !== true) {
      return denied("Assignment was rejected. Verify the student's program, evaluated year, GWA if Transferee, published schedule and section capacity.");
    }
    refresh();
    return { ok: true, message: `Phase 8 demonstration block ${data.block_code || ""} assigned. Official academic enrollment is unchanged.`, data };
  } catch {
    return denied("Coordinator block assignment was not authorized.");
  }
}

export async function autoAssignAdmissionsPhase8Demo() {
  const context = await getStudentContext();
  if (context.kind !== "live") return denied("An activated Admissions student account is required.");
  try {
    const admin = createAdminClient();
    const state = await loadAdmissionsPhase8DemoForStudent(context);
    if (!state || state.canPrepare !== true) {
      return denied(state?.blockingReasons?.[0] ||
        "Automatic placement is not available for this student or current enrollment state.");
    }
    const profile = await admin.from("student_profiles")
      .select("year_level_number").eq("id", context.studentId).maybeSingle();
    if (profile.error || !Number.isInteger(profile.data?.year_level_number)) {
      return denied("A verified student year level is required before choosing a block.");
    }
    const { data: blocks, error } = await admin.from("block_sections")
      .select("id,code,term_id,program_code,year_level,capacity,is_synthetic_demo,planning_status")
      .eq("program_code", context.programCode)
      .eq("year_level", profile.data.year_level_number)
      .eq("is_synthetic_demo", true).eq("planning_status", "PUBLISHED")
      .order("code");
    if (error || !blocks?.length) return denied("No compatible published Phase 8 block is available.");
    // Let the trusted, row-locking database function recheck capacities,
    // academic source, active term and student identity. No client IDs used.
    for (const block of blocks) {
      const { data, error: placementError } = await admin.rpc(
        "admissions_phase8_demo_assign_v1", {
          p_student_id: context.studentId, p_block_id: block.id,
          p_actor_user_id: context.appUserId,
          p_reason: "Student requested automatic Phase 8 demonstration placement.",
        });
      if (!placementError && data?.assigned === true) {
        refresh();
        return { ok: true, message: `Assigned to ${data.block_code || block.code} for project demonstration. Registrar confirmation is still required.` };
      }
    }
    return denied("No suitable Phase 8 demonstration block passed the current enrollment and capacity checks.");
  } catch {
    return denied("Automatic demonstration block assignment could not be completed.");
  }
}

export async function submitAdmissionsPhase8Demo() {
  return studentDemoTransition("SUBMIT");
}
export async function reopenAdmissionsPhase8Demo() {
  return studentDemoTransition("REOPEN");
}
async function studentDemoTransition(action) {
  const context = await getStudentContext();
  if (context.kind !== "live") return denied("An activated Admissions student account is required.");
  try {
    const { data, error } = await createAdminClient().rpc("admissions_phase8_demo_transition_v1", {
      p_student_id: context.studentId, p_actor_user_id: context.appUserId,
      p_action: action, p_reason: action === "SUBMIT"
        ? "Student submitted the prepared Phase 8 demonstration registration."
        : "Student reopened the Registrar returned demonstration enrollment.",
    });
    const desired = action === "SUBMIT" ? "SUBMITTED" : "PROPOSED";
    if (error || data?.status !== desired) return denied("The demonstration enrollment transition did not pass the current academic or identity checks.");
    refresh();
    return { ok: true, message: action === "SUBMIT"
      ? "Demonstration enrollment submitted for Registrar review. This is not official institutional enrollment."
      : "Returned demonstration registration reopened for editing.", data };
  } catch {
    return denied("Demonstration enrollment action could not be completed.");
  }
}

export async function listRegistrarAdmissionsPhase8Demo() {
  try {
    await requireRole("registrar");
    const admin = createAdminClient();
    // Scope every lookup to the private Admissions ledger. Reading the first
    // 1,000 profiles/accounts silently omits later real Admissions students.
    const rows = await admin.from("admissions_phase8_demo_enrollments")
      .select("*")
      .eq("source_kind", "ADMISSIONS_PHASE8_DEMONSTRATION")
      .eq("simulation_only", true).eq("is_official", false)
      .order("updated_at", { ascending: false }).limit(201);
    if (rows.error || !Array.isArray(rows.data) || rows.data.length > 200) return [];
    if (!rows.data.length) return [];
    const studentIds = [...new Set(rows.data.map((x) => x.student_id).filter(Boolean))];
    const blockIds = [...new Set(rows.data.map((x) => x.block_id).filter(Boolean))];
    if (!studentIds.length || !blockIds.length) return [];
    const [profiles, handoffs, blocks] = await Promise.all([
      admin.from("student_profiles")
        .select("id,user_id,student_number,program_code,record_kind,is_synthetic_demo")
        .in("id", studentIds),
      admin.from("admission_handoffs")
        .select("student_id,approved_program_code,admission_status,synchronization_status,source_name")
        .in("student_id", studentIds).eq("source_name", "PLP Admissions")
        .eq("admission_status", "ACCEPTED").eq("synchronization_status", "Successful"),
      admin.from("block_sections")
        .select("id,code,term_id,program_code,is_synthetic_demo")
        .in("id", blockIds),
    ]);
    if ([profiles, handoffs, blocks].some((r) => r.error || !Array.isArray(r.data))) return [];
    const accountIds = [...new Set(profiles.data.map((x) => x.user_id).filter(Boolean))];
    if (!accountIds.length) return [];
    const users = await admin.from("app_users")
      .select("id,full_name,role_code").in("id", accountIds);
    if (users.error || !Array.isArray(users.data)) return [];
    const ps = new Map(profiles.data.map((x) => [x.id, x]));
    const us = new Map(users.data.map((x) => [x.id, x]));
    const hs = new Map(handoffs.data.map((x) => [x.student_id, x]));
    const bs = new Map(blocks.data.map((x) => [x.id, x]));
    return rows.data.map((x) => {
      const profile = ps.get(x.student_id);
      const account = us.get(profile?.user_id);
      const handoff = hs.get(x.student_id);
      const block = bs.get(x.block_id);
      if (!profile || !account || !handoff || !block ||
          profile.record_kind === "PROJECT_ONLY" || profile.is_synthetic_demo !== false ||
          account.role_code !== "student" ||
          handoff.approved_program_code !== profile.program_code ||
          block.program_code !== profile.program_code || block.term_id !== x.term_id ||
          block.is_synthetic_demo !== true) return null;
      return {
        ...x,
        studentNumber: profile.student_number,
        studentName: account.full_name,
        blockCode: block.code,
        programCode: profile.program_code,
      };
    }).filter(Boolean);
  } catch {
    return [];
  }
}

export async function reviewRegistrarAdmissionsPhase8Demo({ studentId, action, reason } = {}) {
  try {
    const actor = await requireRole("registrar");
    if (!STUDENT_REF.test(String(studentId)) ||
        !["VALIDATE", "RETURN", "CONFIRM"].includes(String(action)) ||
        String(reason || "").trim().length < 10) {
      return denied("Select a valid demonstration record, review action, and a reason of at least 10 characters.");
    }
    const { data, error } = await createAdminClient().rpc("admissions_phase8_demo_transition_v1", {
      p_student_id: studentId, p_actor_user_id: actor.id,
      p_action: action, p_reason: String(reason).trim().slice(0, 700),
    });
    const expected = { VALIDATE: "VALIDATED", RETURN: "RETURNED", CONFIRM: "CONFIRMED_SIMULATION" }[action];
    if (error || data?.status !== expected) {
      return denied("Registrar demonstration review could not be saved. Verify submission, source schedule, capacity and current status.");
    }
    refresh();
    return { ok: true, message: action === "CONFIRM"
      ? "Phase 8 demonstration registration confirmed. No official institutional COR was issued."
      : `Phase 8 demonstration enrollment ${expected.toLowerCase()}.`, data };
  } catch {
    return denied("Registrar demonstration review requires an active Registrar account.");
  }
}

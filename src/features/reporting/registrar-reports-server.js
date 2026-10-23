"use server";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const PROJECT_COHORT = "PLP_PROJECT_600_2026_1";
const PROJECT_TERM = "TERM-2026-1";
const LIMIT = 1000;

function dateString(value) {
  return value ? String(value) : "";
}

function summaryRow(record) {
  return {
    id: record.id,
    reference: record.reference,
    studentNumber: record.studentNumber,
    studentName: record.studentName,
    program: record.program,
    term: record.term,
    section: record.section,
    classification: record.classification,
    studentType: record.studentType,
    units: record.units,
    status: record.status,
    source: record.source,
    submittedDate: record.submittedDate,
    confirmationReference: record.confirmationReference,
  };
}

// Every call requires an active, role-mapped Registrar. Service reads are
// constrained to the known fictional cohort or identified official records.
export async function loadRegistrarReports() {
  await requireRole("registrar");
  try {
    const client = await createClient();
    const admin = createAdminClient();
    const [officialResponse, placementsResponse, simulationsResponse] = await Promise.all([
      client.from("enrollments")
        .select("id,reference,student_id,program_code,term_id,declared_units,status,submitted_at,confirmation_reference")
        .order("created_at", { ascending: false }).limit(LIMIT),
      admin.from("project_student_academic_placements")
        .select("student_id,term_id,program_code,academic_classification,home_block_id")
        .eq("project_cohort_id", PROJECT_COHORT).eq("term_id", PROJECT_TERM).limit(LIMIT),
      admin.from("project_phase8_enrollment_simulations")
        .select("id,student_id,term_id,home_block_id,status,source_provenance,verified_institutionally,submitted_at,confirmed_at")
        .eq("term_id", PROJECT_TERM).eq("source_provenance", "GENERATED_PROJECT")
        .eq("verified_institutionally", false).limit(LIMIT),
    ]);
    if (officialResponse.error || placementsResponse.error || simulationsResponse.error) {
      return { kind: "unavailable", records: [], history: [], sections: [] };
    }

    const placements = placementsResponse.data || [];
    if (placements.length > 600) return { kind: "unavailable", records: [], history: [], sections: [] };
    const official = officialResponse.data || [];
    const officialIds = official.map((row) => row.student_id);
    const blocks = [...new Set(placements.map((row) => row.home_block_id).filter(Boolean))];
    const [projectStudents, officialStudents, blocksResponse, registrarResponse, historyResponse, auditResponse] = await Promise.all([
      admin.from("student_profiles")
        .select("id,user_id,student_number,student_type,record_kind,project_cohort_id")
        .eq("record_kind", "PROJECT_ONLY").eq("project_cohort_id", PROJECT_COHORT).limit(601),
      officialIds.length ? admin.from("student_profiles")
        .select("id,user_id,student_number,student_type,record_kind,project_cohort_id")
        .in("id", officialIds).limit(LIMIT)
        : { data: [], error: null },
      blocks.length ? admin.from("block_sections")
        .select("id,code,program_code,term_id,capacity,planning_status")
        .in("id", blocks).limit(LIMIT)
        : { data: [], error: null },
      admin.from("app_users").select("id,full_name").eq("role_code", "registrar").limit(100),
      client.from("enrollment_status_history")
        .select("id,enrollment_id,actor_user_id,actor_label,action,previous_status,new_status,reason,changed_at")
        .order("changed_at", { ascending: false }).limit(LIMIT),
      admin.from("audit_events")
        .select("id,occurred_at,actor_user_id,module,action,entity_key,previous_value,new_value,reason,result")
        .in("module", ["Enrollment", "Enrollment Announcements", "Students", "Grade Import", "Official Grades Import"])
        .order("occurred_at", { ascending: false }).limit(LIMIT),
    ]);
    if (projectStudents.error || officialStudents.error || blocksResponse.error ||
        registrarResponse.error || historyResponse.error || auditResponse.error) {
      return { kind: "unavailable", records: [], history: [], sections: [] };
    }
    const profiles = [...(projectStudents.data || []), ...(officialStudents.data || [])];
    const profileById = new Map(profiles.map((row) => [row.id, row]));
    const blockById = new Map((blocksResponse.data || []).map((row) => [row.id, row]));
    const validProject = placements.filter((row) => {
      const profile = profileById.get(row.student_id);
      return profile?.record_kind === "PROJECT_ONLY" &&
        profile.project_cohort_id === PROJECT_COHORT;
    });
    const officialAppIds = [...new Set(official.map((row) => profileById.get(row.student_id)?.user_id).filter(Boolean))];
    const [projectUsers, officialUsers] = await Promise.all([
      admin.from("app_users").select("id,full_name,role_code,source_account_key")
        .eq("project_cohort_id", PROJECT_COHORT).eq("role_code", "student").limit(601),
      officialAppIds.length ? admin.from("app_users")
        .select("id,full_name,role_code,source_account_key")
        .in("id", officialAppIds).limit(LIMIT)
        : { data: [], error: null },
    ]);
    if (projectUsers.error || officialUsers.error) return { kind: "unavailable", records: [], history: [], sections: [] };
    const userById = new Map([...(projectUsers.data || []), ...(officialUsers.data || [])]
      .filter((row) => row.role_code === "student")
      .map((row) => [row.id, row]));
    const placementById = new Map(validProject.map((row) => [row.student_id, row]));
    const simulationById = new Map((simulationsResponse.data || [])
      .filter((row) => placementById.has(row.student_id))
      .map((row) => [row.student_id, row]));

    const officialRows = official.map((row) => {
      const profile = profileById.get(row.student_id);
      const user = userById.get(profile?.user_id);
      return summaryRow({
        id: row.id, reference: row.reference, studentNumber: profile?.student_number || "",
        studentName: user?.full_name || "Student record", program: row.program_code,
        term: row.term_id, section: "", classification: "",
        studentType: profile?.student_type || "", units: row.declared_units ?? "",
        status: row.status, source: "Official record", submittedDate: dateString(row.submitted_at),
        confirmationReference: row.confirmation_reference || "",
      });
    });
    const projectRows = validProject.map((row) => {
      const profile = profileById.get(row.student_id);
      const user = userById.get(profile.user_id);
      const simulation = simulationById.get(row.student_id);
      return summaryRow({
        id: row.student_id, reference: simulation?.id || "",
        studentNumber: profile.student_number, studentName: user?.full_name || "Student record",
        program: row.program_code, term: row.term_id,
        section: blockById.get(row.home_block_id)?.code || "",
        classification: row.academic_classification || "", studentType: profile.student_type || "",
        units: "", status: simulation?.status || "NOT_STARTED",
        source: "Demonstration only", submittedDate: dateString(simulation?.submitted_at),
        confirmationReference: "",
      });
    });
    const registrarById = new Map((registrarResponse.data || []).map((row) => [row.id, row.full_name]));
    const officialEnrollmentIds = new Set(official.map((row) => row.id));
    const officialRefs = new Map(official.map((row) => [row.id, row.reference]));
    const officialHistory = (historyResponse.data || [])
      .filter((row) => officialEnrollmentIds.has(row.enrollment_id) && registrarById.has(row.actor_user_id))
      .map((row) => ({
        id: row.id, date: dateString(row.changed_at), registrar: registrarById.get(row.actor_user_id),
        record: officialRefs.get(row.enrollment_id) || "", action: row.action,
        previousStatus: row.previous_status || "", newStatus: row.new_status || "",
        reason: row.reason || "", source: "Official record",
      }));
    const auditHistory = (auditResponse.data || [])
      .filter((row) => registrarById.has(row.actor_user_id))
      .map((row) => ({
        id: row.id, date: dateString(row.occurred_at),
        registrar: registrarById.get(row.actor_user_id),
        record: row.entity_key || "", action: `${row.module}: ${row.action}`,
        previousStatus: row.previous_value || "", newStatus: row.new_value || row.result || "",
        reason: row.reason || "", source: "Registrar audit",
      }));
    const simulationIds = new Set([...simulationById.values()].map((row) => row.id));
    const projectHistoryResponse = simulationIds.size
      ? await admin.from("project_phase8_enrollment_simulation_events")
        .select("id,simulation_id,actor_user_id,actor_role,action,prior_status,next_status,reason,occurred_at")
        .eq("actor_role", "registrar")
        .order("occurred_at", { ascending: false }).limit(LIMIT)
      : { data: [], error: null };
    if (projectHistoryResponse.error) return { kind: "unavailable", records: [], history: [], sections: [] };
    const projectHistory = (projectHistoryResponse.data || [])
      .filter((row) => simulationIds.has(row.simulation_id)).map((row) => ({
      id: row.id, date: dateString(row.occurred_at),
      registrar: registrarById.get(row.actor_user_id) || "Registrar",
      record: row.simulation_id, action: row.action, previousStatus: row.prior_status || "",
      newStatus: row.next_status || "", reason: row.reason || "",
      source: "Demonstration only",
    }));
    const sectionCounts = new Map();
    for (const row of validProject) {
      if (!row.home_block_id) continue;
      sectionCounts.set(row.home_block_id, (sectionCounts.get(row.home_block_id) || 0) + 1);
    }
    const sections = [...blockById.values()].map((row) => ({
      id: row.id, program: row.program_code, term: row.term_id,
      section: row.code, capacity: row.capacity, proposed: sectionCounts.get(row.id) || 0,
      remaining: Math.max(0, row.capacity - (sectionCounts.get(row.id) || 0)),
      status: row.planning_status, source: "Demonstration only",
    })).sort((a, b) => a.section.localeCompare(b.section));
    return {
      kind: "ready", records: [...officialRows, ...projectRows],
      sections, history: [...officialHistory, ...projectHistory, ...auditHistory]
        .sort((a, b) => b.date.localeCompare(a.date)),
      officialCount: officialRows.length, projectCount: projectRows.length,
    };
  } catch {
    return { kind: "unavailable", records: [], history: [], sections: [] };
  }
}

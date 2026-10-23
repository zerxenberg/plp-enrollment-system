"use server";

import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

const PROJECT_COHORT = "PLP_PROJECT_600_2026_1";
const PROJECT_TERM = "TERM-2026-1";
const ALLOWED_ROLES = new Set(["academic-coordinator", "system-administrator", "registrar"]);

// The project period is protected from direct client reads. Return only the
// scoped dates and state after checking the authenticated staff role.
export async function loadProjectEnrollmentWindowForStaff(role) {
  if (!ALLOWED_ROLES.has(role)) throw new Error("Unsupported staff role.");
  await requireRole(role);
  const admin = createAdminClient();
  const [windowResult, termResult] = await Promise.all([
    admin.from("project_phase8_demo_enrollment_window")
      .select("project_cohort_id,term_id,start_date,end_date,status,source_type,verified_institutionally")
      .eq("project_cohort_id", PROJECT_COHORT).maybeSingle(),
    admin.from("academic_terms").select("id,short_label")
      .eq("id", PROJECT_TERM).maybeSingle(),
  ]);
  const data = windowResult.data;
  if (windowResult.error || termResult.error || !data || !termResult.data ||
      termResult.data.id !== PROJECT_TERM || data.term_id !== PROJECT_TERM ||
      data.source_type !== "PROJECT_ONLY_FICTIONAL" ||
      data.verified_institutionally !== false ||
      !["OPEN", "CLOSED"].includes(data.status)) {
    throw new Error("The authorized demonstration enrollment period is unavailable.");
  }
  return {
    termId: data.term_id,
    shortLabel: termResult.data.short_label || data.term_id,
    enrollmentStart: data.start_date,
    enrollmentEnd: data.end_date,
    status: data.status === "OPEN" ? "Open" : "Closed",
    isDemonstration: true,
  };
}

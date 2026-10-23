"use server";

import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

// The provenance ledger is intentionally service only. Return only the
// curriculum classifications needed by the authenticated Coordinator view.
// No student, account, or generator attributes cross this boundary.
export async function loadCoordinatorCurriculumProvenance() {
  await requireRole("academic-coordinator");
  const { data, error } = await createAdminClient()
    .from("phase8_fictional_curriculum_provenance")
    .select("curriculum_code,is_official,source_type");
  if (error || !Array.isArray(data)) {
    throw new Error("Academic curriculum provenance is temporarily unavailable.");
  }
  return data.map((row) => ({
    curriculumCode: row.curriculum_code,
    isOfficial: row.is_official === true,
    sourceType: row.source_type,
  }));
}

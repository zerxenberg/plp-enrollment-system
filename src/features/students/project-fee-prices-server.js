import "server-only";

import {
  estimateProjectSelectedSubjects,
  selectedProjectSubjectCodes,
} from "./project-fee-estimate.mjs";

/**
 * Price references are read only after getStudentContext has verified the
 * authenticated, active PROJECT_ONLY Student and the guarded RPC has verified
 * the assigned fictional curriculum. Never accept codes from the browser.
 *
 * Verify no curriculum override exists: the Phase8 price contract is exactly
 * the per-subject synthetic rate, not an institutional tuition schedule.
 */
export async function loadVerifiedProjectSubjectPrices(admin, curriculumCode, selectedSubjects) {
  const codes = selectedProjectSubjectCodes(selectedSubjects);
  if (!curriculumCode || !admin) {
    throw new Error("A verified project curriculum and server connection are required.");
  }
  if (!codes.length) return [];
  const [priceResult, overrideResult] = await Promise.all([
    admin.from("academic_estimated_subject_prices")
      .select("subject_code,rate_per_unit,classification")
      .in("subject_code", codes),
    admin.from("academic_estimated_curriculum_rates")
      .select("subject_code,rate_per_unit,classification")
      .eq("curriculum_code", curriculumCode)
      .in("subject_code", codes),
  ]);
  if (priceResult.error || !Array.isArray(priceResult.data) ||
      overrideResult.error || !Array.isArray(overrideResult.data) ||
      overrideResult.data.length) {
    throw new Error("Project reference prices are unavailable or contain an unexpected override.");
  }
  // Verify every selected code, its ledger classification and exact DB rate
  // before exposing even a provisional price object to the Student portal.
  estimateProjectSelectedSubjects(selectedSubjects, priceResult.data);
  return priceResult.data;
}

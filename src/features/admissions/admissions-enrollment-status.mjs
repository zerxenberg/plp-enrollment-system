// Pure, transport-safe status mapping. Admission remains a separate decision.
export const ADMISSIONS_ENROLLMENT_STATUSES = Object.freeze([
  "pending_enrollment",
  "pending_registrar_enrollment",
  "returned_for_correction",
  "confirmed_demonstration",
  "officially_enrolled",
]);

function mappedOfficialStatus(row) {
  if (!row) return null;
  if (row.status === "CONFIRMED" && row.confirmed_at) return "officially_enrolled";
  if (row.status === "REQUIRES_CORRECTION") return "returned_for_correction";
  if (["SUBMITTED", "FOR_VALIDATION", "VALIDATED", "NEEDS_ACADEMIC_REVIEW", "CONFIRMED"].includes(row.status)) {
    return "pending_registrar_enrollment";
  }
  return "pending_enrollment";
}

function mappedDemonstrationStatus(row) {
  if (!row || row.source_kind !== "ADMISSIONS_PHASE8_DEMONSTRATION" ||
      row.is_official !== false || row.simulation_only !== true) return null;
  if (row.status === "CONFIRMED_SIMULATION" && row.confirmed_at) return "confirmed_demonstration";
  if (row.status === "RETURNED") return "returned_for_correction";
  if (["SUBMITTED", "VALIDATED"].includes(row.status)) return "pending_registrar_enrollment";
  return "pending_enrollment";
}

export function resolveAdmissionsEnrollmentStatus({ official = null, demonstration = null } = {}) {
  const officialStatus = mappedOfficialStatus(official);
  const demoStatus = mappedDemonstrationStatus(demonstration);
  let status = "pending_enrollment";
  let source = "none";
  if (officialStatus && demoStatus) {
    // Report the latest active transaction, not any historical confirmed term.
    const officialTime = Date.parse(official.updated_at || official.created_at || "") || 0;
    const demoTime = Date.parse(demonstration.updated_at || demonstration.created_at || "") || 0;
    if (officialTime >= demoTime) {
      status = officialStatus; source = "official";
    } else {
      status = demoStatus; source = "demonstration";
    }
  } else if (officialStatus) {
    status = officialStatus; source = "official";
  } else if (demoStatus) {
    status = demoStatus; source = "demonstration";
  }
  return {
    enrollment_status: status,
    enrollment_source: source,
    stage: status === "officially_enrolled" ? "enrolled" : "student",
    cor_available: status === "officially_enrolled" || status === "confirmed_demonstration",
  };
}

// Presentation helpers for role-checked Registrar project enrollment reads.
// Legacy simulated confirmation is not proof of a registered subject snapshot.
export function currentProjectEnrollmentSubjects(snapshotSubjects, currentTermCodes, decisions) {
  if (!Array.isArray(snapshotSubjects) || !(currentTermCodes instanceof Set) ||
      !currentTermCodes.size || !(decisions instanceof Map)) {
    throw new Error("Current semester project subjects cannot be verified.");
  }
  const current = snapshotSubjects.filter((subject) =>
    currentTermCodes.has(subject.subject_code));
  if (current.length !== currentTermCodes.size ||
      new Set(current.map((subject) => subject.subject_code)).size !== currentTermCodes.size ||
      current.some((subject) => !decisions.has(subject.subject_code))) {
    throw new Error("Current semester project eligibility is incomplete.");
  }
  return current.map((subject) => ({
    ...subject,
    eligibility: decisions.get(subject.subject_code).eligibility,
    reason: decisions.get(subject.subject_code).reason,
  }));
}

/** Registered subject evidence is separate from historical subject eligibility.
 * Never treat a generated curriculum row as submitted or confirmed enrollment. */
export function verifiedRegistrarSelectedSubjects(result, studentId, simulation, currentTermCodes, decisions) {
  if (result?.fictional_only !== true || result.verified_institutionally !== false ||
      result.student_id !== studentId || result.term_id !== "TERM-2026-1" ||
      result.simulation_id !== (simulation?.id || null) ||
      result.status !== (simulation?.status || null) ||
      !Number.isInteger(result.selected_count) || result.selected_count < 0 ||
      !Array.isArray(result.subjects) || result.subjects.length !== result.selected_count ||
      !(currentTermCodes instanceof Set) || !(decisions instanceof Map)) {
    throw new Error("Protected Registrar selected subjects could not be verified.");
  }
  // Old prepublication CONFIRMED_SIMULATION records may lack snapshots. Show
  // zero rather than blocking the Registrar's separately authorized recovery.
  if (simulation && ["SUBMITTED", "VALIDATED"].includes(simulation.status) &&
      result.selected_count === 0) {
    throw new Error("A submitted project enrollment has no saved registered subjects.");
  }
  const codes = new Set();
  let units = 0;
  const selected = result.subjects.map((item) => {
    const subjectCode = item?.subject_code;
    const decision = decisions.get(subjectCode);
    if (!subjectCode || codes.has(subjectCode) || !currentTermCodes.has(subjectCode) || !decision ||
        !item.subject_name || !item.section_id || !item.section_code ||
        !Number.isFinite(Number(item.academic_units)) || Number(item.academic_units) <= 0 ||
        !Array.isArray(item.registered_schedule) || item.registered_schedule.length === 0) {
      throw new Error("Submitted project subjects do not match the current verified curriculum.");
    }
    codes.add(subjectCode);
    units += Number(item.academic_units);
    return { ...item, currentEligibility: decision.eligibility,
      currentReason: decision.reason || null };
  });
  if (Math.abs(units - Number(result.selected_units)) > 0.001) {
    throw new Error("Protected project registered subject units do not reconcile.");
  }
  return selected;
}

export function hasVerifiedProjectCor(simulation, cor) {
  return Boolean(simulation?.status === "CONFIRMED_SIMULATION" && simulation.confirmed_at &&
    cor?.simulation_id === simulation.id && cor?.confirmed_at === simulation.confirmed_at &&
    cor.simulation_only === true && cor.official === false &&
    cor.certificate_of_official_registration === false &&
    cor.registration_snapshot_complete === true &&
    Array.isArray(cor.registered_subjects) && cor.registered_subjects.length &&
    Array.isArray(cor.registered_schedule) && cor.registered_schedule.length);
}

export function projectEnrollmentDisplayStatus(row, corReady = null) {
  if (row?.status !== "CONFIRMED_SIMULATION") return null;
  return corReady === false
    ? "Confirmed legacy simulation (COR unavailable)"
    : corReady === true
      ? "Confirmed project registration"
      : "Confirmed simulation";
}

// Classroom-only cost estimate: not an official PLP fee schedule, billing
// assessment, payment obligation, or Certificate of Registration.
// P8F26 prices now exist in the server-read pricing ledger. This amount is an
// expected-rate assertion, NOT a fallback when an authoritative price is
// missing or different.
export const PROJECT_ONLY_ESTIMATED_PHP_PER_UNIT = 100;
export const PROJECT_ONLY_PRICE_CLASSIFICATION = "SYNTHETIC_DEVELOPMENT_ONLY";

function uniqueSelection(selectedSubjects) {
  if (!Array.isArray(selectedSubjects)) {
    throw new TypeError("Selected project subjects must be an array.");
  }
  const unique = new Map();
  for (const subject of selectedSubjects) {
    const code = String(subject?.code ?? subject?.subject_code ?? "").trim();
    const value = subject?.units ?? subject?.academic_units;
    const units = value === null || value === undefined || value === "" ? NaN : Number(value);
    if (!code || !Number.isFinite(units) || units <= 0) {
      throw new Error("Selected project subject code and academic units are required.");
    }
    const previousUnits = unique.get(code);
    if (previousUnits !== undefined && previousUnits !== units) {
      throw new Error("Conflicting academic units for the same project subject.");
    }
    unique.set(code, units);
  }
  return unique;
}

export function selectedProjectSubjectCodes(selectedSubjects) {
  return [...uniqueSelection(selectedSubjects).keys()];
}

/**
 * Only pass the already prepared/selected subject registration set here.
 * A weekly timetable contains multiple meetings for one subject; meetings
 * must never multiply the subject's academic units or estimated fee.
 */
export function estimateProjectSelectedSubjects(selectedSubjects = [], priceRows = []) {
  const unique = uniqueSelection(selectedSubjects);
  if (!Array.isArray(priceRows)) {
    throw new Error("Verified project subject prices are required.");
  }
  const prices = new Map();
  for (const row of priceRows) {
    const code = String(row?.subject_code ?? "").trim();
    const rate = Number(row?.rate_per_unit);
    if (!unique.has(code) || prices.has(code) ||
        row?.classification !== PROJECT_ONLY_PRICE_CLASSIFICATION ||
        !Number.isFinite(rate) || rate !== PROJECT_ONLY_ESTIMATED_PHP_PER_UNIT) {
      throw new Error("A selected project subject has invalid or unexpected reference pricing.");
    }
    prices.set(code, rate);
  }
  if (prices.size !== unique.size) {
    throw new Error("A selected project subject is missing its verified reference price.");
  }
  const totalUnits = [...unique.values()].reduce((sum, units) => sum + units, 0);
  const totalAmount = [...unique.entries()].reduce((sum, [code, units]) =>
    sum + units * prices.get(code), 0);
  const names = new Map(selectedSubjects.map((subject) => [
    String(subject?.code ?? subject?.subject_code ?? "").trim(),
    String(subject?.name ?? subject?.subject_name ?? "").trim(),
  ]));
  const subjectFees = [...unique.entries()].map(([code, units]) => ({
    code,
    name: names.get(code) || code,
    units,
    ratePerUnit: prices.get(code),
    estimatedFee: Number((units * prices.get(code)).toFixed(2)),
  }));
  return {
    classification: "PROJECT_ONLY_FICTIONAL_ESTIMATE",
    official: false,
    assessmentIssued: false,
    currency: "PHP",
    ratePerUnit: unique.size ? prices.values().next().value : null,
    priceSource: "academic_estimated_subject_prices",
    priceClassification: PROJECT_ONLY_PRICE_CLASSIFICATION,
    subjectCount: unique.size,
    totalUnits,
    estimatedAmount: Number(totalAmount.toFixed(2)),
    subjectCodes: [...unique.keys()],
    subjects: subjectFees,
  };
}

/** Reconstruct only the eligible prepared set from the protected project RPC.
 * The returned weekly class_schedule has one row PER MEETING, not per subject.
 */
export function selectedProjectSnapshotSubjects(snapshot) {
  if (snapshot?.project_only !== true ||
      snapshot?.verified_institutionally !== false ||
      snapshot?.schedule_validated_for_project !== true ||
      !Array.isArray(snapshot.subjects) ||
      !Array.isArray(snapshot.class_schedule)) {
    throw new Error("A validated fictional project enrollment snapshot is required.");
  }
  const scheduledCodes = new Set(snapshot.class_schedule.map((meeting) =>
    String(meeting?.subject_code ?? "").trim()).filter(Boolean));
  const selected = snapshot.subjects.filter((subject) =>
    ["ELIGIBLE", "RETAKE"].includes(subject?.eligibility) &&
    scheduledCodes.has(String(subject?.subject_code ?? "").trim()));
  return selected;
}

export function estimateProjectSnapshotSelection(snapshot, priceRows) {
  return estimateProjectSelectedSubjects(
    selectedProjectSnapshotSubjects(snapshot), priceRows);
}

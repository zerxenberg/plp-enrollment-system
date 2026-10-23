// PROJECT_ONLY estimates are sourced from the normalized Supabase pricing
// relations, never from local/demo fallback rates. They remain nonofficial.
const PROJECT_CLASSIFICATION = "SYNTHETIC_DEVELOPMENT_ONLY";

function validUnits(value) {
  return Number.isInteger(Number(value)) && [2, 3].includes(Number(value));
}

function money(value, label) {
  if (value == null || value === "" || !Number.isFinite(Number(value)) ||
      Number(value) < 0) {
    throw new Error(`Invalid PROJECT_ONLY ${label} in normalized pricing data.`);
  }
  return Number(value);
}

export function projectPhase8SubjectEstimate(subject, price) {
  if (!subject || !validUnits(subject.units) ||
      !price || price.subject_code !== subject.code ||
      price.classification !== PROJECT_CLASSIFICATION) {
    throw new Error("PROJECT_ONLY subject units or price provenance is missing.");
  }
  const units = Number(subject.units);
  const feePerUnit = money(price.rate_per_unit, "subject rate");
  return {
    units,
    feePerUnit,
    fee: units * feePerUnit,
    feeClassification: price.classification,
  };
}

export function projectPhase8PlacementEstimate(placement, subjectEstimate, rate) {
  if (!placement || !subjectEstimate || !validUnits(subjectEstimate.units)) {
    throw new Error("PROJECT_ONLY curriculum references a missing priced subject.");
  }
  const unitsOverride = placement.units_override;
  if (unitsOverride != null && !validUnits(unitsOverride)) {
    throw new Error("PROJECT_ONLY curriculum contains unsupported placement units.");
  }
  if (rate && rate.classification !== PROJECT_CLASSIFICATION) {
    throw new Error("PROJECT_ONLY curriculum price provenance is invalid.");
  }
  return {
    unitsOverride,
    feePerUnit: rate
      ? money(rate.rate_per_unit, "curriculum rate")
      : subjectEstimate.feePerUnit,
  };
}

export function verifyProjectPhase8CurriculumTuition(assignments, pricedSubjects, estimate) {
  if (!estimate || estimate.classification !== PROJECT_CLASSIFICATION ||
      estimate.is_complete !== true || !Array.isArray(assignments) || !assignments.length) {
    throw new Error("PROJECT_ONLY whole-curriculum estimate is incomplete.");
  }
  let totalUnits = 0;
  let estimatedTuition = 0;
  const semesters = new Set();
  for (const assignment of assignments) {
    const subject = pricedSubjects.get(assignment.subjectCode);
    if (!subject || !validUnits(subject.units)) {
      throw new Error("PROJECT_ONLY curriculum contains an unpriced subject.");
    }
    const units = assignment.unitsOverride == null
      ? subject.units : Number(assignment.unitsOverride);
    const rate = money(assignment.feePerUnit, "curriculum rate");
    totalUnits += Number(units);
    estimatedTuition += Number(units) * rate;
    semesters.add(`${assignment.yearLevel}|${assignment.semester}`);
  }
  if (Number(estimate.priced_subjects) !== assignments.length ||
      Number(estimate.unpriced_subjects) !== 0 ||
      Number(estimate.academic_units) !== totalUnits ||
      Number(estimate.semesters_represented) !== semesters.size ||
      Math.abs(Number(estimate.estimated_tuition) - estimatedTuition) >= 0.005) {
    throw new Error("PROJECT_ONLY normalized semester and curriculum totals disagree.");
  }
  return {
    totalUnits,
    estimatedTuition,
    estimatedTuitionComplete: true,
    estimatedTuitionCoverage: semesters.size,
  };
}

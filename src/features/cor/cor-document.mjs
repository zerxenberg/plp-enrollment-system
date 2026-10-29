// The confirmed COR RPCs are the only source of registered subjects and meetings.
// This model is shared by both portals and the single PDF document renderer.
import { displaySubjectCode } from "../academic/project-academic-display-aliases.mjs";

const missing = (value) => value === null || value === undefined || String(value).trim() === "";
const present = (value) => missing(value) ? "Not recorded" : String(value).trim();

function verifiedSubjects(subjects, meetings, registeredUnits) {
  if (!Array.isArray(subjects) || !subjects.length ||
      !Array.isArray(meetings) || !meetings.length) {
    throw new Error("A verified registered subject and meeting snapshot is required.");
  }
  const seen = new Set();
  const result = subjects.map((subject) => {
    const code = String(subject.subject_code || "").trim();
    const units = Number(subject.academic_units ?? subject.units);
    if (!code || !subject.subject_name || !subject.section_id ||
        !Number.isFinite(units) || units <= 0 || seen.has(code)) {
      throw new Error("The registered subjects are incomplete or duplicated.");
    }
    seen.add(code);
    return {
      code,
      name: String(subject.subject_name),
      units,
      section: present(subject.section_code || subject.section_id),
      sectionId: String(subject.section_id),
    };
  });
  const meetingCodes = new Set();
  for (const meeting of meetings) {
    if (!seen.has(meeting.subject_code) || meeting.day_of_week == null ||
        missing(meeting.start_time) || missing(meeting.end_time)) {
      throw new Error("The registered meeting snapshot is incomplete.");
    }
    meetingCodes.add(meeting.subject_code);
  }
  if (meetingCodes.size !== seen.size ||
      (registeredUnits !== undefined &&
        result.reduce((sum, item) => sum + item.units, 0) !== Number(registeredUnits))) {
    throw new Error("Registered subjects, meetings and academic units do not reconcile.");
  }
  return result.map((subject) => ({
    ...subject,
    meetings: meetings.filter((item) => item.subject_code === subject.code),
  }));
}

function verifiedPrice(subjects, feeEstimate) {
  if (!feeEstimate) return null;
  if (feeEstimate.official !== false || feeEstimate.assessmentIssued !== false ||
      feeEstimate.subjectCount !== subjects.length || !Array.isArray(feeEstimate.subjects)) {
    throw new Error("The project tuition estimate is not verified.");
  }
  const prices = new Map(feeEstimate.subjects.map((item) => [item.code, item]));
  const total = subjects.reduce((sum, subject) => {
    const fee = prices.get(subject.code);
    if (!fee || Number(fee.units) !== subject.units ||
        !Number.isFinite(Number(fee.ratePerUnit)) ||
        !Number.isFinite(Number(fee.estimatedFee)) ||
        Math.abs(Number(fee.estimatedFee) - subject.units * Number(fee.ratePerUnit)) > 0.001) {
      throw new Error("The registered subject has no verified fee estimate.");
    }
    subject.unitFee = Number(fee.ratePerUnit);
    return sum + Number(fee.estimatedFee);
  }, 0);
  if (Math.abs(total - Number(feeEstimate.estimatedAmount)) > 0.001 ||
      Number(feeEstimate.totalUnits) !== subjects.reduce((sum, item) => sum + item.units, 0)) {
    throw new Error("The registered project fees do not reconcile.");
  }
  return total;
}

export function buildVerifiedCorDocument(cor, options = {}) {
  const project = cor?.simulation_only === true;
  if (project) {
    if (cor.official !== false || cor.certificate_of_official_registration !== false ||
        cor.registration_snapshot_complete !== true ||
        cor.registration_status !== "CONFIRMED FOR PROJECT SIMULATION" ||
        !cor.simulation_id || !cor.confirmed_at ||
        missing(cor.student?.student_number) || missing(cor.student?.student_name)) {
      throw new Error("A confirmed project registration snapshot is required.");
    }
  } else if (cor?.official !== true || cor.ready_to_print !== true ||
      cor.schedule_complete !== true || cor.registration_reference_complete !== true ||
      cor.status !== "OFFICIALLY ENROLLED" || !cor.confirmed_at ||
      missing(cor.student_number) || missing(cor.student_name)) {
    throw new Error("A verified official confirmed enrollment is required.");
  }
  const source = project ? cor.student : cor;
  const subjects = verifiedSubjects(
    project ? cor.registered_subjects : cor.subjects,
    project ? cor.registered_schedule : cor.schedule,
    project ? cor.registered_units : undefined,
  );
  for (const subject of subjects) {
    // Preserve the immutable P8F26 subject identity for every registration,
    // meeting, fee lookup and validation. Only the COR-facing label is aliased.
    // The server's verified subject catalog map takes precedence; the shared
    // Academic Coordinator formatter covers direct previews and PDF builders.
    subject.displayCode = options.subjectDisplayCodes?.get(subject.code) ||
      displaySubjectCode(subject.code);
  }
  const totalFee = project ? verifiedPrice(subjects, options.projectFeeEstimate) : null;
  const year = options.academicYear || cor.academic_year ||
    (project ? null : cor.academic_term);
  return {
    project,
    studentNumber: present(source.student_number),
    studentName: present(source.student_name),
    program: present(options.programName || (project ? source.program_code : cor.program_name || cor.program_code)),
    academicYear: present(year),
    semester: present(options.semester || cor.semester),
    yearLevel: present(source.year_level),
    block: present(source.home_block),
    status: project ? "Confirmed (Demo)" : "Confirmed",
    confirmedAt: cor.confirmed_at,
    confirmedBy: present(project ? cor.confirmed_by_registrar : null),
    reference: present(project ? cor.registration_reference || cor.simulation_id :
      cor.confirmation_reference || cor.reference),
    remarks: project ? "PROJECT_ONLY classroom registration" : "Confirmed university registration",
    totalUnits: subjects.reduce((sum, item) => sum + item.units, 0),
    totalFee,
    subjects,
  };
}

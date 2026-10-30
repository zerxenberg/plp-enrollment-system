import {
  getAuthorizedDemonstration,
  getDemonstrationSubjects,
  getDemonstrationFee,
  isConfirmedDemonstrationRegistration,
} from "./live-institutional-view-model.mjs";

// Presentation adapter only. The underlying Admissions demonstration ledger,
// status transitions, permissions, and official enrollment records remain separate.
export function admissionsDemonstrationSharedData(data) {
  const demo = getAuthorizedDemonstration(data);
  if (!demo || !data?.student || !["ready", "blocked"].includes(data.kind)) return null;

  const subjects = getDemonstrationSubjects(demo);
  const fee = getDemonstrationFee(demo);
  const confirmed = isConfirmedDemonstrationRegistration(demo);
  const saved = confirmed ? demo.registration || demo.confirmedRegistration : null;
  const prepared = subjects.filter((subject) => subject.section &&
    subject.sectionStatus === "OPEN" && subject.meetings.length > 0 &&
    ["ELIGIBLE", "RETAKE", "ELIGIBLE_FOR_DEMONSTRATION"].includes(subject.eligibility));
  // Keep the database's demonstration-only eligibility designation visible.
  const normalized = subjects;
  const snapshotSubjects = saved?.subjects.map((subject) => ({
    code: subject.code || subject.subject_code,
    name: subject.name || subject.subject_name,
    units: Number(subject.units),
    section: subject.section || subject.section_code,
    // The immutable saved registration may store meetings in a separate items
    // list. Prefer that verified list rather than assuming embedded meetings.
    meetings: ((saved.items || []).filter((m) =>
      (m.code || m.subject_code) === (subject.code || subject.subject_code)).length
      ? saved.items.filter((m) => (m.code || m.subject_code) ===
        (subject.code || subject.subject_code)) : subject.meetings || []).map((m) => ({
      day: m.day ?? m.day_of_week, start: m.start ?? m.start_time,
      end: m.end ?? m.end_time, room: m.room, instructor: m.instructor || m.professor,
      component: m.component || m.lecture_lab_type,
    })),
  })) || [];
  const registered = confirmed ? {
    id: saved.id, reference: saved.reference, confirmedAt: saved.confirmedAt,
    source: "CONFIRMED_PROJECT_REGISTRATION_SNAPSHOT",
    units: saved.units, subjects: snapshotSubjects,
    projectFeeEstimate: { estimatedAmount: fee.available ? fee.amount : null },
  } : null;
  const projectSubjects = normalized.map((subject) => ({
    subject_code: subject.code, subject_name: subject.name, section_code: subject.section,
    section_id: subject.sectionId, section_status: subject.sectionStatus, units: subject.units,
  }));
  const makeMeetings = (records) => records.flatMap((subject) =>
    (subject.meetings || []).map((meeting) => ({
      subject_code: subject.code, day_of_week: meeting.day ?? meeting.day_of_week,
      start_time: meeting.start ?? meeting.start_time,
      end_time: meeting.end ?? meeting.end_time, room: meeting.room,
      instructor: meeting.instructor || meeting.professor,
      component: meeting.component || meeting.lecture_lab_type,
    })));
  const displayCurriculum = demo.curriculum?.label || demo.curriculum?.name ||
    demo.curriculum?.code || null;
  const perUnitRates = normalized.map((subject) =>
    Number(subject.units) > 0 && Number.isFinite(subject.feeEstimate)
      ? subject.feeEstimate / subject.units : null);
  const uniformRate = fee.available && perUnitRates.length > 0 &&
    perUnitRates.every((rate) => rate !== null && rate === perUnitRates[0])
    ? perUnitRates[0] : null;
  const estimatedPrepared = prepared.length === normalized.length && fee.available
    ? fee.amount : null;
  const savedFee = saved?.feeEstimate;
  const savedFeeVerified = savedFee?.simulation_only === true &&
    savedFee.official === false && savedFee.currency === "PHP" &&
    savedFee.missingRateCount === 0 &&
    savedFee.verifiedRateCount === snapshotSubjects.length &&
    Number.isFinite(Number(savedFee.estimatedAmount)) &&
    Number(savedFee.totalUnits) === saved?.units;
  const registeredFee = savedFeeVerified ? Number(savedFee.estimatedAmount) : null;
  if (registered) registered.projectFeeEstimate.estimatedAmount = registeredFee;
  const timetableVerified = demo.kind === "ready" &&
    demo.status !== "CONFIRMED_SIMULATION" &&
    Array.isArray(demo.blockingReasons) && demo.blockingReasons.length === 0 &&
    Boolean(demo.homeBlock?.code) && prepared.length === normalized.length &&
    prepared.length > 0 && prepared.every((subject) => subject.meetings.every((m) =>
      m.room && m.instructor && (m.start || m.start_time) && (m.end || m.end_time)));
  const academicYear = data.term?.academicYear || null;
  const termLabel = demo.term?.label || data.term?.label || "Term not recorded";
  const student = {
    name: data.student.name, number: data.student.number, type: data.student.type,
    program: data.student.program, yearLevel: data.student.yearLevel,
    curriculum: displayCurriculum, curriculumCode: demo.curriculum?.code || null,
    classification: data.student.classification || "PENDING_EVALUATION",
    progression: null,
  };
  const totalUnits = prepared.reduce((total, subject) => total + Number(subject.units || 0), 0);
  const enrollment = {
    kind: "ready", student,
    term: { label: termLabel, academicYear, semester: data.term?.semester,
      enrollmentStart: data.term?.enrollmentStart, enrollmentEnd: data.term?.enrollmentEnd },
    homeBlock: demo.homeBlock?.code || null,
    subjects: normalized, proposedSubjects: prepared,
    proposedUnits: totalUnits,
    simulation: demo.id ? {
      id: demo.id, status: demo.status, correctionReason: demo.correctionReason,
      submittedAt: demo.submittedAt || null,
    } : null,
    projectFeeEstimate: {
      estimatedAmount: estimatedPrepared,
      totalUnits: demo.feeEstimate?.totalUnits,
      ratePerUnit: uniformRate,
      subjects: normalized.map((subject) => ({
        code: subject.code, estimatedFee: subject.feeEstimate,
      })),
    },
    confirmedRegistration: registered,
    canSubmit: demo.canSubmit === true, canPrepare: demo.canPrepare === true,
    canReopen: demo.canReopen === true,
    blockingReasons: demo.blockingReasons || [],
    timetableReady: prepared.length > 0,
    officialStatus: data.enrollment?.status === "CONFIRMED" && data.enrollment?.confirmedAt
      ? "CONFIRMED" : "NOT_CONFIRMED",
    previousResults: Array.isArray(data.academic?.results) ? data.academic.results : [],
    transferCredits: Array.isArray(data.academic?.credits) ? data.academic.credits : [],
    acceptedProjectResults: [], projectTransferDecisions: [],
  };
  const academic = {
    studentNumber: student.number, program: student.program,
    curriculumCode: displayCurriculum, yearLevel: student.yearLevel,
    track: null,
    curriculum: (demo.curriculumPlan?.length ? demo.curriculumPlan : normalized).map((subject) => ({
      code: subject.code, name: subject.name, units: subject.units,
      yearLevel: subject.yearLevel ?? student.yearLevel,
      semester: subject.semester ?? data.term?.semester,
    })),
    eligibility: normalized.map((subject) => ({ subject_code: subject.code,
      eligibility: subject.eligibility, reason: subject.reason })),
    previousResults: enrollment.previousResults.map((row) => ({
      subject_code: row.code, subject_name: row.name || row.code,
      units: row.units, term: row.term, grade: row.grade, result: row.result,
    })),
    transferCredits: enrollment.transferCredits.map((row) => ({
      target_subject: row.code, credited_units: row.units,
      decision_status: "CREDITED", source_course: null,
    })),
    acceptedProjectResults: [], projectTransferDecisions: [],
  };
  const proposedSchedule = timetableVerified ? {
    source: "VERIFIED_PROJECT_PROPOSED_TIMETABLE", timetableValidated: true,
    term: termLabel, homeBlock: demo.homeBlock?.code,
    subjects: projectSubjects, items: makeMeetings(prepared),
  } : null;
  const projectSchedule = registered ? {
    source: "CONFIRMED_PROJECT_REGISTRATION_SNAPSHOT",
    registrationSnapshotComplete: true,
    reference: saved.reference, confirmedAt: saved.confirmedAt,
    term: termLabel, homeBlock: demo.homeBlock?.code,
    subjects: snapshotSubjects.map((s) => ({ subject_code: s.code,
      subject_name: s.name, units: s.units, section_code: s.section })),
    items: makeMeetings(snapshotSubjects),
  } : null;

  return { enrollment, academic, projectSchedule, proposedSchedule,
    registrationUrl: registered && demo.id
      ? `/api/student/admissions-demo-cor/${encodeURIComponent(demo.id)}` : null };
}

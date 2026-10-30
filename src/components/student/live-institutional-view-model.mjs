import { formatClockTime, formatRoomCode, formatWeekday, WEEKDAY_NAMES } from "../../features/students/class-meeting-format.mjs";

const isText = (value) => typeof value === "string" && value.trim().length > 0;

export function isOfficiallyConfirmed(enrollment) {
  return enrollment?.status === "CONFIRMED" && isText(enrollment.confirmedAt);
}

export function getInstitutionalNextAction(data) {
  if (isOfficiallyConfirmed(data?.enrollment)) {
    return {
      title: "Registrar confirmation completed",
      description: "Your enrollment is officially confirmed. View your registered subjects and published class schedule when available.",
      label: "View Class Schedule", href: "/student/class-schedule",
    };
  }
  if (data?.academic?.isOfficialCurriculum === false) {
    const fictional = data?.student?.curriculumProvenance === "PROJECT_ONLY_FICTIONAL";
    return {
      title: fictional ? "Institutional curriculum approval required" : "Academic validation required",
      description: fictional
        ? "The available curriculum is a fictional reference. The Registrar and Academic Coordinator must verify and approve a real institutional curriculum before enrollment can proceed."
        : "Your curriculum and section readiness require institutional validation before enrollment can proceed.",
      label: "Review Requirements", href: "/student/enrollment",
    };
  }
  if (data?.canSubmit === true || data?.enrollment?.canSubmit === true) {
    return {
      title: "Review and submit your enrollment",
      description: "Your academic preparation is ready to submit for Registrar review. Submission alone does not confirm enrollment.",
      label: "Review Enrollment", href: "/student/enrollment",
    };
  }
  if (data?.canPrepare === true || data?.enrollment?.canPrepare === true) {
    return {
      title: "Prepare your academic assignment",
      description: "Your enrollment needs a validated academic assignment before it can be submitted for Registrar review.",
      label: "Prepare Enrollment", href: "/student/enrollment",
    };
  }
  if (data?.enrollment?.status === "SUBMITTED" || data?.enrollment?.status === "FOR_VALIDATION" ||
      data?.enrollment?.status === "VALIDATED" || data?.enrollment?.status === "NEEDS_ACADEMIC_REVIEW") {
    return {
      title: "Registrar review in progress",
      description: "Your submitted enrollment is awaiting the next authorized review or confirmation step.",
      label: "View Enrollment Status", href: "/student/enrollment",
    };
  }
  return {
    title: "Academic preparation required",
    description: data?.blockingReasons?.[0] ||
      "Your academic assignment or enrollment eligibility is awaiting verification. Review the requirements below.",
    label: "View Enrollment Requirements", href: "/student/enrollment",
  };
}

const isSyntheticRecord = (value) => value?.is_synthetic_demo === true ||
  value?.isSyntheticDemo === true ||
  value?.source === "GENERATED_PROJECT" || value?.source === "PROJECT_ONLY" ||
  value?.provenance === "GENERATED_PROJECT" || value?.provenance === "PROJECT_ONLY";

export function getInstitutionalSchedule(data) {
  const schedule = data?.schedule;
  if (!schedule || isSyntheticRecord(schedule) ||
      !["confirmed", "proposed"].includes(schedule.kind)) {
    return { kind: "awaiting", meetings: [] };
  }
  const confirmed = isOfficiallyConfirmed(data.enrollment);
  if (schedule.kind === "confirmed" && !confirmed) {
    return { kind: "awaiting", meetings: [] };
  }
  const subjects = Array.isArray(schedule.subjects) ? schedule.subjects :
    Array.isArray(data?.enrollment?.cor?.subjects) ? data.enrollment.cor.subjects :
    Array.isArray(data?.enrollment?.subjects) ? data.enrollment.subjects : [];
  const byCode = new Map(subjects.filter((item) => !isSyntheticRecord(item))
    .map((item) => [item.code || item.subjectCode || item.subject_code, item]));
  const rawMeetings = Array.isArray(schedule.meetings) ? schedule.meetings :
    Array.isArray(schedule.items) ? schedule.items :
    subjects.flatMap((subject) => (subject.meetings || []).map((meeting) => ({
      ...meeting, code: subject.code || subject.subjectCode || subject.subject_code,
      subjectName: subject.name || subject.subjectName || subject.subject_name,
      section: subject.section || subject.sectionCode || subject.section_code,
    })));
  const meetings = rawMeetings.flatMap((meeting, index) => {
    const code = meeting?.code || meeting?.subjectCode || meeting?.subject_code;
    const day = meeting?.day ?? meeting?.day_of_week;
    const start = meeting?.start ?? meeting?.start_time;
    const end = meeting?.end ?? meeting?.end_time;
    if (isSyntheticRecord(meeting) || !isText(code) || day == null ||
        !isText(start) || !isText(end)) return [];
    const subject = byCode.get(code);
    return [{
      key: `${code}:${String(day)}:${start}:${end}:${index}`,
      code, name: subject?.name || subject?.subjectName || subject?.subject_name || meeting.subjectName ||
        meeting.name || code,
      section: subject?.section || subject?.sectionCode || meeting.section || "Not assigned",
      day: formatWeekday(day), start: formatClockTime(start), end: formatClockTime(end),
      rawStart: String(start),
      room: formatRoomCode(meeting.room),
      instructor: meeting.instructor || meeting.professor || "To Be Announced",
      component: meeting.component || meeting.lecture_lab_type || "Class meeting",
    }];
  }).sort((a, b) => WEEKDAY_NAMES.indexOf(a.day) - WEEKDAY_NAMES.indexOf(b.day) ||
    a.rawStart.localeCompare(b.rawStart) || a.code.localeCompare(b.code));
  return {
    kind: meetings.length ? (schedule.kind === "confirmed" ? "registered" : "proposed") : "awaiting",
    meetings,
    term: schedule.term || data?.enrollment?.cor?.academic_term || data?.term?.label || null,
    reference: schedule.reference || data?.enrollment?.confirmationReference || null,
  };
}

export function getInstitutionalAcademicHistory(academic) {
  if (isSyntheticRecord(academic)) return [];
  const results = Array.isArray(academic?.results) ? academic.results : [];
  const credits = Array.isArray(academic?.credits) ? academic.credits : [];
  return [
    ...results.filter((item) => !isSyntheticRecord(item)).map((row, index) => ({
      key: `result:${index}:${row.code || row.subject_code}:${row.term || row.term_id}`,
      code: row.code || row.subject_code,
      name: row.name || row.subject_name || row.code || row.subject_code,
      term: row.term || row.term_id || "Not recorded",
      units: row.units,
      result: row.result || row.resultStatus || row.result_status || "NOT_RECORDED",
      grade: row.grade ?? row.official_grade_value ?? null,
      source: row.source || "Institutional academic record",
    })),
    ...credits.filter((item) => !isSyntheticRecord(item)).map((row, index) => ({
      key: `credit:${index}:${row.code || row.target_subject}`,
      code: row.code || row.target_subject || row.target_subject_code,
      name: row.name || row.subject_name || row.code || row.target_subject || row.target_subject_code,
      term: row.term || "Transfer evaluation",
      units: row.units ?? row.credited_units,
      result: row.result || row.decisionStatus || row.decision_status || "PENDING",
      grade: null,
      source: row.source || "Institutional transfer decision",
    })),
  ].filter((row) => isText(row.code));
}

// A genuine Admissions identity may participate in the verified fictional
// Phase 8 exercise, but the simulation must remain a separately labeled view.
// Never infer demonstration authority from a P8 curriculum code alone.
export function getAuthorizedDemonstration(data) {
  const demo = data?.demonstration;
  if (!demo || typeof demo !== "object" ||
      demo.projectOnly !== true ||
      demo.verifiedInstitutionally !== false ||
      demo.provenance !== "PROJECT_ONLY_FICTIONAL" ||
      !["ready", "blocked"].includes(demo.kind)) return null;
  return demo;
}

export function hasUnavailableDemonstration(data) {
  const demo = data?.demonstration;
  return demo?.kind === "unavailable" &&
    demo.projectOnly === true &&
    demo.verifiedInstitutionally === false &&
    demo.provenance === "PROJECT_ONLY_FICTIONAL";
}

export function isConfirmedDemonstrationRegistration(demo) {
  const saved = demo?.registration || demo?.confirmedRegistration;
  return demo?.status === "CONFIRMED_SIMULATION" &&
    saved?.registrationSnapshotComplete === true &&
    saved?.source === "CONFIRMED_PROJECT_REGISTRATION_SNAPSHOT" &&
    isText(saved.reference) && isText(saved.confirmedAt) &&
    Array.isArray(saved.subjects) && saved.subjects.length > 0 &&
    saved.subjects.every((subject) =>
      isText(subject.code || subject.subject_code) &&
      isText(subject.section || subject.section_code) &&
      typeof subject.units === "number" && Number.isFinite(subject.units) &&
      subject.units > 0) &&
    Array.isArray(saved.items) && saved.items.length > 0 &&
    saved.subjects.every((subject) =>
      saved.items.some((meeting) => (meeting.code || meeting.subject_code) ===
        (subject.code || subject.subject_code))) &&
    saved.items.every((meeting) =>
      saved.subjects.some((subject) => (subject.code || subject.subject_code) ===
        (meeting.code || meeting.subject_code)) &&
      (meeting.day ?? meeting.day_of_week) != null &&
      isText(meeting.start ?? meeting.start_time) &&
      isText(meeting.end ?? meeting.end_time));
}

export function getDemonstrationSubjects(demo) {
  if (!demo || !["ready", "blocked"].includes(demo.kind)) return [];
  const raw = Array.isArray(demo.subjects) ? demo.subjects : [];
  return raw.filter((item) => isText(item?.code || item?.subject_code)).map((item) => ({
    ...item,
    code: item.code || item.subject_code,
    name: item.name || item.subject_name || item.code || item.subject_code,
    section: item.section || item.section_code || null,
    sectionStatus: item.sectionStatus || item.section_status || null,
    eligibility: item.eligibility || item.eligibility_status || "PENDING_EVALUATION",
    meetings: Array.isArray(item.meetings) ? item.meetings.filter((meeting) =>
      (meeting.day ?? meeting.day_of_week) != null &&
      isText(meeting.start ?? meeting.start_time) &&
      isText(meeting.end ?? meeting.end_time)) : [],
  }));
}

export function getDemonstrationFee(demo) {
  const fee = demo?.feeEstimate || demo?.projectFeeEstimate;
  const amount = fee?.estimatedAmount;
  if (!fee || typeof amount !== "number" || !Number.isFinite(amount) ||
      amount < 0 || (fee.currency && fee.currency !== "PHP") ||
      fee.verified === false || fee.missingRateCount !== 0 ||
      !Number.isInteger(fee.verifiedRateCount) || fee.verifiedRateCount < 1) {
    return { available: false, amount: null, subjects: [] };
  }
  return {
    available: true,
    amount,
    subjects: Array.isArray(fee.subjects) ? fee.subjects : [],
    ratePerUnit: typeof fee.ratePerUnit === "number" &&
      Number.isFinite(fee.ratePerUnit) ? fee.ratePerUnit : null,
  };
}

export function getDemonstrationNextAction(demo) {
  if (isConfirmedDemonstrationRegistration(demo)) return {
    title: "Confirmed classroom demonstration",
    description: "Your preserved project registration can be viewed as a demonstration. It is not official PLP enrollment.",
    label: "View Demonstration Schedule", href: "/student/class-schedule",
  };
  if (demo?.status === "CONFIRMED_SIMULATION") return {
    title: "Demonstration confirmation needs verification",
    description: "A confirmation exists, but the full registered subject and meeting snapshot is unavailable. Contact the Registrar.",
    label: "Review Demonstration", href: "/student/enrollment",
  };
  if (["SUBMITTED", "VALIDATED", "FOR_VALIDATION"].includes(demo?.status)) return {
    title: "Demonstration awaiting Registrar review",
    description: "Your project enrollment is under review. It has no effect on official enrollment.",
    label: "Review Demonstration", href: "/student/enrollment",
  };
  if (demo?.canSubmit === true) return {
    title: "Review prepared demonstration subjects",
    description: "Your fictional class plan is ready for project submission and Registrar review.",
    label: "Review Demonstration", href: "/student/enrollment",
  };
  if (demo?.canAutoAssign === true || demo?.canPrepare === true) return {
    title: "Prepare demonstration enrollment",
    description: "You may prepare a fictional registration using the authorized Phase 8 academic dataset.",
    label: "Prepare Demonstration", href: "/student/enrollment",
  };
  return {
    title: "Demonstration academic preparation",
    description: demo?.blockingReasons?.[0] ||
      "The project curriculum, assigned block, or section availability still requires review.",
    label: "View Demonstration", href: "/student/enrollment",
  };
}

function normalizedDemonstrationMeetings(subjects) {
  const meetings = subjects.flatMap((subject) => (subject.meetings || []).flatMap((meeting, index) => {
    const day = meeting.day ?? meeting.day_of_week;
    const start = meeting.start ?? meeting.start_time;
    const end = meeting.end ?? meeting.end_time;
    if (day == null || !isText(start) || !isText(end)) return [];
    return [{
      key: `${subject.code}:${day}:${start}:${end}:${index}`,
      code: subject.code,
      name: subject.name || subject.code,
      section: subject.section || "Not assigned",
      sectionStatus: subject.sectionStatus || null,
      day: formatWeekday(day),
      start: formatClockTime(start),
      end: formatClockTime(end),
      rawStart: String(start),
      room: formatRoomCode(meeting.room),
      instructor: meeting.instructor || meeting.professor || "To Be Announced",
      component: meeting.component || meeting.lecture_lab_type || "Class meeting",
    }];
  }));
  return meetings.sort((a, b) =>
    WEEKDAY_NAMES.indexOf(a.day) - WEEKDAY_NAMES.indexOf(b.day) ||
    a.rawStart.localeCompare(b.rawStart) || a.code.localeCompare(b.code));
}

export function getDemonstrationSchedule(demo) {
  if (!demo || !["ready", "blocked"].includes(demo.kind)) return { kind: "awaiting", meetings: [] };
  const registered = isConfirmedDemonstrationRegistration(demo);
  if (registered) {
    const snapshot = demo.registration || demo.confirmedRegistration;
    const subjects = snapshot.subjects.map((subject) => ({
      code: subject.code || subject.subject_code,
      name: subject.name || subject.subject_name || subject.code,
      section: subject.section || subject.section_code || null,
      meetings: snapshot.items.filter((meeting) =>
        (meeting.code || meeting.subject_code) === (subject.code || subject.subject_code)),
    }));
    const meetings = normalizedDemonstrationMeetings(subjects);
    return {
      kind: meetings.length ? "registered" : "awaiting",
      meetings,
      reference: snapshot.reference,
      term: demo.term?.label || demo.term?.id || null,
    };
  }
  if (demo.status === "CONFIRMED_SIMULATION") return { kind: "awaiting", meetings: [] };
  const proposed = Array.isArray(demo.proposedSubjects)
    ? demo.proposedSubjects : getDemonstrationSubjects(demo).filter((subject) =>
      ["ELIGIBLE", "RETAKE", "ELIGIBLE_FOR_DEMONSTRATION"].includes(subject.eligibility) &&
      Boolean(subject.section));
  // Only show a proposed timetable when the server explicitly attests that it
  // came from the approved fictional block schedule.
  if (!isText(demo.homeBlock?.code) || (!["PROPOSED", "SUBMITTED", "VALIDATED", "RETURNED"].includes(demo.status) &&
      demo.timetableReady !== true && demo.timetableValidated !== true &&
      demo.schedule?.kind !== "proposed")) return { kind: "awaiting", meetings: [] };
  const subjects = proposed.map((subject) => ({
    ...subject, code: subject.code || subject.subject_code,
    name: subject.name || subject.subject_name || subject.code || subject.subject_code,
    section: subject.section || subject.section_code,
  }));
  const meetings = normalizedDemonstrationMeetings(subjects);
  return {
    kind: meetings.length ? "proposed" : "awaiting",
    meetings,
    term: demo.term?.label || demo.term?.id || null,
    reference: null,
  };
}

import { getBlockOccupancy } from "../block-planning/block-planning-service.js";

export const ACADEMIC_REPORT_TYPES = [
  "Program and Curriculum Summary",
  "Subjects and Prerequisites",
  "Enrollment Demand and Capacity",
  "Schedule Monitoring",
  "Academic Review Summary",
];

const asArray = (value) => Array.isArray(value) ? value : [];
const numeric = (value) => Number(value) || 0;
const termLabel = (plan, section) => asArray(plan.terms).find((term) => term.id === section.termId)?.label ||
  `${section.semester || ""} ${section.academicYear || ""}`.trim();
const sectionOccupancy = (plan, section) => getBlockOccupancy(plan, section.id) ||
  { proposed: 0, confirmed: 0, available: numeric(section.capacity), status: "OPEN" };

export function buildProgramCurriculumRows(catalog, academicData, breakdown = "program") {
  const programs = asArray(catalog.programs);
  const curricula = asArray(academicData.curricula);
  if (breakdown === "curriculum") return curricula.map((curriculum) => ({
    program: curriculum.program, major: curriculum.major || "General", curriculum: curriculum.version,
    department: curriculum.department || programs.find((program) => program.code === curriculum.program)?.department || "",
    effectiveYear: curriculum.effectiveAcademicYear || "Not specified",
    subjects: asArray(curriculum.assignments).length,
    units: curriculum.totalUnits ?? "Not calculated", status: curriculum.status,
  }));
  return programs.map((program) => ({
    program: program.code, name: program.name, department: program.department,
    specializations: asArray(program.majors).join(", ") || "General",
    curriculumVersions: curricula.filter((curriculum) => curriculum.program === program.code).length,
    status: program.status || "Not specified",
  }));
}

export function buildSubjectPrerequisiteRows(catalog, academicData) {
  const subjects = asArray(catalog.subjects);
  const byCode = new Map(subjects.map((subject) => [subject.code, subject]));
  const offerings = asArray(academicData.offerings);
  const assigned = new Set();
  const rows = asArray(academicData.curricula).flatMap((curriculum) =>
    asArray(curriculum.assignments).map((assignment) => {
      assigned.add(`${curriculum.program}|${assignment.subjectCode}`);
      const subject = byCode.get(assignment.subjectCode);
      const offering = offerings.find((item) => item.subjectCode === assignment.subjectCode &&
        item.program === curriculum.program);
      return {
        program: curriculum.program, curriculum: curriculum.version, subject: assignment.subjectCode,
        name: subject?.name || "Unknown subject", units: subject?.units ?? "Not available",
        yearLevel: assignment.yearLevel || subject?.yearLevel || "",
        semester: assignment.semester || subject?.semester || "",
        prerequisites: asArray(assignment.prerequisites ?? subject?.prerequisites).join(", ") || "None",
        offering: offering?.status || "Not listed", status: subject?.status || "Not listed",
      };
    }));
  for (const subject of subjects) {
    for (const program of asArray(subject.programs).length ? subject.programs : [subject.program].filter(Boolean)) {
      if (assigned.has(`${program}|${subject.code}`)) continue;
      const offering = offerings.find((item) => item.subjectCode === subject.code && item.program === program);
      rows.push({
        program, curriculum: "Not assigned", subject: subject.code, name: subject.name,
        units: subject.units ?? "Not available", yearLevel: subject.yearLevel || "",
        semester: subject.semester || "", prerequisites: asArray(subject.prerequisites).join(", ") || "None",
        offering: offering?.status || "Not listed", status: subject.status || "Not listed",
      });
    }
  }
  return rows;
}

export function buildCapacityRows(plan, registrar, breakdown = "subject") {
  const sections = asArray(plan.blockSections);
  const classes = asArray(plan.subjectClasses);
  const enrollments = asArray(registrar.enrollments);
  if (breakdown === "section") return sections.map((section) => {
    const occupancy = sectionOccupancy(plan, section);
    return {
      program: section.programCode, section: section.code, termId: section.termId,
      academicTerm: termLabel(plan, section), yearLevel: section.yearLevel,
      capacity: numeric(section.capacity), proposed: occupancy.proposed,
      confirmed: occupancy.confirmed, available: occupancy.available,
      capacityStatus: occupancy.status, scheduleStatus: section.status,
    };
  });

  // A block offers each assigned subject to the students occupying that block.
  // Sum distinct blocks per subject; count proposed and confirmed independently.
  const groups = new Map();
  for (const subjectClass of classes) {
    const section = sections.find((item) => item.id === subjectClass.sectionId);
    if (!section) continue;
    const key = `${section.termId}|${section.programCode}|${subjectClass.subjectCode}`;
    if (!groups.has(key)) groups.set(key, { program: section.programCode,
      subject: subjectClass.subjectCode, termId: section.termId,
      academicTerm: termLabel(plan, section), sectionIds: new Set() });
    groups.get(key).sectionIds.add(section.id);
  }
  return [...groups.values()].map(({ sectionIds, ...group }) => {
    const relevant = sections.filter((section) => sectionIds.has(section.id));
    const totals = relevant.reduce((sum, section) => {
      const occupancy = sectionOccupancy(plan, section);
      sum.capacity += numeric(section.capacity);
      sum.proposed += occupancy.proposed;
      sum.confirmed += occupancy.confirmed;
      sum.available += occupancy.available;
      return sum;
    }, { capacity: 0, proposed: 0, confirmed: 0, available: 0 });
    const matchingRequests = enrollments.filter((enrollment) => enrollment.program === group.program &&
      asArray(enrollment.subjects).some((subject) => subject.code === group.subject));
    const requesting = new Set(matchingRequests.map((enrollment) => enrollment.studentNumber || enrollment.reference));
    const confirmedEnrollments = new Set(matchingRequests.filter((enrollment) => enrollment.status === "CONFIRMED")
      .map((enrollment) => enrollment.studentNumber || enrollment.reference));
    return { ...group, sections: relevant.length, registrarRequests: requesting.size,
      registrarConfirmed: confirmedEnrollments.size, ...totals };
  });
}

const minutes = (time) => /^\d{2}:\d{2}$/.test(String(time || "")) ?
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : null;

export function buildScheduleRows(plan) {
  const sections = new Map(asArray(plan.blockSections).map((item) => [item.id, item]));
  const classes = new Map(asArray(plan.subjectClasses).map((item) => [item.id, item]));
  const rooms = new Map(asArray(plan.rooms).map((item) => [item.id, item]));
  const professors = new Map(asArray(plan.professors).map((item) => [item.id, item]));
  const meetings = asArray(plan.classMeetings).map((meeting) => ({
    ...meeting, subjectClass: classes.get(meeting.subjectClassId),
  }));
  const byClass = new Map();
  for (const meeting of meetings) {
    const current = byClass.get(meeting.subjectClassId) || [];
    current.push(meeting);
    byClass.set(meeting.subjectClassId, current);
  }
  return [...classes.values()].flatMap((subjectClass) => {
    const section = sections.get(subjectClass.sectionId);
    if (!section) return [];
    const matches = byClass.get(subjectClass.id) || [null];
    return matches.map((meeting, index) => {
      const reasons = [];
      if (meeting) {
        const start = minutes(meeting.start);
        const end = minutes(meeting.end);
        if (start === null || end === null || start >= end) reasons.push("Invalid time");
        else {
          for (const other of meetings) {
            if (other.id === meeting.id || other.subjectClass?.termId !== section.termId || other.day !== meeting.day) continue;
            const otherStart = minutes(other.start);
            const otherEnd = minutes(other.end);
            if (otherStart === null || otherEnd === null || start >= otherEnd || otherStart >= end) continue;
            if (meeting.roomId && other.roomId === meeting.roomId) reasons.push("Room overlap");
            if (subjectClass.professorId && other.subjectClass.professorId === subjectClass.professorId) reasons.push("Professor overlap");
            if (other.subjectClass.sectionId === subjectClass.sectionId) reasons.push("Block overlap");
          }
          for (const resource of [rooms.get(meeting.roomId), professors.get(subjectClass.professorId)]) {
            if (asArray(resource?.unavailable).some((period) => period.day === meeting.day &&
              minutes(period.start) !== null && minutes(period.end) !== null &&
              start < minutes(period.end) && minutes(period.start) < end)) reasons.push(`${resource.name} unavailable`);
          }
        }
      }
      return {
        id: `${subjectClass.id}:${meeting?.id || index}`, program: section.programCode,
        section: section.code, termId: section.termId, academicTerm: termLabel(plan, section),
        subject: subjectClass.subjectCode, day: meeting?.day || "Not scheduled",
        startTime: meeting?.start || "", endTime: meeting?.end || "",
        dayTime: meeting ? `${meeting.day} · ${meeting.start} to ${meeting.end}` : "Not scheduled",
        room: rooms.get(meeting?.roomId)?.name || "Not assigned",
        professor: professors.get(subjectClass.professorId)?.name || "Not assigned",
        scheduleStatus: section.status === "PUBLISHED" ? "Published proposal" : "Draft",
        conflictStatus: !meeting ? "Unscheduled" : reasons.length ? "Conflict detected" : "No detected conflicts",
        conflictDetails: [...new Set(reasons)].join("; ") || (meeting ? "None detected" : "Schedule has no meeting"),
      };
    });
  });
}

export function buildAcademicReviewSummary(enrollments) {
  const groups = new Map();
  for (const enrollment of asArray(enrollments)) {
    const decision = String(enrollment.academicReviewDecision || enrollment.academicReviewStatus || "").toUpperCase();
    const pending = enrollment.status === "NEEDS_ACADEMIC_REVIEW";
    if (!pending && !["APPROVED", "REJECTED", "APPLIED", "RETURNED_FOR_CLARIFICATION"].includes(decision)) continue;
    const category = enrollment.academicReviewCategory || enrollment.exceptionType || "Defined Academic Exception";
    const key = `${enrollment.program}|${category}`;
    if (!groups.has(key)) groups.set(key, { program: enrollment.program, category,
      pending: 0, approved: 0, rejected: 0, applied: 0, returned: 0, total: 0 });
    const group = groups.get(key);
    group.total += 1;
    // Returned cases remain pending until a final decision; returned is a subset of pending.
    if (decision === "RETURNED_FOR_CLARIFICATION") { group.pending += 1; group.returned += 1; }
    else if (pending && !["APPROVED", "REJECTED", "APPLIED"].includes(decision)) group.pending += 1;
    else if (decision === "APPROVED") group.approved += 1;
    else if (decision === "REJECTED") group.rejected += 1;
    else if (decision === "APPLIED") group.applied += 1;
    else group.pending += 1;
  }
  return [...groups.values()].sort((a, b) => a.program.localeCompare(b.program) || a.category.localeCompare(b.category));
}

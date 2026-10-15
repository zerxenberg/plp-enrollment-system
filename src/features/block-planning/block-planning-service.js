import { getTrackCode } from "./block-planning-seed.js";

export const BLOCK_SECTION_STATUSES = Object.freeze({ DRAFT: "DRAFT", PUBLISHED: "PUBLISHED" });
export const BLOCK_ASSIGNMENT_STATUSES = Object.freeze({ PROPOSED: "PROPOSED", CONFIRMED: "CONFIRMED" });
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const fail = (message) => ({ ok: false, message });
const success = (next, record, message) => ({ ok: true, message, record, next });
const clean = (value) => String(value ?? "").trim();
const toInt = (value) => Number(value);
const normalized = (value) => clean(value).toUpperCase();
const newId = (data, prefix) => {
  const existing = new Set(data.map((row) => row.id));
  let index = 1;
  while (existing.has(`${prefix}-${String(index).padStart(4, "0")}`)) index += 1;
  return `${prefix}-${String(index).padStart(4, "0")}`;
};
const timeMinutes = (value) => {
  if (!/^\d{2}:\d{2}$/.test(clean(value))) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
};
const overlaps = (a, b) => a.start < b.end && b.start < a.end;
const yearNumber = (value) => Number.parseInt(String(value), 10);
const yearLabel = (year) => `${year}${year === 1 ? "st" : year === 2 ? "nd" : year === 3 ? "rd" : "th"} Year`;
const majorMatches = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();
const audit = (data, action, record, previousValue = "", newValue = "", details = {}) => [{
  id: newId(data.history, "BPH"),
  at: new Date().toISOString(), actor: "Academic Coordinator (demo)",
  action, record, previousValue, newValue, ...details,
}, ...data.history];
const getSection = (data, id) => data.blockSections.find((section) => section.id === id);
const getClass = (data, id) => data.subjectClasses.find((item) => item.id === id);
const activeCount = (data, sectionId) => data.assignments.filter((assignment) =>
  assignment.sectionId === sectionId && ["PROPOSED", "CONFIRMED"].includes(assignment.status)).length;

export function getBlockOccupancy(data, sectionId) {
  const section = getSection(data, sectionId);
  if (!section) return null;
  const relevant = data.assignments.filter((assignment) =>
    assignment.sectionId === sectionId && ["PROPOSED", "CONFIRMED"].includes(assignment.status));
  const proposed = relevant.filter((assignment) => assignment.status === "PROPOSED").length;
  const confirmed = relevant.filter((assignment) => assignment.status === "CONFIRMED").length;
  return {
    capacity: section.capacity, proposed, confirmed,
    occupied: proposed + confirmed, available: Math.max(0, section.capacity - proposed - confirmed),
    status: proposed + confirmed >= section.capacity ? "FULL" :
      proposed + confirmed >= section.capacity * 0.9 ? "NEAR_FULL" : "OPEN",
  };
}

function resolveSectionInput(data, values, original = {}) {
  const termId = clean(values.termId ?? original.termId);
  const term = data.terms.find((item) => item.id === termId);
  if (!term) return fail("Select an academic term from the shared term list.");
  const programCode = normalized(values.programCode ?? values.program ?? original.programCode);
  const program = data.programs.find((item) => item.code === programCode);
  if (!program) return fail("Select a configured academic program.");
  const major = clean(values.major ?? original.major);
  if (program.majors?.length ? !program.majors.includes(major) : Boolean(major)) {
    return fail("Select a specialization that belongs to the program.");
  }
  const year = yearNumber(values.yearLevel ?? original.yearLevel);
  if (![1, 2, 3, 4].includes(year)) return fail("Select a valid college year level.");
  const yearLevel = yearLabel(year);
  const letter = normalized(values.letter ?? original.letter ?? (original.code || "").match(/([A-Z])$/)?.[1] ?? "A");
  if (!/^[A-Z]$/.test(letter)) return fail("The block letter must be one letter from A to Z.");
  const capacity = toInt(values.capacity ?? original.capacity);
  if (!Number.isInteger(capacity) || capacity < 1) return fail("Block capacity must be a positive whole number.");
  const curriculumId = clean(values.curriculumId ?? original.curriculumId);
  const curriculum = data.curricula.find((item) => item.id === curriculumId && item.program === programCode &&
    majorMatches(item.major, major) && item.status === "Active");
  if (!curriculum) return fail("Select the active curriculum version for this program and specialization.");
  const trackCode = getTrackCode(programCode, major);
  const code = `${trackCode}-${year}${letter}`;
  return {
    ok: true, record: {
      termId, academicYear: term.academicYear, semester: term.semester,
      programCode, programId: program.id, collegeId: program.departmentId,
      major, yearLevel, letter, code, trackCode, capacity, curriculumId,
    },
  };
}

export function createBlockSectionRecord(data, values = {}) {
  const parsed = resolveSectionInput(data, values);
  if (!parsed.ok) return parsed;
  const row = parsed.record;
  if (data.blockSections.some((item) => item.termId === row.termId && item.code === row.code)) {
    return fail("This block code is already in use for the selected academic term.");
  }
  const id = newId(data.blockSections, "BSEC-NEW");
  const record = { id, ...row, status: "DRAFT", publishedAt: null, isSyntheticDemo: true };
  const curriculum = data.curricula.find((item) => item.id === row.curriculumId);
  const classes = (curriculum.assignments || []).filter((assignment) =>
    assignment.yearLevel === row.yearLevel && assignment.semester === row.semester).map((assignment, index) => {
    const subject = data.subjects.find((item) => item.code === assignment.subjectCode);
    return {
      id: `${id}-CLS-${index + 1}`, sectionId: id, termId: row.termId,
      subjectCode: assignment.subjectCode, professorId: null,
      roomType: /\b(lab|laboratory|clinical|culinary|practicum)\b/i.test(subject?.name || "") ? "LAB" : "LECTURE",
      status: "DRAFT",
    };
  });
  const next = {
    ...data, blockSections: [...data.blockSections, record],
    subjectClasses: [...data.subjectClasses, ...classes],
    history: audit(data, "Block section created", record.code, "", row.termId),
  };
  return success(next, record, "Draft block section created with its curriculum subject classes.");
}

export function updateBlockSectionRecord(data, id, values = {}) {
  const current = getSection(data, id);
  if (!current) return fail("The selected block section no longer exists.");
  if (current.status !== "DRAFT") return fail("Published block schedules must remain unchanged. Create a draft for revisions.");
  const parsed = resolveSectionInput(data, values, current);
  if (!parsed.ok) return parsed;
  const row = parsed.record;
  if (data.blockSections.some((item) => item.id !== id && item.termId === row.termId && item.code === row.code)) {
    return fail("This block code is already in use for the selected academic term.");
  }
  if (row.capacity < activeCount(data, id)) return fail("Capacity cannot be smaller than the students already assigned.");
  const currentKey = [current.termId, current.programCode, current.major, current.yearLevel, current.curriculumId];
  const changedKey = [row.termId, row.programCode, row.major, row.yearLevel, row.curriculumId];
  if (JSON.stringify(currentKey) !== JSON.stringify(changedKey)) {
    if (activeCount(data, id)) return fail("Transfer assigned students first before changing a block's academic identity.");
    if (data.classMeetings.some((meeting) =>
      data.subjectClasses.some((item) => item.id === meeting.subjectClassId && item.sectionId === id))) {
      return fail("Remove existing draft meetings before changing the term, program, year, or curriculum.");
    }
    const curriculum = data.curricula.find((item) => item.id === row.curriculumId);
    const preserved = data.subjectClasses.filter((item) => item.sectionId !== id);
    const classes = curriculum.assignments.filter((assignment) =>
      assignment.yearLevel === row.yearLevel && assignment.semester === row.semester).map((assignment, index) => ({
        id: `${id}-CLS-${index + 1}`, sectionId: id, termId: row.termId,
        subjectCode: assignment.subjectCode, professorId: null,
        roomType: /\b(lab|laboratory|clinical|culinary|practicum)\b/i.test(
          data.subjects.find((subject) => subject.code === assignment.subjectCode)?.name || "") ? "LAB" : "LECTURE",
        status: "DRAFT",
      }));
    const updated = { ...current, ...row };
    return success({
      ...data, blockSections: data.blockSections.map((entry) => entry.id === id ? updated : entry),
      subjectClasses: [...preserved, ...classes],
      history: audit(data, "Block section updated", row.code, current.code, row.code),
    }, updated, "Draft block section updated with the selected curriculum subjects.");
  }
  const updated = { ...current, ...row };
  return success({
    ...data, blockSections: data.blockSections.map((entry) => entry.id === id ? updated : entry),
    history: audit(data, "Block section updated", row.code, `Capacity ${current.capacity}`, `Capacity ${row.capacity}`),
  }, updated, "Draft block section updated.");
}

function checkAssignableStudent(data, student, section) {
  if (!student || student.status !== "ACTIVE") return "An assigned student must have an active student record.";
  if (student.progression === "TEMPORARILY_RESTRICTED") {
    return "Resolve the student's temporary progression restriction through Academic Review before assigning a block.";
  }
  if (student.programCode !== section.programCode || !majorMatches(student.major, section.major)) {
    return "The student's program or specialization does not match the target block.";
  }
  if (student.yearLevel !== section.yearLevel) {
    return "The student's assigned academic year level does not match this block. Review progression before assignment.";
  }
  if (student.curriculumId && student.curriculumId !== section.curriculumId) {
    return "The student's assigned curriculum version does not match this block.";
  }
  return null;
}

export function assignBlockStudentsRecord(data, { sectionId, studentIds } = {}) {
  const section = getSection(data, sectionId);
  if (!section) return fail("Select a valid block section.");
  if (!Array.isArray(studentIds) || !studentIds.length || studentIds.some((id) => !clean(id))) {
    return fail("Select at least one student to assign.");
  }
  const requested = [...new Set(studentIds)];
  if (requested.length !== studentIds.length) return fail("The student selection contains duplicates.");
  for (const studentId of requested) {
    const student = data.students.find((item) => item.id === studentId);
    const error = checkAssignableStudent(data, student, section);
    if (error) return fail(error);
    if (data.assignments.some((item) => item.studentId === studentId && item.termId === section.termId &&
      ["PROPOSED", "CONFIRMED"].includes(item.status))) {
      return fail(`${student.fullName} already has a block assignment for this academic term. Use Transfer instead.`);
    }
  }
  if (activeCount(data, section.id) + requested.length > section.capacity) {
    return fail("There are not enough available seats in this block.");
  }
  const records = requested.map((studentId) => ({
    id: newId(data.assignments, `BASG-${studentId}`),
    studentId, sectionId, termId: section.termId, status: "PROPOSED",
    changes: [{ fromSectionId: null, toSectionId: sectionId,
      termId: section.termId, action: "ASSIGNED", at: new Date().toISOString() }],
    isSyntheticDemo: true,
  }));
  const next = {
    ...data, assignments: [...data.assignments, ...records],
    history: audit(data, "Proposed students assigned", section.code, "", `${records.length} proposed assignment(s)`,
      { sectionId, termId: section.termId, studentIds: requested }),
  };
  return success(next, records, `${records.length} student(s) provisionally assigned. Registrar confirmation remains separate.`);
}

export function transferBlockStudentRecord(data, { studentId, fromSectionId, toSectionId } = {}) {
  const source = getSection(data, fromSectionId);
  const target = getSection(data, toSectionId);
  if (!source || !target || source.id === target.id) return fail("Select two different valid block sections.");
  if (source.termId !== target.termId) return fail("Transfers must remain within the same academic term.");
  if (source.programCode !== target.programCode || !majorMatches(source.major, target.major) ||
    source.yearLevel !== target.yearLevel || source.curriculumId !== target.curriculumId) {
    return fail("Transfer requires the same program, specialization, year level, and assigned curriculum.");
  }
  const assignment = data.assignments.find((item) => item.studentId === studentId &&
    item.sectionId === fromSectionId && item.termId === source.termId);
  if (!assignment) return fail("This student does not have an assignment in the source block.");
  if (assignment.status === "CONFIRMED") return fail("Only the Registrar can correct a confirmed enrollment.");
  if (assignment.status !== "PROPOSED") return fail("Only active proposed block assignments can be transferred.");
  const student = data.students.find((item) => item.id === studentId);
  const issue = checkAssignableStudent(data, student, target);
  if (issue) return fail(issue);
  if (activeCount(data, target.id) >= target.capacity) return fail("The destination block is already full.");
  const updated = {
    ...assignment, sectionId: target.id,
    changes: [...(assignment.changes || []), {
      fromSectionId: source.id, toSectionId: target.id, termId: source.termId,
      action: "TRANSFERRED", at: new Date().toISOString(),
    }],
  };
  const next = {
    ...data, assignments: data.assignments.map((item) => item.id === assignment.id ? updated : item),
    history: audit(data, "Proposed student transferred", student.studentNumber, source.code, target.code,
      { studentId, fromSectionId: source.id, toSectionId: target.id, termId: source.termId }),
  };
  return success(next, updated, `${student.fullName} moved to ${target.code} as a proposed assignment.`);
}

function normalizeMeetingInput(values) {
  const dayText = clean(values.day);
  const day = DAYS.find((item) => item.toLowerCase() === dayText.slice(0, 3).toLowerCase());
  const start = clean(values.start);
  const end = clean(values.end);
  const startMinute = timeMinutes(start);
  const endMinute = timeMinutes(end);
  if (!day || startMinute === null || endMinute === null || startMinute >= endMinute) {
    return fail("Choose a valid day and class time with an end later than the start.");
  }
  return { ok: true, record: { day, start, end, startMinute, endMinute } };
}

export function validateBlockMeeting(data, values = {}) {
  const subjectClass = getClass(data, values.subjectClassId);
  const section = getSection(data, subjectClass?.sectionId);
  if (!subjectClass || !section) return fail("Select a valid curriculum subject class.");
  if (subjectClass.status === "PUBLISHED" || section.status === "PUBLISHED") {
    return fail("Published classes cannot be edited through draft scheduling.");
  }
  const normalizedTime = normalizeMeetingInput(values);
  if (!normalizedTime.ok) return normalizedTime;
  const { day, start, end, startMinute, endMinute } = normalizedTime.record;
  const professorId = clean(values.professorId ?? subjectClass.professorId);
  const professor = data.professors.find((item) => item.id === professorId);
  if (!professor || professor.status !== "ACTIVE") return fail("Select an available professor.");
  if (!professor.qualifiedSubjectCodes?.includes(subjectClass.subjectCode)) {
    return fail(`${professor.name} is not qualified for ${subjectClass.subjectCode}.`);
  }
  const roomId = clean(values.roomId);
  const room = data.rooms.find((item) => item.id === roomId);
  if (!room || room.status !== "AVAILABLE") return fail("Select an available classroom.");
  if (!room.types?.includes(subjectClass.roomType)) {
    return fail(`${room.name} does not support the required ${subjectClass.roomType.toLowerCase()} room type.`);
  }
  if (room.capacity < section.capacity) return fail(`${room.name} cannot accommodate the block's planned capacity.`);
  if (subjectClass.requiredEquipment?.some((item) => !room.equipment?.includes(item))) {
    return fail(`${room.name} lacks equipment required for this subject class.`);
  }
  const candidate = { day, start: startMinute, end: endMinute };
  for (const resource of [professor, room]) {
    if (resource.unavailable?.some((item) => {
      const check = normalizeMeetingInput(item);
      return check.ok && check.record.day === day && overlaps(candidate, {
        start: check.record.startMinute, end: check.record.endMinute,
      });
    })) return fail(`${resource.name} is unavailable during this period.`);
  }
  for (const meeting of data.classMeetings) {
    if (meeting.id === values.id) continue;
    const otherClass = getClass(data, meeting.subjectClassId);
    if (!otherClass || otherClass.termId !== section.termId || meeting.day !== day) continue;
    const otherRange = { start: timeMinutes(meeting.start), end: timeMinutes(meeting.end) };
    if (otherRange.start === null || otherRange.end === null || !overlaps(candidate, otherRange)) continue;
    if (meeting.roomId === roomId) return fail(`Room conflict with ${otherClass.subjectCode} in another class or college.`);
    if (otherClass.professorId === professorId) return fail(`Professor conflict with ${otherClass.subjectCode}.`);
    if (otherClass.sectionId === section.id) return fail(`Block timetable conflict with ${otherClass.subjectCode}.`);
  }
  // A professor change on one meeting reassigns the entire subject class.
  // Check the other retained meeting times too before that change is committed.
  const professorChanged = professorId !== subjectClass.professorId;
  const siblingMeetings = data.classMeetings.filter((item) =>
    item.subjectClassId === subjectClass.id && item.id !== values.id);
  if (professorChanged) {
    for (const sibling of siblingMeetings) {
      const siblingStart = timeMinutes(sibling.start);
      const siblingEnd = timeMinutes(sibling.end);
      if (siblingStart === null || siblingEnd === null) {
        return fail("A retained class meeting has an invalid time; correct it before changing professors.");
      }
      const siblingRange = { start: siblingStart, end: siblingEnd };
      const unavailable = professor.unavailable?.some((item) => {
        const checked = normalizeMeetingInput(item);
        return checked.ok && checked.record.day === sibling.day &&
          overlaps(siblingRange, { start: checked.record.startMinute, end: checked.record.endMinute });
      });
      if (unavailable) return fail(`${professor.name} is unavailable for another retained meeting in this class.`);
      const clash = data.classMeetings.find((other) => {
        if (other.subjectClassId === subjectClass.id || other.day !== sibling.day) return false;
        const otherClass = getClass(data, other.subjectClassId);
        if (otherClass?.termId !== section.termId || otherClass.professorId !== professorId) return false;
        return overlaps(siblingRange, { start: timeMinutes(other.start), end: timeMinutes(other.end) });
      });
      if (clash) return fail(`${professor.name} conflicts with another class during a retained meeting.`);
    }
  }
  const existingHours = data.classMeetings.reduce((sum, meeting) => {
    if (meeting.id === values.id) return sum;
    const assigned = getClass(data, meeting.subjectClassId);
    if (!assigned || assigned.termId !== section.termId ||
      (assigned.professorId !== professorId && !(professorChanged && assigned.id === subjectClass.id))) return sum;
    return sum + Math.max(0, (timeMinutes(meeting.end) ?? 0) - (timeMinutes(meeting.start) ?? 0)) / 60;
  }, 0);
  const nextHours = existingHours + (endMinute - startMinute) / 60;
  if (Number.isFinite(professor.maxWeeklyHours) && nextHours > professor.maxWeeklyHours) {
    return fail(`${professor.name} would exceed their configured ${professor.maxWeeklyHours} weekly teaching hours.`);
  }
  const assignedClasses = new Set(data.subjectClasses.filter((item) => item.termId === section.termId &&
    item.professorId === professorId && item.id !== subjectClass.id &&
    data.classMeetings.some((entry) => entry.subjectClassId === item.id)).map((item) => item.id));
  if (Number.isFinite(professor.maxClassesPerTerm) &&
    assignedClasses.size + 1 > professor.maxClassesPerTerm) {
    return fail(`${professor.name} would exceed their configured subject class limit.`);
  }
  return { ok: true, message: "Meeting resources and timetable are valid.", record: {
    id: values.id || newId(data.classMeetings, "BMTG-NEW"),
    subjectClassId: subjectClass.id, day, start, end, roomId,
    professorId,
  } };
}

export function saveBlockMeetingRecord(data, values = {}) {
  if (values.id && !data.classMeetings.some((item) => item.id === values.id &&
    item.subjectClassId === values.subjectClassId)) return fail("The meeting to edit could not be found.");
  const validation = validateBlockMeeting(data, values);
  if (!validation.ok) return validation;
  const { professorId, ...meeting } = validation.record;
  const exists = data.classMeetings.some((item) => item.id === meeting.id);
  const next = {
    ...data,
    subjectClasses: data.subjectClasses.map((item) => item.id === meeting.subjectClassId ?
      { ...item, professorId } : item),
    classMeetings: exists ? data.classMeetings.map((item) => item.id === meeting.id ? meeting : item) :
      [...data.classMeetings, meeting],
    history: audit(data, exists ? "Class meeting revised" : "Class meeting created",
      meeting.subjectClassId, "", `${meeting.day} ${meeting.start}-${meeting.end}`),
  };
  return success(next, meeting, "Draft class meeting saved after resource and schedule checks.");
}

export function removeBlockMeetingRecord(data, id) {
  const meeting = data.classMeetings.find((item) => item.id === id);
  const subjectClass = getClass(data, meeting?.subjectClassId);
  const section = getSection(data, subjectClass?.sectionId);
  if (!meeting || !subjectClass || !section) return fail("The selected class meeting does not exist.");
  if (section.status === "PUBLISHED" || subjectClass.status === "PUBLISHED") {
    return fail("Published meeting schedules cannot be deleted.");
  }
  return success({
    ...data, classMeetings: data.classMeetings.filter((item) => item.id !== id),
    history: audit(data, "Class meeting removed", subjectClass.subjectCode,
      `${meeting.day} ${meeting.start}-${meeting.end}`, ""),
  }, meeting, "Draft meeting removed.");
}

export function validateBlockScheduleForPublish(data, sectionId) {
  const section = getSection(data, sectionId);
  if (!section) return ["The selected block section does not exist."];
  const issues = [];
  const classes = data.subjectClasses.filter((item) => item.sectionId === sectionId);
  const curriculum = data.curricula.find((item) => item.id === section.curriculumId);
  if (!curriculum || curriculum.status !== "Active") issues.push("An active matching curriculum is required.");
  const expected = (curriculum?.assignments || []).filter((item) =>
    item.yearLevel === section.yearLevel && item.semester === section.semester);
  if (!expected.length) issues.push("This curriculum has no subjects for the selected term and year.");
  for (const assigned of expected) {
    if (classes.filter((item) => item.subjectCode === assigned.subjectCode).length !== 1) {
      issues.push(`Subject ${assigned.subjectCode} must appear exactly once in the block's class list.`);
    }
  }
  for (const subjectClass of classes) {
    const meetings = data.classMeetings.filter((item) => item.subjectClassId === subjectClass.id);
    if (!meetings.length) {
      issues.push(`${subjectClass.subjectCode} needs a professor, room and at least one class meeting.`);
      continue;
    }
    for (const meeting of meetings) {
      const checked = validateBlockMeeting({
        ...data,
        blockSections: data.blockSections.map((item) => item.id === sectionId ? { ...item, status: "DRAFT" } : item),
        subjectClasses: data.subjectClasses.map((item) => item.id === subjectClass.id ?
          { ...item, status: "DRAFT" } : item),
      }, { ...meeting, professorId: subjectClass.professorId });
      if (!checked.ok) issues.push(`${subjectClass.subjectCode}: ${checked.message}`);
    }
  }
  if (activeCount(data, sectionId) > section.capacity) issues.push("The number of students exceeds block capacity.");
  return [...new Set(issues)];
}

export function finalizeBlockScheduleRecord(data, sectionId) {
  const section = getSection(data, sectionId);
  if (!section) return fail("Select a valid block section.");
  if (section.status !== "DRAFT") return fail("Only draft schedules can be published.");
  const issues = validateBlockScheduleForPublish(data, sectionId);
  if (issues.length) return { ok: false, message: issues[0], issues };
  const record = { ...section, status: "PUBLISHED", publishedAt: new Date().toISOString() };
  return success({
    ...data,
    blockSections: data.blockSections.map((item) => item.id === sectionId ? record : item),
    subjectClasses: data.subjectClasses.map((item) => item.sectionId === sectionId ?
      { ...item, status: "PUBLISHED" } : item),
    history: audit(data, "Academic schedule published for Registrar review", section.code, "DRAFT", "PUBLISHED"),
  }, record, "Academic block schedule published as a proposal. Only the Registrar can confirm enrollment.");
}

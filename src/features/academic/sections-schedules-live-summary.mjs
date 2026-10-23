// Presentation-only summary from the authenticated Coordinator snapshot.
// The SQL enrollment and scheduling functions remain authoritative on writes.
export function summarizeBlockOccupancy(blocks = [], assignments = [], students = [], enrollments = []) {
  const byStudent = new Map(students.map((student) =>
    [student.id, student.studentNumber ? `number:${student.studentNumber}` : `id:${student.id}`]));
  const byBlock = new Map(blocks.map((block) => [block.id, {
    proposed: new Set(), confirmed: new Set(), capacity: Number(block.capacity) || 0,
  }]));
  const byTermAndCode = new Map(blocks.map((block) => [`${block.termId}:${block.code}`, block.id]));

  for (const assignment of assignments) {
    const tally = byBlock.get(assignment.sectionId);
    if (!tally || !["PROPOSED", "CONFIRMED"].includes(assignment.status)) continue;
    const identity = byStudent.get(assignment.studentId) || `id:${assignment.studentId}`;
    tally[assignment.status === "CONFIRMED" ? "confirmed" : "proposed"].add(identity);
  }

  // CONFIRMED enrollments are a distinct authoritative source. Match their
  // selected instructional section codes to the existing term's block code.
  // An enrollment with no registered section cannot be assigned to a block.
  for (const enrollment of enrollments) {
    if (enrollment.status !== "CONFIRMED" || !enrollment.studentNumber) continue;
    for (const code of new Set((enrollment.subjects || []).map((subject) => subject.section).filter(Boolean))) {
      const blockId = byTermAndCode.get(`${enrollment.term}:${code}`);
      if (blockId) byBlock.get(blockId).confirmed.add(`number:${enrollment.studentNumber}`);
    }
  }

  return new Map([...byBlock.entries()].map(([id, tally]) => {
    // A Registrar-confirmed student must never occupy a second proposed seat.
    const proposed = [...tally.proposed].filter((student) => !tally.confirmed.has(student)).length;
    const confirmed = tally.confirmed.size;
    const occupied = proposed + confirmed;
    return [id, { proposed, confirmed, occupied,
      available: Math.max(0, tally.capacity - occupied) }];
  }));
}

export function getMeetingConflict(values, meetings = [], classes = []) {
  const target = classes.find((item) => item.id === values.subjectClassId);
  if (!target) return "Choose a valid subject class.";
  if (!["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].includes(values.day) ||
    !/^\d{2}:\d{2}$/.test(values.start || "") ||
    !/^\d{2}:\d{2}$/.test(values.end || "") || values.start >= values.end) {
    return "Choose a valid meeting day with a start time before the end time.";
  }
  if (target.professorId && values.professorId !== target.professorId) {
    return "Changing the assigned primary professor requires an authorized correction.";
  }
  for (const meeting of meetings) {
    // Display IDs embed the real meeting UUID and the owning block UUID.
    // A shared instructional section can appear in more than one block.
    if (values.id && meeting.id?.split(":")[0] === values.id.split(":")[0]) continue;
    const existingClass = classes.find((item) => item.id === meeting.subjectClassId);
    if (!existingClass || existingClass.termId !== target.termId ||
      meeting.day !== values.day || meeting.start >= values.end || values.start >= meeting.end) continue;
    if (existingClass.sectionId === target.sectionId) {
      return "The selected block already has an overlapping class meeting.";
    }
    if (meeting.roomId && meeting.roomId === values.roomId) {
      return "The selected room is already booked for an overlapping class.";
    }
    if (existingClass.professorId && existingClass.professorId === values.professorId) {
      return "The selected professor already has an overlapping class.";
    }
  }
  return "";
}

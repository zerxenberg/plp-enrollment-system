const PASSING_RESULT_STATUSES = new Set(["COMPLETED", "CREDITED"]);

function toMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function findScheduleConflicts(selectedSections, sections) {
  const chosen = Object.values(selectedSections)
    .map((sectionId) => sections.find((section) => section.id === sectionId))
    .filter(Boolean);
  const conflicts = [];

  for (let left = 0; left < chosen.length; left += 1) {
    for (let right = left + 1; right < chosen.length; right += 1) {
      const first = chosen[left];
      const second = chosen[right];
      if (first.day !== second.day) continue;
      const overlaps =
        toMinutes(first.start) < toMinutes(second.end) &&
        toMinutes(second.start) < toMinutes(first.end);
      if (overlaps) conflicts.push([first, second]);
    }
  }

  return conflicts;
}

export function validateStudentEnrollment(student, catalog) {
  const selectedSubjects = student.enrollment.selectedSubjectCodes
    .map((code) => catalog.subjects.find((subject) => subject.code === code))
    .filter(Boolean);
  const completedCodes = new Set(
    student.academicResults
      .filter((result) => PASSING_RESULT_STATUSES.has(result.status))
      .map((result) => result.code),
  );
  const selectedSections = student.enrollment.selectedSections;
  const totalUnits = selectedSubjects.reduce((sum, subject) => sum + subject.units, 0);
  const prerequisitesPassed = selectedSubjects.every((subject) =>
    subject.prerequisites.every((code) => completedCodes.has(code)),
  );
  const allowedSubjects = selectedSubjects.every((subject) => ["ELIGIBLE", "RETAKE"].includes(subject.eligibility));
  const uniqueCodes = new Set(student.enrollment.selectedSubjectCodes);
  const sectionsAvailable = selectedSubjects.every((subject) => {
    const sectionId = selectedSections[subject.code];
    const section = catalog.sections.find((candidate) => candidate.id === sectionId);
    return section && section.status === "OPEN" && section.enrolled < section.capacity;
  });
  const conflicts = findScheduleConflicts(selectedSections, catalog.sections);
  const demoMaximumUnits = student.enrollment.demoMaximumUnits;

  return [
    { key: "program", label: "Program Match", result: student.profile.programCode === student.enrollment.programCode ? "PASSED" : "FAILED", detail: student.profile.program },
    { key: "curriculum", label: "Curriculum Match", result: student.profile.curriculum ? "PASSED" : "FAILED", detail: student.profile.curriculum },
    { key: "duplicate", label: "Duplicate Subject Check", result: uniqueCodes.size === student.enrollment.selectedSubjectCodes.length ? "PASSED" : "FAILED", detail: "Each subject may be selected once." },
    { key: "prerequisite", label: "Prerequisite Check", result: prerequisitesPassed ? "PASSED" : "FAILED", detail: prerequisitesPassed ? "All selected prerequisites are completed or credited." : "At least one selected subject has an unmet prerequisite." },
    { key: "subject-eligibility", label: "Subject Eligibility", result: allowedSubjects ? "PASSED" : "FAILED", detail: allowedSubjects ? "All selected subjects are eligible or valid retakes." : "Remove completed, incomplete, or otherwise restricted subjects before submitting." },
    { key: "units", label: "Unit Validation", result: totalUnits > 0 && totalUnits <= demoMaximumUnits ? "PASSED" : "FAILED", detail: `${totalUnits} selected units. This demo curriculum load allows up to ${demoMaximumUnits} units.` },
    { key: "offering", label: "Subject Offering", result: selectedSubjects.length === student.enrollment.selectedSubjectCodes.length ? "PASSED" : "FAILED", detail: "All selected subjects are offered in the demo catalog." },
    { key: "sections", label: "Section Slot Check", result: sectionsAvailable ? "PASSED" : "FAILED", detail: sectionsAvailable ? "Every selected subject has an open section with an available slot." : "Choose an open section with remaining capacity for every subject." },
    { key: "schedule", label: "Schedule Conflict Check", result: conflicts.length === 0 ? "PASSED" : "FAILED", detail: conflicts.length === 0 ? "No overlapping selected sections." : conflicts.map(([a, b]) => `${a.subjectCode} conflicts with ${b.subjectCode} on ${a.day}.`).join(" ") },
    { key: "period", label: "Enrollment Period Check", result: student.term.status === "Open" ? "PASSED" : "FAILED", detail: `${student.term.enrollmentStart} to ${student.term.enrollmentEnd}` },
  ];
}

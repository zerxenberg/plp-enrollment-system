// These illustrative people and enrollments are fictional demo records.
// Keep existing Registrar records intact and add diverse historical snapshots.
const YEARS = ["1st Year", "2nd Year", "3rd Year", "4th Year"];
const STATUS = ["CONFIRMED", "FOR_VALIDATION", "NEEDS_ACADEMIC_REVIEW", "SUBMITTED"];

export function withRepresentativeDemoStudents(registrar, curricula, subjectCatalog) {
  const students = [...registrar.students];
  const enrollments = [...registrar.enrollments];
  const subjectByCode = new Map(subjectCatalog.map((subject) => [subject.code, subject]));

  curricula.forEach((curriculum, index) => {
    for (let sample = 0; sample < 3; sample += 1) {
      const yearIndex = (index + sample) % 4;
      const yearLevel = YEARS[yearIndex];
      const semester = sample % 2 === 0 ? "First Semester" : "Second Semester";
      const academicYear = sample === 2 ? "2025 to 2026" : "2026 to 2027";
      const studentNumber = `DEMO-${String(index + 1).padStart(2, "0")}-${sample + 1}`;
      const name = `Demo Student ${index + 1}-${sample + 1}`;
      const section = `${curriculum.program} ${yearIndex + 1}${sample === 1 ? "B" : "A"}`;
      const academicTerm = `${semester} ${academicYear}`;
      const classification = sample === 2 ? "IRREGULAR" : "REGULAR";
      const status = STATUS[(index + sample) % STATUS.length];
      const academicAssignments = curriculum.assignments.filter((item) =>
        item.yearLevel === yearLevel && item.semester === semester);
      const subjects = academicAssignments.slice(0, 3).map((assignment, subjectIndex) => {
        const subject = subjectByCode.get(assignment.subjectCode);
        return {
          code: assignment.subjectCode,
          name: subject?.name || assignment.subjectCode,
          units: subject?.units || 3,
          section: subjectIndex === 1 ? `${curriculum.program} ${yearIndex + 1}C` : section,
          schedule: ["Mon 8:00 AM to 11:00 AM", "Tue 1:00 PM to 4:00 PM", "Wed 9:00 AM to 12:00 PM"][subjectIndex],
          room: "Demo Room",
        };
      });
      const units = subjects.reduce((sum, subject) => sum + subject.units, 0);
      students.push({
        studentNumber, admissionReference: `APP-${studentNumber}`, fullName: name,
        program: curriculum.program, major: curriculum.major || "",
        department: curriculum.department, academicTerm, academicYear, semester,
        yearLevel, section, academicClassification: classification,
        academicStanding: sample === 2 ? "Prerequisite deficiency demo" : "No recorded deficiency",
        studentStatus: "ACTIVE", enrollmentStatus: status, email: `${studentNumber.toLowerCase()}@example.invalid`,
        contactNumber: "Demo only", isSyntheticDemo: true,
      });
      enrollments.push({
        reference: `ENR-${studentNumber}-CURRENT`, studentNumber, studentName: name,
        program: curriculum.program, major: curriculum.major || "", department: curriculum.department,
        term: academicTerm, academicYear, semester, yearLevel, units, status,
        submittedDate: "Oct 1, 2026", curriculum: curriculum.version,
        validationPreset: sample === 2 ? "review" : "pass",
        academicClassification: classification, subjects, isSyntheticDemo: true,
      });

      // Historical year and sections belong to this earlier enrollment only.
      const priorYearIndex = Math.max(yearIndex - 1, 0);
      const priorYearLevel = YEARS[priorYearIndex];
      const priorAcademicYear = index % 2 === 0 ? "2024 to 2025" : "2025 to 2026";
      const priorSemester = semester === "First Semester" ? "Second Semester" : "First Semester";
      const earlierAssignments = curriculum.assignments.filter((item) =>
        item.yearLevel === priorYearLevel && item.semester === priorSemester);
      enrollments.push({
        reference: `ENR-${studentNumber}-PRIOR`, studentNumber, studentName: name,
        program: curriculum.program, major: curriculum.major || "", department: curriculum.department,
        term: `${priorSemester} ${priorAcademicYear}`, academicYear: priorAcademicYear,
        semester: priorSemester, yearLevel: priorYearLevel,
        units: earlierAssignments.slice(0, 2).reduce((sum, assignment) => sum + (subjectByCode.get(assignment.subjectCode)?.units || 3), 0),
        status: "CONFIRMED", submittedDate: "May 20, 2025", curriculum: curriculum.version,
        validationPreset: "pass", confirmationDate: "Jun 1, 2025",
        subjects: earlierAssignments.slice(0, 2).map((assignment) => ({
          code: assignment.subjectCode, name: subjectByCode.get(assignment.subjectCode)?.name || assignment.subjectCode,
          units: subjectByCode.get(assignment.subjectCode)?.units || 3,
          section: `${curriculum.program} ${priorYearIndex + 1}H`,
          schedule: "Mon 9:00 AM to 12:00 PM", room: "Historical Demo Room",
        })), isSyntheticDemo: true,
      });
    }
  });
  return { ...registrar, students, enrollments };
}

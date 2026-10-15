import { DEPARTMENTS, PROGRAMS } from "../academic/academic-reference.js";

// All identities and schedules in this fixture are fictional academic planning data.
// A PUBLISHED plan is available for Registrar review; it is not a confirmed enrollment.
export const BLOCK_PLANNING_TERMS = [
  { id: "2026-27-1", academicYear: "2026 to 2027", semester: "First Semester", label: "First Semester 2026 to 2027", status: "CURRENT" },
  { id: "2026-27-2", academicYear: "2026 to 2027", semester: "Second Semester", label: "Second Semester 2026 to 2027", status: "PLANNING" },
];

const TRACK_LABELS = {
  "BSBA|Marketing Management": "BSBAMM",
  "BSBA|Entrepreneurship": "BSBAENT",
  "BSBA|Human Resource Management": "BSBAHR",
  "BSED|English": "BSEDENG",
  "BSED|Filipino": "BSEDFIL",
  "BSED|Mathematics": "BSEDMATH",
  "BSED|Science": "BSEDSCI",
};

const FIRST_NAMES = ["Alex", "Sam", "Jordan", "Riley", "Jamie", "Morgan", "Taylor", "Robin", "Casey", "Drew", "Avery", "Sky", "Pat", "Kris", "Jules", "Max"];
const LAST_NAMES = ["Santos", "Reyes", "Dela Cruz", "Garcia", "Mendoza", "Ramos", "Flores", "Bautista", "Villanueva", "Castillo", "Torres", "Navarro", "Aquino", "Lim", "Cruz", "Salazar"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export function getTrackCode(programCode, major = "") {
  return TRACK_LABELS[`${programCode}|${major}`] || programCode;
}

export function buildBlockPlanningSeed(catalog, curricula) {
  const terms = BLOCK_PLANNING_TERMS.map((term) => ({ ...term }));
  const colleges = (catalog.departments || DEPARTMENTS).map((college) => ({ ...college }));
  const programs = (catalog.programs || PROGRAMS).map((program) => ({ ...program }));
  const subjects = (catalog.subjects || []).map((subject) => ({ ...subject }));
  const sourceCurricula = (curricula || []).filter((item) => item.status === "Active");
  const blockSections = [];
  const students = [];
  const assignments = [];
  const subjectClasses = [];
  const classMeetings = [];
  const professors = [];
  const rooms = [];
  const history = [];

  sourceCurricula.forEach((curriculum, trackIndex) => {
    const trackCode = getTrackCode(curriculum.program, curriculum.major);
    for (let year = 1; year <= 4; year += 1) {
      const yearLevel = `${year}${year === 1 ? "st" : year === 2 ? "nd" : year === 3 ? "rd" : "th"} Year`;
      // A few second blocks make real capacity and transfer demonstrations possible.
      const letters = (curriculum.program === "BSIT" && [1, 2, 3].includes(year)) ||
        (curriculum.program === "BSCS" && year === 2) ? ["A", "B"] : ["A"];
      letters.forEach((letter, letterIndex) => {
        const code = `${trackCode}-${year}${letter}`;
        const resourceId = `${trackCode}-${year}${letter}`;
        const professorId = `PROF-${resourceId}`;
        const generalEducationProfessorId = `PROF-GE-${resourceId}`;
        const roomId = `ROOM-${resourceId}`;
        const yearAssignments = curriculum.assignments.filter((entry) => entry.yearLevel === yearLevel);
        const eligibleSubjects = [...new Set(yearAssignments.map((entry) => entry.subjectCode))];
        const departmentSubjects = eligibleSubjects.filter((code) => !code.startsWith("GE"));
        const roomIndex = rooms.filter((room) => room.collegeId === curriculum.department).length + 1;
        const roomName = curriculum.department === "CCS" ? `Computer Lab ${roomIndex}` :
          curriculum.department === "CBA" ? `Business Room ${500 + roomIndex}` :
          curriculum.department === "CAS" ? `Arts and Science Room ${600 + roomIndex}` :
          curriculum.department === "COE_EDUCATION" ? `Room ${700 + roomIndex}` :
          curriculum.department === "COE_ENGINEERING" ? `Engineering Lab ${roomIndex}` :
          curriculum.department === "CON" ? `Nursing Skills Lab ${roomIndex}` :
          `Culinary Lab ${roomIndex}`;
        const needsLab = yearAssignments.some((entry) =>
          /\b(lab|laboratory|clinical|culinary|practicum)\b/i.test(
            subjects.find((subject) => subject.code === entry.subjectCode)?.name || ""));
        professors.push({
          id: professorId,
          name: `Prof. ${FIRST_NAMES[(trackIndex + year + letterIndex) % FIRST_NAMES.length]} ${LAST_NAMES[(trackIndex * 3 + year + letterIndex) % LAST_NAMES.length]}`,
          collegeId: curriculum.department,
          category: "DEPARTMENT",
          qualifiedSubjectCodes: departmentSubjects,
          maxClassesPerTerm: 5,
          maxWeeklyHours: 18,
          status: "ACTIVE",
          isSyntheticDemo: true,
        });
        professors.push({
          id: generalEducationProfessorId,
          name: `Prof. ${FIRST_NAMES[(trackIndex + year + 6) % FIRST_NAMES.length]} ${LAST_NAMES[(trackIndex + year + 9) % LAST_NAMES.length]}`,
          collegeId: "SHARED",
          category: "GENERAL_EDUCATION",
          qualifiedSubjectCodes: subjects.filter((subject) => subject.code.startsWith("GE"))
            .map((subject) => subject.code),
          maxClassesPerTerm: 10,
          maxWeeklyHours: 18,
          status: "ACTIVE",
          isSyntheticDemo: true,
        });
        rooms.push({
          id: roomId,
          name: roomName,
          collegeId: curriculum.department,
          building: `${curriculum.department} Demonstration Building`,
          floor: curriculum.department === "CCS" ? 6 : curriculum.department === "COE_ENGINEERING" ? 5 : 2,
          capacity: 42,
          types: needsLab ? ["LECTURE", "LAB"] : ["LECTURE"],
          equipment: needsLab ? ["Projector", "Laboratory Workstations"] : ["Projector"],
          accessible: true,
          status: "AVAILABLE",
          isSyntheticDemo: true,
        });
        // Capacity patterns are intentional so all occupancy cases are visible.
        const plannedOccupancy = [40, 37, 18, 30][(trackIndex + year + letterIndex) % 4];
        const currentId = `BSEC-2026-27-1-${resourceId}`;
        const firstTermSubjects = yearAssignments.filter((entry) => entry.semester === "First Semester");
        const futureSubjects = yearAssignments.filter((entry) => entry.semester === "Second Semester");
        for (let index = 0; index < plannedOccupancy; index += 1) {
          const studentId = `BST-${resourceId}-${String(index + 1).padStart(3, "0")}`;
          const isIrregular = index % 13 === 0;
          const failedCode = isIrregular ? firstTermSubjects[0]?.subjectCode : null;
          const restrictedFutureSubjects = failedCode ? futureSubjects.filter((entry) =>
            entry.prerequisites?.includes(failedCode)).map((entry) => entry.subjectCode) : [];
          const limitedProgression = isIrregular && index % 19 === 0;
          students.push({
            id: studentId,
            studentNumber: `DEMO-${resourceId}-${String(index + 1).padStart(3, "0")}`,
            fullName: `${FIRST_NAMES[(index + trackIndex) % FIRST_NAMES.length]} ${LAST_NAMES[(index * 3 + year + trackIndex) % LAST_NAMES.length]} ${index + 1}`,
            programCode: curriculum.program,
            programId: curriculum.programId,
            collegeId: curriculum.department,
            major: curriculum.major || "",
            yearLevel,
            curriculumId: curriculum.id,
            classification: isIrregular ? "IRREGULAR" : "REGULAR",
            progression: limitedProgression ? "LIMITED_PROGRESSION" :
              isIrregular ? "ELIGIBLE_WITH_DEFICIENCIES" : "ELIGIBLE_NORMAL",
            academicResults: failedCode ? [{ subjectCode: failedCode, status: "FAILED" }] : [],
            restrictedFutureSubjectCodes: restrictedFutureSubjects,
            futureTermCandidate: true,
            academicReviewStatus: restrictedFutureSubjects.length ? "PENDING" : null,
            status: "ACTIVE",
            isSyntheticDemo: true,
          });
          assignments.push({
            id: `BASG-${studentId}-2026-27-1`,
            studentId,
            sectionId: currentId,
            termId: "2026-27-1",
            status: "PROPOSED",
            isSyntheticDemo: true,
          });
        }
        terms.forEach((term) => {
          const sectionId = `BSEC-${term.id}-${resourceId}`;
          const isCurrent = term.id === "2026-27-1";
          blockSections.push({
            id: sectionId,
            code,
            trackCode,
            termId: term.id,
            academicYear: term.academicYear,
            semester: term.semester,
            collegeId: curriculum.department,
            programCode: curriculum.program,
            programId: curriculum.programId,
            major: curriculum.major || "",
            yearLevel,
            curriculumId: curriculum.id,
            capacity: 40,
            status: isCurrent ? "PUBLISHED" : "DRAFT",
            publishedAt: isCurrent ? "2026-10-01T08:00:00.000Z" : null,
            isSyntheticDemo: true,
          });
          const assignedSubjects = yearAssignments.filter((entry) => entry.semester === term.semester);
          assignedSubjects.forEach((entry, index) => {
            const subject = subjects.find((item) => item.code === entry.subjectCode);
            const isLab = /\b(lab|laboratory|clinical|culinary|practicum)\b/i.test(subject?.name || "");
            const classId = `BCLS-${term.id}-${resourceId}-${entry.subjectCode}`;
            subjectClasses.push({
              id: classId,
              sectionId,
              termId: term.id,
              subjectCode: entry.subjectCode,
              professorId: isCurrent ? (entry.subjectCode.startsWith("GE") ?
                generalEducationProfessorId : professorId) : null,
              roomType: isLab ? "LAB" : "LECTURE",
              status: isCurrent ? "PUBLISHED" : "DRAFT",
            });
            if (isCurrent) {
              classMeetings.push({
                id: `BMTG-${term.id}-${resourceId}-${entry.subjectCode}`,
                subjectClassId: classId,
                day: DAYS[index % DAYS.length],
                start: "08:00",
                end: "10:00",
                roomId,
              });
              // A representative class meets for a main lecture plus two shorter
              // practical sessions. Adjacent timetable boundaries remain legal.
              if (curriculum.program === "BSIT" && year === 2 && letter === "A" && index === 0) {
                for (const [day, suffix] of [["Wed", "P1"], ["Thu", "P2"]]) {
                  classMeetings.push({
                    id: `BMTG-${term.id}-${resourceId}-${entry.subjectCode}-${suffix}`,
                    subjectClassId: classId, day, start: "10:00", end: "11:00", roomId,
                  });
                }
              }
            }
          });
        });
      });
    }
  });

  // Additional selectable lecture rooms model representative shared facilities.
  // Room identifiers also include the building context, because a room number
  // alone is not globally unique across different demonstration buildings.
  for (const [department, numbers, floor] of [
    ["CCS", [601, 602, 603, 605], 6],
    ["COE_ENGINEERING", [501, 502, 503], 5],
  ]) {
    numbers.forEach((number) => rooms.push({
      id: `ROOM-${department}-${number}`,
      name: `Room ${number}`,
      collegeId: department,
      building: `${department} Demonstration Building`,
      floor,
      capacity: 45,
      types: ["LECTURE"],
      equipment: ["Projector"],
      accessible: true,
      status: "AVAILABLE",
      isSyntheticDemo: true,
    }));
  }

  return {
    terms, colleges, programs, curricula: sourceCurricula.map((item) => ({ ...item })),
    subjects, blockSections, students, assignments, subjectClasses,
    classMeetings, professors, rooms, history,
  };
}

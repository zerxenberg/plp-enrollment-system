"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import studentSource from "@/data/mock/student.json";
import catalogSource from "@/data/mock/catalog.json";
import registrarSource from "@/data/mock/registrar.json";
import notificationSource from "@/data/mock/notifications.json";
import systemAdministratorSource from "@/data/mock/system-administrators.json";
import academicCoordinatorSource from "@/data/mock/academic-coordinators.json";
import { validateStudentEnrollment } from "@/lib/validation/enrollment-validation";
import { getDemoSession } from "@/lib/auth/demo-auth";
import { useLiveAcademicCoordinator } from "@/features/academic/LiveAcademicCoordinatorProvider";
import { withRepresentativeDemoStudents } from "@/features/students/mock-student-fixtures";
import {
  buildMockAcademicReferences, DEFAULT_DEMO_FEE_PER_UNIT,
  summarizeCurriculum, validateCurriculumRecord, validateCurriculumActivation,
  validatePrerequisiteGraph, getAcademicSubjectOptions as filterAcademicSubjectOptions,
  getPrerequisiteCandidates,
} from "@/features/academic/academic-reference";
import { transitionCurriculumVersion } from "@/features/academic/curriculum-lifecycle";
import {
  academicReviewOutcome, demoValidationOutcome,
} from "@/features/academic/academic-review-workflow";
import { buildBlockPlanningSeed } from "@/features/block-planning/block-planning-seed";
import {
  createBlockSectionRecord, updateBlockSectionRecord, assignBlockStudentsRecord,
  transferBlockStudentRecord, saveBlockMeetingRecord, removeBlockMeetingRecord,
  finalizeBlockScheduleRecord,
} from "@/features/block-planning/block-planning-service";
import {
  GRADE_IMPORT_EMPTY, GRADE_IMPORT_STORAGE_KEY, readGradeStore, saveGradeStore,
  createGradeBatch, validateGradeBatch, replaceGradeBatch, verifyGradeBatch,
  publishGradeBatch, cancelGradeBatch, amendGradeResult, getStudentAcademicRecords,
} from "@/features/grade-import/grade-import-service";

const DemoDataContext = createContext(null);
const clone = (value) => JSON.parse(JSON.stringify(value));
const STUDENT_EDITABLE_STATUSES = new Set(["ELIGIBLE", "IN_PROGRESS", "REQUIRES_CORRECTION"]);
const STUDENT_SUBMITTABLE_STATUSES = new Set(["IN_PROGRESS"]);
const ACADEMIC_STORAGE_KEY = "plp-demo-academic-setup-v1";
const BLOCK_PLANNING_STORAGE_KEY = "plp-demo-block-planning-v1";
const ACADEMIC_FIXTURE_VERSION = 2;
const ACADEMIC_YEARS = ["1st Year", "2nd Year", "3rd Year", "4th Year"];
const ACADEMIC_SEMESTERS = ["First Semester", "Second Semester"];
function withCurriculumMetrics(record, subjects) {
  const assignments = record.assignments || [];
  const summary = summarizeCurriculum(assignments, subjects).total;
  return {
    ...record, assignedSubjects: assignments.length, totalUnits: summary.units,
    totalFee: summary.tuition,
    totalFeeDisplay: new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(summary.tuition),
    semesters: ACADEMIC_YEARS.flatMap((yearLevel) => ACADEMIC_SEMESTERS.map((semester) => ({
      yearLevel, semester, subjects: assignments.filter((item) =>
        item.yearLevel === yearLevel && item.semester === semester),
    }))),
  };
}
const ACADEMIC_FIXTURES = buildMockAcademicReferences(catalogSource.subjects, catalogSource.programs);
const INITIAL_ACADEMIC_CATALOG = {
  ...catalogSource,
  departments: ACADEMIC_FIXTURES.departments,
  programs: ACADEMIC_FIXTURES.programs,
  subjects: ACADEMIC_FIXTURES.subjects,
};

const ACADEMIC_COORDINATOR_INITIAL_DATA = {
  curricula: ACADEMIC_FIXTURES.curricula.map((entry) => entry.program === "BSIT" ? {
    ...entry, id: "CUR-BSIT-2024", version: "BSIT Curriculum 2024", effectiveAcademicYear: "2024 to 2025",
  } : entry),
  legacyCurricula: [
    {
      id: "CUR-BSBA-2024",
      version: "BSBA Curriculum 2024",
      program: "BSBA",
      effectiveAcademicYear: "2024 to 2025",
      status: "Active",
      assignedSubjects: 0,
    },
  ],
  prerequisiteRules: [],
  offerings: catalogSource.subjects.map((subject, index) => ({
    id: `OFF-${subject.code}`,
    academicTerm: "First Semester 2026 to 2027",
    program: "BSIT",
    curriculum: "BSIT Curriculum 2024",
    subjectCode: subject.code,
    subjectName: subject.name,
    yearLevel: subject.yearLevel,
    semester: subject.semester,
    status: index < 6 ? "Active" : "Planned",
    plannedSections: index < 4 ? 2 : 1,
  })),
  history: [
    {
      id: "ACH-001",
      dateTime: "Oct 7, 2026 · 4:40 PM",
      coordinator: "Elena Cruz",
      module: "Sections & Schedules",
      record: "BSIT-3A",
      action: "Section capacity reviewed",
      previousValue: "31 confirmed",
      newValue: "31 confirmed",
    },
    {
      id: "ACH-002",
      dateTime: "Oct 6, 2026 · 2:15 PM",
      coordinator: "Elena Cruz",
      module: "Academic Setup",
      record: "IT305",
      action: "Prerequisite reviewed",
      previousValue: "IT204",
      newValue: "IT204",
    },
  ],
};

// Only pristine first-generation sample checklists are upgraded automatically.
// User-edited versions and all student/grade-import records remain untouched.
function isOriginalSampleCurriculum(record, revised) {
  if (!record || !revised || record.id !== revised.id || record.version !== revised.version ||
      record.program !== revised.program || (record.major || "") !== (revised.major || "") ||
      record.status !== "Active" || record.effectiveAcademicYear !== revised.effectiveAcademicYear ||
      !Array.isArray(record.assignments) || record.assignments.length !== 24) return false;
  const match = /^CUR-DEMO-(.+)-2026$/.exec(record.id);
  const prefix = match?.[1] || (record.id === "CUR-BSIT-2024" ? "IT" : null);
  if (!prefix) return false;
  const original = [];
  for (let index = 0; index < 16; index++) {
    original.push({
      subjectCode: `${prefix}${String(index + 1).padStart(3, "0")}`,
      yearLevel: ACADEMIC_YEARS[Math.floor(index / 4)],
      semester: ACADEMIC_SEMESTERS[Math.floor(index / 2) % 2],
      prerequisites: index >= 2 ? [`${prefix}${String(index - 1).padStart(3, "0")}`] : [],
      feePerUnit: DEFAULT_DEMO_FEE_PER_UNIT,
    });
  }
  for (let index = 0; index < 8; index++) {
    original.push({
      subjectCode: `GE${String(index + 101)}`,
      yearLevel: ACADEMIC_YEARS[Math.floor(index / 2)],
      semester: ACADEMIC_SEMESTERS[index % 2],
      prerequisites: [], feePerUnit: DEFAULT_DEMO_FEE_PER_UNIT,
    });
  }
  const canonical = (assignments) => assignments.map((item) => ({
    subjectCode: item.subjectCode, yearLevel: item.yearLevel, semester: item.semester,
    prerequisites: item.prerequisites || [], feePerUnit: item.feePerUnit ?? DEFAULT_DEMO_FEE_PER_UNIT,
  })).sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));
  return JSON.stringify(canonical(record.assignments)) === JSON.stringify(canonical(original));
}

function upgradeOriginalAcademicSamples(saved) {
  if (saved.fixtureVersion >= ACADEMIC_FIXTURE_VERSION) return saved;
  const fixtures = new Map(ACADEMIC_COORDINATOR_INITIAL_DATA.curricula.map((item) => [item.id, item]));
  let changed = false;
  const curricula = saved.academicCoordinatorData.curricula.map((item) => {
    const revised = fixtures.get(item.id);
    if (!isOriginalSampleCurriculum(item, revised)) return item;
    changed = true;
    return clone(revised);
  });
  if (!changed) return { ...saved, fixtureVersion: ACADEMIC_FIXTURE_VERSION };
  const existingCodes = new Set(saved.catalog.subjects.map((subject) => subject.code));
  const addedSubjects = INITIAL_ACADEMIC_CATALOG.subjects.filter((item) => !existingCodes.has(item.code));
  return {
    ...saved, fixtureVersion: ACADEMIC_FIXTURE_VERSION,
    catalog: { ...saved.catalog, subjects: [...saved.catalog.subjects, ...clone(addedSubjects)] },
    academicCoordinatorData: { ...saved.academicCoordinatorData, curricula },
  };
}

function validateSubjectContext(catalog, subject) {
  const programs = Array.isArray(subject.programs) ? subject.programs : [];
  if (!programs.length || programs.some((code) => !catalog.programs.some((entry) =>
    entry.code === code && (subject.department === "SHARED" || entry.department === subject.department)))) {
    return "Select academic programs belonging to the chosen department.";
  }
  if (subject.department === "SHARED" &&
    (programs.length !== catalog.programs.length || catalog.programs.some((entry) => !programs.includes(entry.code)))) {
    return "Shared General Education subjects must be applicable to all programs.";
  }
  if (subject.major && (programs.length !== 1 || !catalog.programs.find((entry) =>
    entry.code === programs[0])?.majors?.includes(subject.major))) {
    return "The selected specialization is incompatible with this subject.";
  }
  const prerequisites = subject.prerequisites || [];
  const graphError = validatePrerequisiteGraph(catalog.subjects, subject.code, prerequisites);
  if (graphError) return graphError;
  const options = getPrerequisiteCandidates(catalog, subject);
  for (const code of prerequisites) {
    if (!options.some((candidate) => candidate.code === code)) {
      return `Prerequisite ${code} must be a compatible subject in an earlier academic semester.`;
    }
  }
  return null;
}

function timeToMinutes(value) {
  if (!value || !String(value).includes(":")) return null;
  const [hours, minutes] = String(value).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function wouldCreatePrerequisiteCycle(subjects, targetCode, prerequisiteCode) {
  const byCode = new Map(subjects.map((subject) => [subject.code, subject]));
  const visited = new Set();

  function canReach(code, target) {
    if (code === target) return true;
    if (visited.has(code)) return false;
    visited.add(code);

    const subject = byCode.get(code);
    if (!subject) return false;

    return (subject.prerequisites || []).some((next) => canReach(next, target));
  }

  return canReach(prerequisiteCode, targetCode);
}

function demoTimestamp() {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
}

function buildRegistrarEnrollment(student, catalog, submittedDate) {
  const subjects = student.enrollment.selectedSubjectCodes.map((code) => {
    const subject = catalog.subjects.find((item) => item.code === code);
    const sectionId = student.enrollment.selectedSections[code];
    const section = catalog.sections.find((item) => item.id === sectionId);
    return {
      code,
      name: subject?.name || code,
      units: subject?.units || 0,
      section: section?.section || "Not selected",
      schedule: section ? `${section.day} ${section.displayTime}` : "No section selected",
      day: section?.day || "Not assigned",
      start: section?.displayTime?.split(" to ")[0] || "Not assigned",
      end: section?.displayTime?.split(" to ")[1] || "Not assigned",
      room: section?.room || "Not assigned",
      instructor: section?.instructor || "To be announced",
    };
  });

  return {
    reference: student.enrollment.reference,
    studentNumber: student.profile.studentNumber,
    studentName: student.profile.fullName,
    program: student.profile.programCode,
    term: student.term.shortLabel,
    units: subjects.reduce((sum, subject) => sum + subject.units, 0),
    status: "SUBMITTED",
    submittedDate,
    curriculum: student.profile.curriculum,
    validationPreset: "pass",
    correctionReason: null,
    subjects,
  };
}

export function DemoDataProvider({ children }) {
  const [student, setStudent] = useState(() => clone(studentSource));
  const [registrar, setRegistrar] = useState(() =>
    withRepresentativeDemoStudents(clone(registrarSource), ACADEMIC_COORDINATOR_INITIAL_DATA.curricula, INITIAL_ACADEMIC_CATALOG.subjects));
  const [notifications, setNotifications] = useState(() => clone(notificationSource));
  const [systemAdministrators] = useState(() => clone(systemAdministratorSource));
  const [academicCoordinators] = useState(() => clone(academicCoordinatorSource));
  const [catalog, setCatalog] = useState(() => clone(INITIAL_ACADEMIC_CATALOG));
  const [academicCoordinatorData, setAcademicCoordinatorData] = useState(() => clone(ACADEMIC_COORDINATOR_INITIAL_DATA));
  const reviewDecisionLocksRef = useRef(new Set());
  const [blockPlanning, setBlockPlanning] = useState(() =>
    buildBlockPlanningSeed(INITIAL_ACADEMIC_CATALOG, ACADEMIC_COORDINATOR_INITIAL_DATA.curricula));
  const blockPlanningRef = useRef(blockPlanning);
  const [blockPlanningLoaded, setBlockPlanningLoaded] = useState(false);
  const curriculumDataRef = useRef(academicCoordinatorData);
  const curriculumEventCounterRef = useRef(0);
  const [academicLoaded, setAcademicLoaded] = useState(false);
  const [gradeImports, setGradeImports] = useState(() => clone(GRADE_IMPORT_EMPTY));
  const gradeStoreRef = useRef(gradeImports);
  const [sessionRevision, setSessionRevision] = useState(0);
  const hasRole = (role) => getDemoSession()?.role === role;

  useEffect(() => { curriculumDataRef.current = academicCoordinatorData; }, [academicCoordinatorData]);
  useEffect(() => { reviewDecisionLocksRef.current.clear(); }, [registrar.enrollments]);

  useEffect(() => {
    const load = (raw) => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw);
        const required = ["terms", "colleges", "programs", "curricula", "subjects",
          "blockSections", "students", "assignments", "subjectClasses",
          "classMeetings", "professors", "rooms", "history"];
        if (saved?.version !== 1 || !saved.data ||
          required.some((key) => !Array.isArray(saved.data[key]))) return;
        // Validate basic referential integrity before accepting an old browser snapshot.
        const data = saved.data;
        const ids = (rows) => new Set(rows.map((item) => item.id));
        const sectionIds = ids(data.blockSections);
        const studentIds = ids(data.students);
        const classIds = ids(data.subjectClasses);
        if (data.blockSections.some((item) => !item.id || !data.terms.some((term) => term.id === item.termId)) ||
          data.assignments.some((item) => !sectionIds.has(item.sectionId) || !studentIds.has(item.studentId)) ||
          data.subjectClasses.some((item) => !sectionIds.has(item.sectionId)) ||
          data.classMeetings.some((item) => !classIds.has(item.subjectClassId))) return;
        blockPlanningRef.current = data;
        setBlockPlanning(data);
      } catch {
        // A malformed demo snapshot cannot prevent the page from loading.
      }
    };
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try { load(window.localStorage.getItem(BLOCK_PLANNING_STORAGE_KEY)); } catch { /* use fixture */ }
      setBlockPlanningLoaded(true);
    });
    const onStorage = (event) => {
      if (event.key === BLOCK_PLANNING_STORAGE_KEY) load(event.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (!blockPlanningLoaded) return;
    try {
      const value = JSON.stringify({ version: 1, data: blockPlanning });
      if (window.localStorage.getItem(BLOCK_PLANNING_STORAGE_KEY) !== value) {
        window.localStorage.setItem(BLOCK_PLANNING_STORAGE_KEY, value);
      }
    } catch {
      // Changes remain available within this browser session.
    }
  }, [blockPlanning, blockPlanningLoaded]);

  useEffect(() => {
    const load = (raw) => {
      if (!raw) {
        setCatalog(clone(INITIAL_ACADEMIC_CATALOG));
        setAcademicCoordinatorData(clone(ACADEMIC_COORDINATOR_INITIAL_DATA));
        return;
      }
      try {
        const saved = JSON.parse(raw);
        if (saved?.version !== 1 || !Array.isArray(saved.catalog?.programs) ||
          !Array.isArray(saved.catalog?.subjects) || !Array.isArray(saved.academicCoordinatorData?.curricula)) return;
        const restored = upgradeOriginalAcademicSamples(saved);
        setCatalog(restored.catalog);
        setAcademicCoordinatorData(restored.academicCoordinatorData);
      } catch {
        // Invalid or unavailable browser mock storage does not block the demo.
      }
    };
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try { load(window.localStorage.getItem(ACADEMIC_STORAGE_KEY)); } catch { /* use built-in fixtures */ }
      setAcademicLoaded(true);
    });
    const onStorage = (event) => {
      if (event.key === ACADEMIC_STORAGE_KEY) load(event.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (!academicLoaded) return;
    try {
      const next = JSON.stringify({ version: 1, fixtureVersion: ACADEMIC_FIXTURE_VERSION, catalog, academicCoordinatorData });
      if (window.localStorage.getItem(ACADEMIC_STORAGE_KEY) !== next)
        window.localStorage.setItem(ACADEMIC_STORAGE_KEY, next);
    } catch {
      // Demo edits remain usable in memory when browser storage is unavailable.
    }
  }, [academicLoaded, catalog, academicCoordinatorData]);

  useEffect(() => {
    const onGradeChange = () => {
      gradeStoreRef.current = readGradeStore();
      setGradeImports(gradeStoreRef.current);
    };
    const onStorage = (event) => {
      if (event.key === GRADE_IMPORT_STORAGE_KEY) onGradeChange();
      if (event.key === "plp-demo-session") setSessionRevision((current) => current + 1);
    };
    const onSessionChange = () => setSessionRevision((current) => current + 1);
    queueMicrotask(onGradeChange);
    window.addEventListener("storage", onStorage);
    window.addEventListener("plp-grade-imports-changed", onGradeChange);
    window.addEventListener("plp-demo-session-changed", onSessionChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("plp-grade-imports-changed", onGradeChange);
      window.removeEventListener("plp-demo-session-changed", onSessionChange);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return undefined;
    // Isolated developer utility, intentionally absent from Registrar GUI.
    // At the browser console call: window.plpGradeDemoReset()
    window.plpGradeDemoReset = () => {
      const next = clone(GRADE_IMPORT_EMPTY);
      try {
        saveGradeStore(next);
        return "Only generated grade import batches, published demo results and their notifications were reset.";
      } catch {
        return "Could not reset demo grade data; check browser storage availability.";
      }
    };
    return () => { delete window.plpGradeDemoReset; };
  }, []);

  // Every grade action operates on a complete snapshot; one localStorage write
  // commits batches, publications and notifications together for the demo.
  function commitGradeAction(operation) {
    if (!hasRole("registrar")) return { ok: false, message: "Only the demo Registrar can perform grade import actions." };
    const latest = readGradeStore();
    gradeStoreRef.current = latest;
    const result = operation(latest);
    if (result.next) {
      gradeStoreRef.current = result.next;
      setGradeImports(result.next);
      try {
        saveGradeStore(result.next);
      } catch {
        gradeStoreRef.current = latest;
        setGradeImports(latest);
        return { ok: false, message: "Demo browser storage is unavailable or full; no publication was saved." };
      }
    }
    return result;
  }

  function createMockGradeImport(payload) {
    return commitGradeAction((current) => createGradeBatch(current, payload));
  }
  function validateMockGradeImport(batchId) {
    return commitGradeAction((current) => validateGradeBatch(current, batchId, registrar.students));
  }
  function replaceMockGradeFile(batchId, payload) {
    return commitGradeAction((current) => replaceGradeBatch(current, batchId, payload));
  }
  function verifyMockGradeSource(batchId, payload) {
    return commitGradeAction((current) => verifyGradeBatch(current, batchId, payload));
  }
  function publishMockGrades(batchId) {
    return commitGradeAction((current) => publishGradeBatch(current, batchId, registrar.students));
  }
  function cancelMockGradeImport(batchId, reason) {
    return commitGradeAction((current) => cancelGradeBatch(current, batchId, reason));
  }
  function amendMockPublishedResult(payload) {
    return commitGradeAction((current) => amendGradeResult(current, payload));
  }
  function resetMockGradeImports() {
    if (process.env.NODE_ENV === "production") return { ok: false, message: "Reset is only available in development." };
    return commitGradeAction(() => ({ ok: true, message: "Only demo grade imports and their generated academic records were reset.", next: clone(GRADE_IMPORT_EMPTY) }));
  }

  // Demo identity comes from the selected mock login. No server-side
  // authorization or access isolation is claimed by these client-side views.
  const session = sessionRevision >= 0 ? getDemoSession() : null;
  const activeStudentNumber = session?.role === "student" ? session.identifier : student.profile.studentNumber;
  const primaryStudent = activeStudentNumber === student.profile.studentNumber;
  const matchedRecord = registrar.students.find((record) => record.studentNumber === activeStudentNumber);
  const previousResults = primaryStudent ? student.academicResults : [
    { code: "IT201", name: "Computer Programming 2", units: 3, term: "1st Sem 2025", status: "COMPLETED" },
  ];
  const importedResults = getStudentAcademicRecords(gradeImports, activeStudentNumber);
  const importedCodes = new Set(importedResults.map((result) => result.code));
  const visibleResults = [
    ...previousResults.filter((result) => !importedCodes.has(result.code)),
    ...importedResults.map((result) => ({ ...result, units: catalog.subjects.find((item) => item.code === result.code)?.units || 3 })),
  ];
  const hasDeficiencies = visibleResults.some((result) => ["FAILED", "INCOMPLETE"].includes(result.status));
  const studentView = {
    ...student,
    profile: {
      ...student.profile,
      ...(primaryStudent ? {} : {
        studentNumber: activeStudentNumber, fullName: matchedRecord?.fullName || session?.name || "Demo Student",
        email: matchedRecord?.email || "", programCode: matchedRecord?.program || "BSIT",
        major: matchedRecord?.major || "",
        curriculum: matchedRecord?.curriculum ||
          registrar.enrollments.find((entry) => entry.studentNumber === activeStudentNumber)?.curriculum ||
          student.profile.curriculum,
        studentType: "Continuing Student", studentStatus: "ACTIVE",
      }),
      academicClassification: hasDeficiencies ? "IRREGULAR" : "REGULAR",
      progressionStatus: hasDeficiencies ? "ELIGIBLE_WITH_DEFICIENCIES" : "ELIGIBLE_NORMAL",
    },
    academicResults: visibleResults,
    enrollment: primaryStudent ? student.enrollment : {
      ...student.enrollment, reference: `ENR-DEMO-${activeStudentNumber}`, selectedSubjectCodes: [],
      selectedSections: {}, status: "ELIGIBLE", eligibilityStatus: "ELIGIBLE",
    },
  };
  const completedCodes = new Set(visibleResults.filter((result) => ["COMPLETED", "CREDITED"].includes(result.status)).map((result) => result.code));
  const latestByCode = new Map(visibleResults.map((result) => [result.code, result]));
  const studentCurriculum = academicCoordinatorData.curricula.find((item) =>
    item.version === studentView.profile.curriculum && item.program === studentView.profile.programCode &&
    (item.major || "") === (studentView.profile.major || ""));
  const curriculumCodes = studentCurriculum?.assignments?.length
    ? new Set(studentCurriculum.assignments.map((item) => item.subjectCode)) : null;
  const catalogView = {
    ...catalog,
    // The expanded catalog is shared by Academic Setup; the Student demo still
    // displays only subjects from its original enabled enrollment offering.
    subjects: catalog.subjects.filter((subject) => curriculumCodes
      ? curriculumCodes.has(subject.code)
      : subject.availableInStudentDemo &&
        (subject.programs || [subject.program || "BSIT"]).includes(studentView.profile.programCode)
    ).map((subject) => {
      const result = latestByCode.get(subject.code);
      const unmet = (subject.prerequisites || []).filter((code) => !completedCodes.has(code));
      if (unmet.length) return { ...subject, eligibility: "RESTRICTED", restrictionReason: `Complete prerequisite(s) ${unmet.join(", ")} first.` };
      if (result?.status === "COMPLETED" || result?.status === "CREDITED")
        return { ...subject, eligibility: "RESTRICTED", restrictionReason: "Already completed or credited; ordinary repeat registration is unavailable." };
      if (result?.status === "INCOMPLETE")
        return { ...subject, eligibility: "RESTRICTED", restrictionReason: "Incomplete result requires academic resolution before enrollment." };
      if (result?.status === "FAILED") return { ...subject, eligibility: "RETAKE", restrictionReason: "" };
      return { ...subject, eligibility: "ELIGIBLE", restrictionReason: "" };
    }),
  };
  const visibleNotifications = {
    ...notifications,
    student: [
      ...gradeImports.notifications.filter((entry) => entry.studentNumber === activeStudentNumber),
      ...(primaryStudent ? notifications.student : []),
    ],
  };

  function addStudentSubject(code) {
    if (!hasRole("student") || !primaryStudent) return false;
    const subject = catalogView.subjects.find((item) => item.code === code);
    if (!subject || !["ELIGIBLE", "RETAKE"].includes(subject.eligibility) || !STUDENT_EDITABLE_STATUSES.has(student.enrollment.status)) return false;
    setStudent((current) => {
      if (!STUDENT_EDITABLE_STATUSES.has(current.enrollment.status)) return current;
      if (current.enrollment.selectedSubjectCodes.includes(code)) return current;
      return {
        ...current,
        enrollment: {
          ...current.enrollment,
          status: "IN_PROGRESS",
          selectedSubjectCodes: [...current.enrollment.selectedSubjectCodes, code],
        },
      };
    });
    return true;
  }

  function removeStudentSubject(code) {
    if (!hasRole("student") || !primaryStudent) return false;
    if (!STUDENT_EDITABLE_STATUSES.has(student.enrollment.status)) return false;
    setStudent((current) => {
      if (!STUDENT_EDITABLE_STATUSES.has(current.enrollment.status)) return current;
      const nextSections = { ...current.enrollment.selectedSections };
      delete nextSections[code];
      return {
        ...current,
        enrollment: {
          ...current.enrollment,
          status: "IN_PROGRESS",
          selectedSubjectCodes: current.enrollment.selectedSubjectCodes.filter((item) => item !== code),
          selectedSections: nextSections,
        },
      };
    });
    return true;
  }

  function selectStudentSection(subjectCode, sectionId) {
    if (!hasRole("student") || !primaryStudent || !["ELIGIBLE", "RETAKE"].includes(catalogView.subjects.find((item) => item.code === subjectCode)?.eligibility)) return false;
    if (!STUDENT_EDITABLE_STATUSES.has(student.enrollment.status)) return false;
    setStudent((current) => {
      if (!STUDENT_EDITABLE_STATUSES.has(current.enrollment.status)) return current;
      return {
        ...current,
        enrollment: {
          ...current.enrollment,
          status: "IN_PROGRESS",
          selectedSections: { ...current.enrollment.selectedSections, [subjectCode]: sectionId },
        },
      };
    });
    return true;
  }

  function submitStudentEnrollment() {
    if (!hasRole("student") || !primaryStudent) return { ok: false, checks: [], reason: "role" };
    if (!STUDENT_SUBMITTABLE_STATUSES.has(student.enrollment.status)) {
      return { ok: false, checks: [], reason: "status" };
    }
    const checks = validateStudentEnrollment(studentView, catalogView);
    if (checks.some((check) => check.result !== "PASSED")) return { ok: false, checks };
    const submittedDate = demoTimestamp();
    const registrarEnrollment = buildRegistrarEnrollment(student, catalog, submittedDate);
    setStudent((current) => ({
      ...current,
      enrollment: { ...current.enrollment, status: "SUBMITTED", submittedDate, correctionReason: null },
    }));
    setRegistrar((current) => {
      const exists = current.enrollments.some((item) => item.reference === registrarEnrollment.reference);
      const enrollments = exists
        ? current.enrollments.map((item) => item.reference === registrarEnrollment.reference ? { ...item, ...registrarEnrollment } : item)
        : [registrarEnrollment, ...current.enrollments];
      return {
        ...current,
        enrollments,
        students: current.students.map((item) => item.studentNumber === registrarEnrollment.studentNumber ? { ...item, enrollmentStatus: "SUBMITTED" } : item),
        activity: [
          {
            id: `ACT-${Date.now()}`,
            date: submittedDate,
            registrar: "Student Portal",
            student: registrarEnrollment.studentName,
            reference: registrarEnrollment.reference,
            action: exists ? "Enrollment resubmitted" : "Enrollment submitted",
            previousStatus: student.enrollment.status,
            newStatus: "SUBMITTED",
            reason: "Student submitted the current enrollment transaction for official processing.",
          },
          ...current.activity,
        ],
      };
    });
    setNotifications((current) => ({
      ...current,
      student: [
        {
          id: `SN-${Date.now()}`,
          title: "Enrollment Submitted",
          message: "Your enrollment passed the current frontend checks and was submitted for official processing.",
          date: submittedDate,
          category: "Enrollment",
          read: false,
          relatedHref: "/student/enrollment",
        },
        ...current.student,
      ],
    }));
    return { ok: true, checks };
  }

  function updateStudentContact(values) {
    if (!hasRole("student") || !primaryStudent) return false;
    setStudent((current) => ({ ...current, profile: { ...current.profile, ...values } }));
    return true;
  }

  function markNotification(role, id, read = true) {
    if (!hasRole(role)) return false;
    if (role === "student" && gradeImports.notifications.some((entry) => entry.id === id && entry.studentNumber === activeStudentNumber)) {
      const updated = { ...readGradeStore(), notifications: readGradeStore().notifications.map((entry) =>
        entry.id === id && entry.studentNumber === activeStudentNumber ? { ...entry, read } : entry) };
      saveGradeStore(updated);
      return true;
    }
    setNotifications((current) => ({
      ...current,
      [role]: (current[role] || []).map((item) => (item.id === id ? { ...item, read } : item)),
    }));
    return true;
  }

  function markAllNotifications(role) {
    if (!hasRole(role)) return false;
    if (role === "student") {
      const latest = readGradeStore();
      if (latest.notifications.some((item) => item.studentNumber === activeStudentNumber && !item.read)) {
        saveGradeStore({ ...latest, notifications: latest.notifications.map((entry) =>
          entry.studentNumber === activeStudentNumber ? { ...entry, read: true } : entry) });
      }
    }
    setNotifications((current) => ({
      ...current,
      [role]: (current[role] || []).map((item) => ({ ...item, read: true })),
    }));
    return true;
  }

  function addActivity(enrollment, action, previousStatus, newStatus, reason) {
    setRegistrar((current) => ({
      ...current,
      activity: [
        {
          id: `ACT-${Date.now()}`,
          date: demoTimestamp(),
          registrar: current.registrar.fullName,
          student: enrollment.studentName,
          reference: enrollment.reference,
          action,
          previousStatus,
          newStatus,
          reason,
        },
        ...current.activity,
      ],
    }));
  }

  function updateEnrollment(reference, updater) {
    setRegistrar((current) => ({
      ...current,
      enrollments: current.enrollments.map((item) => item.reference === reference ? updater(item) : item),
    }));
  }

  function syncEnrollmentStatus(enrollment, status, extra = {}) {
    setRegistrar((current) => ({
      ...current,
      students: current.students.map((item) => item.studentNumber === enrollment.studentNumber ? { ...item, enrollmentStatus: status } : item),
    }));
    if (enrollment.studentNumber === student.profile.studentNumber && enrollment.reference === student.enrollment.reference) {
      setStudent((current) => ({
        ...current,
        enrollment: { ...current.enrollment, status, ...extra },
      }));
    }
  }

  function addStudentEnrollmentNotification(enrollment, title, message) {
    const date = demoTimestamp();
    const notification = {
      id: `RN-STUDENT-${Date.now()}`,
      studentNumber: enrollment.studentNumber,
      enrollmentReference: enrollment.reference,
      title,
      message,
      date,
      category: "Enrollment",
    };
    setRegistrar((current) => ({
      ...current,
      outboundStudentNotifications: [notification, ...(current.outboundStudentNotifications || [])],
    }));
    if (enrollment.studentNumber === student.profile.studentNumber) {
      setNotifications((current) => ({
        ...current,
        student: [
          { ...notification, id: `SN-${Date.now()}`, read: false, relatedHref: "/student/enrollment" },
          ...current.student,
        ],
      }));
    }
  }

  function runRegistrarValidation(reference) {
    if (!hasRole("registrar")) return null;
    const enrollment = registrar.enrollments.find((item) => item.reference === reference);
    if (!enrollment) return null;
    const previousStatus = enrollment.status;
    if (previousStatus === "SUBMITTED") {
      updateEnrollment(reference, (item) => ({ ...item, status: "FOR_VALIDATION", validationStartedAt: demoTimestamp() }));
      syncEnrollmentStatus(enrollment, "FOR_VALIDATION");
      addActivity(enrollment, "Validation started", "SUBMITTED", "FOR_VALIDATION", "The submitted transaction entered Registrar validation.");
      addStudentEnrollmentNotification(enrollment, "Enrollment Validation Started", "Your submitted enrollment is now For Validation by the Registrar.");
      return "FOR_VALIDATION";
    }
    if (previousStatus !== "FOR_VALIDATION" && previousStatus !== "VALIDATED") return previousStatus;
    const nextStatus = demoValidationOutcome(enrollment);
    const appliesAcademicApproval = nextStatus === "VALIDATED" && enrollment.academicReviewDecision === "APPROVED";
    const validationReason = nextStatus === "VALIDATED" ? "All demo validation checks passed." : nextStatus === "NEEDS_ACADEMIC_REVIEW" ? "The enrollment requires an Academic Coordinator decision." : "The enrollment requires a correction before validation can continue.";
    const correctionReason = nextStatus === "REQUIRES_CORRECTION" ? "Validation identified a correctable enrollment issue." : enrollment.correctionReason;
    updateEnrollment(reference, (item) => ({
      ...item,
      status: nextStatus,
      lastValidatedAt: demoTimestamp(),
      correctionReason,
      ...(appliesAcademicApproval ? { academicReviewDecision: "APPLIED", academicReviewAppliedDate: demoTimestamp() } : {}),
    }));
    if (appliesAcademicApproval) {
      addAcademicHistory("Academic Review", reference, "Approved exception applied during validation",
        "APPROVED", "APPLIED", enrollment.academicReviewReason || "", enrollment.academicReviewScope || null);
    }
    syncEnrollmentStatus(enrollment, nextStatus, { correctionReason });
    addActivity(enrollment, "Validation completed", previousStatus, nextStatus, validationReason);
    addStudentEnrollmentNotification(enrollment, `Enrollment ${nextStatus === "VALIDATED" ? "Validated" : nextStatus === "NEEDS_ACADEMIC_REVIEW" ? "Needs Academic Review" : "Requires Correction"}`, validationReason);
    return nextStatus;
  }

  function returnForCorrection(reference, details) {
    if (!hasRole("registrar")) return false;
    const enrollment = registrar.enrollments.find((item) => item.reference === reference);
    if (!enrollment || !["FOR_VALIDATION", "VALIDATED"].includes(enrollment.status) || !details?.explanation?.trim()) return false;
    const reason = `${details.category}: ${details.explanation}${details.affected ? ` Affected: ${details.affected}.` : ""}`;
    updateEnrollment(reference, (item) => ({ ...item, status: "REQUIRES_CORRECTION", correctionReason: reason }));
    syncEnrollmentStatus(enrollment, "REQUIRES_CORRECTION", { correctionReason: reason });
    addActivity(enrollment, "Returned for correction", enrollment.status, "REQUIRES_CORRECTION", reason);
    addStudentEnrollmentNotification(enrollment, "Enrollment Requires Correction", reason);
    return true;
  }

  function confirmRegistrarEnrollment(reference) {
    if (!hasRole("registrar")) return false;
    const enrollment = registrar.enrollments.find((item) => item.reference === reference);
    if (!enrollment || enrollment.status !== "VALIDATED") return false;
    const confirmationReference = `CONF-2026-${String(Math.floor(Date.now() % 10000)).padStart(4, "0")}`;
    const confirmationDate = demoTimestamp();
    updateEnrollment(reference, (item) => ({ ...item, status: "CONFIRMED", confirmationReference, confirmationDate }));
    setRegistrar((current) => ({
      ...current,
      sections: current.sections.map((section) => {
        const included = enrollment.subjects.some((subject) => subject.section === section.code);
        if (!included) return section;
        const confirmed = Math.min(section.capacity, section.confirmed + 1);
        const remaining = section.capacity - confirmed;
        return { ...section, confirmed, status: confirmed >= section.capacity ? "Full" : remaining <= 3 ? "Near Capacity" : "Available" };
      }),
    }));
    syncEnrollmentStatus(enrollment, "CONFIRMED", { confirmationReference, confirmationDate });
    if (enrollment.studentNumber === student.profile.studentNumber && enrollment.reference === student.enrollment.reference) {
      setStudent((current) => {
        const confirmedRecord = {
          term: current.term.label,
          program: current.profile.program,
          status: "CONFIRMED",
          units: enrollment.units,
          confirmationDate,
        };
        const historyWithoutCurrentTerm = current.enrollmentHistory.filter((item) => item.term !== current.term.label);
        return {
          ...current,
          confirmedSchedule: {
            term: current.term.label,
            items: enrollment.subjects.map((subject) => ({
              code: subject.code,
              name: subject.name,
              section: subject.section,
              day: subject.day || "Not assigned",
              start: subject.start || "Not assigned",
              end: subject.end || "Not assigned",
              room: subject.room,
              instructor: subject.instructor || "To be announced",
            })),
          },
          enrollmentHistory: [confirmedRecord, ...historyWithoutCurrentTerm],
        };
      });
    }
    addActivity(enrollment, "Enrollment confirmed", "VALIDATED", "CONFIRMED", `Confirmation reference ${confirmationReference}.`);
    addStudentEnrollmentNotification(enrollment, "Enrollment Confirmed", `Your enrollment is officially Confirmed. Confirmation reference: ${confirmationReference}.`);
    return true;
  }

  function applyAuthorizedCorrection(reference, correctedInformation, reason) {
    if (!hasRole("registrar")) return false;
    const enrollment = registrar.enrollments.find((item) => item.reference === reference);
    if (!enrollment || !reason.trim() || !correctedInformation.trim()) return false;
    const clarifiesReview = enrollment.status === "NEEDS_ACADEMIC_REVIEW" &&
      enrollment.academicReviewDecision === "RETURNED_FOR_CLARIFICATION";
    updateEnrollment(reference, (item) => ({
      ...item,
      authorizedCorrection: correctedInformation,
      authorizedCorrectionReason: reason,
      ...(clarifiesReview ? {
        academicReviewDecision: "PENDING",
        academicReviewClarification: correctedInformation,
        academicReviewClarificationReason: reason,
        academicReviewClarificationDate: demoTimestamp(),
      } : {}),
    }));
    addActivity(enrollment, "Authorized correction recorded", enrollment.status, enrollment.status, reason);
    if (clarifiesReview) {
      addAcademicHistory("Academic Review", reference, "Clarification supplied for academic exception",
        "RETURNED_FOR_CLARIFICATION", "PENDING", reason, enrollment.academicReviewScope || null);
    }
    return true;
  }

  function correctRegistrarStudent(studentNumber, field, value, reason) {
    if (!hasRole("registrar")) return false;
    const record = registrar.students.find((item) => item.studentNumber === studentNumber);
    if (!record || !["email", "contactNumber"].includes(field) || !reason.trim() || !value.trim()) return false;
    setRegistrar((current) => ({
      ...current,
      students: current.students.map((item) => item.studentNumber === studentNumber ? { ...item, [field]: value } : item),
      activity: [
        {
          id: `ACT-${Date.now()}`,
          date: demoTimestamp(),
          registrar: current.registrar.fullName,
          student: record.fullName,
          reference: studentNumber,
          action: "Authorized student record correction",
          previousStatus: record[field],
          newStatus: value,
          reason,
        },
        ...current.activity,
      ],
    }));
    if (studentNumber === student.profile.studentNumber) {
      setStudent((current) => ({
        ...current,
        profile: { ...current.profile, [field]: value },
      }));
    }
    return true;
  }


  function currentAcademicCoordinatorName() {
    const identifier = String(getDemoSession()?.identifier || "").toLowerCase();
    const record = academicCoordinators.find((item) =>
      [item.username, item.employeeId, item.email]
        .map((value) => String(value || "").toLowerCase())
        .includes(identifier),
    );

    return record?.fullName || academicCoordinators[0]?.fullName || "Academic Coordinator";
  }

  function addAcademicHistory(module, record, action, previousValue = "", newValue = "", reason = "", scope = null) {
    setAcademicCoordinatorData((current) => ({
      ...current,
      history: [
        {
          id: `ACH-${Date.now()}`,
          dateTime: demoTimestamp(),
          coordinator: currentAcademicCoordinatorName(),
          module,
          record,
          action,
          previousValue,
          newValue,
          ...(reason ? { reason } : {}),
          ...(scope ? { scope } : {}),
        },
        ...current.history,
      ],
    }));
  }

  function createAcademicProgram(values) {
    if (!hasRole("academic-coordinator")) return { ok: false, message: "Unauthorized role." };

    const code = String(values?.code || "").trim().toUpperCase();
    const name = String(values?.name || "").trim();
    const department = String(values?.department || "").trim();

    if (!code || !name || !department) {
      return { ok: false, message: "Program code, name, and department are required." };
    }
    if (!catalog.departments.some((item) => item.id === department)) {
      return { ok: false, message: "Select a valid college department." };
    }

    if (catalog.programs.some((item) => item.code === code)) {
      return { ok: false, message: "That program code already exists." };
    }

    const record = {
      id: `program-${code.toLowerCase()}`,
      code,
      name,
      department,
      departmentId: department,
      status: values.status || "Active",
      majors: Array.isArray(values.majors) ? values.majors : [],
      reference: "Demo Academic Data",
      enrolled: 0,
    };

    setCatalog((current) => ({
      ...current,
      programs: [...current.programs, record],
    }));
    addAcademicHistory("Academic Setup", code, "Program created", "", record.status);
    return { ok: true, record };
  }

  function updateAcademicProgram(code, changes) {
    if (!hasRole("academic-coordinator")) return false;
    const existing = catalog.programs.find((item) => item.code === code);
    if (!existing) return false;
    if (changes.department && !catalog.departments.some((item) => item.id === changes.department)) return false;
    if (existing.reference === "Verified Program" && changes.department !== existing.department) return false;

    setCatalog((current) => ({
      ...current,
      programs: current.programs.map((item) =>
        item.code === code ? { ...item, ...changes, code: item.code, id: item.id, departmentId: changes.department || item.department } : item
      ),
    }));
    addAcademicHistory(
      "Academic Setup",
      code,
      "Program updated",
      `${existing.name} · ${existing.status}`,
      `${changes.name || existing.name} · ${changes.status || existing.status}`,
    );
    return true;
  }

  function createCurriculumVersion(values) {
    if (!hasRole("academic-coordinator")) return { ok: false, message: "Unauthorized role." };

    const program = String(values?.program || "").trim();
    const version = String(values?.version || "").trim();
    const effectiveAcademicYear = String(values?.effectiveAcademicYear || "").trim();
    const definition = catalog.programs.find((item) => item.code === program);
    const department = values.department || definition?.department;
    const major = values.major || "";
    const assignments = Array.isArray(values.assignments) ? clone(values.assignments) : [];

    if (!program || !version || !effectiveAcademicYear) {
      return { ok: false, message: "Program, curriculum version, and effective academic year are required." };
    }
    if (!definition || definition.department !== department || (major && !definition.majors.includes(major))) {
      return { ok: false, message: "Select a compatible department, program and major." };
    }

    if (academicCoordinatorData.curricula.some((item) => item.program === program && (item.major || "") === major && item.version.toLowerCase() === version.toLowerCase())) {
      return { ok: false, message: "That curriculum version already exists." };
    }
    const problems = validateCurriculumRecord({ ...values, program, department, major, assignments, version, effectiveAcademicYear }, catalog);
    if (problems.length) return { ok: false, message: problems[0] };

    const record = withCurriculumMetrics({
      id: `CUR-${Date.now()}`,
      program,
      programId: definition.id,
      department,
      departmentId: department,
      major,
      version,
      effectiveAcademicYear,
      status: "Draft",
      assignments,
      reference: "Demo Academic Data",
    }, catalog.subjects);

    setAcademicCoordinatorData((current) => ({
      ...current,
      curricula: [record, ...current.curricula],
    }));
    addAcademicHistory("Academic Setup", version, "Curriculum version created", "", record.status);
    return { ok: true, record };
  }

  function updateCurriculumVersion(id, changes) {
    if (!hasRole("academic-coordinator")) return { ok: false, message: "Only Academic Coordinators can edit curricula." };

    const existing = academicCoordinatorData.curricula.find((item) => item.id === id);
    if (!existing) return { ok: false, message: "Curriculum was not found." };
    if (existing.status !== "Draft") return { ok: false, message: "Active or archived curricula cannot be edited. Duplicate as a new Draft." };
    const selectedProgram = catalog.programs.find((item) => item.code === (changes.program || existing.program));
    const merged = { ...existing, ...changes, id, status: "Draft",
      department: changes.department || selectedProgram?.department || existing.department,
      departmentId: changes.department || selectedProgram?.departmentId || existing.departmentId,
      programId: selectedProgram?.id || existing.programId,
    };
    if (academicCoordinatorData.curricula.some((item) => item.id !== id && item.program === merged.program && (item.major || "") === (merged.major || "") && item.version.toLowerCase() === merged.version.toLowerCase())) {
      return { ok: false, message: "A curriculum with this version already exists for the selected program and major." };
    }
    const errors = validateCurriculumRecord(merged, catalog);
    if (errors.length) return { ok: false, message: errors[0] };

    setAcademicCoordinatorData((current) => ({
      ...current,
      curricula: current.curricula.map((item) =>
        item.id === id ? withCurriculumMetrics(merged, catalog.subjects) : item
      ),
    }));
    addAcademicHistory(
      "Academic Setup",
      existing.version,
      "Curriculum updated",
      existing.status,
      changes.status || existing.status,
    );
    return { ok: true, record: withCurriculumMetrics(merged, catalog.subjects) };
  }

  function duplicateCurriculumVersion(id) {
    if (!hasRole("academic-coordinator")) return { ok: false, message: "Unauthorized role." };

    const source = academicCoordinatorData.curricula.find((item) => item.id === id);
    if (!source) return { ok: false, message: "Curriculum was not found." };

    const baseVersion = `${source.version} Copy`;
    let version = baseVersion;
    let counter = 2;
    while (academicCoordinatorData.curricula.some((item) => item.program === source.program && (item.major || "") === (source.major || "") && item.version === version)) {
      version = `${baseVersion} ${counter++}`;
    }
    const record = {
      ...source,
      id: `CUR-${Date.now()}`,
      version,
      status: "Draft",
      assignments: clone(source.assignments || []),
    };
    const duplicate = withCurriculumMetrics(record, catalog.subjects);

    setAcademicCoordinatorData((current) => ({
      ...current,
      curricula: [duplicate, ...current.curricula],
    }));
    addAcademicHistory("Academic Setup", record.version, "Curriculum duplicated as new version", source.version, record.version);
    return { ok: true, record: duplicate };
  }

  function getAcademicSubjectOptions(filters) {
    return filterAcademicSubjectOptions(catalog, filters);
  }

  function validateCurriculumVersion(id) {
    if (!hasRole("academic-coordinator")) return { ok: false, message: "Only Academic Coordinators can validate curricula." };
    const record = academicCoordinatorData.curricula.find((item) => item.id === id);
    if (!record) return { ok: false, message: "Curriculum was not found.", errors: ["Curriculum was not found."] };
    const errors = validateCurriculumActivation(record, catalog);
    addAcademicHistory("Academic Setup", record.version,
      errors.length ? "Curriculum validation failed" : "Curriculum validation passed",
      record.status, errors.length ? errors[0] : "Validation Passed");
    return {
      ok: errors.length === 0,
      message: errors.length ? errors[0] : "All eight semesters and subject requirements are valid.",
      errors,
      summary: summarizeCurriculum(record.assignments || [], catalog.subjects),
    };
  }

  function performCurriculumLifecycle(id, action) {
    if (!hasRole("academic-coordinator")) {
      return { ok: false, message: "Only Academic Coordinators may change curriculum status." };
    }
    const result = transitionCurriculumVersion(curriculumDataRef.current, catalog, {
      id, action, actor: currentAcademicCoordinatorName(), dateTime: demoTimestamp(),
      eventId: `ACH-${Date.now()}-${++curriculumEventCounterRef.current}`,
    });
    if (!result.ok) return result;
    // The complete next state includes the curriculum switch and both history
    // events. The ref serializes multiple actions within the same browser tick.
    curriculumDataRef.current = result.next;
    setAcademicCoordinatorData(result.next);
    return result;
  }

  function activateCurriculumVersion(id) { return performCurriculumLifecycle(id, "activate"); }
  function deactivateCurriculumVersion(id) { return performCurriculumLifecycle(id, "deactivate"); }
  function archiveCurriculumVersion(id) { return performCurriculumLifecycle(id, "archive"); }
  function restoreCurriculumVersion(id) { return performCurriculumLifecycle(id, "restore"); }

  function resetMockAcademicSetup() {
    if (!hasRole("academic-coordinator"))
      return { ok: false, message: "Only the demo Academic Coordinator can reset Academic Setup data." };
    setCatalog(clone(INITIAL_ACADEMIC_CATALOG));
    setAcademicCoordinatorData(clone(ACADEMIC_COORDINATOR_INITIAL_DATA));
    return { ok: true, message: "Mock academic setup has been restored to its initial sample data." };
  }

  function deleteAcademicSubject(code) {
    if (!hasRole("academic-coordinator")) return { ok: false, message: "Unauthorized role." };
    const record = catalog.subjects.find((item) => item.code === code);
    if (!record) return { ok: false, message: "Subject was not found." };
    const inCurriculum = academicCoordinatorData.curricula.some((entry) =>
      (entry.assignments || []).some((assignment) => assignment.subjectCode === code));
    const hasEnrollment = registrar.enrollments.some((entry) => entry.subjects?.some((subject) => subject.code === code));
    const neededAsPrerequisite = catalog.subjects.some((entry) => entry.prerequisites?.includes(code));
    const hasSection = catalog.sections.some((section) => section.subjectCode === code);
    if (inCurriculum || hasEnrollment || neededAsPrerequisite || hasSection || record.availableInStudentDemo)
      return { ok: false, message: "This subject is referenced by a curriculum, section, enrollment, or prerequisite. Set it inactive or update the Draft curriculum first." };
    setCatalog((current) => ({ ...current, subjects: current.subjects.filter((entry) => entry.code !== code) }));
    addAcademicHistory("Academic Setup", code, "Unreferenced subject deleted", record.name, "");
    return { ok: true };
  }

  function deleteAcademicProgram(code) {
    if (!hasRole("academic-coordinator")) return { ok: false, message: "Unauthorized role." };
    const record = catalog.programs.find((item) => item.code === code);
    if (!record) return { ok: false, message: "Program was not found." };
    if (academicCoordinatorData.curricula.some((entry) => entry.program === code) ||
        catalog.subjects.some((entry) => entry.programs?.includes(code)) ||
        registrar.students.some((entry) => entry.program === code) ||
        student.profile.programCode === code) {
      return { ok: false, message: "Program is referenced by an academic record. Deactivate it instead." };
    }
    setCatalog((current) => ({ ...current, programs: current.programs.filter((entry) => entry.code !== code) }));
    addAcademicHistory("Academic Setup", code, "Unreferenced program deleted", record.name, "");
    return { ok: true };
  }

  function createAcademicSubject(values) {
    if (!hasRole("academic-coordinator")) return { ok: false, message: "Unauthorized role." };

    const code = String(values?.code || "").trim().toUpperCase();
    const name = String(values?.name || "").trim();
    const units = Number(values?.units || 0);

    if (!code || !name || !Number.isFinite(units) || units <= 0 || !Number.isFinite(Number(values.feePerUnit ?? DEFAULT_DEMO_FEE_PER_UNIT)) || Number(values.feePerUnit ?? DEFAULT_DEMO_FEE_PER_UNIT) < 0) {
      return { ok: false, message: "Subject code, name, and valid units are required." };
    }
    const programs = Array.isArray(values.programs) ? values.programs : [values.program || "BSIT"];
    if (!programs.length || programs.some((item) => !catalog.programs.some((program) => program.code === item))) {
      return { ok: false, message: "Select valid applicable programs." };
    }
    const prerequisites = Array.isArray(values.prerequisites) ? values.prerequisites : [];
    const invalid = validateSubjectContext(catalog, { ...values, code, programs, prerequisites });
    if (invalid) return { ok: false, message: invalid };

    if (catalog.subjects.some((item) => item.code === code)) {
      return { ok: false, message: "That subject code already exists." };
    }

    const record = {
      id: `subject-${code.toLowerCase()}`,
      code,
      name,
      units,
      description: String(values?.description || "").trim(),
      yearLevel: values?.yearLevel || "1st Year",
      semester: values?.semester || "First Semester",
      category: "Other Eligible",
      eligibility: "NOT_OFFERED",
      prerequisites,
      restrictionReason: "",
      status: values?.status || "Active",
      program: values?.program || "BSIT",
      programs,
      major: values?.major || "",
      programIds: programs.map((item) => `program-${item.toLowerCase()}`),
      department: values?.department || catalog.programs.find((item) => item.code === programs[0])?.department,
      departmentId: values?.department || catalog.programs.find((item) => item.code === programs[0])?.departmentId,
      feePerUnit: Number(values.feePerUnit ?? DEFAULT_DEMO_FEE_PER_UNIT),
      fee: units * Number(values.feePerUnit ?? DEFAULT_DEMO_FEE_PER_UNIT),
      availableInStudentDemo: false,
      reference: "Demo Academic Data",
      curriculum: values?.curriculum || "BSIT Curriculum 2024",
    };

    setCatalog((current) => ({
      ...current,
      subjects: [...current.subjects, record],
    }));
    addAcademicHistory("Academic Setup", code, "Subject created", "", record.name);
    return { ok: true, record };
  }

  function updateAcademicSubject(code, changes) {
    if (!hasRole("academic-coordinator")) return false;

    const existing = catalog.subjects.find((item) => item.code === code);
    if (!existing) return { ok: false, message: "Subject was not found." };
    const next = { ...existing, ...changes, code, id: existing.id,
      programIds: (changes.programs || existing.programs).map((item) => `program-${item.toLowerCase()}`),
    };
    next.departmentId = next.department;
    next.fee = Number(next.units) * Number(next.feePerUnit);
    if (!Number.isFinite(Number(next.units)) || Number(next.units) <= 0 || !Number.isFinite(Number(next.feePerUnit)) || Number(next.feePerUnit) < 0) return { ok: false, message: "Units and the demo fee rate must be valid nonnegative numbers." };
    const invalid = validateSubjectContext(catalog, next);
    if (invalid) return { ok: false, message: invalid };
    if (!next.programs?.length || next.programs.some((item) => !catalog.programs.some((entry) => entry.code === item))) return { ok: false, message: "Select valid applicable programs." };
    if (academicCoordinatorData.curricula.some((item) => ["Active", "Inactive", "Archived"].includes(item.status) && (item.assignments || []).some((assignment) => assignment.subjectCode === code)) &&
      (next.units !== existing.units || JSON.stringify(next.prerequisites) !== JSON.stringify(existing.prerequisites) ||
       next.department !== existing.department || next.major !== (existing.major || "") ||
       JSON.stringify([...next.programs].sort()) !== JSON.stringify([...(existing.programs || [])].sort()))) {
      return { ok: false, message: "A protected curriculum uses this subject. Duplicate its curriculum for structural or prerequisite changes." };
    }

    setCatalog((current) => ({
      ...current,
      subjects: current.subjects.map((item) =>
        item.code === code ? next : item
      ),
    }));
    addAcademicHistory("Academic Setup", code, "Subject updated", existing.name, changes.name || existing.name);
    return { ok: true, record: next };
  }

  function savePrerequisiteRule({ targetCode, prerequisiteCode, curriculumId, effectiveTerm }) {
    if (!hasRole("academic-coordinator")) return { ok: false, message: "Unauthorized role." };

    const target = catalog.subjects.find((item) => item.code === targetCode);
    const prerequisite = catalog.subjects.find((item) => item.code === prerequisiteCode);

    if (!target || !prerequisite) {
      return { ok: false, message: "Both subject references must exist." };
    }

    if (targetCode === prerequisiteCode) {
      return { ok: false, message: "A subject cannot be its own prerequisite." };
    }

    if (curriculumId) {
      const curriculum = academicCoordinatorData.curricula.find((entry) => entry.id === curriculumId);
      if (!curriculum) return { ok: false, message: "Curriculum was not found." };
      if (curriculum.status !== "Draft") return { ok: false, message: "Prerequisites may be edited only on Draft curricula." };
      const targetAssignment = curriculum.assignments.find((entry) => entry.subjectCode === targetCode);
      const prerequisiteAssignment = curriculum.assignments.find((entry) => entry.subjectCode === prerequisiteCode);
      if (!targetAssignment || !prerequisiteAssignment)
        return { ok: false, message: "Both subjects must be assigned to this curriculum." };
      const ruleCodes = targetAssignment.prerequisites || target.prerequisites || [];
      if (ruleCodes.includes(prerequisiteCode))
        return { ok: false, message: "That prerequisite relationship already exists." };
      const subjectGraph = catalog.subjects.map((subject) => {
        const assignment = curriculum.assignments.find((entry) => entry.subjectCode === subject.code);
        return assignment ? { ...subject, prerequisites: assignment.prerequisites ?? subject.prerequisites } : subject;
      });
      const problem = validatePrerequisiteGraph(subjectGraph, targetCode, [...ruleCodes, prerequisiteCode]);
      if (problem) return { ok: false, message: problem };
      const termIndex = (assignment) => ACADEMIC_YEARS.indexOf(assignment.yearLevel) * 2 + ACADEMIC_SEMESTERS.indexOf(assignment.semester);
      if (termIndex(prerequisiteAssignment) >= termIndex(targetAssignment))
        return { ok: false, message: "The prerequisite must be assigned to an earlier semester." };
      const updated = withCurriculumMetrics({
        ...curriculum, assignments: curriculum.assignments.map((entry) =>
          entry.subjectCode === targetCode ? { ...entry, prerequisites: [...ruleCodes, prerequisiteCode] } : entry),
      }, catalog.subjects);
      setAcademicCoordinatorData((current) => ({
        ...current,
        curricula: current.curricula.map((entry) => entry.id === curriculumId ? updated : entry),
        prerequisiteRules: [...(current.prerequisiteRules || []), {
          id: `PR-${Date.now()}`, curriculumId, targetCode, prerequisiteCode,
          effectiveTerm: effectiveTerm || student.term.shortLabel, status: "Active",
        }],
      }));
      addAcademicHistory("Academic Setup", targetCode, "Curriculum prerequisite added", curriculum.version, prerequisiteCode);
      return { ok: true };
    }

    if ((target.prerequisites || []).includes(prerequisiteCode)) {
      return { ok: false, message: "That prerequisite relationship already exists." };
    }

    if (wouldCreatePrerequisiteCycle(catalog.subjects, targetCode, prerequisiteCode)) {
      return { ok: false, message: "The rule would create a circular prerequisite relationship." };
    }

    setCatalog((current) => ({
      ...current,
      subjects: current.subjects.map((item) =>
        item.code === targetCode
          ? { ...item, prerequisites: [...(item.prerequisites || []), prerequisiteCode] }
          : item
      ),
    }));
    addAcademicHistory("Academic Setup", targetCode, "Prerequisite added", "", prerequisiteCode);
    return { ok: true };
  }

  function removePrerequisiteRule(targetCode, prerequisiteCode, curriculumId) {
    if (!hasRole("academic-coordinator")) return false;
    if (curriculumId) {
      const curriculum = academicCoordinatorData.curricula.find((entry) => entry.id === curriculumId);
      if (!curriculum || curriculum.status !== "Draft") return false;
      const assignment = curriculum.assignments.find((entry) => entry.subjectCode === targetCode);
      if (!assignment?.prerequisites?.includes(prerequisiteCode)) return false;
      const updated = withCurriculumMetrics({
        ...curriculum, assignments: curriculum.assignments.map((entry) =>
          entry.subjectCode === targetCode
            ? { ...entry, prerequisites: entry.prerequisites.filter((code) => code !== prerequisiteCode) }
            : entry),
      }, catalog.subjects);
      setAcademicCoordinatorData((current) => ({
        ...current,
        curricula: current.curricula.map((entry) => entry.id === curriculumId ? updated : entry),
        prerequisiteRules: (current.prerequisiteRules || []).map((entry) =>
          entry.curriculumId === curriculumId && entry.targetCode === targetCode && entry.prerequisiteCode === prerequisiteCode
            ? { ...entry, status: "Inactive" } : entry),
      }));
      addAcademicHistory("Academic Setup", targetCode, "Curriculum prerequisite deactivated", prerequisiteCode, curriculum.version);
      return true;
    }
    if (!catalog.subjects.some((entry) => entry.code === targetCode && entry.prerequisites?.includes(prerequisiteCode))) return false;

    setCatalog((current) => ({
      ...current,
      subjects: current.subjects.map((item) =>
        item.code === targetCode
          ? { ...item, prerequisites: (item.prerequisites || []).filter((code) => code !== prerequisiteCode) }
          : item
      ),
    }));
    addAcademicHistory("Academic Setup", targetCode, "Prerequisite deactivated", prerequisiteCode, "");
    return true;
  }

  function createSubjectOffering(values) {
    if (!hasRole("academic-coordinator")) return { ok: false, message: "Unauthorized role." };

    const subject = catalog.subjects.find((item) => item.code === values?.subjectCode);
    if (!subject) return { ok: false, message: "Select a valid subject." };

    const record = {
      id: `OFF-${Date.now()}`,
      academicTerm: values.academicTerm || student.term.label,
      program: values.program || "BSIT",
      curriculum: values.curriculum || student.profile.curriculum || "Current Curriculum",
      subjectCode: subject.code,
      subjectName: subject.name,
      yearLevel: subject.yearLevel,
      semester: subject.semester,
      status: values.status || "Planned",
      plannedSections: Number(values.plannedSections || 1),
    };

    setAcademicCoordinatorData((current) => ({
      ...current,
      offerings: [record, ...current.offerings],
    }));
    addAcademicHistory("Sections & Schedules", subject.code, "Subject offering created", "", record.status);
    return { ok: true, record };
  }

  function updateSubjectOffering(id, changes) {
    if (!hasRole("academic-coordinator")) return false;

    const existing = academicCoordinatorData.offerings.find((item) => item.id === id);
    if (!existing) return false;

    setAcademicCoordinatorData((current) => ({
      ...current,
      offerings: current.offerings.map((item) =>
        item.id === id ? { ...item, ...changes, id: item.id } : item
      ),
    }));
    addAcademicHistory(
      "Sections & Schedules",
      existing.subjectCode,
      "Subject offering updated",
      existing.status,
      changes.status || existing.status,
    );
    return true;
  }

  function createAcademicSection(values) {
    if (!hasRole("academic-coordinator")) return { ok: false, message: "Unauthorized role." };

    const code = String(values?.code || "").trim().toUpperCase();
    const subject = String(values?.subject || "").trim().toUpperCase();
    const capacity = Number(values?.capacity || 0);

    if (!code || !subject || capacity <= 0) {
      return { ok: false, message: "Section code, subject, and valid capacity are required." };
    }

    if (registrar.sections.some((item) => item.code === code)) {
      return { ok: false, message: "That section code already exists." };
    }

    const record = {
      code,
      subject,
      program: values.program || "BSIT",
      academicTerm: values.academicTerm || student.term.shortLabel,
      capacity,
      confirmed: 0,
      status: "Available",
      sectionStatus: values.sectionStatus || "Planned",
      schedule: "Not scheduled",
      room: "TBA",
      day: "",
      start: "",
      end: "",
    };

    setRegistrar((current) => ({
      ...current,
      sections: [record, ...current.sections],
    }));
    addAcademicHistory("Sections & Schedules", code, "Section created", "", record.sectionStatus);
    return { ok: true, record };
  }

  function updateAcademicSection(code, changes) {
    if (!hasRole("academic-coordinator")) return false;

    const existing = registrar.sections.find((item) => item.code === code);
    if (!existing) return false;

    setRegistrar((current) => ({
      ...current,
      sections: current.sections.map((item) =>
        item.code === code ? { ...item, ...changes, code: item.code } : item
      ),
    }));
    addAcademicHistory(
      "Sections & Schedules",
      code,
      "Section updated",
      existing.sectionStatus || existing.status,
      changes.sectionStatus || existing.sectionStatus || existing.status,
    );
    return true;
  }

  function saveAcademicSchedule(values) {
    if (!hasRole("academic-coordinator")) return { ok: false, message: "Unauthorized role." };

    const section = registrar.sections.find((item) => item.code === values?.sectionCode);
    if (!section) return { ok: false, message: "Select a valid section." };

    const startMinutes = timeToMinutes(values.start);
    const endMinutes = timeToMinutes(values.end);

    if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) {
      return { ok: false, message: "The class start time must be earlier than the end time." };
    }

    const conflict = registrar.sections.find((item) => {
      if (item.code === section.code) return false;
      if (!item.day || !item.start || !item.end) return false;
      if (item.day !== values.day) return false;

      const itemStart = timeToMinutes(item.start);
      const itemEnd = timeToMinutes(item.end);
      const overlaps = itemStart < endMinutes && startMinutes < itemEnd;
      const sameRoom = String(item.room || "").toLowerCase() === String(values.room || "").toLowerCase();

      return overlaps && sameRoom;
    });

    if (conflict) {
      return { ok: false, message: `Room conflict with ${conflict.code} on ${values.day}.` };
    }

    const schedule = `${values.day} ${values.start} to ${values.end}`;

    setRegistrar((current) => ({
      ...current,
      sections: current.sections.map((item) =>
        item.code === section.code
          ? {
              ...item,
              day: values.day,
              start: values.start,
              end: values.end,
              room: values.room,
              schedule,
              sectionStatus: item.sectionStatus === "Planned" ? "Open" : item.sectionStatus,
            }
          : item
      ),
    }));

    addAcademicHistory("Sections & Schedules", section.code, "Class schedule saved", section.schedule, schedule);
    return { ok: true };
  }

  // Block planning actions operate only on a separate browser demo snapshot.
  // Academic Setup remains the current source for the underlying catalog.
  const effectiveBlockPlanning = {
    ...blockPlanning,
    colleges: catalog.departments,
    programs: catalog.programs,
    curricula: academicCoordinatorData.curricula,
    subjects: catalog.subjects,
  };

  function runBlockPlanningAction(action, ...args) {
    if (!hasRole("academic-coordinator")) {
      return { ok: false, message: "Only the Academic Coordinator can edit block planning proposals." };
    }
    const current = {
      ...blockPlanningRef.current,
      colleges: catalog.departments,
      programs: catalog.programs,
      curricula: academicCoordinatorData.curricula,
      subjects: catalog.subjects,
    };
    const result = action(current, ...args);
    if (result.ok && result.next) {
      blockPlanningRef.current = result.next;
      setBlockPlanning(result.next);
    }
    const { next, ...response } = result;
    return response;
  }

  function createBlockSection(values) {
    return runBlockPlanningAction(createBlockSectionRecord, values);
  }

  function updateBlockSection(id, values) {
    return runBlockPlanningAction(updateBlockSectionRecord, id, values);
  }

  function assignBlockStudents(values) {
    return runBlockPlanningAction(assignBlockStudentsRecord, values);
  }

  function transferBlockStudent(values) {
    return runBlockPlanningAction(transferBlockStudentRecord, values);
  }

  function saveBlockMeeting(values) {
    return runBlockPlanningAction(saveBlockMeetingRecord, values);
  }

  function removeBlockMeeting(id) {
    return runBlockPlanningAction(removeBlockMeetingRecord, id);
  }

  function finalizeBlockSchedule(sectionId) {
    return runBlockPlanningAction(finalizeBlockScheduleRecord, sectionId);
  }

  function resetBlockDemoData() {
    if (!hasRole("academic-coordinator")) {
      return { ok: false, message: "Only the Academic Coordinator can reset block planning demo data." };
    }
    const next = buildBlockPlanningSeed(catalog, academicCoordinatorData.curricula);
    blockPlanningRef.current = next;
    setBlockPlanning(next);
    return { ok: true, message: "Block planning mock data restored. Official enrollments and other demo stores were not changed." };
  }

  function decideAcademicReview(reference, { decision, note }) {
    if (!hasRole("academic-coordinator")) return { ok: false, message: "Unauthorized role." };

    const enrollment = registrar.enrollments.find((item) => item.reference === reference);
    const normalizedDecision = String(decision || "").toUpperCase();
    const academicReason = String(note || "").trim();
    const outcome = academicReviewOutcome(enrollment, normalizedDecision, academicReason);
    if (!outcome.ok) return outcome;
    if (reviewDecisionLocksRef.current.has(reference)) {
      return { ok: false, message: "An academic decision for this case is already being processed." };
    }
    reviewDecisionLocksRef.current.add(reference);
    const nextStatus = outcome.nextStatus;

    const coordinator = currentAcademicCoordinatorName();
    const decisionDate = demoTimestamp();
    const scope = {
      studentReference: enrollment.studentNumber,
      enrollmentReference: enrollment.reference,
      subjectCode: enrollment.academicReviewSubjectCode || enrollment.subjects?.[0]?.code || null,
      rule: enrollment.academicReviewRule || enrollment.validationPreset || "Defined Academic Exception",
    };

    setRegistrar((current) => ({
      ...current,
      enrollments: current.enrollments.map((item) =>
        item.reference === reference
          ? {
              ...item,
              status: nextStatus,
              academicReviewDecision: normalizedDecision,
              academicReviewReason: academicReason,
              academicReviewCoordinator: coordinator,
              academicReviewDate: decisionDate,
              academicReviewScope: scope,
              academicReviewHistory: [
                ...(item.academicReviewHistory || []),
                { status: normalizedDecision, reason: academicReason, coordinator, date: decisionDate, scope },
              ],
            }
          : item
      ),
      activity: [
        {
          id: `ACT-${Date.now()}`,
          date: decisionDate,
          registrar: coordinator,
          actorRole: "ACADEMIC_COORDINATOR",
          actorName: coordinator,
          student: enrollment.studentName,
          reference,
          action: `Academic exception ${normalizedDecision.toLowerCase().replaceAll("_", " ")}`,
          previousStatus: enrollment.status,
          newStatus: nextStatus,
          reason: academicReason,
        },
        ...current.activity,
      ],
    }));

    setNotifications((current) => ({
      ...current,
      registrar: [
        {
          id: `RN-AC-${Date.now()}`,
          title: "Academic Review Decision Recorded",
          message: `${reference} received an Academic Coordinator decision: ${normalizedDecision.replaceAll("_", " ")}.`,
          date: decisionDate,
          category: "Academic Review",
          read: false,
          relatedHref: `/registrar/enrollment?reference=${encodeURIComponent(reference)}`,
        },
        ...(current.registrar || []),
      ],
      student:
        enrollment.studentNumber === student.profile.studentNumber
          ? [
              {
                id: `SN-AC-${Date.now()}`,
                title: "Academic Review Updated",
                message:
                  normalizedDecision === "APPROVED"
                    ? "Your academic exception was approved and your enrollment returned to Registrar validation."
                    : normalizedDecision === "REJECTED"
                      ? "Your academic exception was not approved. Review the correction instructions for your enrollment."
                      : "Your academic review requires clarification before a final decision can be made.",
                date: decisionDate,
                category: "Academic",
                read: false,
                relatedHref: "/student/enrollment",
              },
              ...(current.student || []),
            ]
          : current.student,
    }));

    addAcademicHistory(
      "Academic Review",
      reference,
      "Academic exception " + normalizedDecision.toLowerCase().replaceAll("_", " "),
      "NEEDS_ACADEMIC_REVIEW",
      `${normalizedDecision} → ${nextStatus}`,
      academicReason,
      scope,
    );

    return { ok: true, nextStatus };
  }

  const value = {
    student: studentView,
    catalog: session?.role === "student" ? catalogView : catalog,
    academicCatalog: catalog,
    registrar,
    systemAdministrators,
    academicCoordinators,
    academicCoordinatorData,
    blockPlanning: effectiveBlockPlanning,
    notifications: visibleNotifications,
    gradeImports,
    createMockGradeImport,
    validateMockGradeImport,
    replaceMockGradeFile,
    verifyMockGradeSource,
    publishMockGrades,
    cancelMockGradeImport,
    amendMockPublishedResult,
    resetMockGradeImports,
    addStudentSubject,
    removeStudentSubject,
    selectStudentSection,
    submitStudentEnrollment,
    updateStudentContact,
    markNotification,
    markAllNotifications,
    runRegistrarValidation,
    returnForCorrection,
    confirmRegistrarEnrollment,
    applyAuthorizedCorrection,
    correctRegistrarStudent,
    createAcademicProgram,
    updateAcademicProgram,
    createCurriculumVersion,
    updateCurriculumVersion,
    duplicateCurriculumVersion,
    getAcademicSubjectOptions,
    validateCurriculumVersion,
    activateCurriculumVersion,
    deactivateCurriculumVersion,
    archiveCurriculumVersion,
    restoreCurriculumVersion,
    resetMockAcademicSetup,
    deleteAcademicSubject,
    deleteAcademicProgram,
    createAcademicSubject,
    updateAcademicSubject,
    savePrerequisiteRule,
    removePrerequisiteRule,
    createSubjectOffering,
    updateSubjectOffering,
    createAcademicSection,
    updateAcademicSection,
    saveAcademicSchedule,
    createBlockSection,
    updateBlockSection,
    assignBlockStudents,
    transferBlockStudent,
    saveBlockMeeting,
    removeBlockMeeting,
    finalizeBlockSchedule,
    resetBlockDemoData,
    decideAcademicReview,
  };

  return <DemoDataContext.Provider value={value}>{children}</DemoDataContext.Provider>;
}

export function useDemoData() {
  const context = useContext(DemoDataContext);
  const live = useLiveAcademicCoordinator();
  if (!context) throw new Error("useDemoData must be used inside DemoDataProvider.");
  return live ? { ...context, ...live } : context;
}

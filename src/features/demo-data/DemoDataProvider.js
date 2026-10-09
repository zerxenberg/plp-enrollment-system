"use client";

import { createContext, useContext, useState } from "react";
import studentSource from "@/data/mock/student.json";
import catalogSource from "@/data/mock/catalog.json";
import registrarSource from "@/data/mock/registrar.json";
import notificationSource from "@/data/mock/notifications.json";
import systemAdministratorSource from "@/data/mock/system-administrators.json";
import academicCoordinatorSource from "@/data/mock/academic-coordinators.json";
import { validateStudentEnrollment } from "@/lib/validation/enrollment-validation";
import { getDemoSession } from "@/lib/auth/demo-auth";

const DemoDataContext = createContext(null);
const clone = (value) => JSON.parse(JSON.stringify(value));
const STUDENT_EDITABLE_STATUSES = new Set(["ELIGIBLE", "IN_PROGRESS", "REQUIRES_CORRECTION"]);
const STUDENT_SUBMITTABLE_STATUSES = new Set(["IN_PROGRESS"]);

const ACADEMIC_COORDINATOR_INITIAL_DATA = {
  curricula: [
    {
      id: "CUR-BSIT-2024",
      version: "BSIT Curriculum 2024",
      program: "BSIT",
      effectiveAcademicYear: "2024 to 2025",
      status: "Active",
      assignedSubjects: catalogSource.subjects.length,
    },
    {
      id: "CUR-BSBA-2024",
      version: "BSBA Curriculum 2024",
      program: "BSBA",
      effectiveAcademicYear: "2024 to 2025",
      status: "Active",
      assignedSubjects: 0,
    },
  ],
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
      record: "CTC 301",
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
  const [registrar, setRegistrar] = useState(() => clone(registrarSource));
  const [notifications, setNotifications] = useState(() => clone(notificationSource));
  const [systemAdministrators] = useState(() => clone(systemAdministratorSource));
  const [academicCoordinators] = useState(() => clone(academicCoordinatorSource));
  const [catalog, setCatalog] = useState(() => clone(catalogSource));
  const [academicCoordinatorData, setAcademicCoordinatorData] = useState(() => clone(ACADEMIC_COORDINATOR_INITIAL_DATA));
  const hasRole = (role) => getDemoSession()?.role === role;

  function addStudentSubject(code) {
    if (!hasRole("student")) return false;
    const subject = catalog.subjects.find((item) => item.code === code);
    if (!subject || subject.eligibility === "RESTRICTED" || !STUDENT_EDITABLE_STATUSES.has(student.enrollment.status)) return false;
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
    if (!hasRole("student")) return false;
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
    if (!hasRole("student")) return false;
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
    if (!hasRole("student")) return { ok: false, checks: [], reason: "role" };
    if (!STUDENT_SUBMITTABLE_STATUSES.has(student.enrollment.status)) {
      return { ok: false, checks: [], reason: "status" };
    }
    const checks = validateStudentEnrollment(student, catalog);
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
    if (!hasRole("student")) return false;
    setStudent((current) => ({ ...current, profile: { ...current.profile, ...values } }));
    return true;
  }

  function markNotification(role, id, read = true) {
    if (!hasRole(role)) return false;
    setNotifications((current) => ({
      ...current,
      [role]: (current[role] || []).map((item) => (item.id === id ? { ...item, read } : item)),
    }));
    return true;
  }

  function markAllNotifications(role) {
    if (!hasRole(role)) return false;
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
    const nextStatus = enrollment.validationPreset === "pass" ? "VALIDATED" : enrollment.validationPreset === "review" ? "NEEDS_ACADEMIC_REVIEW" : "REQUIRES_CORRECTION";
    const validationReason = nextStatus === "VALIDATED" ? "All demo validation checks passed." : nextStatus === "NEEDS_ACADEMIC_REVIEW" ? "The enrollment requires an Academic Coordinator decision." : "The enrollment requires a correction before validation can continue.";
    const correctionReason = nextStatus === "REQUIRES_CORRECTION" ? "Validation identified a correctable enrollment issue." : enrollment.correctionReason;
    updateEnrollment(reference, (item) => ({ ...item, status: nextStatus, lastValidatedAt: demoTimestamp(), correctionReason }));
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
    updateEnrollment(reference, (item) => ({ ...item, authorizedCorrection: correctedInformation, authorizedCorrectionReason: reason }));
    addActivity(enrollment, "Authorized correction recorded", enrollment.status, enrollment.status, reason);
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

  function addAcademicHistory(module, record, action, previousValue = "", newValue = "") {
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

    if (catalog.programs.some((item) => item.code === code)) {
      return { ok: false, message: "That program code already exists." };
    }

    const record = {
      code,
      name,
      department,
      status: values.status || "Active",
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

    setCatalog((current) => ({
      ...current,
      programs: current.programs.map((item) =>
        item.code === code ? { ...item, ...changes, code: item.code } : item
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

    if (!program || !version || !effectiveAcademicYear) {
      return { ok: false, message: "Program, curriculum version, and effective academic year are required." };
    }

    if (academicCoordinatorData.curricula.some((item) => item.version.toLowerCase() === version.toLowerCase())) {
      return { ok: false, message: "That curriculum version already exists." };
    }

    const record = {
      id: `CUR-${Date.now()}`,
      program,
      version,
      effectiveAcademicYear,
      status: values.status || "Draft",
      assignedSubjects: 0,
    };

    setAcademicCoordinatorData((current) => ({
      ...current,
      curricula: [record, ...current.curricula],
    }));
    addAcademicHistory("Academic Setup", version, "Curriculum version created", "", record.status);
    return { ok: true, record };
  }

  function updateCurriculumVersion(id, changes) {
    if (!hasRole("academic-coordinator")) return false;

    const existing = academicCoordinatorData.curricula.find((item) => item.id === id);
    if (!existing) return false;

    setAcademicCoordinatorData((current) => ({
      ...current,
      curricula: current.curricula.map((item) =>
        item.id === id ? { ...item, ...changes, id: item.id } : item
      ),
    }));
    addAcademicHistory(
      "Academic Setup",
      existing.version,
      "Curriculum updated",
      existing.status,
      changes.status || existing.status,
    );
    return true;
  }

  function duplicateCurriculumVersion(id) {
    if (!hasRole("academic-coordinator")) return { ok: false, message: "Unauthorized role." };

    const source = academicCoordinatorData.curricula.find((item) => item.id === id);
    if (!source) return { ok: false, message: "Curriculum was not found." };

    const record = {
      ...source,
      id: `CUR-${Date.now()}`,
      version: `${source.version} Copy`,
      status: "Draft",
    };

    setAcademicCoordinatorData((current) => ({
      ...current,
      curricula: [record, ...current.curricula],
    }));
    addAcademicHistory("Academic Setup", record.version, "Curriculum duplicated as new version", source.version, record.version);
    return { ok: true, record };
  }

  function createAcademicSubject(values) {
    if (!hasRole("academic-coordinator")) return { ok: false, message: "Unauthorized role." };

    const code = String(values?.code || "").trim().toUpperCase();
    const name = String(values?.name || "").trim();
    const units = Number(values?.units || 0);

    if (!code || !name || units <= 0) {
      return { ok: false, message: "Subject code, name, and valid units are required." };
    }

    if (catalog.subjects.some((item) => item.code === code)) {
      return { ok: false, message: "That subject code already exists." };
    }

    const record = {
      code,
      name,
      units,
      description: String(values?.description || "").trim(),
      yearLevel: values?.yearLevel || "1st Year",
      semester: values?.semester || "First Semester",
      category: "Other Eligible",
      eligibility: "ELIGIBLE",
      prerequisites: [],
      restrictionReason: "",
      status: values?.status || "Active",
      program: values?.program || "BSIT",
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
    if (!existing) return false;

    setCatalog((current) => ({
      ...current,
      subjects: current.subjects.map((item) =>
        item.code === code ? { ...item, ...changes, code: item.code } : item
      ),
    }));
    addAcademicHistory("Academic Setup", code, "Subject updated", existing.name, changes.name || existing.name);
    return true;
  }

  function savePrerequisiteRule({ targetCode, prerequisiteCode }) {
    if (!hasRole("academic-coordinator")) return { ok: false, message: "Unauthorized role." };

    const target = catalog.subjects.find((item) => item.code === targetCode);
    const prerequisite = catalog.subjects.find((item) => item.code === prerequisiteCode);

    if (!target || !prerequisite) {
      return { ok: false, message: "Both subject references must exist." };
    }

    if (targetCode === prerequisiteCode) {
      return { ok: false, message: "A subject cannot be its own prerequisite." };
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

  function removePrerequisiteRule(targetCode, prerequisiteCode) {
    if (!hasRole("academic-coordinator")) return false;

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

  function decideAcademicReview(reference, { decision, note }) {
    if (!hasRole("academic-coordinator")) return { ok: false, message: "Unauthorized role." };

    const enrollment = registrar.enrollments.find((item) => item.reference === reference);
    if (!enrollment || enrollment.status !== "NEEDS_ACADEMIC_REVIEW") {
      return { ok: false, message: "This case is not waiting for an Academic Coordinator decision." };
    }

    const normalizedDecision = String(decision || "").toUpperCase();
    const academicReason = String(note || "").trim();

    if (!["APPROVED", "REJECTED", "RETURNED_FOR_CLARIFICATION"].includes(normalizedDecision)) {
      return { ok: false, message: "Select a valid academic decision." };
    }

    if (!academicReason) {
      return { ok: false, message: "An academic reason or decision note is required." };
    }

    const nextStatus =
      normalizedDecision === "APPROVED"
        ? "FOR_VALIDATION"
        : normalizedDecision === "REJECTED"
          ? "REQUIRES_CORRECTION"
          : "NEEDS_ACADEMIC_REVIEW";

    const coordinator = currentAcademicCoordinatorName();
    const decisionDate = demoTimestamp();

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
            }
          : item
      ),
      activity: [
        {
          id: `ACT-${Date.now()}`,
          date: decisionDate,
          registrar: coordinator,
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
      "Academic exception decided",
      "NEEDS_ACADEMIC_REVIEW",
      `${normalizedDecision} → ${nextStatus}`,
    );

    return { ok: true, nextStatus };
  }

  const value = {
    student,
    catalog,
    registrar,
    systemAdministrators,
    academicCoordinators,
    academicCoordinatorData,
    notifications,
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
    createAcademicSubject,
    updateAcademicSubject,
    savePrerequisiteRule,
    removePrerequisiteRule,
    createSubjectOffering,
    updateSubjectOffering,
    createAcademicSection,
    updateAcademicSection,
    saveAcademicSchedule,
    decideAcademicReview,
  };

  return <DemoDataContext.Provider value={value}>{children}</DemoDataContext.Provider>;
}

export function useDemoData() {
  const context = useContext(DemoDataContext);
  if (!context) throw new Error("useDemoData must be used inside DemoDataProvider.");
  return context;
}

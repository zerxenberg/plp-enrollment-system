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
  const catalog = catalogSource;
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

  const value = {
    student,
    catalog,
    registrar,
    systemAdministrators,
    academicCoordinators,
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
  };

  return <DemoDataContext.Provider value={value}>{children}</DemoDataContext.Provider>;
}

export function useDemoData() {
  const context = useContext(DemoDataContext);
  if (!context) throw new Error("useDemoData must be used inside DemoDataProvider.");
  return context;
}

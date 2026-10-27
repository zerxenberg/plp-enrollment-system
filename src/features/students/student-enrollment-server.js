import "server-only";

import { requireStudentContext, getStudentContext } from "./student-context-server";
import {
  estimateProjectSelectedSubjects,
  selectedProjectSubjectCodes,
} from "./project-fee-estimate.mjs";
import { loadVerifiedProjectSubjectPrices } from "./project-fee-prices-server";
import { loadStudentPublishedReadiness } from "./student-published-readiness-server";

const TERM_ID = "TERM-2026-1";
const PROJECT_COHORT = "PLP_PROJECT_600_2026_1";

function enrollmentRecordsUnavailable() {
  // An authorization/session failure is distinct from a verified Student's
  // academic read failing (for example, a missing service-role SELECT grant).
  // Neither condition is permission to bypass academic readiness checks.
  return { kind: "unavailable", reason: "records" };
}

function manilaCalendarDate() {
  // PostgreSQL term dates describe the local school calendar day.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function mapSchedule(meetings) {
  const bySubject = new Map();
  for (const item of meetings || []) {
    const code = item.subject_code;
    if (!code) continue;
    const list = bySubject.get(code) || [];
    list.push({
      day: item.day, start: item.start_time, end: item.end_time,
      room: item.room || "To be announced",
      instructor: item.instructor || "To be announced",
      component: item.component || null,
    });
    bySubject.set(code, list);
  }
  return bySubject;
}

function preparedSubjects(snapshot, sectionCodes, currentTermCodes = null, subjectDecisions = null) {
  const meetings = mapSchedule(snapshot.class_schedule);
  const subjects = (snapshot.subjects || [])
    .filter((item) => !currentTermCodes || currentTermCodes.has(item.subject_code))
    .map((item) => ({
    code: item.subject_code,
    name: item.subject_name,
    units: item.academic_units,
    eligibility: subjectDecisions?.get(item.subject_code)?.eligibility || "PENDING_EVALUATION",
    reason: subjectDecisions?.get(item.subject_code)?.reason || null,
    section: sectionCodes.get(item.subject_code)?.code || null,
    sectionStatus: sectionCodes.get(item.subject_code)?.status || null,
    sectionScheduleStatus: sectionCodes.get(item.subject_code)?.scheduleStatus || null,
    meetings: meetings.get(item.subject_code) || [],
  }));
  // Proposed means academically eligible with a finalized, block-linked
  // timetable. It does not mean the class is open for registration yet.
  const eligible = subjects.filter((item) =>
    ["ELIGIBLE", "RETAKE"].includes(item.eligibility) &&
    Boolean(item.section) && item.meetings.length > 0 &&
    item.sectionScheduleStatus === "FINALIZED" &&
    ["PLANNED", "OPEN"].includes(item.sectionStatus));
  const openEligible = eligible.filter((item) => item.sectionStatus === "OPEN");
  return { subjects, eligible, openEligible };
}

// Only a Registrar-confirmed, immutable selection returned through the guarded
// demonstration COR RPC can be presented as registered subjects or meetings.
// This read also works when current registration/fee preparation is unavailable.
export function verifyConfirmedProjectRegistrationSnapshot(cor, simulation, snapshot) {
  if (!cor || cor.registration_snapshot_complete !== true ||
      cor.simulation_only !== true || cor.official !== false ||
      cor.certificate_of_official_registration !== false ||
      cor.simulation_id !== simulation?.id ||
      cor.confirmed_at !== simulation?.confirmed_at ||
      cor.student?.student_number !== snapshot.student_number ||
      cor.student?.curriculum_code !== snapshot.curriculum_code ||
      cor.student?.term_id !== snapshot.term_id ||
      !Array.isArray(cor.registered_subjects) || !cor.registered_subjects.length ||
      !Array.isArray(cor.registered_schedule) || !cor.registered_schedule.length) {
    return null;
  }
  const registered = new Map();
  for (const item of cor.registered_subjects) {
    const units = Number(item?.academic_units);
    if (!item?.subject_code || !item.subject_name || !item.section_id ||
        !item.section_code || registered.has(item.subject_code) ||
        !Number.isFinite(units) || units <= 0) return null;
    registered.set(item.subject_code, {
      code: item.subject_code,
      name: item.subject_name,
      units,
      section: item.section_code,
      sectionId: item.section_id,
      meetings: [],
    });
  }
  for (const item of cor.registered_schedule) {
    const subject = registered.get(item?.subject_code);
    if (!subject || item.day_of_week == null || !item.start_time ||
        !item.end_time) return null;
    subject.meetings.push({
      day: item.day_of_week, start: item.start_time, end: item.end_time,
      room: item.room || "Not recorded", instructor: item.professor || "Not recorded",
      component: item.lecture_lab_type || null,
    });
  }
  if ([...registered.values()].some((item) => !item.meetings.length)) return null;
  const subjects = [...registered.values()];
  const units = subjects.reduce((sum, item) => sum + item.units, 0);
  if (Number(cor.registered_units) !== units) return null;
  return {
    reference: cor.registration_reference || cor.simulation_id,
    confirmedAt: cor.confirmed_at,
    subjects,
    units,
    source: "CONFIRMED_PROJECT_REGISTRATION_SNAPSHOT",
  };
}

function confirmedProjectRegistration(cor, simulation, snapshot, priceRows) {
  const registration = verifyConfirmedProjectRegistrationSnapshot(
    cor, simulation, snapshot);
  if (!registration) return null;
  const projectFeeEstimate = estimateProjectSelectedSubjects(registration.subjects, priceRows);
  if (projectFeeEstimate.totalUnits !== registration.units) return null;
  return { ...registration, projectFeeEstimate };
}

export function buildStudentEnrollmentSummary({
  context, snapshot, term, simulation, sectionCodes, correctionReason = null,
  demoWindow = null,
  priceRows, currentTermCodes = null, publishedEvidence = null,
  confirmedRegistration = null,
  asOfDate = manilaCalendarDate(),
}) {
  const { subjects, eligible, openEligible } = preparedSubjects(snapshot, sectionCodes, currentTermCodes,
    publishedEvidence?.subjectDecisions);
  // Proposed classroom preparation is a verified estimate, not a registration.
  // A PLANNED section may be estimated but may never be submitted to the RPC;
  // OPEN still gates the entire prepared selection and confirmed subjects.
  const projectFeeEstimate = estimateProjectSelectedSubjects(eligible, priceRows);
  const validDemoWindow = demoWindow?.project_cohort_id === PROJECT_COHORT &&
    demoWindow?.term_id === (term?.id || TERM_ID) &&
    demoWindow?.source_type === "PROJECT_ONLY_FICTIONAL" &&
    demoWindow?.verified_institutionally === false;
  const demoStart = validDemoWindow ? demoWindow.start_date : null;
  const demoEnd = validDemoWindow ? demoWindow.end_date : null;
  const termEnd = demoStart && demoEnd ? demoEnd : term?.enrollment_end || null;
  const termStart = demoStart && demoEnd ? demoStart : term?.enrollment_start || null;
  const today = asOfDate;
  const originalOpen = term?.status === "Open" &&
    Boolean(term?.enrollment_start && term?.enrollment_end) &&
    today >= term.enrollment_start && today <= term.enrollment_end;
  const demonstrationOpen = validDemoWindow && demoWindow.status === "OPEN" &&
    Boolean(demoStart && demoEnd) && today >= demoStart && today <= demoEnd;
  // A manually closed project window must never be bypassed by the
  // institution's independently configured academic term dates.
  const windowOpen = validDemoWindow ? demonstrationOpen : originalOpen;
  const gradeReady = publishedEvidence?.readiness?.ready === true;
  const ready = gradeReady && snapshot.schedule_validated_for_project === true &&
    eligible.length > 0 && openEligible.length === eligible.length;
  const blockingReasons = [];
  if (!gradeReady) blockingReasons.push(publishedEvidence?.readiness?.reason ||
    "Published academic results or approved transfer credits are required.");
  if (snapshot.schedule_validated_for_project !== true) {
    blockingReasons.push("The project class timetable has not been validated.");
  }
  if (eligible.length === 0) {
    blockingReasons.push("No academically eligible subjects have finalized class sections and a verified timetable.");
  } else if (openEligible.length !== eligible.length) {
    const pending = eligible.length - openEligible.length;
    blockingReasons.push(`${pending} prepared subject section${pending === 1 ? " is" : "s are"} still PLANNED. The Academic Coordinator must activate the validated demonstration sections before you can submit enrollment.`);
  }
  if (!windowOpen) blockingReasons.push("The configured enrollment period is not currently open.");
  const simulationStatus = simulation?.status || null;
  const canSubmit = ready && windowOpen &&
    (simulationStatus === null || ["DRAFT", "RETURNED"].includes(simulationStatus));

  return {
    kind: "ready",
    provenance: "GENERATED_PROJECT",
    student: {
      name: snapshot.student_name,
      number: snapshot.student_number || context.studentNumber,
      type: context.studentType,
      program: snapshot.program_code,
      track: snapshot.program_track_code,
      curriculum: snapshot.curriculum_code,
      yearLevel: snapshot.year_level,
      classification: publishedEvidence?.readiness?.classification || "PENDING_EVALUATION",
      progression: snapshot.progression_status,
    },
    term: {
      id: term?.id || snapshot.term_id || TERM_ID,
      label: term?.label || snapshot.term_id || TERM_ID,
      academicYear: term?.academic_year || null,
      semester: term?.semester || null,
      enrollmentStart: termStart,
      enrollmentEnd: termEnd,
      status: validDemoWindow ? (demoWindow.status === "OPEN" ? "Open" : "Closed")
        : term?.status || "Unknown",
      windowOpen,
      demonstrationWindow: validDemoWindow,
    },
    homeBlock: snapshot.home_block || null,
    homeBlockStatus: snapshot.block_planning_status || null,
    timetableReady: snapshot.schedule_validated_for_project === true,
    simulation: simulation ? {
      id: simulation.id,
      status: simulation.status,
      submittedAt: simulation.submitted_at,
      confirmedAt: simulation.confirmed_at,
      correctionReason: simulation.status === "RETURNED" ? correctionReason : null,
    } : null,
    officialStatus: "NOT_CONFIRMED",
    subjects,
    proposedSubjects: eligible,
    openSubjectCount: openEligible.length,
    proposedUnits: projectFeeEstimate.totalUnits,
    projectFeeEstimate,
    confirmedRegistration,
    previousResults: publishedEvidence?.previousResults || [],
    transferCredits: publishedEvidence?.transferCredits || [],
    // Accepted project records are distinct from official institutional grades
    // and credits. The dashboard must not misreport these as zero simply
    // because official records are intentionally unchanged.
    acceptedProjectResults: publishedEvidence?.acceptedProjectResults || [],
    projectTransferDecisions: publishedEvidence?.projectTransferDecisions || [],
    projectTransferSummary: publishedEvidence?.projectTransferSummary || null,
    blockingReasons,
    canSubmit,
  };
}

/** Server data only: never return the privileged Supabase client to a component. */
export async function loadStudentEnrollmentForPage() {
  const context = await getStudentContext();
  if (context.kind !== "project") return { kind: "unavailable", reason: "identity" };
  try {
    const [snapshotResult, termResult, statusResult, placementResult, windowResult] = await Promise.all([
      context.client.rpc("project_phase8_student_snapshot_v2", { p_student_id: context.studentId }),
      context.admin.from("academic_terms")
        .select("id,label,academic_year,semester,enrollment_start,enrollment_end,status")
        .eq("id", TERM_ID).maybeSingle(),
      context.client.rpc("project_phase8_student_portal_status_v1", {
        p_student_id: context.studentId,
      }),
      context.admin.from("project_student_academic_placements")
        .select("home_block_id").eq("student_id", context.studentId)
        .eq("term_id", TERM_ID).maybeSingle(),
      context.admin.from("project_phase8_demo_enrollment_window")
        .select("project_cohort_id,term_id,start_date,end_date,status,source_type,verified_institutionally")
        .eq("project_cohort_id", PROJECT_COHORT).maybeSingle(),
    ]);
    if (snapshotResult.error || snapshotResult.data?.project_only !== true ||
        snapshotResult.data?.verified_institutionally !== false ||
        snapshotResult.data?.data_origin !== "GENERATED_PROJECT" ||
        snapshotResult.data?.student_number !== context.studentNumber ||
        snapshotResult.data?.term_id !== TERM_ID ||
        termResult.error || !termResult.data || statusResult.error ||
        statusResult.data?.project_only !== true ||
        statusResult.data?.verified_institutionally !== false ||
        statusResult.data?.curriculum_is_official !== false ||
        statusResult.data?.curriculum_code !== snapshotResult.data?.curriculum_code ||
        placementResult.error || !placementResult.data || windowResult.error) {
      return enrollmentRecordsUnavailable();
    }
    // The eligibility snapshot includes requirements from the entire curriculum.
    // Enrollment may only prepare this student's assigned year and semester.
    const { data: termCurriculum, error: termCurriculumError } = await context.admin
      .from("curriculum_subjects")
      .select("subject_code")
      .eq("curriculum_code", snapshotResult.data.curriculum_code)
      .eq("year_level_number", snapshotResult.data.year_level)
      .eq("semester", termResult.data.semester);
    if (termCurriculumError || !termCurriculum?.length) {
      return enrollmentRecordsUnavailable();
    }
    const currentTermCodes = new Set(termCurriculum.map((row) => row.subject_code));
    const sectionCodes = new Map();
    const blockId = placementResult.data.home_block_id;
    if (blockId) {
      const { data: links, error: linkError } = await context.admin
        .from("block_subject_sections")
        .select("section_id")
        .eq("block_id", blockId);
      if (!linkError && links?.length) {
        const ids = [...new Set(links.map((entry) => entry.section_id).filter(Boolean))];
        const { data: sections, error: sectionsError } = await context.admin
        .from("sections").select("id,section_code,subject_code,status,schedule_status").in("id", ids);
        if (!sectionsError) {
          for (const section of sections || []) {
            if (section.subject_code && section.section_code) {
              sectionCodes.set(section.subject_code, {
                code: section.section_code, status: section.status,
                scheduleStatus: section.schedule_status,
              });
            }
          }
        }
      }
    }
    const publishedEvidence = await loadStudentPublishedReadiness(
      context, TERM_ID, snapshotResult.data.curriculum_code, currentTermCodes);
    const simulation = statusResult.data.simulation || null;
    const { eligible } = preparedSubjects(snapshotResult.data, sectionCodes,
      currentTermCodes, publishedEvidence.subjectDecisions);
    const selectedCodes = selectedProjectSubjectCodes(eligible);
    // Server-only price SELECT for this student's academically eligible,
    // finalized proposed subjects, including PLANNED sections. Missing prices fail
    // closed rather than falling back to an illustrative constant.
    const priceRows = await loadVerifiedProjectSubjectPrices(
      context.admin, snapshotResult.data.curriculum_code, eligible);
    if (priceRows.length !== selectedCodes.length) return enrollmentRecordsUnavailable();
    let registeredRegistration = null;
    if (simulation?.status === "CONFIRMED_SIMULATION") {
      const { data: cor, error: corError } = await context.client.rpc(
        "project_phase8_demonstration_cor_v1", { p_simulation_id: simulation.id });
      if (!corError && cor?.registration_snapshot_complete === true &&
          Array.isArray(cor.registered_subjects) && cor.registered_subjects.length) {
        // These prices correspond to the persisted registered selection, which
        // may differ from the current eligible preparation after confirmation.
        const registeredRows = cor.registered_subjects.map((item) => ({
          code: item.subject_code, name: item.subject_name, units: item.academic_units,
        }));
        try {
          const confirmedPrices = await loadVerifiedProjectSubjectPrices(
            context.admin, snapshotResult.data.curriculum_code, registeredRows);
          registeredRegistration = confirmedProjectRegistration(
            cor, simulation, snapshotResult.data, confirmedPrices);
        } catch {
          // Do not promote a partial or inconsistent historical registration
          // into a COR; current enrollment preparation can still be viewed.
          registeredRegistration = null;
        }
      }
    }
    return buildStudentEnrollmentSummary({ context, snapshot: snapshotResult.data,
      term: termResult.data, simulation, sectionCodes,
      priceRows, currentTermCodes, publishedEvidence, demoWindow: windowResult.data,
      confirmedRegistration: registeredRegistration,
      correctionReason: simulation?.correction_reason || null });
  } catch {
    return enrollmentRecordsUnavailable();
  }
}

export async function loadStudentEnrollmentSummary() {
  return loadStudentEnrollmentForPage();
}

/** Reevaluate against the live backend immediately before project submission. */
export async function assertCanSubmitProjectEnrollment() {
  const context = await requireStudentContext();
  const data = await loadStudentEnrollmentForPage();
  if (data.kind !== "ready" || !data.canSubmit) {
    throw new Error(data.blockingReasons?.[0] ||
      "Your enrollment is not currently eligible for submission.");
  }
  // Only this authenticated server read may choose the subject codes supplied
  // to the registration RPC. The browser never supplies IDs or subject lists.
  const proposedSubjects = data.proposedSubjects;
  const proposedCodes = Array.isArray(proposedSubjects)
    ? proposedSubjects.map((subject) => subject?.code) : [];
  const estimatedCodes = data.projectFeeEstimate?.subjectCodes;
  if (data.provenance !== "GENERATED_PROJECT" ||
      data.student?.number !== context.studentNumber ||
      data.term?.id !== TERM_ID || data.term?.windowOpen !== true ||
      data.timetableReady !== true || !data.student?.curriculum ||
      proposedCodes.length === 0 ||
      new Set(proposedCodes).size !== proposedCodes.length ||
      !Array.isArray(estimatedCodes) ||
      estimatedCodes.length !== proposedCodes.length ||
      proposedCodes.some((code) => !estimatedCodes.includes(code)) ||
      proposedSubjects.some((subject) =>
        typeof subject.code !== "string" || !subject.code.trim() ||
        !["ELIGIBLE", "RETAKE"].includes(subject.eligibility) ||
        subject.sectionStatus !== "OPEN" || !subject.section ||
        !Array.isArray(subject.meetings) || !subject.meetings.length ||
        !Number.isFinite(Number(subject.units)) || Number(subject.units) <= 0)) {
    throw new Error("The prepared subject selection could not be verified. Refresh enrollment and try again.");
  }
  return {
    context,
    proposedSubjects,
    termId: data.term.id,
    curriculumCode: data.student.curriculum,
  };
}

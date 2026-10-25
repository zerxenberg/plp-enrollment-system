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
    section: sectionCodes.get(item.subject_code) || null,
    meetings: meetings.get(item.subject_code) || [],
  }));
  const eligible = subjects.filter((item) =>
    ["ELIGIBLE", "RETAKE"].includes(item.eligibility) &&
    Boolean(item.section) && item.meetings.length > 0);
  return { subjects, eligible };
}

export function buildStudentEnrollmentSummary({
  context, snapshot, term, simulation, sectionCodes, correctionReason = null,
  demoWindow = null,
  priceRows, currentTermCodes = null, publishedEvidence = null,
  asOfDate = manilaCalendarDate(),
}) {
  const { subjects, eligible } = preparedSubjects(snapshot, sectionCodes, currentTermCodes,
    publishedEvidence?.subjectDecisions);
  // An eligible subject elsewhere in the curriculum is not automatically a
  // registered class. Only sections present in this student's validated home
  // block timetable form the prepared selection.
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
    eligible.length > 0;
  const blockingReasons = [];
  if (!gradeReady) blockingReasons.push(publishedEvidence?.readiness?.reason ||
    "Published academic results or approved transfer credits are required.");
  if (!ready) blockingReasons.push("The approved project timetable or eligible subjects are not ready.");
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
    proposedUnits: projectFeeEstimate.totalUnits,
    projectFeeEstimate,
    previousResults: publishedEvidence?.previousResults || [],
    transferCredits: publishedEvidence?.transferCredits || [],
    blockingReasons,
    canSubmit,
  };
}

/** Server data only: never return the privileged Supabase client to a component. */
export async function loadStudentEnrollmentForPage() {
  const context = await getStudentContext();
  if (context.kind !== "project") return { kind: "unavailable" };
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
      return { kind: "unavailable" };
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
      return { kind: "unavailable" };
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
          .from("sections").select("id,section_code,subject_code").in("id", ids);
        if (!sectionsError) {
          for (const section of sections || []) {
            if (section.subject_code && section.section_code) {
              sectionCodes.set(section.subject_code, section.section_code);
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
    // Server-only price SELECT for exactly the signed student's eligible,
    // section-linked and scheduled subjects. Missing/mismatched prices fail
    // closed rather than falling back to an illustrative constant.
    const priceRows = await loadVerifiedProjectSubjectPrices(
      context.admin, snapshotResult.data.curriculum_code, eligible);
    if (priceRows.length !== selectedCodes.length) return { kind: "unavailable" };
    return buildStudentEnrollmentSummary({ context, snapshot: snapshotResult.data,
      term: termResult.data, simulation, sectionCodes,
      priceRows, currentTermCodes, publishedEvidence, demoWindow: windowResult.data,
      correctionReason: simulation?.correction_reason || null });
  } catch {
    return { kind: "unavailable" };
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
  return context;
}

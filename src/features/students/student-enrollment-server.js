import "server-only";

import { requireStudentContext, getStudentContext } from "./student-context-server";
import {
  estimateProjectSelectedSubjects,
  selectedProjectSubjectCodes,
} from "./project-fee-estimate.mjs";
import { loadVerifiedProjectSubjectPrices } from "./project-fee-prices-server";

const TERM_ID = "TERM-2026-1";

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

function preparedSubjects(snapshot, sectionCodes) {
  const meetings = mapSchedule(snapshot.class_schedule);
  const subjects = (snapshot.subjects || []).map((item) => ({
    code: item.subject_code,
    name: item.subject_name,
    units: item.academic_units,
    eligibility: item.eligibility || "RESTRICTED",
    reason: item.reason || null,
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
  priceRows,
  asOfDate = manilaCalendarDate(),
}) {
  const { subjects, eligible } = preparedSubjects(snapshot, sectionCodes);
  // An eligible subject elsewhere in the curriculum is not automatically a
  // registered class. Only sections present in this student's validated home
  // block timetable form the prepared selection.
  const projectFeeEstimate = estimateProjectSelectedSubjects(eligible, priceRows);
  const termEnd = term?.enrollment_end || null;
  const termStart = term?.enrollment_start || null;
  const today = asOfDate;
  const windowOpen = term?.status === "Open" && Boolean(termStart && termEnd) &&
    today >= termStart && today <= termEnd;
  const ready = snapshot.schedule_validated_for_project === true &&
    eligible.length > 0;
  const blockingReasons = [];
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
      classification: snapshot.academic_classification,
      progression: snapshot.progression_status,
    },
    term: {
      id: term?.id || snapshot.term_id || TERM_ID,
      label: term?.label || snapshot.term_id || TERM_ID,
      academicYear: term?.academic_year || null,
      semester: term?.semester || null,
      enrollmentStart: termStart,
      enrollmentEnd: termEnd,
      status: term?.status || "Unknown",
      windowOpen,
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
    previousResults: snapshot.previous_results || [],
    transferCredits: snapshot.transfer_credits || [],
    blockingReasons,
    canSubmit,
  };
}

/** Server data only: never return the privileged Supabase client to a component. */
export async function loadStudentEnrollmentForPage() {
  const context = await getStudentContext();
  if (context.kind !== "project") return { kind: "unavailable" };
  try {
    const [snapshotResult, termResult, statusResult, placementResult] = await Promise.all([
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
        placementResult.error || !placementResult.data) {
      return { kind: "unavailable" };
    }
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
    const simulation = statusResult.data.simulation || null;
    const { eligible } = preparedSubjects(snapshotResult.data, sectionCodes);
    const selectedCodes = selectedProjectSubjectCodes(eligible);
    // Server-only price SELECT for exactly the signed student's eligible,
    // section-linked and scheduled subjects. Missing/mismatched prices fail
    // closed rather than falling back to an illustrative constant.
    const priceRows = await loadVerifiedProjectSubjectPrices(
      context.admin, snapshotResult.data.curriculum_code, eligible);
    if (priceRows.length !== selectedCodes.length) return { kind: "unavailable" };
    return buildStudentEnrollmentSummary({ context, snapshot: snapshotResult.data,
      term: termResult.data, simulation, sectionCodes,
      priceRows, correctionReason: simulation?.correction_reason || null });
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

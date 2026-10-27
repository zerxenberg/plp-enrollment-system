import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadStudentProfileForPage } from "@/features/students/student-profile-server";
import {
  loadStudentEnrollmentForPage,
  verifyConfirmedProjectRegistrationSnapshot,
} from "./student-enrollment-server";
import {
  loadAcceptedProjectGradeResults,
  loadValidatedProjectTransferDecisions,
} from "./student-published-readiness-server";
import { summarizeProjectTransferDecisions } from "./published-grade-readiness.mjs";

const PROJECT_COHORT = "PLP_PROJECT_600_2026_1";
const HISTORICAL_BLOCK_ID = "456b850d-3241-505f-a718-f35ff3ce4be1";
const HISTORICAL_TERM_ID = "TERM-2025-2";
const HISTORICAL_CURRICULUM = "P8F26-BSIT-V1";
const UNAVAILABLE = Object.freeze({ mode: "unavailable" });

// Academic instructor attribution is for the explicitly scoped, fictional
// historical block. It must not make unaccepted grades or official faculty claims.
async function loadProjectHistoricalProfessors(admin, student, snapshot, acceptedResults) {
  if (!acceptedResults.length || student.student_type !== "CONTINUING_STUDENT" ||
      snapshot.curriculum_code !== HISTORICAL_CURRICULUM) return new Map();
  const { data: placement, error: placementError } = await admin.from("project_student_academic_placements")
    .select("student_id")
    .eq("student_id", student.id).eq("project_cohort_id", PROJECT_COHORT)
    .eq("term_id", snapshot.term_id).eq("home_block_id", HISTORICAL_BLOCK_ID)
    .eq("curriculum_code", HISTORICAL_CURRICULUM).maybeSingle();
  if (placementError || !placement) return new Map();
  const { data: mappings, error: mappingError } = await admin.from("project_historical_subject_instructors")
    .select("subject_code,instructor_id,assignment_provenance,verified_institutionally")
    .eq("project_cohort_id", PROJECT_COHORT).eq("target_block_id", HISTORICAL_BLOCK_ID)
    .eq("prior_term_id", HISTORICAL_TERM_ID).eq("curriculum_code", HISTORICAL_CURRICULUM)
    .eq("previous_block_code", "BSIT-1A");
  if (mappingError || !mappings?.length) return new Map();
  const validMappings = mappings.filter((row) =>
    row.instructor_id && row.assignment_provenance === "PROJECT_FICTIONAL_ASSIGNMENT" &&
    row.verified_institutionally === false);
  if (!validMappings.length) return new Map();
  const { data: instructors, error: instructorError } = await admin.from("instructors")
    .select("id,display_name,is_synthetic_demo,synthetic_source_key")
    .in("id", validMappings.map((row) => row.instructor_id));
  if (instructorError || !instructors) return new Map();
  const names = new Map(instructors.filter((item) => item.is_synthetic_demo === true &&
    item.synthetic_source_key?.startsWith("PROJECT_ONLY_BSIT1A_TERM2025_2:"))
    .map((item) => [item.id, item.display_name]));
  return new Map(validMappings.filter((row) => names.has(row.instructor_id))
    .map((row) => [row.subject_code, names.get(row.instructor_id)]));
}

// All identifiers originate from verified Auth and the trusted student profile
// loader. Neither page accepts a student id, number, or term from the browser.
export async function loadStudentAcademicForPage() {
  try {
    const profileView = await loadStudentProfileForPage();
    if (profileView.mode !== "project" || !profileView.profile?.studentNumber) {
      return UNAVAILABLE;
    }

    const client = await createClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth?.user?.id) return UNAVAILABLE;

    const admin = createAdminClient();
    const { data: account, error: accountError } = await admin.from("app_users")
      .select("id,auth_user_id,role_code,account_status,login_enabled")
      .eq("auth_user_id", auth.user.id).maybeSingle();
    if (accountError || !account || account.auth_user_id !== auth.user.id ||
        account.role_code !== "student" || account.account_status !== "Active" ||
        account.login_enabled !== true) return UNAVAILABLE;

    const { data: student, error: studentError } = await admin.from("student_profiles")
      .select("id,user_id,student_number,record_kind,project_cohort_id,student_type")
      .eq("user_id", account.id)
      .eq("student_number", profileView.profile.studentNumber)
      .eq("record_kind", "PROJECT_ONLY")
      .eq("project_cohort_id", PROJECT_COHORT).maybeSingle();
    if (studentError || !student || student.user_id !== account.id) return UNAVAILABLE;

    // This authenticated RPC independently enforces account ownership,
    // activation, first-login password change and PROJECT_ONLY provenance.
    const { data: snapshot, error: snapshotError } = await client.rpc(
      "project_phase8_student_snapshot_v2", { p_student_id: student.id },
    );
    if (snapshotError || !snapshot || snapshot.project_only !== true ||
        snapshot.verified_institutionally !== false ||
        snapshot.data_origin !== "GENERATED_PROJECT" ||
        snapshot.student_number !== student.student_number ||
        !snapshot.curriculum_code) return UNAVAILABLE;

    // The provenance table deliberately denies direct SELECT even to the
    // application's service-role client. Use its owner-checked read contract.
    const { data: provenance, error: provenanceError } = await client.rpc(
      "project_phase8_student_portal_status_v1", { p_student_id: student.id },
    );
    if (provenanceError || provenance?.project_only !== true ||
        provenance?.verified_institutionally !== false ||
        provenance?.curriculum_is_official !== false ||
        provenance?.curriculum_code !== snapshot.curriculum_code) {
      return UNAVAILABLE;
    }

    // Fetch every subject belonging to the student's assigned curriculum.
    // The current-term eligibility array in the snapshot is only one term.
    const { data: curriculumRows, error: curriculumError } = await admin
      .from("curriculum_subjects")
      .select("subject_code,year_level_number,semester,display_order,is_required,units_override")
      .eq("curriculum_code", snapshot.curriculum_code)
      .order("year_level_number", { ascending: true })
      .order("semester", { ascending: true })
      .order("display_order", { ascending: true });
    if (curriculumError || !curriculumRows?.length) return UNAVAILABLE;
    const codes = [...new Set(curriculumRows.map((row) => row.subject_code))];
    const { data: subjects, error: subjectsError } = await admin.from("subjects")
      .select("code,name,units").in("code", codes);
    if (subjectsError || !subjects || subjects.length !== codes.length) return UNAVAILABLE;
    const byCode = new Map(subjects.map((subject) => [subject.code, subject]));
    const curriculum = curriculumRows.map((row) => ({
      code: row.subject_code,
      name: byCode.get(row.subject_code)?.name ?? row.subject_code,
      units: row.units_override ?? byCode.get(row.subject_code)?.units ?? null,
      yearLevel: row.year_level_number,
      semester: row.semester,
      required: row.is_required,
    }));

    // The official schedule must be read from the same guarded RPC as the
    // official COR. Project simulated confirmation is not official confirmation.
    const { data: enrollments, error: enrollmentError } = await admin
      .from("enrollments").select("id,term_id,confirmed_at")
      .eq("student_id", student.id).eq("status", "CONFIRMED")
      .order("confirmed_at", { ascending: false }).limit(1);
    if (enrollmentError) return UNAVAILABLE;
    let officialSchedule = null;
    if (enrollments?.length && enrollments[0].confirmed_at) {
      const { data: cor, error: corError } = await client.rpc(
        "official_enrollment_cor_v1", { p_enrollment_id: enrollments[0].id },
      );
      if (corError) return UNAVAILABLE;
      if (cor?.official === true && cor.schedule_complete === true &&
          cor.ready_to_print === true && cor.enrollment_id === enrollments[0].id &&
          cor.student_number === student.student_number &&
          Boolean(cor.confirmation_reference) && Boolean(cor.confirmed_at)) {
        officialSchedule = {
          enrollmentId: cor.enrollment_id,
          term: cor.academic_term || cor.term_id,
          reference: cor.confirmation_reference,
          homeBlock: cor.home_block,
          items: Array.isArray(cor.schedule) ? cor.schedule : [],
          subjects: Array.isArray(cor.subjects) ? cor.subjects : [],
        };
      }
    }

    // Keep institutional publications and explicitly accepted project grades
    // in different arrays. Raw generated history never counts toward progress.
    const [publishedResultQuery, creditQuery, acceptedProjectResults, projectTransferDecisions] = await Promise.all([
      admin.from("academic_results")
        .select("subject_code,term_id,units,result_status,official_grade_value,published_grade_import_row_id")
        .eq("student_id", student.id)
        .eq("source_name", "REGISTRAR_VERIFIED_IMPORT")
        .not("published_grade_import_row_id", "is", null),
      admin.from("transfer_credit_evaluations")
        .select("target_subject_code,source_course_name,credited_units,decision_status,evaluator_user_id,decided_at")
        .eq("student_id", student.id)
        .eq("target_curriculum_code", snapshot.curriculum_code)
        .eq("decision_status", "CREDITED"),
      loadAcceptedProjectGradeResults(admin, student.id, snapshot.curriculum_code),
      student.student_type === "TRANSFEREE"
        ? loadValidatedProjectTransferDecisions(admin, student.id, snapshot.curriculum_code)
        : Promise.resolve([]),
    ]);
    if (publishedResultQuery.error || creditQuery.error) return UNAVAILABLE;
    const publishedResults = (publishedResultQuery.data || []).map((row) => ({
      term: row.term_id,
      subject_code: row.subject_code,
      subject_name: byCode.get(row.subject_code)?.name || row.subject_code,
      units: row.units,
      grade: row.official_grade_value,
      result: row.result_status,
    }));
    const approvedCredits = (creditQuery.data || [])
      .filter((row) => row.evaluator_user_id && row.decided_at)
      .map((row) => ({
        target_subject: row.target_subject_code,
        source_course: row.source_course_name,
        credited_units: row.credited_units,
        decision_status: "CREDITED",
      }));
    const projectProfessors = await loadProjectHistoricalProfessors(
      admin, student, snapshot, acceptedProjectResults);
    const projectGrades = acceptedProjectResults.map((row) => ({
      term: row.term_id,
      subject_code: row.subject_code,
      subject_name: byCode.get(row.subject_code)?.name || row.subject_code,
      units: row.units,
      grade: row.grade,
      result: row.result_status,
      acceptedAt: row.accepted_at,
      sourceKind: row.source_kind,
      previousSubjectProfessor: row.term_id === HISTORICAL_TERM_ID
        ? projectProfessors.get(row.subject_code) || null : null,
      professorProvenance: row.term_id === HISTORICAL_TERM_ID &&
        projectProfessors.has(row.subject_code) ? "PROJECT_FICTIONAL_ASSIGNMENT" : null,
    }));

    // Academic records remain readable when enrollment preparation is blocked
    // by pending project grades, unavailable fee data or an unopened window.
    const enrollmentView = await loadStudentEnrollmentForPage();
    const enrollmentReady = enrollmentView.kind === "ready";
    let confirmedProject = enrollmentReady &&
      enrollmentView.simulation?.status === "CONFIRMED_SIMULATION"
      ? enrollmentView.confirmedRegistration : null;
    if (!confirmedProject && provenance.simulation?.status === "CONFIRMED_SIMULATION") {
      const { data: cor, error: corError } = await client.rpc(
        "project_phase8_demonstration_cor_v1", {
          p_simulation_id: provenance.simulation.id,
        });
      if (!corError) {
        confirmedProject = verifyConfirmedProjectRegistrationSnapshot(
          cor, provenance.simulation, snapshot);
      }
    }
    // Source the demonstration timetable from the recorded, owner-checked COR
    // snapshot. Proposed block meetings must never become registered classes.
    const projectSchedule = confirmedProject ? {
      // The immutable confirmed timetable must remain readable even when
      // fresh enrollment preparation or pricing is temporarily unavailable.
      term: enrollmentReady ? enrollmentView.term.label : snapshot.term_id,
      reference: confirmedProject.reference,
      confirmedAt: confirmedProject.confirmedAt,
      registrationSnapshotComplete: true,
      source: confirmedProject.source,
      subjects: confirmedProject.subjects.map((item) => ({
        subject_code: item.code, subject_name: item.name,
        section_id: item.sectionId, units: item.units,
      })),
      items: confirmedProject.subjects.flatMap((item) => item.meetings.map((meeting) => ({
        subject_code: item.code, day_of_week: meeting.day,
        start_time: meeting.start, end_time: meeting.end,
        room: meeting.room, professor: meeting.instructor,
        lecture_lab_type: meeting.component,
      }))),
    } : null;
    // The verified home-block timetable is available before enrollment
    // confirmation, but it is not an immutable registered class selection.
    // Do not silently promote these generated class meetings into a COR.
    let proposedSchedule = null;
    if (snapshot.schedule_validated_for_project === true &&
        enrollmentReady && enrollmentView.timetableReady === true &&
        enrollmentView.student.number === student.student_number &&
        enrollmentView.student.curriculum === snapshot.curriculum_code &&
        enrollmentView.term.id === snapshot.term_id) {
      const prepared = enrollmentView.subjects.filter((item) =>
        item.section && Array.isArray(item.meetings) && item.meetings.length &&
        ["ELIGIBLE", "RETAKE"].includes(item.eligibility));
      if (prepared.length) {
        proposedSchedule = {
          source: "VERIFIED_PROJECT_PROPOSED_TIMETABLE",
          timetableValidated: true,
          term: enrollmentView.term.label,
          homeBlock: enrollmentView.homeBlock,
          subjects: prepared.map((item) => ({
            subject_code: item.code, subject_name: item.name,
            section_code: item.section, units: item.units,
            section_status: item.sectionStatus,
          })),
          items: prepared.flatMap((item) => item.meetings.map((meeting) => ({
            subject_code: item.code, day_of_week: meeting.day,
            start_time: meeting.start, end_time: meeting.end,
            room: meeting.room, professor: meeting.instructor,
            lecture_lab_type: meeting.component,
            status: item.sectionStatus,
          }))),
        };
      }
    }
    return {
      mode: "project",
      snapshot: {
        studentNumber: snapshot.student_number,
        program: snapshot.program_code,
        track: snapshot.program_track_code,
        curriculumCode: snapshot.curriculum_code,
        yearLevel: snapshot.year_level,
        classification: enrollmentReady ? enrollmentView.student.classification : "PENDING_EVALUATION",
        term: snapshot.term_id,
        previousResults: publishedResults,
        acceptedProjectResults: projectGrades,
        transferCredits: approvedCredits,
        projectTransferDecisions,
        projectTransferSummary: summarizeProjectTransferDecisions(projectTransferDecisions),
        eligibility: (enrollmentReady ? enrollmentView.subjects : []).map((subject) => ({
          subject_code: subject.code,
          eligibility: subject.eligibility,
          reason: subject.reason,
        })),
        curriculum,
      },
      officialSchedule,
      projectSchedule,
      proposedSchedule,
    };
  } catch {
    // Missing migrations, expired sessions and SQL read errors fail closed.
    return UNAVAILABLE;
  }
}

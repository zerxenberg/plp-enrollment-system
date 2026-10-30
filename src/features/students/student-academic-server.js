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
const UNAVAILABLE = Object.freeze({ mode: "unavailable" });

// Historical faculty attribution belongs only to this authenticated student's
// accepted fictional grade sources. Never infer it from the student's *current*
// block: a future placement change must not rewrite historical provenance.
async function loadProjectHistoricalProfessors(admin, student, snapshot, acceptedResults) {
  if (!acceptedResults.length || student.student_type !== "CONTINUING_STUDENT" ||
      !snapshot.curriculum_code) return new Map();
  const acceptedTerms = [...new Set(acceptedResults.map((row) => row.term_id).filter(Boolean))];
  if (!acceptedTerms.length) return new Map();

  // The accepted-result loader validates the canonical grade and source ledger,
  // but intentionally returns no batch_id. Re-read only this student's accepted
  // ledger rows and match them to those already verified results. Never use an
  // arbitrary project grade, current placement, or client-provided identity.
  const acceptedKey = (row) => `${row.term_id}|${row.subject_code}`;
  const acceptedByKey = new Map(acceptedResults.map((row) => [acceptedKey(row), row]));
  if (acceptedByKey.size !== acceptedResults.length) return new Map();
  const { data: acceptances, error: acceptanceError } = await admin
    .from("project_grade_result_acceptances")
    .select("result_id,batch_id,student_id,term_id,curriculum_code,subject_code,accepted_at,source_kind")
    .eq("student_id", student.id).eq("curriculum_code", snapshot.curriculum_code)
    .in("term_id", acceptedTerms);
  if (acceptanceError || !acceptances?.length) return new Map();
  const acceptedBatches = new Map();
  for (const row of acceptances) {
    const grade = acceptedByKey.get(acceptedKey(row));
    if (!grade || !row.result_id || !row.batch_id ||
        row.student_id !== student.id || row.curriculum_code !== snapshot.curriculum_code ||
        row.accepted_at !== grade.accepted_at || row.source_kind !== grade.source_kind ||
        acceptedBatches.has(acceptedKey(row))) return new Map();
    acceptedBatches.set(acceptedKey(row), row.batch_id);
  }
  if (acceptedBatches.size !== acceptedResults.length) return new Map();

  const { data: batches, error: batchError } = await admin.from("project_grade_import_batches")
    .select("id,project_cohort_id,block_id,target_term_id,term_id,curriculum_code,previous_block_code,subject_code,source_system,status")
    .in("id", [...new Set(acceptedBatches.values())])
    .eq("project_cohort_id", PROJECT_COHORT).eq("source_system", "PROJECT_ONLY")
    .eq("status", "PUBLISHED_PROJECT");
  if (batchError || !batches?.length) return new Map();
  const byBatchId = new Map(batches.map((row) => [row.id, row]));
  if (byBatchId.size !== new Set(acceptedBatches.values()).size) return new Map();

  const batchForGrade = new Map();
  for (const [gradeKey, batchId] of acceptedBatches) {
    const grade = acceptedByKey.get(gradeKey);
    const batch = byBatchId.get(batchId);
    if (!batch || !batch.block_id || !batch.target_term_id || !batch.previous_block_code ||
        batch.project_cohort_id !== PROJECT_COHORT ||
        batch.term_id !== grade.term_id ||
        batch.subject_code !== grade.subject_code ||
        batch.curriculum_code !== snapshot.curriculum_code ||
        batch.source_system !== "PROJECT_ONLY" || batch.status !== "PUBLISHED_PROJECT") {
      return new Map();
    }
    batchForGrade.set(gradeKey, batch);
  }
  // Validate the historical target block itself, without requiring it to be
  // the student's current home block. It must remain a synthetic project block.
  const blockIds = [...new Set(batches.map((row) => row.block_id))];
  const { data: blocks, error: blockError } = await admin.from("block_sections")
    .select("id,term_id,curriculum_code,is_synthetic_demo").in("id", blockIds);
  if (blockError || blocks?.length !== blockIds.length) return new Map();
  const blocksById = new Map(blocks.map((row) => [row.id, row]));
  if (blocksById.size !== blockIds.length || batches.some((batch) => {
    const block = blocksById.get(batch.block_id);
    return !block || block.is_synthetic_demo !== true ||
      block.term_id !== batch.target_term_id ||
      block.curriculum_code !== batch.curriculum_code;
  })) return new Map();

  const { data: mappings, error: mappingError } = await admin.from("project_historical_subject_instructors")
    .select("target_block_id,subject_code,prior_term_id,previous_block_code,instructor_id,assignment_provenance,verified_institutionally")
    .eq("project_cohort_id", PROJECT_COHORT)
    .eq("curriculum_code", snapshot.curriculum_code)
    .in("target_block_id", blockIds).in("prior_term_id", acceptedTerms)
    .in("subject_code", [...new Set(acceptedResults.map((row) => row.subject_code))]);
  if (mappingError || !mappings?.length) return new Map();
  const mappingKey = (row) =>
    `${row.target_block_id}|${row.prior_term_id}|${row.previous_block_code}|${row.subject_code}`;
  const mapped = new Map();
  for (const row of mappings) {
    const trustedProjectMapping = row.instructor_id &&
      row.assignment_provenance === "PROJECT_FICTIONAL_ASSIGNMENT" &&
      row.verified_institutionally === false;
    if (!trustedProjectMapping) continue;
    const key = mappingKey(row);
    if (mapped.has(key)) return new Map();
    mapped.set(key, row);
  }
  const validMappings = [...batchForGrade.values()].map((batch) => mapped.get(mappingKey({
    target_block_id: batch.block_id,
    prior_term_id: batch.term_id,
    previous_block_code: batch.previous_block_code,
    subject_code: batch.subject_code,
  }))).filter(Boolean);
  if (!validMappings.length) return new Map();
  const { data: instructors, error: instructorError } = await admin.from("instructors")
    .select("id,display_name,app_user_id,is_synthetic_demo,synthetic_source_key")
    .in("id", [...new Set(validMappings.map((row) => row.instructor_id))]);
  if (instructorError || !instructors) return new Map();
  const names = new Map(instructors.filter((item) => item.is_synthetic_demo === true &&
    item.app_user_id == null &&
    typeof item.display_name === "string" && item.display_name.trim() &&
    (item.synthetic_source_key?.startsWith("PROJECT_ONLY_") ||
      item.synthetic_source_key?.startsWith("PHASE8_FICTIONAL_SCHEDULE_V1:FACULTY:")))
    .map((item) => [item.id, item.display_name]));
  return new Map([...batchForGrade].flatMap(([gradeKey, batch]) => {
    const mapping = mapped.get(mappingKey({
      target_block_id: batch.block_id,
      prior_term_id: batch.term_id,
      previous_block_code: batch.previous_block_code,
      subject_code: batch.subject_code,
    }));
    return mapping && names.has(mapping.instructor_id)
      ? [[gradeKey, names.get(mapping.instructor_id)]] : [];
  }));
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
      previousSubjectProfessor: projectProfessors.get(`${row.term_id}|${row.subject_code}`) || null,
      professorProvenance: projectProfessors.has(`${row.term_id}|${row.subject_code}`)
        ? "PROJECT_FICTIONAL_ASSIGNMENT" : null,
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
    let blockSchedule = null;
    if (snapshot.schedule_validated_for_project === true &&
        enrollmentReady && enrollmentView.timetableReady === true &&
        enrollmentView.student.number === student.student_number &&
        enrollmentView.student.curriculum === snapshot.curriculum_code &&
        enrollmentView.term.id === snapshot.term_id) {
      const scheduled = enrollmentView.subjects.filter((item) =>
        item.section && Array.isArray(item.meetings) && item.meetings.length &&
        item.sectionScheduleStatus === "FINALIZED" &&
        ["PLANNED", "OPEN"].includes(item.sectionStatus));
      // A published, validated block timetable can be viewed while grades are
      // pending. It is not a subject proposal, registration or academic credit.
      // Its data comes from the same protected student snapshot and block links.
      if (scheduled.length) {
        blockSchedule = {
          source: "VERIFIED_PROJECT_BLOCK_TIMETABLE",
          timetableValidated: true,
          term: enrollmentView.term.label,
          homeBlock: enrollmentView.homeBlock,
          subjects: scheduled.map((item) => ({
            subject_code: item.code, subject_name: item.name,
            section_code: item.section, units: item.units,
            section_status: item.sectionStatus,
          })),
          items: scheduled.flatMap((item) => item.meetings.map((meeting) => ({
            subject_code: item.code, day_of_week: meeting.day,
            start_time: meeting.start, end_time: meeting.end,
            room: meeting.room, professor: meeting.instructor,
            lecture_lab_type: meeting.component,
          }))),
        };
      }
      const prepared = scheduled.filter((item) =>
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
      blockSchedule,
    };
  } catch {
    // Missing migrations, expired sessions and SQL read errors fail closed.
    return UNAVAILABLE;
  }
}

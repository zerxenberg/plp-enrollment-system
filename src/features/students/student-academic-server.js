import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadStudentProfileForPage } from "@/features/students/student-profile-server";
import { loadStudentEnrollmentForPage } from "./student-enrollment-server";

const PROJECT_COHORT = "PLP_PROJECT_600_2026_1";
const UNAVAILABLE = Object.freeze({ mode: "unavailable" });

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
          term: cor.academic_term || cor.term_id,
          reference: cor.confirmation_reference,
          homeBlock: cor.home_block,
          items: Array.isArray(cor.schedule) ? cor.schedule : [],
          subjects: Array.isArray(cor.subjects) ? cor.subjects : [],
        };
      }
    }

    // Seeded academic histories and generated transfer decisions are not
    // Registrar published or approved evidence. Never elevate them into an
    // academic transcript or completion calculation.
    const [publishedResultQuery, creditQuery] = await Promise.all([
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

    const enrollmentView = await loadStudentEnrollmentForPage();
    if (enrollmentView.kind !== "ready") return UNAVAILABLE;
    return {
      mode: "project",
      snapshot: {
        studentNumber: snapshot.student_number,
        program: snapshot.program_code,
        track: snapshot.program_track_code,
        curriculumCode: snapshot.curriculum_code,
        yearLevel: snapshot.year_level,
        classification: enrollmentView.student.classification,
        term: snapshot.term_id,
        previousResults: publishedResults,
        transferCredits: approvedCredits,
        eligibility: enrollmentView.subjects.map((subject) => ({
          subject_code: subject.code,
          eligibility: subject.eligibility,
          reason: subject.reason,
        })),
        curriculum,
      },
      officialSchedule,
    };
  } catch {
    // Missing migrations, expired sessions and SQL read errors fail closed.
    return UNAVAILABLE;
  }
}

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { readProjectDemonstrationCOR } from "@/features/academic/project-phase8-actions";
import { getOfficialRegistrationData } from "@/features/grade-import/registrar-grade-actions";
import { estimateProjectSelectedSubjects } from "@/features/students/project-fee-estimate.mjs";
import { loadVerifiedProjectSubjectPrices } from "@/features/students/project-fee-prices-server";
import { buildVerifiedCorDocument, verifiedCorStudentSex } from "./cor-document.mjs";
import { verifiedCorSubjectDisplayCodes } from "./cor-subjects.mjs";

async function loadCorSubjectDisplayCodes(admin, subjects) {
  const codes = [...new Set(subjects.map((subject) => subject.subject_code))];
  const { data, error } = await admin.from("subjects")
    .select("code,name").in("code", codes);
  if (error) throw new Error("The COR subject catalog could not be loaded.");
  return verifiedCorSubjectDisplayCodes(subjects, data);
}

async function loadCorStudentSex(admin, cor) {
  const project = cor.simulation_only === true;
  const reference = project ? cor.simulation_id : cor.enrollment_id;
  if (!reference) throw new Error("The COR registration reference is missing.");
  const table = project ? "project_phase8_enrollment_simulations" : "enrollments";
  const registrationResult = await admin.from(table)
    .select(project
      ? "id,student_id,term_id,status,source_provenance,verified_institutionally"
      : "id,student_id,term_id,status")
    .eq("id", reference).maybeSingle();
  const registration = registrationResult.data;
  if (registrationResult.error || !registration?.student_id) {
    throw new Error("The COR registration identity could not be verified.");
  }
  const profileResult = await admin.from("student_profiles")
    .select("id,user_id,student_number,record_kind,project_cohort_id,is_synthetic_demo,synthetic_source_key")
    .eq("id", registration.student_id).maybeSingle();
  const profile = profileResult.data;
  if (profileResult.error || !profile?.user_id) {
    throw new Error("The COR student profile could not be verified.");
  }
  const accountResult = await admin.from("app_users")
    .select("id,role_code,full_name,sex,is_synthetic_demo,source_account_key,project_cohort_id")
    .eq("id", profile.user_id).maybeSingle();
  const account = accountResult.data;
  if (accountResult.error || !account) {
    throw new Error("The COR student account could not be verified.");
  }
  return verifiedCorStudentSex(cor, { registration, profile, account });
}

export async function verifiedProjectCorDocument(cor, suppliedFeeEstimate = null) {
  // Confirm immutable registration first, before accessing privileged pricing.
  buildVerifiedCorDocument(cor);
  const admin = createAdminClient();
  const selection = cor.registered_subjects.map((subject) => ({
    code: subject.subject_code,
    name: subject.subject_name,
    units: subject.academic_units,
  }));
  const projectFeeEstimate = suppliedFeeEstimate || estimateProjectSelectedSubjects(
    selection, await loadVerifiedProjectSubjectPrices(admin, cor.student.curriculum_code, selection));
  const [programResult, subjectDisplayCodes, studentSex] = await Promise.all([
    admin.from("programs").select("code,name")
      .eq("code", cor.student.program_code).maybeSingle(),
    loadCorSubjectDisplayCodes(admin, cor.registered_subjects),
    loadCorStudentSex(admin, cor),
  ]);
  if (programResult.error || !programResult.data?.name ||
      programResult.data.code !== cor.student.program_code) {
    throw new Error("The confirmed student's program could not be verified.");
  }
  return buildVerifiedCorDocument(cor, {
    projectFeeEstimate, programName: programResult.data.name, subjectDisplayCodes, studentSex,
  });
}

export async function registrarProjectCorDocument(simulationId) {
  return verifiedProjectCorDocument(await readProjectDemonstrationCOR(simulationId, "registrar"));
}

export async function officialCorDocument(enrollmentId, role = "registrar") {
  // The protected RPC requires a confirmed enrollment, complete schedule
  // and the correct owner or Registrar business role.
  const cor = await getOfficialRegistrationData(enrollmentId, role);
  // Only after the session-scoped COR RPC authorizes this enrollment, read the
  // matching academic term. Student policies may not expose the term ledger.
  const admin = createAdminClient();
  const [{ data: term, error }, subjectDisplayCodes, studentSex] = await Promise.all([
    admin.from("academic_terms").select("id,label,academic_year,semester")
      .eq("id", cor.term_id).maybeSingle(),
    loadCorSubjectDisplayCodes(admin, cor.subjects),
    loadCorStudentSex(admin, cor),
  ]);
  if (error || !term || term.id !== cor.term_id) {
    throw new Error("The confirmed academic term could not be verified.");
  }
  // The fictional fee ledger does not establish an official university rate.
  return buildVerifiedCorDocument(cor, {
    academicYear: term.academic_year, semester: term.semester, subjectDisplayCodes, studentSex,
  });
}

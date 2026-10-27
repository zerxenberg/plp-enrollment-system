import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { readProjectDemonstrationCOR } from "@/features/academic/project-phase8-actions";
import { getOfficialRegistrationData } from "@/features/grade-import/registrar-grade-actions";
import { estimateProjectSelectedSubjects } from "@/features/students/project-fee-estimate.mjs";
import { loadVerifiedProjectSubjectPrices } from "@/features/students/project-fee-prices-server";
import { buildVerifiedCorDocument } from "./cor-document.mjs";

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
  const programResult = await admin.from("programs")
    .select("code,name").eq("code", cor.student.program_code).maybeSingle();
  if (programResult.error || !programResult.data?.name ||
      programResult.data.code !== cor.student.program_code) {
    throw new Error("The confirmed student's program could not be verified.");
  }
  return buildVerifiedCorDocument(cor, {
    projectFeeEstimate, programName: programResult.data.name,
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
  const { data: term, error } = await createAdminClient().from("academic_terms")
    .select("id,label,academic_year,semester").eq("id", cor.term_id).maybeSingle();
  if (error || !term || term.id !== cor.term_id) {
    throw new Error("The confirmed academic term could not be verified.");
  }
  // The fictional fee ledger does not establish an official university rate.
  return buildVerifiedCorDocument(cor, {
    academicYear: term.academic_year, semester: term.semester,
  });
}

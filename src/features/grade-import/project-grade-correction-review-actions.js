"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const PROJECT_COHORT = "PLP_PROJECT_600_2026_1";
const VALID_DECISIONS = new Set(["APPROVE_IMPORTED", "REJECT_IMPORTED"]);
const trim = (value) => String(value ?? "").trim();

async function readProjectReviewPages(queryFactory, description) {
  const result = [];
  for (let offset = 0; offset < 25000; offset += 500) {
    const query = await queryFactory().range(offset, offset + 499);
    if (query.error || !Array.isArray(query.data)) {
      throw new Error(`Protected ${description} could not be read`);
    }
    result.push(...query.data);
    if (query.data.length < 500) return result;
  }
  throw new Error(`Protected ${description} exceeds the supported review capacity`);
}

async function readProjectReviewChunks(items, queryFactory, description) {
  const results = [];
  for (let start = 0; start < items.length; start += 50) {
    results.push(...await readProjectReviewPages(
      () => queryFactory(items.slice(start, start + 50)), description));
  }
  return results;
}

/** Read only fictional, term-scoped requests for the academic decision owner. */
export async function loadProjectGradeCorrectionReviews() {
  await requireRole("academic-coordinator");
  try {
    const admin = createAdminClient();
    const batches = await readProjectReviewPages(() => admin.from("project_grade_import_batches")
      .select("id,block_id,target_term_id,term_id,previous_block_code,subject_code,source_reference,file_name,source_checksum,status")
      .eq("project_cohort_id", PROJECT_COHORT)
      .eq("source_system", "PROJECT_ONLY").order("id"),
    "project grade source batches");
    if (!batches.length) return { ok: true, data: { requests: [] } };

    const requests = await readProjectReviewChunks(batches.map((item) => item.id), (ids) =>
      admin.from("project_grade_correction_requests")
      .select("id,batch_id,source_row_id,previous_grade,previous_status,proposed_grade,proposed_status,reason,requested_by,requested_at,status,reviewed_at,review_reference")
      .in("batch_id", ids)
      .order("requested_at", { ascending: false }).order("id"),
    "project grade correction requests");
    if (!requests.length) return { ok: true, data: { requests: [] } };

    const sources = await readProjectReviewChunks(requests.map((item) => item.source_row_id), (ids) =>
      admin.from("project_grade_import_rows")
      .select("id,batch_id,source_student_number,validation_status,source_record_reference")
      .in("id", ids).order("id"),
    "project grade correction source rows");
    const byBatch = new Map(batches.map((batch) => [batch.id, batch]));
    const bySource = new Map(sources.map((row) => [row.id, row]));
    const scoped = requests.filter((request) => byBatch.has(request.batch_id) &&
      bySource.has(request.source_row_id) &&
      bySource.get(request.source_row_id).batch_id === request.batch_id);
    return { ok: true, data: { requests: scoped.map((request) => {
      const batch = byBatch.get(request.batch_id);
      const source = bySource.get(request.source_row_id);
      return {
        ...request,
        student_number: source.source_student_number,
        subject_code: batch.subject_code,
        current_block_id: batch.block_id,
        historical_term_id: batch.term_id,
        previous_block_code: batch.previous_block_code,
        source_reference: batch.source_reference,
        source_record_reference: source.source_record_reference,
        source_checksum: batch.source_checksum,
        file_name: batch.file_name,
        batch_status: batch.status,
        source_validation_status: source.validation_status,
      };
    }) } };
  } catch {
    return { ok: false, message: "Protected project grade correction requests could not be loaded." };
  }
}

/**
 * Review is an explicit Academic Coordinator choice, never a Registrar
 * self-approval. The transactional SQL function checks role, project scope,
 * immutable source/old-grade snapshot and writes a project-only audit trail.
 */
export async function decideProjectGradeCorrection(requestId, decision, reason, evidenceReference) {
  await requireRole("academic-coordinator");
  const normalizedDecision = trim(decision);
  const normalizedReason = trim(reason);
  const normalizedEvidence = trim(evidenceReference);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trim(requestId)) ||
      !VALID_DECISIONS.has(normalizedDecision) ||
      normalizedReason.length < 15 || normalizedReason.length > 2000 ||
      normalizedEvidence.length < 8 || normalizedEvidence.length > 240) {
    return { ok: false, message: "Select a valid review decision and provide at least 15 characters of reason and a verified evidence reference." };
  }
  try {
    const client = await createClient();
    let { data, error } = await client.rpc("academic_coordinator_project_grade_decide_v1", {
      p_request_id: trim(requestId),
      p_decision: normalizedDecision,
      p_reason: normalizedReason,
      p_evidence_reference: normalizedEvidence,
    });
    // Preserve the existing BSIT 2A correction contract. The historical
    // generalization is a separate protected RPC that explicitly excludes
    // that published legacy cohort; it runs only when the older scoped RPC
    // rejects a different project's block as ineligible.
    if (error?.code === "23514") {
      ({ data, error } = await client.rpc("academic_coordinator_project_grade_decide_dynamic_v1", {
        p_request_id: trim(requestId),
        p_decision: normalizedDecision,
        p_reason: normalizedReason,
        p_evidence_reference: normalizedEvidence,
      }));
    }
    if (error || data?.official_records_unchanged !== true ||
        !trim(data?.review_reference) ||
        data?.decision_status !== (normalizedDecision === "APPROVE_IMPORTED" ? "APPLIED" : "REJECTED")) {
      return { ok: false, message: "The correction decision was not applied. Check the review evidence, status and permissions." };
    }
    revalidatePath("/academic-coordinator/academic-review");
    revalidatePath("/registrar/students");
    revalidatePath("/student/academic-records");
    revalidatePath("/student/enrollment");
    return {
      ok: true, data,
      message: normalizedDecision === "APPROVE_IMPORTED"
        ? "Project-only historical grade correction approved and audited. The Registrar may now verify the reconciled source."
        : "Project-only correction rejected and audited. The Registrar can cancel this source batch and upload a corrected workbook.",
    };
  } catch {
    return { ok: false, message: "The protected project grade review is unavailable." };
  }
}

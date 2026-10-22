-- Additive-only grade and transfer provenance, no changes to original grades.
SET lock_timeout = '3s';
DO $new_table_guard$
BEGIN
  IF to_regclass('public.grade_import_batches') IS NOT NULL OR
     to_regclass('public.grade_import_rows') IS NOT NULL OR
     to_regclass('public.academic_result_revisions') IS NOT NULL OR
     to_regclass('public.transfer_credit_evaluations') IS NOT NULL THEN
    RAISE EXCEPTION 'Grade-transfer migration requires an absent-table baseline';
  END IF;
END
$new_table_guard$;
DO $preflight$
DECLARE expected record;
BEGIN
  FOR expected IN
    SELECT * FROM (VALUES
      ('app_users', 'id', 'uuid'),
      ('student_profiles', 'id', 'uuid'),
      ('academic_terms', 'id', 'text'),
      ('subjects', 'code', 'text'),
      ('curricula', 'code', 'text'),
      ('sections', 'id', 'uuid'),
      ('enrollments', 'id', 'uuid'),
      ('academic_results', 'id', 'uuid'),
      ('enrollment_subjects', 'enrollment_id', 'uuid'),
      ('enrollment_subjects', 'subject_code', 'text'),
      ('curriculum_subjects', 'curriculum_code', 'text'),
      ('curriculum_subjects', 'subject_code', 'text')
    ) AS columns_to_check(table_name, column_name, required_data_type)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = expected.table_name
        AND c.column_name = expected.column_name
        AND c.data_type = expected.required_data_type
    ) THEN
      RAISE EXCEPTION 'Baseline FK prerequisite differs: %.% requires %',
        expected.table_name, expected.column_name, expected.required_data_type;
    END IF;
  END LOOP;
END
$preflight$;

-- File checksum is scoped by academic term and source system, allowing reuse
-- of an identical template in another term but rejecting duplicate uploads
-- for a given source/term. A publication must be verified transactionally.
-- Statuses follow the existing Registrar grade-import workflow vocabulary.
CREATE TABLE IF NOT EXISTS public.grade_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id text NOT NULL REFERENCES public.academic_terms(id) ON DELETE RESTRICT,
  subject_code text NOT NULL REFERENCES public.subjects(code) ON DELETE RESTRICT,
  section_id uuid REFERENCES public.sections(id) ON DELETE RESTRICT,
  source_system text NOT NULL,
  source_reference text NOT NULL,
  issuer text NOT NULL,
  file_name text NOT NULL,
  source_checksum text NOT NULL,
  row_count integer NOT NULL CHECK (row_count > 0),
  status text NOT NULL DEFAULT 'UPLOADED' CHECK (status IN (
    'UPLOADED', 'PENDING_VERIFICATION', 'VALIDATED',
    'REQUIRES_CORRECTION', 'PUBLISHED', 'CANCELLED', 'FAILED'
  )),
  uploaded_by_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  validated_at timestamptz,
  verified_by uuid REFERENCES public.app_users(id) ON DELETE RESTRICT,
  verification_method text,
  verified_checksum_sha256 text,
  verified_at timestamptz,
  published_by_user_id uuid REFERENCES public.app_users(id) ON DELETE RESTRICT,
  published_at timestamptz,
  publication_reference text UNIQUE,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grade_import_batches_sha256_format CHECK (
    source_checksum ~ '^[0-9a-f]{64}$'
    AND (verified_checksum_sha256 IS NULL
         OR verified_checksum_sha256 ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT grade_import_batches_source_nonblank CHECK (
    length(btrim(source_system)) > 0 AND length(btrim(source_reference)) > 0
    AND length(btrim(issuer)) > 0 AND length(btrim(file_name)) > 0
  ),
  CONSTRAINT grade_import_batches_verification_gate CHECK (
    status NOT IN ('VALIDATED', 'PUBLISHED')
    OR (validated_at IS NOT NULL AND verified_by IS NOT NULL
        AND verified_at IS NOT NULL
        AND length(btrim(coalesce(verification_method, ''))) > 0
        AND verified_checksum_sha256 IS NOT NULL
        AND verified_checksum_sha256 = source_checksum)
  ),
  CONSTRAINT grade_import_batches_publication_gate CHECK (
    status <> 'PUBLISHED' OR
    (published_by_user_id IS NOT NULL AND published_at IS NOT NULL
     AND length(btrim(coalesce(publication_reference, ''))) > 0)
  ),
  CONSTRAINT grade_import_batches_cancel_reason CHECK (
    status <> 'CANCELLED'
    OR length(btrim(coalesce(cancellation_reason, ''))) > 0
  ),
  CONSTRAINT grade_import_batches_content_dedupe
    UNIQUE (term_id, source_system, source_checksum)
);
CREATE INDEX IF NOT EXISTS grade_import_batches_subject_term_idx
  ON public.grade_import_batches (subject_code, term_id, status);
CREATE INDEX IF NOT EXISTS grade_import_batches_uploader_idx
  ON public.grade_import_batches (uploaded_by_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS grade_import_batches_verifier_idx
  ON public.grade_import_batches (verified_by) WHERE verified_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS grade_import_batches_publisher_idx
  ON public.grade_import_batches (published_by_user_id) WHERE published_by_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS grade_import_batches_section_idx
  ON public.grade_import_batches (section_id) WHERE section_id IS NOT NULL;

-- Parsed rows stay staging records until an independently authorized Registrar
-- publication transaction checks student identity, completed attempt, source,
-- matching term/subject/section, exact checksum and no existing publication.
-- Raw source fields remain separate from nullable resolved FK references.
CREATE TABLE IF NOT EXISTS public.grade_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.grade_import_batches(id) ON DELETE RESTRICT,
  source_row_number integer NOT NULL CHECK (source_row_number >= 1),
  source_student_number text NOT NULL,
  source_student_name text,
  source_subject_code text NOT NULL,
  source_section_code text,
  source_record_reference text NOT NULL,
  raw_grade_text text NOT NULL,
  normalized_grade numeric(6,3),
  completion_status text CHECK (
    completion_status IN ('COMPLETED', 'FAILED', 'INCOMPLETE', 'CREDITED')
  ),
  student_id uuid REFERENCES public.student_profiles(id) ON DELETE RESTRICT,
  subject_code text REFERENCES public.subjects(code) ON DELETE RESTRICT,
  curriculum_code text REFERENCES public.curricula(code) ON DELETE RESTRICT,
  section_id uuid REFERENCES public.sections(id) ON DELETE RESTRICT,
  enrollment_id uuid REFERENCES public.enrollments(id) ON DELETE RESTRICT,
  published_result_id uuid REFERENCES public.academic_results(id) ON DELETE RESTRICT,
  CONSTRAINT grade_import_rows_confirmed_subject_fk
    FOREIGN KEY (enrollment_id, subject_code)
    REFERENCES public.enrollment_subjects(enrollment_id, subject_code)
    ON DELETE RESTRICT,
  validation_status text NOT NULL DEFAULT 'PENDING' CHECK (
    validation_status IN ('PENDING', 'VALID', 'INVALID', 'PUBLISHED')
  ),
  error_details jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(error_details) = 'array'),
  original_row jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(original_row) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grade_import_rows_row_identity UNIQUE (batch_id, source_row_number),
  CONSTRAINT grade_import_rows_raw_fields_nonblank CHECK (
    length(btrim(source_student_number)) > 0
    AND length(btrim(source_subject_code)) > 0
    AND length(btrim(source_record_reference)) > 0
    AND length(btrim(raw_grade_text)) > 0
  ),
  CONSTRAINT grade_import_rows_published_resolution CHECK (
    validation_status <> 'PUBLISHED'
    OR (student_id IS NOT NULL AND subject_code IS NOT NULL
        AND completion_status IS NOT NULL AND published_result_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS grade_import_rows_batch_status_idx
  ON public.grade_import_rows (batch_id, validation_status);
CREATE INDEX IF NOT EXISTS grade_import_rows_student_subject_idx
  ON public.grade_import_rows (student_id, subject_code)
  WHERE student_id IS NOT NULL AND subject_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS grade_import_rows_curriculum_idx
  ON public.grade_import_rows (curriculum_code) WHERE curriculum_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS grade_import_rows_section_idx
  ON public.grade_import_rows (section_id) WHERE section_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS grade_import_rows_enrollment_idx
  ON public.grade_import_rows (enrollment_id) WHERE enrollment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS grade_import_rows_result_idx
  ON public.grade_import_rows (published_result_id) WHERE published_result_id IS NOT NULL;

-- Append-oriented revision evidence for an already existing academic_results
-- row. This draft defines storage, not the correction/publishing authority.
-- Existing result rows are NOT modified or automatically reclassified.
CREATE TABLE IF NOT EXISTS public.academic_result_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_result_id uuid NOT NULL REFERENCES public.academic_results(id) ON DELETE RESTRICT,
  grade_import_row_id uuid REFERENCES public.grade_import_rows(id) ON DELETE RESTRICT,
  revision_number integer NOT NULL CHECK (revision_number >= 1),
  prior_value jsonb NOT NULL CHECK (jsonb_typeof(prior_value) = 'object'),
  revised_value jsonb NOT NULL CHECK (jsonb_typeof(revised_value) = 'object'),
  source_record_reference text NOT NULL,
  verification_method text NOT NULL,
  reason text NOT NULL,
  authorized_by uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  amended_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academic_result_revisions_version UNIQUE (
    academic_result_id, revision_number
  ),
  CONSTRAINT academic_result_revisions_evidence_nonblank CHECK (
    length(btrim(source_record_reference)) > 0
    AND length(btrim(verification_method)) > 0
    AND length(btrim(reason)) > 0
  ),
  CONSTRAINT academic_result_revisions_material_change CHECK (
    prior_value IS DISTINCT FROM revised_value
  )
);
CREATE INDEX IF NOT EXISTS academic_result_revisions_recent_idx
  ON public.academic_result_revisions (amended_at DESC);
CREATE INDEX IF NOT EXISTS academic_result_revisions_actor_idx
  ON public.academic_result_revisions (authorized_by);
CREATE INDEX IF NOT EXISTS academic_result_revisions_row_idx
  ON public.academic_result_revisions (grade_import_row_id)
  WHERE grade_import_row_id IS NOT NULL;

-- The admission/transcript evaluation is separate from grade imports and
-- does not itself publish a CREDITED result or approve admission/enrollment.
CREATE TABLE IF NOT EXISTS public.transfer_credit_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.student_profiles(id) ON DELETE RESTRICT,
  target_curriculum_code text NOT NULL REFERENCES public.curricula(code) ON DELETE RESTRICT,
  target_subject_code text NOT NULL REFERENCES public.subjects(code) ON DELETE RESTRICT,
  source_institution text NOT NULL,
  external_subject_reference text NOT NULL,
  source_course_name text,
  evidence_reference text NOT NULL,
  requested_units numeric(6,2) CHECK (requested_units >= 0),
  credited_units numeric(6,2) CHECK (credited_units >= 0),
  decision_status text NOT NULL DEFAULT 'PENDING' CHECK (
    decision_status IN ('PENDING', 'CREDITED', 'DENIED', 'REQUIRES_REVIEW')
  ),
  recorded_by_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  evaluator_user_id uuid REFERENCES public.app_users(id) ON DELETE RESTRICT,
  decision_reason text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transfer_credit_evaluations_source_nonblank CHECK (
    length(btrim(source_institution)) > 0
    AND length(btrim(external_subject_reference)) > 0
    AND length(btrim(evidence_reference)) > 0
  ),
  CONSTRAINT transfer_credit_evaluations_decision_evidence CHECK (
    decision_status NOT IN ('CREDITED', 'DENIED')
    OR (evaluator_user_id IS NOT NULL AND decided_at IS NOT NULL
        AND length(btrim(coalesce(decision_reason, ''))) > 0)
  ),
  CONSTRAINT transfer_credit_evaluations_source_identity UNIQUE (
    student_id, target_curriculum_code, target_subject_code, evidence_reference
  ),
  CONSTRAINT transfer_credit_evaluations_curriculum_subject_fk
    FOREIGN KEY (target_curriculum_code, target_subject_code)
    REFERENCES public.curriculum_subjects(curriculum_code, subject_code)
    ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS transfer_credit_evaluations_student_status_idx
  ON public.transfer_credit_evaluations (student_id, decision_status);
CREATE INDEX IF NOT EXISTS transfer_credit_evaluations_curriculum_subject_idx
  ON public.transfer_credit_evaluations (target_curriculum_code, target_subject_code);
CREATE INDEX IF NOT EXISTS transfer_credit_evaluations_recorded_by_idx
  ON public.transfer_credit_evaluations (recorded_by_user_id);
CREATE INDEX IF NOT EXISTS transfer_credit_evaluations_decided_by_idx
  ON public.transfer_credit_evaluations (evaluator_user_id)
  WHERE evaluator_user_id IS NOT NULL;

-- Keep this layer inaccessible to anon and authenticated clients. Subsequent
-- authorized server/RPC work must provide role checks, append-only history,
-- controlled state transitions, atomic publication, and grade eligibility
-- recalculation. No table access GRANTs or RLS policies are included.
ALTER TABLE public.grade_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_result_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfer_credit_evaluations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.grade_import_batches, public.grade_import_rows,
  public.academic_result_revisions, public.transfer_credit_evaluations
  FROM PUBLIC, anon, authenticated;


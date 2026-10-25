-- Additive project-cohort progression rules and authenticated submission gate.
-- Rollback: DROP TRIGGER project_enrollment_published_grade_gate ON
-- public.project_phase8_enrollment_simulations; DROP FUNCTION
-- public.project_enrollment_published_grade_gate_v1(); DROP TABLE
-- public.project_enrollment_academic_policy; never remove student records.
CREATE TABLE IF NOT EXISTS public.project_enrollment_academic_policy (
  project_cohort_id text PRIMARY KEY,
  maximum_unresolved_failed_subjects smallint NOT NULL DEFAULT 3
    CHECK (maximum_unresolved_failed_subjects BETWEEN 0 AND 20),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_enrollment_academic_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_enrollment_academic_policy FROM PUBLIC, anon, authenticated;
INSERT INTO public.project_enrollment_academic_policy
  (project_cohort_id,maximum_unresolved_failed_subjects)
VALUES ('PLP_PROJECT_600_2026_1',3)
ON CONFLICT (project_cohort_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.project_enrollment_published_grade_gate_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_student public.student_profiles%ROWTYPE;
  v_previous public.enrollments%ROWTYPE;
  v_required integer;
  v_missing integer;
  v_failures integer;
  v_threshold integer;
BEGIN
  IF NEW.status NOT IN ('SUBMITTED','VALIDATED','CONFIRMED_SIMULATION') THEN
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'Authenticated academic action is required'
      USING ERRCODE='42501';
  END IF;
  IF (NEW.status='SUBMITTED' AND public.current_role_code() IS DISTINCT FROM 'student')
     OR (NEW.status IN ('VALIDATED','CONFIRMED_SIMULATION')
       AND public.current_role_code() IS DISTINCT FROM 'registrar') THEN
    RAISE EXCEPTION 'The requested enrollment transition requires the owning role'
      USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_student FROM public.student_profiles
  WHERE id=NEW.student_id AND record_kind='PROJECT_ONLY'
    AND project_cohort_id='PLP_PROJECT_600_2026_1';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verified project academic placement is required'
      USING ERRCODE='23514';
  END IF;
  SELECT maximum_unresolved_failed_subjects INTO v_threshold
  FROM public.project_enrollment_academic_policy
  WHERE project_cohort_id=v_student.project_cohort_id;
  IF v_threshold IS NULL THEN
    RAISE EXCEPTION 'Project academic progression policy is not configured'
      USING ERRCODE='23514';
  END IF;
  IF v_student.student_type='CONTINUING_STUDENT' THEN
    SELECT * INTO v_previous FROM public.enrollments
    WHERE student_id=NEW.student_id AND status='CONFIRMED'
      AND term_id<>NEW.term_id
    ORDER BY confirmed_at DESC NULLS LAST LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Confirmed previous semester enrollment is required before continuing enrollment'
        USING ERRCODE='23514';
    END IF;
    SELECT count(*) INTO v_required FROM
      (SELECT DISTINCT subject_code FROM public.enrollment_subjects
       WHERE enrollment_id=v_previous.id AND registration_status='CONFIRMED') expected;
    IF v_required=0 THEN
      RAISE EXCEPTION 'Registered previous semester subject attempts are missing'
        USING ERRCODE='23514';
    END IF;
    SELECT count(*) INTO v_missing
    FROM (SELECT DISTINCT subject_code FROM public.enrollment_subjects
          WHERE enrollment_id=v_previous.id AND registration_status='CONFIRMED') expected
    WHERE NOT EXISTS (
      SELECT 1 FROM public.academic_results a
      JOIN public.grade_import_rows r ON r.id=a.published_grade_import_row_id
      JOIN public.grade_import_batches b ON b.id=r.batch_id AND b.status='PUBLISHED'
      WHERE a.student_id=NEW.student_id AND a.term_id=v_previous.term_id
        AND a.subject_code=expected.subject_code
        AND a.source_name='REGISTRAR_VERIFIED_IMPORT'
        AND a.result_status IN ('COMPLETED','FAILED')
    );
    IF v_missing>0 THEN
      RAISE EXCEPTION 'Missing published previous semester academic results: %',v_missing
        USING ERRCODE='23514';
    END IF;
    SELECT count(*) INTO v_failures FROM (
      SELECT DISTINCT ON (a.subject_code) a.subject_code,a.result_status
      FROM public.academic_results a
      JOIN public.grade_import_rows r ON r.id=a.published_grade_import_row_id
      JOIN public.grade_import_batches b ON b.id=r.batch_id AND b.status='PUBLISHED'
      WHERE a.student_id=NEW.student_id AND a.source_name='REGISTRAR_VERIFIED_IMPORT'
      ORDER BY a.subject_code,a.updated_at DESC,a.created_at DESC,a.id DESC
    ) latest
    WHERE result_status='FAILED';
    IF v_failures>v_threshold THEN
      RAISE EXCEPTION 'Unresolved failed requirements exceed the configured limit'
        USING ERRCODE='23514';
    END IF;
  ELSIF v_student.student_type='TRANSFEREE' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.transfer_credit_evaluations t
      WHERE t.student_id=NEW.student_id
        AND t.decision_status='CREDITED'
        AND t.decided_at IS NOT NULL AND t.evaluator_user_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Approved recorded transfer credit evaluation is required'
        USING ERRCODE='23514';
    END IF;
  ELSIF v_student.student_type IS DISTINCT FROM 'NEW_STUDENT' THEN
    RAISE EXCEPTION 'Unsupported student admission type' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.project_enrollment_published_grade_gate_v1()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS project_enrollment_published_grade_gate
  ON public.project_phase8_enrollment_simulations;
CREATE TRIGGER project_enrollment_published_grade_gate
BEFORE INSERT OR UPDATE OF status
ON public.project_phase8_enrollment_simulations
FOR EACH ROW EXECUTE FUNCTION public.project_enrollment_published_grade_gate_v1();

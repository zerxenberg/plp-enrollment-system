-- Phase 8: trusted Registrar grade pipeline and authoritative COR source.
-- Additive only. No historical grades, account records, or enrollments are changed.
SET lock_timeout = '3s';
DO $compat$
BEGIN
 IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
   RAISE EXCEPTION 'Expected postgres schema migration identity';
 END IF;
 IF to_regclass('public.grade_import_batches') IS NULL
    OR to_regclass('public.grade_import_rows') IS NULL
    OR to_regclass('public.academic_results') IS NULL
    OR to_regclass('public.enrollments') IS NULL
    OR to_regprocedure('public.current_role_code()') IS NULL THEN
   RAISE EXCEPTION 'Grade import foundation or signed-role resolver missing';
 END IF;
END $compat$;

ALTER TABLE public.academic_results
  ADD COLUMN IF NOT EXISTS official_grade_value numeric(6,3),
  ADD COLUMN IF NOT EXISTS published_grade_import_row_id uuid;
DO $constraint$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.academic_results'::regclass
    AND conname='academic_results_grade_import_row_fk') THEN
  ALTER TABLE public.academic_results
   ADD CONSTRAINT academic_results_grade_import_row_fk
   FOREIGN KEY (published_grade_import_row_id) REFERENCES public.grade_import_rows(id)
   ON DELETE RESTRICT;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.academic_results'::regclass
    AND conname='academic_results_grade_value_nonnegative') THEN
  ALTER TABLE public.academic_results
   ADD CONSTRAINT academic_results_grade_value_nonnegative
   CHECK (official_grade_value IS NULL OR official_grade_value >= 0);
 END IF;
END $constraint$;
CREATE UNIQUE INDEX IF NOT EXISTS academic_results_import_source_unique
 ON public.academic_results(published_grade_import_row_id)
 WHERE published_grade_import_row_id IS NOT NULL;

-- No direct table grants. Each SECURITY DEFINER endpoint checks a signed active
-- Registrar through current_role_code(), not mutable JWT user_metadata.
CREATE OR REPLACE FUNCTION public.registrar_stage_grade_batch_v1(
  p_term_id text, p_subject_code text, p_section_id uuid,
  p_source_system text, p_source_reference text, p_issuer text,
  p_file_name text, p_checksum text, p_rows jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = '' AS $fn$
DECLARE v_actor uuid; v_batch uuid; v_count int;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated'
    OR auth.uid() IS NULL OR public.current_role_code() IS DISTINCT FROM 'registrar' THEN
   RAISE EXCEPTION 'Registrar authentication required' USING ERRCODE='42501';
 END IF;
 SELECT id INTO STRICT v_actor FROM public.app_users
  WHERE auth_user_id=auth.uid() AND role_code='registrar'
    AND account_status='Active' AND login_enabled;
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'Expected an array of verified source rows';
 END IF;
 v_count := jsonb_array_length(p_rows);
 IF v_count < 1 OR v_count > 1500 THEN
   RAISE EXCEPTION 'Grade batch row count outside 1 to 1500';
 END IF;
 IF p_checksum !~ '^[0-9a-f]{64}$' OR
    length(btrim(coalesce(p_source_reference,'')))=0 OR
    length(btrim(coalesce(p_issuer,'')))=0 THEN
   RAISE EXCEPTION 'A source digest, reference and issuer are required';
 END IF;
 IF EXISTS (
   SELECT 1 FROM jsonb_array_elements(p_rows) AS e(j)
   WHERE jsonb_typeof(j) <> 'object'
     OR btrim(coalesce(j->>'student_number',''))=''
     OR btrim(coalesce(j->>'subject_code',''))<>p_subject_code
     OR btrim(coalesce(j->>'grade_value',''))=''
     OR btrim(coalesce(j->>'source_record_reference',''))=''
 ) THEN
   RAISE EXCEPTION 'Source rows contain missing or mismatched required fields';
 END IF;
 INSERT INTO public.grade_import_batches(
  term_id,subject_code,section_id,source_system,source_reference,issuer,
  file_name,source_checksum,row_count,uploaded_by_user_id
 ) VALUES (
  p_term_id,p_subject_code,p_section_id,p_source_system,p_source_reference,
  p_issuer,p_file_name,p_checksum,v_count,v_actor
 ) RETURNING id INTO v_batch;
 INSERT INTO public.grade_import_rows (
  batch_id,source_row_number,source_student_number,source_student_name,
  source_subject_code,source_section_code,source_record_reference,
  raw_grade_text,normalized_grade,completion_status,original_row
 )
 SELECT v_batch,ord::integer, btrim(j->>'student_number'),
   nullif(btrim(coalesce(j->>'student_full_name','')),''),
   btrim(j->>'subject_code'),
   nullif(btrim(coalesce(j->>'section_code','')),''),
   btrim(j->>'source_record_reference'),
   btrim(j->>'grade_value'),
   CASE WHEN btrim(j->>'grade_value') ~ '^[0-9]+(\\.[0-9]{1,3})?$'
      THEN (j->>'grade_value')::numeric ELSE NULL END,
   CASE WHEN upper(btrim(coalesce(j->>'completion_status',''))) IN
     ('COMPLETED','FAILED','INCOMPLETE','CREDITED')
     THEN upper(btrim(j->>'completion_status')) ELSE NULL END,
   j
 FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS e(j,ord);
 RETURN v_batch;
END $fn$;

-- Revalidation is idempotent and never alters an official academic result.
CREATE OR REPLACE FUNCTION public.registrar_validate_grade_batch_v1(p_batch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = '' AS $fn$
DECLARE v_batch public.grade_import_batches%ROWTYPE; v_row record;
        v_profile uuid; v_enrollment uuid; v_curriculum text;
        v_section uuid; v_valid integer:=0; v_invalid integer:=0;
        v_issue text; v_status text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated'
    OR auth.uid() IS NULL OR public.current_role_code() IS DISTINCT FROM 'registrar' THEN
   RAISE EXCEPTION 'Registrar authentication required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO STRICT v_batch FROM public.grade_import_batches
  WHERE id=p_batch_id FOR UPDATE;
 IF v_batch.status NOT IN ('UPLOADED','REQUIRES_CORRECTION','PENDING_VERIFICATION') THEN
   RAISE EXCEPTION 'Batch is not in a stage eligible for validation';
 END IF;
 FOR v_row IN SELECT * FROM public.grade_import_rows
             WHERE batch_id=p_batch_id ORDER BY source_row_number FOR UPDATE LOOP
  v_issue:=NULL; v_profile:=NULL; v_enrollment:=NULL; v_curriculum:=NULL; v_section:=NULL;
  v_status:=v_row.completion_status;
  SELECT id INTO v_profile FROM public.student_profiles
   WHERE student_number=v_row.source_student_number;
  IF v_profile IS NULL THEN v_issue:='UNKNOWN_STUDENT';
  ELSIF v_row.source_subject_code <> v_batch.subject_code THEN
   v_issue:='SUBJECT_MISMATCH';
  ELSIF v_status IS NULL OR (v_row.normalized_grade IS NULL
           AND upper(v_row.raw_grade_text) NOT IN ('INC','INCOMPLETE')) THEN
   v_issue:='GRADE_OR_STATUS_UNRECOGNIZED';
  ELSIF v_status='CREDITED' THEN
   v_issue:='TRANSFER_CREDIT_REQUIRES_SEPARATE_EVALUATION';
  ELSE
    SELECT e.id,e.curriculum_code,es.section_id
      INTO v_enrollment,v_curriculum,v_section
      FROM public.enrollments e
      JOIN public.enrollment_subjects es
        ON es.enrollment_id=e.id AND es.subject_code=v_batch.subject_code
      WHERE e.student_id=v_profile AND e.term_id=v_batch.term_id
        AND e.status='CONFIRMED'
        AND es.registration_status='CONFIRMED'
        AND (v_batch.section_id IS NULL OR es.section_id=v_batch.section_id)
      LIMIT 1;
    IF v_enrollment IS NULL THEN v_issue:='CONFIRMED_ATTEMPT_MISSING';
    ELSIF EXISTS (SELECT 1 FROM public.academic_results ar
                 WHERE ar.student_id=v_profile AND ar.subject_code=v_batch.subject_code
                   AND ar.term_id=v_batch.term_id) THEN
      v_issue:='OFFICIAL_RESULT_ALREADY_EXISTS';
    END IF;
  END IF;
  UPDATE public.grade_import_rows SET
    student_id=CASE WHEN v_issue IS NULL THEN v_profile ELSE NULL END,
    subject_code=CASE WHEN v_issue IS NULL THEN v_batch.subject_code ELSE NULL END,
    curriculum_code=CASE WHEN v_issue IS NULL THEN v_curriculum ELSE NULL END,
    section_id=CASE WHEN v_issue IS NULL THEN v_section ELSE NULL END,
    enrollment_id=CASE WHEN v_issue IS NULL THEN v_enrollment ELSE NULL END,
    validation_status=CASE WHEN v_issue IS NULL THEN 'VALID' ELSE 'INVALID' END,
    error_details=CASE WHEN v_issue IS NULL THEN '[]'::jsonb
      ELSE jsonb_build_array(v_issue) END
  WHERE id=v_row.id;
  IF v_issue IS NULL THEN v_valid:=v_valid+1; ELSE v_invalid:=v_invalid+1; END IF;
 END LOOP;
 UPDATE public.grade_import_batches
 SET status=CASE WHEN v_invalid=0 THEN 'PENDING_VERIFICATION'
                 ELSE 'REQUIRES_CORRECTION' END,
     validated_at=CASE WHEN v_invalid=0 THEN clock_timestamp() ELSE NULL END,
     verified_by=NULL,verified_at=NULL,verification_method=NULL,
     verified_checksum_sha256=NULL
 WHERE id=p_batch_id;
 RETURN jsonb_build_object('valid_rows',v_valid,'invalid_rows',v_invalid,
                           'ready_for_source_verification',v_invalid=0);
END $fn$;

CREATE OR REPLACE FUNCTION public.registrar_verify_grade_batch_v1(
 p_batch_id uuid,p_source_reference text,p_checksum text,p_method text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = '' AS $fn$
DECLARE v_actor uuid; v_batch public.grade_import_batches%ROWTYPE;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated'
    OR auth.uid() IS NULL OR public.current_role_code() IS DISTINCT FROM 'registrar' THEN
   RAISE EXCEPTION 'Registrar authentication required' USING ERRCODE='42501';
 END IF;
 SELECT id INTO STRICT v_actor FROM public.app_users
   WHERE auth_user_id=auth.uid() AND role_code='registrar'
     AND account_status='Active' AND login_enabled;
 SELECT * INTO STRICT v_batch FROM public.grade_import_batches
   WHERE id=p_batch_id FOR UPDATE;
 IF v_batch.status <> 'PENDING_VERIFICATION' OR
    p_source_reference IS DISTINCT FROM v_batch.source_reference OR
    p_checksum IS DISTINCT FROM v_batch.source_checksum OR
    btrim(coalesce(p_method,''))='' OR
    (SELECT count(*) FROM public.grade_import_rows WHERE batch_id=p_batch_id
      AND validation_status='VALID') <> v_batch.row_count THEN
   RAISE EXCEPTION 'Source verification or row validation incomplete';
 END IF;
 UPDATE public.grade_import_batches SET status='VALIDATED',
  verified_by=v_actor,verified_at=clock_timestamp(),
  verification_method=btrim(p_method),
  verified_checksum_sha256=p_checksum,validated_at=coalesce(validated_at,clock_timestamp())
 WHERE id=p_batch_id;
 RETURN true;
END $fn$;

CREATE OR REPLACE FUNCTION public.registrar_publish_grade_batch_v1(p_batch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = '' AS $fn$
DECLARE v_actor uuid; v_batch public.grade_import_batches%ROWTYPE;
  v_row record; v_result uuid; v_count int:=0; v_units smallint;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated'
    OR auth.uid() IS NULL OR public.current_role_code() IS DISTINCT FROM 'registrar' THEN
   RAISE EXCEPTION 'Registrar authentication required' USING ERRCODE='42501';
 END IF;
 SELECT id INTO STRICT v_actor FROM public.app_users
   WHERE auth_user_id=auth.uid() AND role_code='registrar'
    AND account_status='Active' AND login_enabled;
 SELECT * INTO STRICT v_batch FROM public.grade_import_batches
   WHERE id=p_batch_id FOR UPDATE;
 IF v_batch.status='PUBLISHED' THEN
   RETURN jsonb_build_object('published',true,'reference',v_batch.publication_reference,
      'idempotent',true);
 END IF;
 IF v_batch.status <> 'VALIDATED' OR v_batch.verified_checksum_sha256<>v_batch.source_checksum
   OR v_batch.verified_at IS NULL THEN
   RAISE EXCEPTION 'Source has not been verified';
 END IF;
 IF (SELECT count(*) FROM public.grade_import_rows WHERE batch_id=p_batch_id
   AND validation_status='VALID')<>v_batch.row_count THEN
   RAISE EXCEPTION 'Incomplete row validation';
 END IF;
 FOR v_row IN SELECT * FROM public.grade_import_rows
  WHERE batch_id=p_batch_id ORDER BY source_row_number FOR UPDATE LOOP
  -- Recheck eligibility under the publication lock, including changes after validation.
  IF NOT EXISTS (
    SELECT 1 FROM public.enrollments e
    JOIN public.enrollment_subjects es
     ON es.enrollment_id=e.id AND es.subject_code=v_row.subject_code
    WHERE e.id=v_row.enrollment_id AND e.student_id=v_row.student_id
      AND e.term_id=v_batch.term_id AND e.status='CONFIRMED'
      AND es.registration_status='CONFIRMED'
      AND (v_batch.section_id IS NULL OR es.section_id=v_batch.section_id)
  ) OR EXISTS (
     SELECT 1 FROM public.academic_results a
     WHERE a.student_id=v_row.student_id AND a.term_id=v_batch.term_id
       AND a.subject_code=v_row.subject_code
  ) THEN
    RAISE EXCEPTION 'Source attempt changed or official grade already exists';
  END IF;
  SELECT coalesce(es.units_at_enrollment,s.units) INTO v_units
  FROM public.enrollment_subjects es JOIN public.subjects s ON s.code=es.subject_code
  WHERE es.enrollment_id=v_row.enrollment_id AND es.subject_code=v_row.subject_code;
  INSERT INTO public.academic_results(
    student_id,subject_code,term_id,units,result_status,source_name,
    official_grade_value,published_grade_import_row_id
  ) VALUES (
    v_row.student_id,v_row.subject_code,v_batch.term_id,v_units,
    v_row.completion_status,'REGISTRAR_VERIFIED_IMPORT',
    v_row.normalized_grade,v_row.id
  ) RETURNING id INTO v_result;
  UPDATE public.grade_import_rows SET validation_status='PUBLISHED',
    published_result_id=v_result WHERE id=v_row.id;
  v_count:=v_count+1;
 END LOOP;
 UPDATE public.grade_import_batches SET status='PUBLISHED',
  published_by_user_id=v_actor,published_at=clock_timestamp(),
  publication_reference='GIP-'||replace(p_batch_id::text,'-','')
 WHERE id=p_batch_id;
 RETURN jsonb_build_object('published',true,'rows',v_count,
  'reference','GIP-'||replace(p_batch_id::text,'-',''),'idempotent',false);
END $fn$;

-- Read-only authoritative COR material. Never substitutes a PROPOSED block for
-- a confirmed enrollment or returns unapproved draft class meetings.
CREATE OR REPLACE FUNCTION public.official_enrollment_cor_v1(p_enrollment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = '' AS $fn$
DECLARE v_enrollment public.enrollments%ROWTYPE;
  v_actor_role text; v_actor uuid; v_student_number text; v_student_name text;
  v_program text; v_term text; v_subjects jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
   RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
 END IF;
 v_actor_role:=public.current_role_code();
 SELECT id INTO v_actor FROM public.app_users WHERE auth_user_id=auth.uid()
   AND account_status='Active' AND login_enabled;
 SELECT * INTO STRICT v_enrollment FROM public.enrollments
  WHERE id=p_enrollment_id AND status='CONFIRMED';
 IF v_actor_role NOT IN ('registrar','academic-coordinator')
    AND NOT (v_actor_role='student' AND EXISTS (
       SELECT 1 FROM public.student_profiles s
       WHERE s.id=v_enrollment.student_id AND s.user_id=v_actor
    )) THEN
   RAISE EXCEPTION 'Enrollment is not visible to this role' USING ERRCODE='42501';
 END IF;
 SELECT s.student_number,u.full_name,p.name INTO
   v_student_number,v_student_name,v_program
 FROM public.student_profiles s JOIN public.app_users u ON u.id=s.user_id
 JOIN public.programs p ON p.code=v_enrollment.program_code
 WHERE s.id=v_enrollment.student_id;
 SELECT label INTO v_term FROM public.academic_terms WHERE id=v_enrollment.term_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'subject_code',x.subject_code,'subject_name',x.subject_name,
   'units',x.units,'section_id',x.section_id,
   'registration_status',x.registration_status) ORDER BY x.subject_code),'[]'::jsonb)
 INTO v_subjects FROM (
   SELECT es.subject_code,s.name AS subject_name,
    coalesce(es.units_at_enrollment,s.units) AS units,
    es.section_id,es.registration_status
   FROM public.enrollment_subjects es JOIN public.subjects s ON s.code=es.subject_code
   WHERE es.enrollment_id=p_enrollment_id AND es.registration_status='CONFIRMED'
 ) x;
 RETURN jsonb_build_object(
   'official',true,'status','OFFICIALLY ENROLLED',
   'enrollment_id',v_enrollment.id,'reference',v_enrollment.reference,
   'confirmation_reference',v_enrollment.confirmation_reference,
   'confirmed_at',v_enrollment.confirmed_at,
   'student_number',v_student_number,'student_name',v_student_name,
   'term_id',v_enrollment.term_id,'academic_term',v_term,
   'program_code',v_enrollment.program_code,'program_name',v_program,
   'curriculum_code',v_enrollment.curriculum_code,
   'subjects',v_subjects,
   'schedule_source','PUBLISHED_ONLY',
   'schedule_publication_pending', EXISTS (
      SELECT 1 FROM public.enrollment_subjects es
      LEFT JOIN public.sections sec ON sec.id=es.section_id
      WHERE es.enrollment_id=v_enrollment.id
       AND es.registration_status='CONFIRMED'
       AND (es.section_id IS NULL OR sec.schedule_status IS DISTINCT FROM 'PUBLISHED')
   ));
END $fn$;

REVOKE ALL ON FUNCTION
 public.registrar_stage_grade_batch_v1(text,text,uuid,text,text,text,text,text,jsonb),
 public.registrar_validate_grade_batch_v1(uuid),
 public.registrar_verify_grade_batch_v1(uuid,text,text,text),
 public.registrar_publish_grade_batch_v1(uuid),
 public.official_enrollment_cor_v1(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
 public.registrar_stage_grade_batch_v1(text,text,uuid,text,text,text,text,text,jsonb),
 public.registrar_validate_grade_batch_v1(uuid),
 public.registrar_verify_grade_batch_v1(uuid,text,text,text),
 public.registrar_publish_grade_batch_v1(uuid),
 public.official_enrollment_cor_v1(uuid)
TO authenticated;
-- Existing RLS and table grants are unchanged.

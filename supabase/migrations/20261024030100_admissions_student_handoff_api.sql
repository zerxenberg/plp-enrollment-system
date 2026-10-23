-- Admissions -> Enrollment institutional student provisioning.
-- Additive only: this does not import Admissions data by itself and does not create Supabase Auth accounts.

CREATE OR REPLACE FUNCTION public.integration_provision_admission_student_v1(
  p_applicant_reference text,
  p_external_user_reference text,
  p_student_number_prefix text,
  p_student_type text,
  p_full_name text,
  p_first_name text,
  p_middle_name text,
  p_last_name text,
  p_email text,
  p_contact_number text,
  p_address text,
  p_program_code text,
  p_curriculum_code text,
  p_term_id text,
  p_admission_date date,
  p_source_name text,
  p_integration_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_user public.app_users%ROWTYPE;
  v_student public.student_profiles%ROWTYPE;
  v_existing_handoff public.admission_handoffs%ROWTYPE;
  v_curriculum public.curricula%ROWTYPE;
  v_term public.academic_terms%ROWTYPE;
  v_student_number text;
  v_sequence integer;
  v_created boolean := false;
  v_has_official_enrollment boolean := false;
  v_email text := lower(trim(p_email));
BEGIN
  IF current_user NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'Trusted integration service required' USING ERRCODE='42501';
  END IF;

  IF p_applicant_reference IS NULL OR trim(p_applicant_reference) = ''
     OR p_external_user_reference IS NULL OR trim(p_external_user_reference) = ''
     OR p_full_name IS NULL OR trim(p_full_name) = ''
     OR v_email IS NULL OR v_email = ''
     OR p_program_code IS NULL OR p_curriculum_code IS NULL OR p_term_id IS NULL THEN
    RAISE EXCEPTION 'Complete admission identity and academic mapping are required';
  END IF;

  IF p_student_number_prefix !~ '^[0-9]{2}$' THEN
    RAISE EXCEPTION 'Student number prefix must contain exactly two digits';
  END IF;

  IF p_student_type NOT IN ('NEW_STUDENT', 'TRANSFEREE') THEN
    RAISE EXCEPTION 'Only mapped new students and transferees may be provisioned automatically';
  END IF;

  SELECT * INTO v_curriculum
  FROM public.curricula
  WHERE code = p_curriculum_code;

  IF v_curriculum.code IS NULL
     OR v_curriculum.program_code IS DISTINCT FROM p_program_code
     OR lower(coalesce(v_curriculum.status, '')) <> 'active' THEN
    RAISE EXCEPTION 'Mapped curriculum is not active for the approved program';
  END IF;

  SELECT * INTO v_term
  FROM public.academic_terms
  WHERE id = p_term_id;

  IF v_term.id IS NULL OR lower(v_term.status) <> 'open' THEN
    RAISE EXCEPTION 'Mapped academic term is not open';
  END IF;

  SELECT * INTO v_existing_handoff
  FROM public.admission_handoffs
  WHERE applicant_reference = p_applicant_reference;

  SELECT * INTO v_user
  FROM public.app_users
  WHERE source_account_key = p_applicant_reference;

  IF v_existing_handoff.id IS NOT NULL AND v_user.id IS NOT NULL THEN
    SELECT * INTO v_student
    FROM public.student_profiles
    WHERE id = v_existing_handoff.student_id;

    IF v_student.id IS NULL OR v_student.user_id IS DISTINCT FROM v_user.id THEN
      RAISE EXCEPTION 'Existing Admission handoff conflicts with the preprovisioned identity';
    END IF;
  ELSIF v_existing_handoff.id IS NOT NULL AND v_user.id IS NULL THEN
    SELECT * INTO v_student
    FROM public.student_profiles
    WHERE id = v_existing_handoff.student_id;

    IF v_student.id IS NULL THEN
      RAISE EXCEPTION 'Existing Admission handoff has no student record';
    END IF;

    SELECT * INTO v_user
    FROM public.app_users
    WHERE id = v_student.user_id;

    IF v_user.id IS NULL OR v_user.source_account_key IS DISTINCT FROM p_applicant_reference THEN
      RAISE EXCEPTION 'Existing Admission handoff cannot be reconciled automatically';
    END IF;
  END IF;

  IF v_user.id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.app_users WHERE lower(email) = v_email) THEN
      RAISE EXCEPTION 'Registered email already belongs to another Enrollment account';
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtextextended('PLP_STUDENT_NUMBER:' || p_student_number_prefix, 0)
    );

    SELECT coalesce(max(substring(student_number from 4 for 5)::integer), 0) + 1
      INTO v_sequence
    FROM public.student_profiles
    WHERE student_number ~ ('^' || p_student_number_prefix || '-[0-9]{5}$');

    IF v_sequence > 99999 THEN
      RAISE EXCEPTION 'Student number sequence is exhausted for prefix %', p_student_number_prefix;
    END IF;

    v_student_number := p_student_number_prefix || '-' || lpad(v_sequence::text, 5, '0');

    INSERT INTO public.app_users (
      source_account_key, role_code, full_name, first_name, middle_name, last_name,
      email, account_status, login_enabled, source_created_on,
      is_synthetic_demo, institutional_verified_at
    ) VALUES (
      p_applicant_reference, 'student', trim(p_full_name),
      nullif(trim(p_first_name), ''), nullif(trim(p_middle_name), ''), nullif(trim(p_last_name), ''),
      v_email, 'Inactive', false, p_admission_date, false, clock_timestamp()
    )
    RETURNING * INTO v_user;

    INSERT INTO public.student_profiles (
      user_id, student_number, program_code, current_term_id, current_curriculum_code,
      contact_number, address, year_level, year_level_number, student_type, student_status,
      academic_classification, progression_status, is_synthetic_demo, record_kind,
      project_cohort_id, institutional_verified_at
    ) VALUES (
      v_user.id, v_student_number, p_program_code, p_term_id, p_curriculum_code,
      nullif(trim(p_contact_number), ''), nullif(trim(p_address), ''),
      CASE WHEN p_student_type = 'NEW_STUDENT' THEN '1st Year' ELSE NULL END,
      CASE WHEN p_student_type = 'NEW_STUDENT' THEN 1 ELSE NULL END,
      p_student_type, 'ADMITTED',
      CASE WHEN p_student_type = 'NEW_STUDENT' THEN 'REGULAR' ELSE NULL END,
      CASE WHEN p_student_type = 'NEW_STUDENT' THEN 'ELIGIBLE_NORMAL' ELSE NULL END,
      false, NULL, NULL, clock_timestamp()
    )
    RETURNING * INTO v_student;

    v_created := true;
  ELSE
    IF v_user.role_code IS DISTINCT FROM 'student'
       OR v_user.is_synthetic_demo IS TRUE
       OR v_user.source_account_key IS DISTINCT FROM p_applicant_reference THEN
      RAISE EXCEPTION 'Existing Enrollment identity is not an institutional Student';
    END IF;

    SELECT * INTO v_student
    FROM public.student_profiles
    WHERE user_id = v_user.id
    FOR UPDATE;

    IF v_student.id IS NULL OR v_student.record_kind = 'PROJECT_ONLY'
       OR v_student.is_synthetic_demo IS TRUE THEN
      RAISE EXCEPTION 'Existing Enrollment student profile is not institutional';
    END IF;

    IF v_user.auth_user_id IS NOT NULL AND lower(v_user.email) IS DISTINCT FROM v_email THEN
      RAISE EXCEPTION 'Admissions email differs from an Auth-linked Enrollment account';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.app_users
      WHERE lower(email) = v_email AND id <> v_user.id
    ) THEN
      RAISE EXCEPTION 'Registered email already belongs to another Enrollment account';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.enrollments
      WHERE student_id = v_student.id
        AND status NOT IN ('CANCELLED', 'NOT_ELIGIBLE')
    ) INTO v_has_official_enrollment;

    IF v_has_official_enrollment AND (
      v_student.program_code IS DISTINCT FROM p_program_code
      OR v_student.current_curriculum_code IS DISTINCT FROM p_curriculum_code
      OR v_student.current_term_id IS DISTINCT FROM p_term_id
    ) THEN
      RAISE EXCEPTION 'Existing official enrollment prevents automatic academic identity remapping';
    END IF;

    UPDATE public.app_users
    SET full_name = trim(p_full_name),
        first_name = nullif(trim(p_first_name), ''),
        middle_name = nullif(trim(p_middle_name), ''),
        last_name = nullif(trim(p_last_name), ''),
        email = CASE WHEN auth_user_id IS NULL THEN v_email ELSE email END,
        institutional_verified_at = coalesce(institutional_verified_at, clock_timestamp()),
        updated_at = clock_timestamp()
    WHERE id = v_user.id
    RETURNING * INTO v_user;

    UPDATE public.student_profiles
    SET program_code = CASE WHEN NOT v_has_official_enrollment THEN p_program_code ELSE program_code END,
        current_term_id = CASE WHEN NOT v_has_official_enrollment THEN p_term_id ELSE current_term_id END,
        current_curriculum_code = CASE WHEN NOT v_has_official_enrollment THEN p_curriculum_code ELSE current_curriculum_code END,
        contact_number = coalesce(nullif(trim(p_contact_number), ''), contact_number),
        address = coalesce(nullif(trim(p_address), ''), address),
        student_type = coalesce(student_type, p_student_type),
        student_status = coalesce(student_status, 'ADMITTED'),
        year_level = CASE
          WHEN p_student_type = 'NEW_STUDENT' AND year_level IS NULL THEN '1st Year'
          ELSE year_level
        END,
        year_level_number = CASE
          WHEN p_student_type = 'NEW_STUDENT' AND year_level_number IS NULL THEN 1
          ELSE year_level_number
        END,
        academic_classification = CASE
          WHEN p_student_type = 'NEW_STUDENT' AND academic_classification IS NULL THEN 'REGULAR'
          ELSE academic_classification
        END,
        progression_status = CASE
          WHEN p_student_type = 'NEW_STUDENT' AND progression_status IS NULL THEN 'ELIGIBLE_NORMAL'
          ELSE progression_status
        END,
        institutional_verified_at = coalesce(institutional_verified_at, clock_timestamp()),
        updated_at = clock_timestamp()
    WHERE id = v_student.id
    RETURNING * INTO v_student;

    v_student_number := v_student.student_number;
  END IF;

  INSERT INTO public.user_login_identifiers (
    user_id, identifier_type, identifier_value, is_primary
  ) VALUES
    (v_user.id, 'STUDENT_NUMBER', v_student.student_number, true),
    (v_user.id, 'EMAIL', v_user.email, false),
    (v_user.id, 'ALTERNATE_IDENTIFIER', p_external_user_reference, false)
  ON CONFLICT (user_id, identifier_type, identifier_value) DO NOTHING;

  INSERT INTO public.admission_handoffs (
    applicant_reference, student_id, approved_program_code, admission_status,
    admission_date, admission_type, integration_request_id,
    synchronization_status, received_at, source_name
  ) VALUES (
    p_applicant_reference, v_student.id, p_program_code, 'COMPLETED',
    p_admission_date, p_student_type, p_integration_request_id,
    'SUCCESS', clock_timestamp(),
    coalesce(nullif(trim(p_source_name), ''), 'PLP Admissions')
  )
  ON CONFLICT (applicant_reference)
  DO UPDATE SET
    approved_program_code = EXCLUDED.approved_program_code,
    admission_status = 'COMPLETED',
    admission_date = EXCLUDED.admission_date,
    admission_type = EXCLUDED.admission_type,
    integration_request_id = EXCLUDED.integration_request_id,
    synchronization_status = 'SUCCESS',
    received_at = clock_timestamp(),
    source_name = EXCLUDED.source_name,
    updated_at = clock_timestamp()
  WHERE public.admission_handoffs.student_id = EXCLUDED.student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Admission reference is already linked to another student';
  END IF;

  INSERT INTO public.synchronization_events (
    sync_reference, integration_request_id, applicant_reference,
    direction, status, result, attempt_number
  ) VALUES (
    'ADM-SYNC-' || upper(replace(gen_random_uuid()::text, '-', '')),
    p_integration_request_id, p_applicant_reference,
    'ADMISSIONS_TO_ENROLLMENT', 'Successful',
    CASE WHEN v_created THEN 'CREATED_STUDENT' ELSE 'UPDATED_EXISTING_STUDENT' END,
    1
  );

  IF p_student_type = 'NEW_STUDENT' THEN
    PERFORM public.refresh_published_student_eligibility_v1(v_student.id);
  END IF;

  RETURN jsonb_build_object(
    'created', v_created,
    'app_user_id', v_user.id,
    'auth_user_id', v_user.auth_user_id,
    'student_id', v_student.id,
    'student_number', v_student.student_number,
    'student_status', v_student.student_status,
    'student_type', v_student.student_type,
    'program_code', v_student.program_code,
    'curriculum_code', v_student.current_curriculum_code,
    'term_id', v_student.current_term_id
  );
END
$function$;

REVOKE ALL ON FUNCTION public.integration_provision_admission_student_v1(
  text,text,text,text,text,text,text,text,text,text,text,text,text,text,date,text,uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.integration_provision_admission_student_v1(
  text,text,text,text,text,text,text,text,text,text,text,text,text,text,date,text,uuid
) TO service_role;

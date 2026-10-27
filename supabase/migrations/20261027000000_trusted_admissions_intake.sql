-- Trusted PLP Admissions intake. This migration is for reviewed deployment only.
-- It does not create Supabase Auth users or official enrollments.
CREATE OR REPLACE FUNCTION public.integration_accept_admissions_intake_v1(
  p_applicant_ref text,
  p_full_name text,
  p_email text,
  p_program_code text,
  p_admission_date date,
  p_admission_type text,
  p_source_name text DEFAULT 'PLP Admissions'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_year integer;
  v_prefix text;
  v_program_code text;
  v_track_code text;
  v_existing record;
  v_user_id uuid;
  v_student_id uuid;
  v_number text;
  v_next integer;
  v_attempt integer := 0;
  v_request_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted integration service required' USING ERRCODE='42501';
  END IF;
  IF coalesce(p_applicant_ref,'') !~ '^ADM-20[0-9]{2}-[0-9]{6,9}$'
     OR length(btrim(coalesce(p_full_name,''))) NOT BETWEEN 2 AND 200
     OR length(btrim(coalesce(p_email,''))) NOT BETWEEN 3 AND 254
     OR btrim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR length(btrim(coalesce(p_program_code,''))) NOT BETWEEN 2 AND 30
     OR p_admission_date IS NULL
     OR p_admission_type NOT IN ('new','transferee')
     OR coalesce(p_source_name,'') <> 'PLP Admissions' THEN
    RAISE EXCEPTION 'Invalid or unsupported Admissions handoff' USING ERRCODE='22023';
  END IF;
  v_year := substring(p_applicant_ref from 5 for 4)::integer;
  IF extract(year from p_admission_date)::integer NOT BETWEEN v_year - 1 AND v_year + 1 THEN
    RAISE EXCEPTION 'Admission date and applicant reference conflict' USING ERRCODE='22023';
  END IF;
  v_prefix := right(v_year::text,2);

  -- Resolve either a degree program code or an approved program track code.
  SELECT code INTO v_program_code FROM public.programs
    WHERE upper(code)=upper(btrim(p_program_code)) AND status='Active';
  IF v_program_code IS NULL THEN
    SELECT t.program_code,t.code INTO v_program_code,v_track_code
      FROM public.program_tracks t
      JOIN public.programs p ON p.code=t.program_code
     WHERE upper(t.code)=upper(btrim(p_program_code))
       AND t.status='ACTIVE' AND p.status='Active';
  END IF;
  IF v_program_code IS NULL THEN
    RAISE EXCEPTION 'Program code is not recognized by Enrollment' USING ERRCODE='22023';
  END IF;

  -- Serialize requests per applicant, including retries from Admissions.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('PLP_ADMISSIONS:'||p_applicant_ref,0));
  SELECT h.student_id,s.student_number,s.program_code,u.id as user_id,u.email,u.full_name,u.role_code,u.is_synthetic_demo
  INTO v_existing
  FROM public.admission_handoffs h
  JOIN public.student_profiles s ON s.id=h.student_id
  JOIN public.app_users u ON u.id=s.user_id
  WHERE h.applicant_reference=p_applicant_ref;
  IF FOUND THEN
    IF lower(v_existing.email)<>lower(btrim(p_email))
       OR v_existing.program_code<>v_program_code
       OR v_existing.role_code<>'student'
       OR v_existing.is_synthetic_demo THEN
      RAISE EXCEPTION 'Existing applicant identity conflicts; requires administrator review'
        USING ERRCODE='23505';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'status','unchanged','student_number',v_existing.student_number,
      'applicant_ref',p_applicant_ref);
  END IF;

  -- Never appropriate an unrelated application account by matching email.
  IF EXISTS (SELECT 1 FROM public.app_users
             WHERE lower(email)=lower(btrim(p_email))
                OR source_account_key='PLP_ADMISSIONS:'||p_applicant_ref) THEN
    RAISE EXCEPTION 'An Enrollment identity already exists; requires manual reconciliation'
      USING ERRCODE='23505';
  END IF;

  INSERT INTO public.app_users(
    source_account_key,role_code,full_name,email,account_status,login_enabled,
    is_synthetic_demo,account_kind,project_cohort_id,institutional_verified_at
  ) VALUES (
    'PLP_ADMISSIONS:'||p_applicant_ref,'student',btrim(p_full_name),
    lower(btrim(p_email)),'Inactive',false,false,'INSTITUTIONAL',null,now()
  ) RETURNING id INTO v_user_id;

  -- Use the existing year allocator and reserve the chosen identifier.
  -- The transaction lock protects against concurrent handoff allocations.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('PLP_STUDENT_NUMBER:'||v_year::text,0));
  SELECT greatest(
    coalesce((SELECT next_serial FROM public.student_number_counters WHERE entry_year=v_year),1),
    coalesce((SELECT max(right(student_number,5)::integer)+1
              FROM public.student_profiles WHERE student_number ~ ('^'||v_prefix||'-[0-9]{5}$')),1),
    coalesce((SELECT max(serial_number)+1 FROM public.student_number_reservations WHERE entry_year=v_year),1)
  ) INTO v_next;
  LOOP
    IF v_next > 99999 THEN
      RAISE EXCEPTION 'Student number capacity exhausted for entry year' USING ERRCODE='22023';
    END IF;
    v_number := v_prefix||'-'||lpad(v_next::text,5,'0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.student_profiles WHERE student_number=v_number)
          AND NOT EXISTS (SELECT 1 FROM public.student_number_reservations WHERE student_number=v_number);
    v_next := v_next+1;
  END LOOP;
  INSERT INTO public.student_number_counters(entry_year,next_serial,updated_at)
    VALUES (v_year,v_next+1,now())
    ON CONFLICT(entry_year) DO UPDATE
      SET next_serial=greatest(public.student_number_counters.next_serial,excluded.next_serial),
          updated_at=now();

  INSERT INTO public.student_profiles (
    user_id,student_number,program_code,student_type,student_status,
    year_level,academic_classification,progression_status,
    is_synthetic_demo,record_kind,project_cohort_id,institutional_verified_at
  ) VALUES (
    v_user_id,v_number,v_program_code,
    CASE WHEN p_admission_type='new' THEN 'NEW_STUDENT' ELSE 'TRANSFEREE' END,
    'ADMITTED',
    CASE WHEN p_admission_type='new' THEN '1st Year' ELSE NULL END,
    CASE WHEN p_admission_type='new' THEN 'REGULAR' ELSE NULL END,
    CASE WHEN p_admission_type='new' THEN 'ELIGIBLE_NORMAL' ELSE NULL END,
    false,null,null,now()
  ) RETURNING id INTO v_student_id;

  INSERT INTO public.student_number_reservations(entry_year,serial_number,student_number)
    VALUES (v_year,v_next,v_number);

  INSERT INTO public.user_login_identifiers(user_id,identifier_type,identifier_value,is_primary)
    VALUES
      (v_user_id,'EMAIL',lower(btrim(p_email)),true),
      (v_user_id,'STUDENT_NUMBER',v_number,false);

  INSERT INTO public.integration_requests(
    request_reference,request_type,source_system,endpoint_path,external_reference,
    status,response_code,request_summary,response_summary
  ) VALUES (
    'INTAKE-'||pg_catalog.gen_random_uuid()::text,'ADMISSIONS_HANDOFF','PLP Admissions',
    '/api/integration/admissions/intake',p_applicant_ref,
    'Successful',201,'Accepted applicant handoff','Institutional student record created; Auth pending'
  ) RETURNING id INTO v_request_id;

  INSERT INTO public.admission_handoffs(
    applicant_reference,student_id,approved_program_code,admission_status,
    admission_date,admission_type,integration_request_id,synchronization_status,
    received_at,source_name
  ) VALUES (
    p_applicant_ref,v_student_id,v_program_code,'ACCEPTED',p_admission_date,
    p_admission_type,v_request_id,'Successful',now(),'PLP Admissions'
  );

  INSERT INTO public.synchronization_events(
    integration_request_id,applicant_reference,direction,status,result,attempt_number
  ) VALUES (
    v_request_id,p_applicant_ref,'INBOUND','Successful',
    'Created institutional Student; awaiting administrator Auth provisioning',1
  );

  INSERT INTO public.audit_events(
    id,occurred_at,actor_label,module,action,entity_type,entity_key,result
  ) VALUES (
    'AUD-ADM-'||replace(pg_catalog.gen_random_uuid()::text,'-',''),
    now(),'PLP Admissions API','System Integration','Admission student imported',
    'student_profile',v_student_id::text,'Successful'
  );

  RETURN pg_catalog.jsonb_build_object(
    'status','created','student_number',v_number,'applicant_ref',p_applicant_ref);
END;
$$;

REVOKE ALL ON FUNCTION public.integration_accept_admissions_intake_v1(
  text,text,text,text,date,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.integration_accept_admissions_intake_v1(
  text,text,text,text,date,text,text) TO service_role;

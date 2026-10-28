-- Trusted PLP Admissions intake. This migration is for reviewed deployment only.
-- No Supabase Auth users or official enrollments are created.
-- Existing source-code mappings are explicit. Only high-confidence custom name matches are automatic.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.admissions_program_code_map (
  source_code_normalized text PRIMARY KEY,
  source_code text NOT NULL,
  display_name text NOT NULL,
  program_code text NOT NULL REFERENCES public.programs(code) ON UPDATE CASCADE ON DELETE RESTRICT,
  program_track_code text REFERENCES public.program_tracks(code) ON UPDATE CASCADE ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  match_method text NOT NULL DEFAULT 'explicit_alias',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admissions_program_code_map_normalized_check
    CHECK (source_code_normalized = regexp_replace(upper(btrim(source_code)), '[^A-Z0-9]', '', 'g'))
);
ALTER TABLE public.admissions_program_code_map ENABLE ROW LEVEL SECURITY;

INSERT INTO public.admissions_program_code_map
  (source_code_normalized,source_code,display_name,program_code,program_track_code,is_active,match_method)
VALUES
  ('BSA','BSA','BS Accountancy','BSA',NULL,true,'official_admissions_code'),
  ('BSBA','BSBA','BS Business Administration major in Marketing Management','BSBA','BSBAMM',true,'official_admissions_code'),
  ('BSENT','BSENT','BS Entrepreneurship','BSBA','BSBAENT',true,'official_admissions_code'),
  ('BSHM','BSHM','BS Hospitality Management','BSHM',NULL,true,'official_admissions_code'),
  ('BEED','BEED','Bachelor of Elementary Education','BEED',NULL,true,'official_admissions_code'),
  ('BSEDENG','BSED-ENG','Bachelor of Secondary Education Major in English','BSED','BSEDENG',true,'official_admissions_code'),
  ('BSEDFIL','BSED-FIL','Bachelor of Secondary Education Major in Filipino','BSED','BSEDFIL',true,'official_admissions_code'),
  ('BSEDMATH','BSED-MATH','Bachelor of Secondary Education Major in Mathematics','BSED','BSEDMATH',true,'official_admissions_code'),
  ('ABPSYCH','AB Psych','AB Psychology','BSP',NULL,true,'official_admissions_code'),
  ('BSCS','BSCS','BS Computer Science','BSCS',NULL,true,'official_admissions_code'),
  ('BSIT','BSIT','BS Information Technology','BSIT',NULL,true,'official_admissions_code'),
  ('BSECE','BSECE','BS Electronics Engineering','BSECE',NULL,true,'official_admissions_code'),
  ('BSN','BSN','BS Nursing','BSN',NULL,true,'official_admissions_code')
ON CONFLICT (source_code_normalized) DO UPDATE SET
  source_code=EXCLUDED.source_code,
  display_name=EXCLUDED.display_name,
  program_code=EXCLUDED.program_code,
  program_track_code=EXCLUDED.program_track_code,
  is_active=EXCLUDED.is_active,
  match_method=EXCLUDED.match_method;

CREATE OR REPLACE FUNCTION public.integration_normalize_program_name_v1(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        lower(regexp_replace(coalesce(p_name,''), '\s*\([^()]*\)\s*$', '', 'g')),
        '^(bachelor of science|bachelor of arts|bachelor of|bs|b\.s\.|ab|a\.b\.)\s+',
        '', 'i'
      ),
      '\m(major|in|of|the|and|with|degree)\M', ' ', 'g'
    ),
    '\s+', ' ', 'g'
  ));
$$;

ALTER TABLE public.admission_handoffs
  ADD COLUMN IF NOT EXISTS approved_program_track_code text;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname='admission_handoffs_approved_program_track_code_fkey'
      AND conrelid='public.admission_handoffs'::regclass
  ) THEN
    ALTER TABLE public.admission_handoffs
      ADD CONSTRAINT admission_handoffs_approved_program_track_code_fkey
      FOREIGN KEY (approved_program_track_code)
      REFERENCES public.program_tracks(code) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END
$migration$;

-- Replace the old seven-argument signature to avoid ambiguous PostgREST RPC overloads.
DROP FUNCTION IF EXISTS public.integration_accept_admissions_intake_v1(
  text,text,text,text,date,text,text
);

CREATE OR REPLACE FUNCTION public.integration_accept_admissions_intake_v1(
  p_applicant_ref text,
  p_full_name text,
  p_email text,
  p_program_code text,
  p_program_name text,
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
  v_source_code_normalized text;
  v_program_name_normalized text;
  v_candidate record;
  v_best_program_code text;
  v_best_track_code text;
  v_best_score real;
  v_second_score real;
  v_rank integer := 0;
  v_existing record;
  v_user_id uuid;
  v_student_id uuid;
  v_number text;
  v_next integer;
  v_attempt integer := 0;
  v_request_id uuid;
BEGIN
  IF (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted integration service required' USING ERRCODE='42501';
  END IF;
  IF coalesce(p_applicant_ref,'') !~ '^ADM-20[0-9]{2}-[0-9]{6,9}$'
     OR length(btrim(coalesce(p_full_name,''))) NOT BETWEEN 2 AND 200
     OR length(btrim(coalesce(p_email,''))) NOT BETWEEN 3 AND 254
     OR btrim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR length(btrim(coalesce(p_program_code,''))) NOT BETWEEN 2 AND 60
     OR length(btrim(coalesce(p_program_name,''))) > 240
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

  -- Resolve source codes through explicit Admissions aliases first.
  -- Exact normalized code matching is the next safest option.
  v_source_code_normalized := regexp_replace(upper(btrim(p_program_code)), '[^A-Z0-9]', '', 'g');
  SELECT m.program_code,m.program_track_code
    INTO v_program_code,v_track_code
    FROM public.admissions_program_code_map m
    JOIN public.programs p ON p.code=m.program_code AND p.status='Active'
    LEFT JOIN public.program_tracks t
      ON t.code=m.program_track_code AND t.program_code=m.program_code AND t.status='ACTIVE'
   WHERE m.source_code_normalized=v_source_code_normalized
     AND m.is_active
     AND (m.program_track_code IS NULL OR t.code IS NOT NULL)
   LIMIT 1;

  IF NOT FOUND THEN
    SELECT p.code,NULL::text INTO v_program_code,v_track_code
      FROM public.programs p
     WHERE regexp_replace(upper(p.code), '[^A-Z0-9]', '', 'g')=v_source_code_normalized
       AND p.status='Active'
     ORDER BY p.code
     LIMIT 1;
  END IF;
  IF NOT FOUND THEN
    SELECT t.program_code,t.code INTO v_program_code,v_track_code
      FROM public.program_tracks t
      JOIN public.programs p ON p.code=t.program_code
     WHERE regexp_replace(upper(t.code), '[^A-Z0-9]', '', 'g')=v_source_code_normalized
       AND t.status='ACTIVE' AND p.status='Active'
     ORDER BY t.code
     LIMIT 1;
  END IF;

  -- For new/custom source codes, compare the full course name with active
  -- Enrollment program/track labels. Only accept a strong, unambiguous match.
  IF NOT FOUND AND btrim(coalesce(p_program_name,'')) <> '' THEN
    v_program_name_normalized := public.integration_normalize_program_name_v1(p_program_name);
    v_best_score := NULL;
    v_second_score := NULL;
    v_best_program_code := NULL;
    v_best_track_code := NULL;
    v_rank := 0;

    IF v_program_name_normalized <> '' THEN
      FOR v_candidate IN
        WITH candidates AS (
          SELECT p.code AS candidate_program_code,
                 NULL::text AS candidate_track_code,
                 p.name AS display_name,
                 public.integration_normalize_program_name_v1(p.name) AS normalized_name
            FROM public.programs p
           WHERE p.status='Active'
          UNION ALL
          SELECT p.code AS candidate_program_code,
                 t.code AS candidate_track_code,
                 p.name || ' ' || t.name AS display_name,
                 public.integration_normalize_program_name_v1(p.name || ' ' || t.name) AS normalized_name
            FROM public.program_tracks t
            JOIN public.programs p ON p.code=t.program_code
           WHERE t.status='ACTIVE' AND p.status='Active'
        )
        SELECT c.candidate_program_code,c.candidate_track_code,c.display_name,
               extensions.similarity(v_program_name_normalized,c.normalized_name) AS score
          FROM candidates c
         WHERE c.normalized_name <> ''
         ORDER BY score DESC,c.candidate_program_code,coalesce(c.candidate_track_code,'')
         LIMIT 2
      LOOP
        IF v_rank=0 THEN
          v_best_program_code := v_candidate.candidate_program_code;
          v_best_track_code := v_candidate.candidate_track_code;
          v_best_score := v_candidate.score;
        ELSE
          v_second_score := v_candidate.score;
        END IF;
        v_rank := v_rank+1;
      END LOOP;

      IF v_best_score >= 0.58
         AND (v_second_score IS NULL OR v_best_score-v_second_score >= 0.10) THEN
        v_program_code := v_best_program_code;
        v_track_code := v_best_track_code;
      END IF;
    END IF;
  END IF;

  IF v_program_code IS NULL THEN
    RAISE EXCEPTION 'Admissions program code could not be mapped confidently. Verify the course name or add an approved alias.' USING ERRCODE='22023';
  END IF;

  -- Serialize requests per applicant, including retries from Admissions.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('PLP_ADMISSIONS:'||p_applicant_ref,0));
  SELECT h.student_id,h.approved_program_track_code,s.student_number,s.program_code,u.id as user_id,u.email,u.full_name,u.role_code,u.is_synthetic_demo
  INTO v_existing
  FROM public.admission_handoffs h
  JOIN public.student_profiles s ON s.id=h.student_id
  JOIN public.app_users u ON u.id=s.user_id
  WHERE h.applicant_reference=p_applicant_ref;
  IF FOUND THEN
    IF lower(v_existing.email)<>lower(btrim(p_email))
       OR v_existing.program_code<>v_program_code
       OR v_existing.approved_program_track_code IS DISTINCT FROM v_track_code
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
    lower(btrim(p_email)),'Inactive',false,false,null,null,now()
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
    applicant_reference,student_id,approved_program_code,approved_program_track_code,
    admission_status,admission_date,admission_type,integration_request_id,synchronization_status,
    received_at,source_name
  ) VALUES (
    p_applicant_ref,v_student_id,v_program_code,v_track_code,'ACCEPTED',p_admission_date,
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
  text,text,text,text,text,date,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.integration_accept_admissions_intake_v1(
  text,text,text,text,text,date,text,text) TO service_role;
, '', 'g')),
        '^(bachelor of science|bachelor of arts|bachelor of|bs|b\.s\.|ab|a\.b\.)\s+',
        '', 'i'
      ),
      '\m(major|in|of|the|and|with|degree)\M', ' ', 'g'
    ),
    '\s+', ' ', 'g'
  ));
$;

ALTER TABLE public.admission_handoffs
  ADD COLUMN IF NOT EXISTS approved_program_track_code text;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname='admission_handoffs_approved_program_track_code_fkey'
      AND conrelid='public.admission_handoffs'::regclass
  ) THEN
    ALTER TABLE public.admission_handoffs
      ADD CONSTRAINT admission_handoffs_approved_program_track_code_fkey
      FOREIGN KEY (approved_program_track_code)
      REFERENCES public.program_tracks(code) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END
$migration$;
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
  IF (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
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
  SELECT h.student_id,h.approved_program_track_code,s.student_number,s.program_code,u.id as user_id,u.email,u.full_name,u.role_code,u.is_synthetic_demo
  INTO v_existing
  FROM public.admission_handoffs h
  JOIN public.student_profiles s ON s.id=h.student_id
  JOIN public.app_users u ON u.id=s.user_id
  WHERE h.applicant_reference=p_applicant_ref;
  IF FOUND THEN
    IF lower(v_existing.email)<>lower(btrim(p_email))
       OR v_existing.program_code<>v_program_code
       OR v_existing.approved_program_track_code IS DISTINCT FROM v_track_code
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
    lower(btrim(p_email)),'Inactive',false,false,null,null,now()
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
    applicant_reference,student_id,approved_program_code,approved_program_track_code,
    admission_status,admission_date,admission_type,integration_request_id,synchronization_status,
    received_at,source_name
  ) VALUES (
    p_applicant_ref,v_student_id,v_program_code,v_track_code,'ACCEPTED',p_admission_date,
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

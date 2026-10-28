-- Authenticated enrichment for Admissions applicants already accepted by the trusted intake.
-- Run on the Enrollment PostgreSQL project. Does not create or activate Auth accounts.
BEGIN;

CREATE TABLE IF NOT EXISTS public.admissions_student_source_details (
  applicant_reference text PRIMARY KEY
    REFERENCES public.admission_handoffs(applicant_reference) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  personal_email text,
  birthdate date,
  sex text,
  suffix text,
  shs_strand text,
  inputted_gwa numeric(5,2),
  gwa_verified boolean NOT NULL DEFAULT false,
  verified_documents text[] NOT NULL DEFAULT '{}'::text[],
  source_updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admissions_student_source_gwa_check
    CHECK (inputted_gwa IS NULL OR (inputted_gwa BETWEEN 75 AND 100)),
  CONSTRAINT admissions_student_source_gwa_verified_check
    CHECK (NOT gwa_verified OR inputted_gwa IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS admissions_student_source_student_idx
  ON public.admissions_student_source_details(student_id);
ALTER TABLE public.admissions_student_source_details ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admissions_student_source_details FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.admissions_student_source_details TO service_role;

CREATE OR REPLACE FUNCTION public.integration_enrich_admissions_profile_v1(
  p_applicant_ref text,
  p_details jsonb,
  p_personal_email text,
  p_gwa numeric,
  p_gwa_verified boolean,
  p_verified_documents text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_student_id uuid;
  v_user_id uuid;
  v_first text;
  v_middle text;
  v_last text;
  v_suffix text;
  v_birthdate date;
  v_sex text;
  v_phone text;
  v_address text;
  v_strand text;
  v_source_created_on date;
  v_documents text[];
BEGIN
  IF (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted integration service required' USING ERRCODE='42501';
  END IF;
  IF p_applicant_ref IS NULL OR p_applicant_ref !~ '^ADM-20[0-9]{2}-[0-9]{6,9}$'
     OR p_details IS NULL OR pg_catalog.jsonb_typeof(p_details) <> 'object'
     OR pg_catalog.length(p_details::text) > 5000
     OR (p_gwa IS NOT NULL AND (p_gwa < 75 OR p_gwa > 100))
     OR (coalesce(p_gwa_verified,false) AND p_gwa IS NULL)
     OR (p_personal_email IS NOT NULL AND pg_catalog.length(p_personal_email) > 254)
     OR coalesce(pg_catalog.array_length(p_verified_documents,1),0) > 30
  THEN
    RAISE EXCEPTION 'Invalid applicant enrichment data' USING ERRCODE='22023';
  END IF;

  SELECT h.student_id,s.user_id INTO v_student_id,v_user_id
  FROM public.admission_handoffs h
  JOIN public.student_profiles s ON s.id=h.student_id
  JOIN public.app_users u ON u.id=s.user_id
  WHERE h.applicant_reference=p_applicant_ref
    AND h.source_name='PLP Admissions'
    AND u.source_account_key='PLP_ADMISSIONS:'||p_applicant_ref
    AND u.role_code='student' AND u.is_synthetic_demo=false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Admissions student must be accepted before enrichment' USING ERRCODE='22023';
  END IF;

  v_first := pg_catalog.nullif(pg_catalog.btrim(p_details->>'first_name'),'');
  v_middle := pg_catalog.nullif(pg_catalog.btrim(p_details->>'middle_name'),'');
  v_last := pg_catalog.nullif(pg_catalog.btrim(p_details->>'last_name'),'');
  v_suffix := pg_catalog.nullif(pg_catalog.btrim(p_details->>'suffix'),'');
  v_sex := pg_catalog.nullif(pg_catalog.btrim(p_details->>'sex'),'');
  v_phone := pg_catalog.nullif(pg_catalog.btrim(p_details->>'contact_number'),'');
  v_address := pg_catalog.nullif(pg_catalog.btrim(p_details->>'address'),'');
  v_strand := pg_catalog.nullif(pg_catalog.btrim(p_details->>'shs_strand'),'');
  IF pg_catalog.length(coalesce(v_first,'')) > 100
     OR pg_catalog.length(coalesce(v_middle,'')) > 100
     OR pg_catalog.length(coalesce(v_last,'')) > 100
     OR pg_catalog.length(coalesce(v_suffix,'')) > 20
     OR pg_catalog.length(coalesce(v_phone,'')) > 24
     OR pg_catalog.length(coalesce(v_address,'')) > 500
     OR pg_catalog.length(coalesce(v_strand,'')) > 80
     OR (v_sex IS NOT NULL AND v_sex NOT IN ('M','F')) THEN
    RAISE EXCEPTION 'Invalid source profile fields' USING ERRCODE='22023';
  END IF;
  IF nullif(p_details->>'birthdate','') IS NOT NULL THEN
    v_birthdate := (p_details->>'birthdate')::date;
  END IF;
  IF nullif(p_details->>'source_created_on','') IS NOT NULL THEN
    v_source_created_on := (p_details->>'source_created_on')::date;
  END IF;

  UPDATE public.app_users
  SET first_name=coalesce(v_first,first_name),
      middle_name=coalesce(v_middle,middle_name),
      last_name=coalesce(v_last,last_name),
      source_created_on=coalesce(v_source_created_on,source_created_on),
      updated_at=now()
  WHERE id=v_user_id;

  UPDATE public.student_profiles
  SET contact_number=coalesce(v_phone,contact_number),
      address=coalesce(v_address,address),
      updated_at=now()
  WHERE id=v_student_id;

  v_documents := coalesce(
    ARRAY(SELECT DISTINCT pg_catalog.btrim(d)
          FROM unnest(coalesce(p_verified_documents,'{}'::text[])) AS d
          WHERE pg_catalog.length(pg_catalog.btrim(d)) BETWEEN 1 AND 80
          ORDER BY 1),
    '{}'::text[]
  );
  INSERT INTO public.admissions_student_source_details (
    applicant_reference,student_id,personal_email,birthdate,sex,suffix,
    shs_strand,inputted_gwa,gwa_verified,verified_documents,source_updated_at
  ) VALUES (
    p_applicant_ref,v_student_id,pg_catalog.nullif(pg_catalog.btrim(p_personal_email),''),
    v_birthdate,v_sex,v_suffix,v_strand,p_gwa,coalesce(p_gwa_verified,false),
    v_documents,now()
  )
  ON CONFLICT (applicant_reference) DO UPDATE SET
    personal_email=coalesce(EXCLUDED.personal_email,public.admissions_student_source_details.personal_email),
    birthdate=coalesce(EXCLUDED.birthdate,public.admissions_student_source_details.birthdate),
    sex=coalesce(EXCLUDED.sex,public.admissions_student_source_details.sex),
    suffix=coalesce(EXCLUDED.suffix,public.admissions_student_source_details.suffix),
    shs_strand=coalesce(EXCLUDED.shs_strand,public.admissions_student_source_details.shs_strand),
    inputted_gwa=coalesce(EXCLUDED.inputted_gwa,public.admissions_student_source_details.inputted_gwa),
    gwa_verified=CASE WHEN EXCLUDED.inputted_gwa IS NULL THEN public.admissions_student_source_details.gwa_verified
                      ELSE EXCLUDED.gwa_verified END,
    verified_documents=CASE WHEN pg_catalog.cardinality(EXCLUDED.verified_documents)=0
      THEN public.admissions_student_source_details.verified_documents ELSE EXCLUDED.verified_documents END,
    source_updated_at=now();

  RETURN pg_catalog.jsonb_build_object(
    'status','enriched','applicant_ref',p_applicant_ref,
    'student_id',v_student_id,
    'gwa_verified',coalesce(p_gwa_verified,false)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.integration_enrich_admissions_profile_v1(text,jsonb,text,numeric,boolean,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.integration_enrich_admissions_profile_v1(text,jsonb,text,numeric,boolean,text[]) TO service_role;

COMMIT;

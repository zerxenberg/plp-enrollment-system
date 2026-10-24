-- Isolated Registrar sandbox grade imports.
-- These records are retained only in sandbox tables and have no publication pathway.
CREATE TABLE IF NOT EXISTS public.registrar_sandbox_grade_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id text NOT NULL,
  academic_year text NOT NULL,
  semester text NOT NULL,
  college_code text NOT NULL,
  program_code text NOT NULL,
  subject_code text NOT NULL,
  section_code text NOT NULL,
  source_reference text NOT NULL,
  issuer text NOT NULL,
  file_name text NOT NULL,
  source_checksum text NOT NULL CHECK (source_checksum ~ '^[0-9a-f]{64}$'),
  row_count integer NOT NULL CHECK (row_count BETWEEN 1 AND 1500),
  status text NOT NULL DEFAULT 'SANDBOX_STAGED' CHECK (status IN ('SANDBOX_STAGED')),
  uploaded_by_user_id uuid NOT NULL REFERENCES public.app_users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.registrar_sandbox_grade_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.registrar_sandbox_grade_batches(id) ON DELETE CASCADE,
  source_row_number integer NOT NULL,
  student_number text NOT NULL,
  student_full_name text NOT NULL,
  subject_code text NOT NULL,
  academic_year text NOT NULL,
  semester text NOT NULL,
  section_code text NOT NULL,
  grade_value text NOT NULL,
  completion_status text NOT NULL,
  source_record_reference text NOT NULL CHECK (source_record_reference LIKE 'DEMO_ONLY:%'),
  original_row jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(batch_id, source_row_number)
);

ALTER TABLE public.registrar_sandbox_grade_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrar_sandbox_grade_rows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.registrar_sandbox_grade_batches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.registrar_sandbox_grade_rows FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.registrar_stage_sandbox_grade_batch_v1(
  p_academic_year text,
  p_semester text,
  p_college_code text,
  p_program_code text,
  p_subject_code text,
  p_section_code text,
  p_source_reference text,
  p_issuer text,
  p_file_name text,
  p_checksum text,
  p_rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_actor uuid;
  v_term_id text;
  v_batch_id uuid;
  v_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated'
     OR auth.uid() IS NULL
     OR public.current_role_code() IS DISTINCT FROM 'registrar' THEN
    RAISE EXCEPTION 'Registrar authentication required' USING ERRCODE='42501';
  END IF;

  SELECT id INTO STRICT v_actor FROM public.app_users
    WHERE auth_user_id=auth.uid() AND role_code='registrar'
      AND account_status='Active' AND login_enabled;

  IF p_checksum !~ '^[0-9a-f]{64}$'
     OR length(btrim(coalesce(p_source_reference,'')))=0
     OR length(btrim(coalesce(p_issuer,'')))=0
     OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Sandbox source metadata or rows are invalid';
  END IF;

  v_count := jsonb_array_length(p_rows);
  IF v_count < 1 OR v_count > 1500 THEN
    RAISE EXCEPTION 'Sandbox grade row count outside 1 to 1500';
  END IF;

  SELECT t.id INTO STRICT v_term_id
  FROM public.academic_terms t
  WHERE lower(btrim(t.academic_year))=lower(btrim(p_academic_year))
    AND lower(btrim(t.semester))=lower(btrim(p_semester));

  IF NOT EXISTS (
    SELECT 1
    FROM public.sections s
    JOIN public.subject_offerings so ON so.id=s.subject_offering_id
    JOIN public.programs p ON p.code=so.program_code
    WHERE s.term_id=v_term_id
      AND s.subject_code=p_subject_code
      AND upper(s.section_code)=upper(p_section_code)
      AND s.is_synthetic_demo IS TRUE
      AND p.code=p_program_code
      AND p.organizational_unit_code=p_college_code
  ) THEN
    RAISE EXCEPTION 'Selected context does not resolve to a synthetic demonstration section';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) e(j)
    WHERE jsonb_typeof(j) <> 'object'
       OR btrim(coalesce(j->>'student_number',''))=''
       OR btrim(coalesce(j->>'student_full_name',''))=''
       OR btrim(coalesce(j->>'subject_code','')) <> p_subject_code
       OR lower(btrim(coalesce(j->>'academic_year',''))) <> lower(btrim(p_academic_year))
       OR lower(btrim(coalesce(j->>'semester',''))) <> lower(btrim(p_semester))
       OR upper(btrim(coalesce(j->>'section_code',''))) <> upper(btrim(p_section_code))
       OR btrim(coalesce(j->>'source_record_reference','')) NOT LIKE 'DEMO_ONLY:%'
       OR btrim(coalesce(j->>'grade_value','')) !~ '^[0-9]+(\.[0-9]{1,3})?$'
       OR upper(btrim(coalesce(j->>'completion_status',''))) NOT IN ('COMPLETED','FAILED','INCOMPLETE','CREDITED')
       OR NOT EXISTS (
         SELECT 1 FROM public.student_profiles sp
         WHERE upper(sp.student_number)=upper(btrim(j->>'student_number'))
           AND (sp.is_synthetic_demo IS TRUE OR sp.record_kind='PROJECT_ONLY')
       )
  ) THEN
    RAISE EXCEPTION 'Rows must match the sandbox context and synthetic student records, with DEMO_ONLY source references';
  END IF;

  INSERT INTO public.registrar_sandbox_grade_batches(
    term_id,academic_year,semester,college_code,program_code,subject_code,section_code,
    source_reference,issuer,file_name,source_checksum,row_count,uploaded_by_user_id
  ) VALUES (
    v_term_id,p_academic_year,p_semester,p_college_code,p_program_code,p_subject_code,p_section_code,
    btrim(p_source_reference),btrim(p_issuer),left(coalesce(p_file_name,'sandbox.xlsx'),255),
    p_checksum,v_count,v_actor
  ) RETURNING id INTO v_batch_id;

  INSERT INTO public.registrar_sandbox_grade_rows(
    batch_id,source_row_number,student_number,student_full_name,subject_code,
    academic_year,semester,section_code,grade_value,completion_status,
    source_record_reference,original_row
  )
  SELECT v_batch_id,ord::integer,btrim(j->>'student_number'),btrim(j->>'student_full_name'),
    btrim(j->>'subject_code'),btrim(j->>'academic_year'),btrim(j->>'semester'),
    btrim(j->>'section_code'),btrim(j->>'grade_value'),upper(btrim(j->>'completion_status')),
    btrim(j->>'source_record_reference'),j
  FROM jsonb_array_elements(p_rows) WITH ORDINALITY e(j,ord);

  RETURN jsonb_build_object(
    'batch_id',v_batch_id,'status','SANDBOX_STAGED','row_count',v_count,
    'official_publication_enabled',false
  );
END $function$;

REVOKE ALL ON FUNCTION public.registrar_stage_sandbox_grade_batch_v1(text,text,text,text,text,text,text,text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_stage_sandbox_grade_batch_v1(text,text,text,text,text,text,text,text,text,text,jsonb) TO authenticated;

-- Correct decimal grade normalization for databases where the original
-- Registrar grade backend migration has already been applied.
-- This is intentionally limited to the official staging RPC.
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
   CASE WHEN btrim(j->>'grade_value') ~ '^[0-9]+([.][0-9]{1,3})?$'
      THEN (j->>'grade_value')::numeric ELSE NULL END,
   CASE WHEN upper(btrim(coalesce(j->>'completion_status',''))) IN
     ('COMPLETED','FAILED','INCOMPLETE','CREDITED')
     THEN upper(btrim(j->>'completion_status')) ELSE NULL END,
   j
 FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS e(j,ord);
 RETURN v_batch;
END $fn$;

REVOKE ALL ON FUNCTION
 public.registrar_stage_grade_batch_v1(text,text,uuid,text,text,text,text,text,jsonb)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
 public.registrar_stage_grade_batch_v1(text,text,uuid,text,text,text,text,text,jsonb)
 TO authenticated;

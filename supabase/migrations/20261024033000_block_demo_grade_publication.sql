-- Prevent explicitly marked demonstration grade rows from being published as official results.
-- Demo spreadsheets may be staged and validated for Registrar workflow demonstrations,
-- but rows whose source_record_reference begins with DEMO_ONLY: are never publishable.
CREATE OR REPLACE FUNCTION public.registrar_publish_grade_batch_v1(p_batch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_actor uuid; v_batch public.grade_import_batches%ROWTYPE;
  v_row record; v_result uuid; v_count int:=0; v_units smallint;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL
    OR public.current_role_code() IS DISTINCT FROM 'registrar' THEN
   RAISE EXCEPTION 'Registrar authentication required' USING ERRCODE='42501';
 END IF;
 SELECT id INTO STRICT v_actor FROM public.app_users
   WHERE auth_user_id=auth.uid() AND role_code='registrar'
    AND account_status='Active' AND login_enabled;
 SELECT * INTO STRICT v_batch FROM public.grade_import_batches WHERE id=p_batch_id FOR UPDATE;
 IF v_batch.status='PUBLISHED' THEN
   RETURN jsonb_build_object('published',true,'reference',v_batch.publication_reference,'idempotent',true);
 END IF;
 IF v_batch.status <> 'VALIDATED' OR v_batch.verified_checksum_sha256<>v_batch.source_checksum
   OR v_batch.verified_at IS NULL THEN
   RAISE EXCEPTION 'Source has not been verified';
 END IF;
 IF (SELECT count(*) FROM public.grade_import_rows WHERE batch_id=p_batch_id AND validation_status='VALID')<>v_batch.row_count THEN
   RAISE EXCEPTION 'Incomplete row validation';
 END IF;
 FOR v_row IN SELECT * FROM public.grade_import_rows WHERE batch_id=p_batch_id ORDER BY source_row_number FOR UPDATE LOOP
  IF upper(coalesce(v_row.source_record_reference,'')) LIKE 'DEMO_ONLY:%' THEN
    RAISE EXCEPTION 'Demo-only grade rows cannot be published to official academic records';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.enrollments e JOIN public.enrollment_subjects es
     ON es.enrollment_id=e.id AND es.subject_code=v_row.subject_code
     WHERE e.id=v_row.enrollment_id AND e.student_id=v_row.student_id
       AND e.term_id=v_batch.term_id AND e.status='CONFIRMED'
       AND es.registration_status='CONFIRMED'
       AND (v_batch.section_id IS NULL OR es.section_id=v_batch.section_id))
    OR EXISTS (SELECT 1 FROM public.academic_results a WHERE a.student_id=v_row.student_id
       AND a.term_id=v_batch.term_id AND a.subject_code=v_row.subject_code) THEN
    RAISE EXCEPTION 'Source attempt changed or official grade already exists';
  END IF;
  SELECT coalesce(es.units_at_enrollment,s.units) INTO v_units
    FROM public.enrollment_subjects es JOIN public.subjects s ON s.code=es.subject_code
    WHERE es.enrollment_id=v_row.enrollment_id AND es.subject_code=v_row.subject_code;
  INSERT INTO public.academic_results(student_id,subject_code,term_id,units,result_status,source_name,official_grade_value,published_grade_import_row_id)
    VALUES (v_row.student_id,v_row.subject_code,v_batch.term_id,v_units,v_row.completion_status,
      'REGISTRAR_VERIFIED_IMPORT',v_row.normalized_grade,v_row.id) RETURNING id INTO v_result;
  UPDATE public.grade_import_rows SET validation_status='PUBLISHED',published_result_id=v_result WHERE id=v_row.id;
  v_count:=v_count+1;
 END LOOP;
 UPDATE public.grade_import_batches SET status='PUBLISHED',published_by_user_id=v_actor,published_at=clock_timestamp(),
   publication_reference='GIP-'||replace(p_batch_id::text,'-','') WHERE id=p_batch_id;
 RETURN jsonb_build_object('published',true,'rows',v_count,'reference','GIP-'||replace(p_batch_id::text,'-',''),'idempotent',false);
END $function$;

REVOKE ALL ON FUNCTION public.registrar_publish_grade_batch_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_publish_grade_batch_v1(uuid) TO authenticated;
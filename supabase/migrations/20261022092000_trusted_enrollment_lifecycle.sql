-- Trusted enrollment start, subject choice, submission and final Registrar
-- confirmation. No existing student/enrollment/academic rows are modified.
SET lock_timeout='3s';
CREATE OR REPLACE FUNCTION public.student_open_enrollment_v1(p_term_id text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_actor uuid; v_student public.student_profiles%ROWTYPE;
 v_term public.academic_terms%ROWTYPE; v_enrollment uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL
   OR public.current_role_code() IS DISTINCT FROM 'student' THEN
   RAISE EXCEPTION 'Student authentication required' USING ERRCODE='42501';
 END IF;
 SELECT id INTO STRICT v_actor FROM public.app_users WHERE auth_user_id=auth.uid()
   AND role_code='student' AND account_status='Active' AND login_enabled;
 SELECT * INTO STRICT v_student FROM public.student_profiles
   WHERE user_id=v_actor FOR UPDATE;
 IF v_student.record_kind='PROJECT_ONLY'
    OR v_student.student_status IS DISTINCT FROM 'ACTIVE'
    OR v_student.program_code IS NULL OR v_student.current_curriculum_code IS NULL
    OR v_student.current_term_id IS DISTINCT FROM p_term_id THEN
   RAISE EXCEPTION 'Student academic record is not cleared for official enrollment'
     USING ERRCODE='42501';
 END IF;
 SELECT * INTO STRICT v_term FROM public.academic_terms WHERE id=p_term_id;
 IF lower(v_term.status) <> 'open'
    OR v_term.enrollment_start IS NULL OR v_term.enrollment_end IS NULL
    OR current_date NOT BETWEEN v_term.enrollment_start AND v_term.enrollment_end THEN
   RAISE EXCEPTION 'Registrar enrollment period is not currently open';
 END IF;
 SELECT id INTO v_enrollment FROM public.enrollments
  WHERE student_id=v_student.id AND term_id=p_term_id;
 IF v_enrollment IS NOT NULL THEN RETURN v_enrollment; END IF;
 IF v_student.student_type IN ('NEW_STUDENT','TRANSFEREE')
    AND NOT EXISTS (
      SELECT 1 FROM public.admission_handoffs h
      WHERE h.student_id=v_student.id AND h.admission_status='COMPLETED'
    ) THEN
   RAISE EXCEPTION 'Verified Admission completion is required';
 END IF;
 INSERT INTO public.enrollments (
   reference,student_id,program_code,term_id,curriculum_code,
   status,eligibility_status
 ) VALUES (
   'ENR-'||replace(gen_random_uuid()::text,'-',''),
   v_student.id,v_student.program_code,p_term_id,v_student.current_curriculum_code,
   'IN_PROGRESS','ELIGIBLE'
 ) RETURNING id INTO v_enrollment;
 RETURN v_enrollment;
END $fn$;

CREATE OR REPLACE FUNCTION public.student_select_enrollment_subject_v1(
 p_enrollment_id uuid,p_subject_code text,p_section_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_actor uuid; v_enrollment public.enrollments%ROWTYPE;
  v_section public.sections%ROWTYPE; v_student public.student_profiles%ROWTYPE;
  v_units smallint; v_count int;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL
    OR public.current_role_code() IS DISTINCT FROM 'student' THEN
   RAISE EXCEPTION 'Student authentication required' USING ERRCODE='42501';
 END IF;
 SELECT id INTO STRICT v_actor FROM public.app_users WHERE auth_user_id=auth.uid()
  AND role_code='student' AND account_status='Active' AND login_enabled;
 SELECT * INTO STRICT v_enrollment FROM public.enrollments
  WHERE id=p_enrollment_id FOR UPDATE;
 SELECT * INTO STRICT v_student FROM public.student_profiles
  WHERE id=v_enrollment.student_id AND user_id=v_actor;
 IF v_student.record_kind='PROJECT_ONLY' OR v_enrollment.status <> 'IN_PROGRESS'
  OR v_enrollment.curriculum_code IS NULL THEN
    RAISE EXCEPTION 'An editable verified enrollment is required';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.curriculum_subjects cs
  WHERE cs.curriculum_code=v_enrollment.curriculum_code
    AND cs.subject_code=p_subject_code
 ) OR EXISTS (
  SELECT 1 FROM public.academic_results ar
  WHERE ar.student_id=v_enrollment.student_id AND ar.subject_code=p_subject_code
    AND ar.result_status IN ('COMPLETED','CREDITED')
 ) OR NOT EXISTS (
  SELECT 1 FROM public.student_subject_eligibility elig
  WHERE elig.student_id=v_enrollment.student_id AND elig.term_id=v_enrollment.term_id
    AND elig.subject_code=p_subject_code AND elig.eligibility_status IN ('ELIGIBLE','RETAKE')
 ) THEN
   RAISE EXCEPTION 'Curriculum or individual prerequisite eligibility rejected this subject';
 END IF;
 SELECT * INTO STRICT v_section FROM public.sections WHERE id=p_section_id FOR UPDATE;
 IF v_section.subject_code IS DISTINCT FROM p_subject_code
   OR v_section.term_id IS DISTINCT FROM v_enrollment.term_id
   OR v_section.schedule_status IS DISTINCT FROM 'FINALIZED'
   OR NOT EXISTS (
    SELECT 1 FROM public.subject_offerings o
    WHERE o.id=v_section.subject_offering_id AND o.status='ACTIVE'
     AND o.curriculum_code=v_enrollment.curriculum_code
     AND o.program_code=v_enrollment.program_code
   ) THEN
    RAISE EXCEPTION 'A matching finalized academic subject section is required';
 END IF;
 SELECT count(DISTINCT e.student_id) INTO v_count
 FROM public.enrollments e JOIN public.enrollment_subjects es ON es.enrollment_id=e.id
 WHERE e.term_id=v_enrollment.term_id
    AND es.section_id=p_section_id
    AND es.registration_status IN ('SELECTED','CONFIRMED')
    AND e.status NOT IN ('CANCELLED','NOT_ELIGIBLE')
    AND e.student_id<>v_enrollment.student_id;
 IF v_count>=LEAST(v_section.capacity,40) THEN
   RAISE EXCEPTION 'Section is at maximum approved capacity';
 END IF;
 IF EXISTS (
  SELECT 1 FROM public.enrollment_subjects es
  JOIN public.section_meetings oldm ON oldm.section_id=es.section_id
  JOIN public.section_meetings newm ON newm.section_id=p_section_id
   AND oldm.day_of_week=newm.day_of_week
   AND oldm.start_time<newm.end_time AND newm.start_time<oldm.end_time
  WHERE es.enrollment_id=p_enrollment_id AND es.subject_code<>p_subject_code
   AND es.registration_status IN ('SELECTED','CONFIRMED')
   AND oldm.meeting_status='ACTIVE' AND newm.meeting_status='ACTIVE'
 ) THEN
   RAISE EXCEPTION 'Selected classes overlap the student timetable';
 END IF;
 SELECT COALESCE(cs.units_override,s.units) INTO v_units
  FROM public.curriculum_subjects cs JOIN public.subjects s ON s.code=cs.subject_code
  WHERE cs.curriculum_code=v_enrollment.curriculum_code AND cs.subject_code=p_subject_code;
 IF v_units IS NULL OR v_units<=0 THEN
   RAISE EXCEPTION 'Academic unit assignment is not verified';
 END IF;
 INSERT INTO public.enrollment_subjects
  (enrollment_id,subject_code,section_id,units_at_enrollment,registration_status)
 VALUES (p_enrollment_id,p_subject_code,p_section_id,v_units,'SELECTED')
 ON CONFLICT (enrollment_id,subject_code)
 DO UPDATE SET section_id=excluded.section_id,
   units_at_enrollment=excluded.units_at_enrollment,
   registration_status='SELECTED';
 RETURN true;
END $fn$;

CREATE OR REPLACE FUNCTION public.student_submit_enrollment_v1(p_enrollment_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_actor uuid; v_enrollment public.enrollments%ROWTYPE;
  v_term public.academic_terms%ROWTYPE; v_count int;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL
   OR public.current_role_code() IS DISTINCT FROM 'student' THEN
    RAISE EXCEPTION 'Student authentication required' USING ERRCODE='42501';
 END IF;
 SELECT id INTO STRICT v_actor FROM public.app_users WHERE auth_user_id=auth.uid()
    AND role_code='student' AND account_status='Active' AND login_enabled;
 SELECT * INTO STRICT v_enrollment FROM public.enrollments
    WHERE id=p_enrollment_id FOR UPDATE;
 IF v_enrollment.status <> 'IN_PROGRESS' OR NOT EXISTS (
    SELECT 1 FROM public.student_profiles s
    WHERE s.id=v_enrollment.student_id AND s.user_id=v_actor
     AND s.record_kind IS DISTINCT FROM 'PROJECT_ONLY'
 ) THEN RAISE EXCEPTION 'An editable student-owned enrollment is required'; END IF;
 SELECT * INTO STRICT v_term FROM public.academic_terms
    WHERE id=v_enrollment.term_id;
 IF lower(v_term.status)<>'open'
    OR v_term.enrollment_start IS NULL OR v_term.enrollment_end IS NULL OR
    current_date NOT BETWEEN v_term.enrollment_start AND v_term.enrollment_end THEN
   RAISE EXCEPTION 'Registrar enrollment period is closed';
 END IF;
 SELECT count(*) INTO v_count FROM public.enrollment_subjects
 WHERE enrollment_id=p_enrollment_id AND registration_status='SELECTED';
 IF v_count=0 THEN RAISE EXCEPTION 'Select approved subjects before submission'; END IF;
 IF EXISTS (
 SELECT 1 FROM public.enrollment_subjects es
 LEFT JOIN public.sections sec ON sec.id=es.section_id
 LEFT JOIN public.student_subject_eligibility elig
  ON elig.student_id=v_enrollment.student_id
     AND elig.term_id=v_enrollment.term_id AND elig.subject_code=es.subject_code
 WHERE es.enrollment_id=p_enrollment_id AND es.registration_status='SELECTED'
  AND (sec.schedule_status IS DISTINCT FROM 'FINALIZED'
    OR elig.eligibility_status NOT IN ('ELIGIBLE','RETAKE')
    OR elig.eligibility_status IS NULL)
 ) THEN RAISE EXCEPTION 'Subject schedule or prerequisite validation changed'; END IF;
 UPDATE public.enrollments SET status='SUBMITTED',submitted_at=clock_timestamp(),
   declared_units=(SELECT sum(es.units_at_enrollment) FROM public.enrollment_subjects es
    WHERE es.enrollment_id=p_enrollment_id AND es.registration_status='SELECTED')
 WHERE id=p_enrollment_id;
 INSERT INTO public.enrollment_status_history(
 enrollment_id,actor_user_id,actor_label,action,previous_status,new_status,reason
 ) VALUES (p_enrollment_id,v_actor,'Student','SUBMIT','IN_PROGRESS','SUBMITTED',
   'Student reviewed and submitted validated subject choices');
 RETURN true;
END $fn$;

CREATE OR REPLACE FUNCTION public.registrar_confirm_validated_enrollment_v1(
 p_enrollment_id uuid,p_source_reference text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_actor uuid; v_enrollment public.enrollments%ROWTYPE;
 v_section record; v_capacity int; v_ref text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL
  OR public.current_role_code() IS DISTINCT FROM 'registrar' THEN
   RAISE EXCEPTION 'Registrar authorization required' USING ERRCODE='42501';
 END IF;
 SELECT id INTO STRICT v_actor FROM public.app_users WHERE auth_user_id=auth.uid()
   AND role_code='registrar' AND account_status='Active' AND login_enabled;
 IF btrim(coalesce(p_source_reference,''))='' THEN
   RAISE EXCEPTION 'An authorized confirmation source reference is required';
 END IF;
 SELECT * INTO STRICT v_enrollment FROM public.enrollments
   WHERE id=p_enrollment_id FOR UPDATE;
 IF v_enrollment.status='CONFIRMED' THEN RETURN v_enrollment.confirmation_reference; END IF;
 IF v_enrollment.status<>'VALIDATED' THEN
   RAISE EXCEPTION 'Only a Registrar validated enrollment can be confirmed';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.enrollment_subjects
     WHERE enrollment_id=p_enrollment_id AND registration_status='SELECTED') THEN
   RAISE EXCEPTION 'No approved subject selection is available';
 END IF;
 FOR v_section IN SELECT sec.id,sec.capacity
  FROM public.sections sec JOIN public.enrollment_subjects es ON es.section_id=sec.id
  WHERE es.enrollment_id=p_enrollment_id AND es.registration_status='SELECTED'
  ORDER BY sec.id FOR UPDATE OF sec LOOP
  IF NOT EXISTS (SELECT 1 FROM public.sections WHERE id=v_section.id
   AND schedule_status='FINALIZED') THEN
   RAISE EXCEPTION 'An unfinalized class cannot be confirmed';
  END IF;
  SELECT count(DISTINCT e.student_id) INTO v_capacity
  FROM public.enrollment_subjects es JOIN public.enrollments e ON e.id=es.enrollment_id
  WHERE es.section_id=v_section.id AND es.registration_status='CONFIRMED'
    AND e.term_id=v_enrollment.term_id AND e.status='CONFIRMED'
    AND e.id<>p_enrollment_id;
  IF v_capacity>=LEAST(v_section.capacity,40) THEN
   RAISE EXCEPTION 'Official class seat capacity has been exhausted';
  END IF;
 END LOOP;
 IF EXISTS (SELECT 1 FROM public.enrollment_subjects es
   LEFT JOIN public.student_subject_eligibility elig
    ON elig.student_id=v_enrollment.student_id
      AND elig.term_id=v_enrollment.term_id AND elig.subject_code=es.subject_code
   WHERE es.enrollment_id=p_enrollment_id AND es.registration_status='SELECTED'
    AND (elig.eligibility_status IS NULL
      OR elig.eligibility_status NOT IN ('ELIGIBLE','RETAKE'))) THEN
    RAISE EXCEPTION 'Eligibility must be refreshed and approved before confirmation';
 END IF;
 v_ref:='COR-'||replace(p_enrollment_id::text,'-','');
 UPDATE public.enrollment_subjects SET registration_status='CONFIRMED'
  WHERE enrollment_id=p_enrollment_id AND registration_status='SELECTED';
 UPDATE public.enrollments SET status='CONFIRMED',
  confirmed_at=clock_timestamp(),confirmation_reference=v_ref
 WHERE id=p_enrollment_id;
 INSERT INTO public.enrollment_status_history
  (enrollment_id,actor_user_id,actor_label,action,previous_status,new_status,reason)
 VALUES (p_enrollment_id,v_actor,'Registrar','OFFICIAL_CONFIRMATION',
  'VALIDATED','CONFIRMED',btrim(p_source_reference));
 RETURN v_ref;
END $fn$;

REVOKE ALL ON FUNCTION
 public.student_open_enrollment_v1(text),
 public.student_select_enrollment_subject_v1(uuid,text,uuid),
 public.student_submit_enrollment_v1(uuid),
 public.registrar_confirm_validated_enrollment_v1(uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.student_open_enrollment_v1(text),
 public.student_select_enrollment_subject_v1(uuid,text,uuid),
 public.student_submit_enrollment_v1(uuid),
 public.registrar_confirm_validated_enrollment_v1(uuid,text)
 TO authenticated;

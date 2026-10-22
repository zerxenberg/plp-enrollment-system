-- Phase 8: synchronize subject eligibility after authoritative results and
-- expose complete source-backed registration data without invented schedules.
SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.refresh_published_student_eligibility_v1(
 p_student_id uuid
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_student public.student_profiles%ROWTYPE;
 v_term public.academic_terms%ROWTYPE; v_placement record;
 v_status text; v_reason text; v_updated int:=0;
BEGIN
 SELECT * INTO v_student FROM public.student_profiles WHERE id=p_student_id;
 IF v_student.id IS NULL OR v_student.record_kind='PROJECT_ONLY'
   OR v_student.current_curriculum_code IS NULL OR v_student.current_term_id IS NULL
   OR v_student.year_level_number IS NULL THEN RETURN 0; END IF;
 SELECT * INTO v_term FROM public.academic_terms WHERE id=v_student.current_term_id;
 IF v_term.id IS NULL THEN RETURN 0; END IF;
 FOR v_placement IN
  SELECT cs.subject_code FROM public.curriculum_subjects cs
  WHERE cs.curriculum_code=v_student.current_curriculum_code
   AND cs.year_level_number=v_student.year_level_number
   AND lower(trim(cs.semester))=lower(trim(v_term.semester))
 LOOP
  v_status:='ELIGIBLE';v_reason:=NULL;
  IF EXISTS (SELECT 1 FROM public.academic_results ar
    WHERE ar.student_id=p_student_id AND ar.subject_code=v_placement.subject_code
      AND ar.result_status IN ('COMPLETED','CREDITED'))
    OR EXISTS (SELECT 1 FROM public.transfer_credit_evaluations te
       WHERE te.student_id=p_student_id
        AND te.target_curriculum_code=v_student.current_curriculum_code
        AND te.target_subject_code=v_placement.subject_code
        AND te.decision_status='CREDITED' AND te.decided_at IS NOT NULL
        AND te.evaluator_user_id IS NOT NULL) THEN
      v_status:='RESTRICTED';v_reason:='ALREADY_COMPLETED_OR_CREDITED';
  ELSIF EXISTS (SELECT 1 FROM public.subject_prerequisites p
   WHERE p.subject_code=v_placement.subject_code AND p.is_active
    AND NOT (
      EXISTS (SELECT 1 FROM public.academic_results ar
        WHERE ar.student_id=p_student_id AND ar.subject_code=p.prerequisite_subject_code
          AND ar.result_status IN ('COMPLETED','CREDITED'))
      OR EXISTS (SELECT 1 FROM public.transfer_credit_evaluations te
         WHERE te.student_id=p_student_id
          AND te.target_curriculum_code=v_student.current_curriculum_code
          AND te.target_subject_code=p.prerequisite_subject_code
          AND te.decision_status='CREDITED'
          AND te.decided_at IS NOT NULL AND te.evaluator_user_id IS NOT NULL)
    )) THEN
      v_status:='RESTRICTED';v_reason:='PREREQUISITE_NOT_YET_COMPLETED';
  ELSIF EXISTS (SELECT 1 FROM public.academic_results ar
   WHERE ar.student_id=p_student_id AND ar.subject_code=v_placement.subject_code
    AND ar.result_status='FAILED') THEN
      v_status:='RETAKE';v_reason:='FAILED_SUBJECT_RETAKE';
  ELSIF EXISTS (SELECT 1 FROM public.academic_results ar
   WHERE ar.student_id=p_student_id AND ar.subject_code=v_placement.subject_code
    AND ar.result_status='INCOMPLETE') THEN
      v_status:='RESTRICTED';v_reason:='INCOMPLETE_SUBJECT_PENDING';
  END IF;
  INSERT INTO public.student_subject_eligibility
    (student_id,term_id,subject_code,eligibility_status,
     display_category,restriction_reason,evaluated_at,source_name)
  VALUES (p_student_id,v_term.id,v_placement.subject_code,v_status,
    CASE WHEN v_status='RETAKE' THEN 'RETAKE' ELSE 'CURRICULUM' END,
    v_reason,clock_timestamp(),'REGISTRAR_PUBLICATION_V1')
  ON CONFLICT(student_id,term_id,subject_code)
  DO UPDATE SET eligibility_status=excluded.eligibility_status,
    display_category=excluded.display_category,
    restriction_reason=excluded.restriction_reason,
    evaluated_at=excluded.evaluated_at
  WHERE public.student_subject_eligibility.source_name='REGISTRAR_PUBLICATION_V1';
  v_updated:=v_updated+1;
 END LOOP;
 RETURN v_updated;
END $fn$;
REVOKE ALL ON FUNCTION public.refresh_published_student_eligibility_v1(uuid)
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.academic_result_refresh_eligibility_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = '' AS $fn$
BEGIN
 -- Triggered only by an authenticated Registrar-published result or a
 -- controlled Registrar grade correction. Direct grade table grants stay off.
 PERFORM public.refresh_published_student_eligibility_v1(NEW.student_id);
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.academic_result_refresh_eligibility_v1()
 FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS academic_result_refresh_eligibility_v1
 ON public.academic_results;
CREATE TRIGGER academic_result_refresh_eligibility_v1
AFTER INSERT OR UPDATE OF result_status,official_grade_value
ON public.academic_results FOR EACH ROW
EXECUTE FUNCTION public.academic_result_refresh_eligibility_v1();

-- Transfer decisions update eligibility only after authorized Coordinator
-- source-attested CREDITED decision; not a fabricated PLP grade result.
CREATE OR REPLACE FUNCTION public.transfer_credit_refresh_eligibility_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = '' AS $fn$
BEGIN
 IF NEW.decision_status='CREDITED' THEN
   PERFORM public.refresh_published_student_eligibility_v1(NEW.student_id);
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.transfer_credit_refresh_eligibility_v1()
 FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS transfer_credit_refresh_eligibility_v1
 ON public.transfer_credit_evaluations;
CREATE TRIGGER transfer_credit_refresh_eligibility_v1
AFTER UPDATE OF decision_status ON public.transfer_credit_evaluations
FOR EACH ROW EXECUTE FUNCTION public.transfer_credit_refresh_eligibility_v1();

-- Replace our just-installed v1 RPC without changing its signature or grants.
-- FINALIZED is the actual existing section publication code; PUBLISHED applies
-- to the parent block only. Never use DRAFT or PROPOSED sources for an official COR.
CREATE OR REPLACE FUNCTION public.official_enrollment_cor_v1(p_enrollment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = '' AS $fn$
DECLARE v_enrollment public.enrollments%ROWTYPE;
  v_actor_role text; v_actor uuid; v_student_number text; v_student_name text;
  v_program text; v_year_level smallint; v_term text;
  v_block text; v_subjects jsonb; v_schedule jsonb;
  v_missing int; v_subject_total int;
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
 SELECT s.student_number,u.full_name,p.name,s.year_level_number INTO
   v_student_number,v_student_name,v_program,v_year_level
 FROM public.student_profiles s JOIN public.app_users u ON u.id=s.user_id
 JOIN public.programs p ON p.code=v_enrollment.program_code
 WHERE s.id=v_enrollment.student_id;
 SELECT label INTO v_term FROM public.academic_terms WHERE id=v_enrollment.term_id;
 SELECT b.code INTO v_block FROM public.block_student_assignments a
 JOIN public.block_sections b ON b.id=a.block_id
 WHERE a.student_id=v_enrollment.student_id AND a.term_id=v_enrollment.term_id
  AND a.status='CONFIRMED' AND b.planning_status='PUBLISHED'
 ORDER BY a.assigned_at DESC LIMIT 1;
 SELECT count(*) INTO v_subject_total FROM public.enrollment_subjects es
 WHERE es.enrollment_id=p_enrollment_id AND es.registration_status='CONFIRMED';
 SELECT count(*) INTO v_missing FROM public.enrollment_subjects es
 LEFT JOIN public.sections s ON s.id=es.section_id
 WHERE es.enrollment_id=p_enrollment_id AND es.registration_status='CONFIRMED'
   AND (s.id IS NULL OR s.schedule_status IS DISTINCT FROM 'FINALIZED'
     OR NOT EXISTS (
       SELECT 1 FROM public.section_meetings m
       WHERE m.section_id=s.id AND m.meeting_status='ACTIVE'
     ));
 SELECT coalesce(jsonb_agg(jsonb_build_object(
    'subject_code',es.subject_code,'subject_name',sub.name,
    'units',coalesce(es.units_at_enrollment,sub.units),
    'section_id',es.section_id,'registration_status',es.registration_status)
     ORDER BY es.subject_code),'[]'::jsonb) INTO v_subjects
 FROM public.enrollment_subjects es
 JOIN public.subjects sub ON sub.code=es.subject_code
 WHERE es.enrollment_id=p_enrollment_id AND es.registration_status='CONFIRMED';
 SELECT coalesce(jsonb_agg(jsonb_build_object(
    'subject_code',x.subject_code,'day_of_week',x.day_of_week,
    'start_time',x.start_time,'end_time',x.end_time,
    'room',x.room_code,'professor',x.instructor_name,
    'lecture_lab_type','NOT_RECORDED_IN_SOURCE') ORDER BY
     x.day_of_week,x.start_time,x.subject_code),'[]'::jsonb)
 INTO v_schedule FROM (
  SELECT es.subject_code,m.day_of_week,m.start_time,m.end_time,
   r.room_code,i.display_name instructor_name
  FROM public.enrollment_subjects es
  JOIN public.sections s ON s.id=es.section_id AND s.schedule_status='FINALIZED'
  JOIN public.section_meetings m ON m.section_id=s.id AND m.meeting_status='ACTIVE'
  JOIN public.rooms r ON r.id=m.room_id
  JOIN public.section_instructors si ON si.section_id=s.id AND si.assignment_role='PRIMARY'
  JOIN public.instructors i ON i.id=si.instructor_id
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
   'year_level',v_year_level,'home_block',v_block,
   'curriculum_code',v_enrollment.curriculum_code,
   'subjects',v_subjects,'schedule',v_schedule,
   'schedule_complete',v_missing=0 AND v_subject_total>0,
   'registration_reference_complete',v_enrollment.confirmation_reference IS NOT NULL,
   'ready_to_print',v_missing=0 AND v_subject_total>0
      AND v_enrollment.confirmation_reference IS NOT NULL
      AND v_enrollment.confirmed_at IS NOT NULL);
END $fn$;
-- Keep authenticated role-scoped read access to the existing v1 function;
-- there are no direct grants on the protected enrollment or grade tables.

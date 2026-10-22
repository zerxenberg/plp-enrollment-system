-- The four portal backends will read one authoritative simulated PROJECT_ONLY
-- academic dataset without granting browser table access or suggesting it is
-- verified institutional information. Students see ONLY their own profile.
SET lock_timeout='3s';
CREATE OR REPLACE FUNCTION public.project_phase8_student_snapshot_v1(p_student_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid;v_role text;v_profile public.student_profiles%ROWTYPE;
 v_placement public.project_student_academic_placements%ROWTYPE;
 v_name text;v_block_code text;v_block_status text;v_timetable_ready boolean;
 v_subjects jsonb;v_history jsonb;v_transfer jsonb;v_schedule jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
  RAISE EXCEPTION 'PLP account authentication required' USING ERRCODE='42501';
 END IF;
 SELECT au.id,au.role_code INTO v_actor,v_role FROM public.app_users au
 WHERE au.auth_user_id=auth.uid() AND au.account_status='Active'
  AND au.login_enabled AND au.role_code IN
   ('student','registrar','academic-coordinator');
 IF v_actor IS NULL THEN
  RAISE EXCEPTION 'Active academic account required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO STRICT v_profile FROM public.student_profiles
  WHERE id=p_student_id AND record_kind='PROJECT_ONLY'
   AND project_cohort_id='PLP_PROJECT_600_2026_1';
 IF v_role='student' AND v_profile.user_id<>v_actor THEN
  RAISE EXCEPTION 'Cross-student academic data access is prohibited' USING ERRCODE='42501';
 END IF;
 SELECT * INTO STRICT v_placement FROM public.project_student_academic_placements
  WHERE student_id=v_profile.id AND term_id='TERM-2026-1'
   AND project_cohort_id='PLP_PROJECT_600_2026_1';
 SELECT full_name INTO v_name FROM public.app_users WHERE id=v_profile.user_id;
 SELECT b.code,b.planning_status,coalesce(v.validation_status='READY_PROJECT',false)
 INTO v_block_code,v_block_status,v_timetable_ready
 FROM public.block_sections b LEFT JOIN public.project_phase8_schedule_validations v
   ON v.block_id=b.id
 WHERE b.id=v_placement.home_block_id;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'subject_code',e.subject_code,'subject_name',s.name,
  'academic_units',coalesce(cs.units_override,s.units),
  'eligibility',e.eligibility_status,'reason',e.reason)
  ORDER BY cs.display_order NULLS LAST,e.subject_code),'[]'::jsonb)
 INTO v_subjects
 FROM public.project_subject_eligibility e
 JOIN public.subjects s ON s.code=e.subject_code
 LEFT JOIN public.curriculum_subjects cs
  ON cs.curriculum_code=e.curriculum_code AND cs.subject_code=e.subject_code
 WHERE e.student_id=v_profile.id AND e.term_id=v_placement.term_id;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'term',h.term_id,'subject_code',h.subject_code,'subject_name',s.name,
   'units',h.academic_units,'grade',h.grade_value,'result',h.result_status)
  ORDER BY h.term_id,h.subject_code),'[]'::jsonb) INTO v_history
 FROM public.project_simulated_academic_results h
 JOIN public.subjects s ON s.code=h.subject_code
 WHERE h.student_id=v_profile.id;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'target_subject',t.target_subject_code,'source_course',t.source_course_name,
   'credited_units',t.credited_units,'project_decision',t.decision_status)
 ORDER BY t.target_subject_code),'[]'::jsonb) INTO v_transfer
 FROM public.project_simulated_transfer_credits t WHERE t.student_id=v_profile.id;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'subject_code',s.subject_code,'subject_name',sub.name,'day',m.day_of_week,
  'start_time',m.start_time,'end_time',m.end_time,
  'component',m.meeting_component_type,'room',r.room_code,
  'instructor',i.display_name)
 ORDER BY m.day_of_week,m.start_time,s.subject_code),'[]'::jsonb)
 INTO v_schedule
 FROM public.block_subject_sections bs
 JOIN public.sections s ON s.id=bs.section_id
 JOIN public.subjects sub ON sub.code=s.subject_code
 JOIN public.section_meetings m ON m.section_id=s.id AND m.meeting_status='ACTIVE'
 JOIN public.rooms r ON r.id=m.room_id
 JOIN public.section_instructors si ON si.section_id=s.id AND si.assignment_role='PRIMARY'
 JOIN public.instructors i ON i.id=si.instructor_id
 WHERE bs.block_id=v_placement.home_block_id AND v_timetable_ready;
 RETURN jsonb_build_object(
  'project_only',true,'verified_institutionally',false,
  'data_origin','GENERATED_PROJECT','student_number',v_profile.student_number,
  'student_name',v_name,'program_code',v_placement.program_code,
  'program_track_code',v_placement.program_track_code,
  'curriculum_code',v_placement.curriculum_code,
  'year_level',v_placement.year_level,'term_id',v_placement.term_id,
  'academic_classification',v_placement.academic_classification,
  'progression_status',v_placement.progression_status,
  'home_block',v_block_code,'block_planning_status',v_block_status,
  'schedule_validated_for_project',coalesce(v_timetable_ready,false),
  'official_enrollment_status','NOT_CONFIRMED',
  'subjects',v_subjects,'previous_results',v_history,
  'transfer_credits',v_transfer,'class_schedule',v_schedule);
END $fn$;
REVOKE ALL ON FUNCTION public.project_phase8_student_snapshot_v1(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.project_phase8_student_snapshot_v1(uuid)
 TO authenticated;

CREATE OR REPLACE FUNCTION public.project_phase8_block_roster_v1(p_block_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_role text;v_rows jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL
  OR public.current_role_code() NOT IN ('registrar','academic-coordinator')
  THEN RAISE EXCEPTION 'Authorized academic staff required' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.block_sections b
  JOIN public.project_phase8_schedule_validations v ON v.block_id=b.id
  WHERE b.id=p_block_id AND v.validation_status='READY_PROJECT'
  AND b.synthetic_source_key LIKE 'PHASE8_PROJECT_2026:%'
 ) THEN RAISE EXCEPTION 'Unvalidated project block' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'student_id',p.student_id,'student_number',sp.student_number,
  'full_name',au.full_name,'year_level',p.year_level,
  'academic_classification',p.academic_classification,
  'enrollment_status','NOT_CONFIRMED') ORDER BY sp.student_number),'[]'::jsonb)
 INTO v_rows FROM public.project_student_academic_placements p
 JOIN public.student_profiles sp ON sp.id=p.student_id
 JOIN public.app_users au ON au.id=sp.user_id
 WHERE p.home_block_id=p_block_id AND p.project_cohort_id='PLP_PROJECT_600_2026_1';
 RETURN jsonb_build_object('fictional_only',true,'block_id',p_block_id,
  'students',v_rows,'verified_institutionally',false);
END $fn$;
REVOKE ALL ON FUNCTION public.project_phase8_block_roster_v1(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.project_phase8_block_roster_v1(uuid)
 TO authenticated;

-- Separate classroom-project timetable validation. Does not publish official
-- university schedules, and does not weaken the existing publication trigger.
SET lock_timeout = '3s';
CREATE TABLE IF NOT EXISTS public.project_phase8_schedule_validations (
 block_id uuid PRIMARY KEY REFERENCES public.block_sections(id) ON DELETE RESTRICT,
 validation_status text NOT NULL CHECK(validation_status IN ('READY_PROJECT','INCOMPLETE')),
 summary jsonb NOT NULL,
 validated_at timestamptz NOT NULL DEFAULT now(),
 source_key text NOT NULL UNIQUE CHECK (source_key LIKE 'PHASE8_PROJECT_2026:%')
);
ALTER TABLE public.project_phase8_schedule_validations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.project_phase8_schedule_validations FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.phase8_validate_project_block_v1(p_block uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_block public.block_sections%ROWTYPE;
 v_subjects int; v_rows int; v_students int; v_days int;
 v_missing int; v_self_conflicts int; v_resource_conflicts int;
 v_result jsonb; v_ready boolean;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
   RAISE EXCEPTION 'Trusted service required to validate project timetable'
    USING ERRCODE='42501';
 END IF;
 SELECT * INTO STRICT v_block FROM public.block_sections WHERE id=p_block;
 IF v_block.term_id<>'TERM-2026-1'
   OR v_block.synthetic_source_key NOT LIKE 'PHASE8_PROJECT_2026:%'
   OR v_block.planning_status <> 'DRAFT' THEN
   RAISE EXCEPTION 'Only current project DRAFT blocks can be validated';
 END IF;
 SELECT count(*),count(DISTINCT s.subject_code)
   INTO v_rows,v_subjects
 FROM public.block_subject_sections bss
 JOIN public.sections s ON s.id=bss.section_id
 WHERE bss.block_id=p_block;
 SELECT count(*) INTO v_students FROM public.project_student_academic_placements p
 WHERE p.home_block_id=p_block AND p.term_id=v_block.term_id;
 SELECT count(DISTINCT m.day_of_week) INTO v_days
 FROM public.block_subject_sections bss JOIN public.section_meetings m
  ON m.section_id=bss.section_id AND m.meeting_status='ACTIVE'
 WHERE bss.block_id=p_block AND m.day_of_week BETWEEN 1 AND 5;
 SELECT count(*) INTO v_missing
 FROM public.block_subject_sections bss JOIN public.sections s ON s.id=bss.section_id
 WHERE bss.block_id=p_block AND (
   s.term_id IS DISTINCT FROM v_block.term_id
   OR s.subject_code NOT IN (
    SELECT cs.subject_code FROM public.curriculum_subjects cs
    JOIN public.academic_terms t ON t.id=v_block.term_id
    WHERE cs.curriculum_code=v_block.curriculum_code
     AND cs.year_level_number=v_block.year_level
     AND lower(trim(cs.semester))=lower(trim(t.semester))
   )
   OR NOT EXISTS (
    SELECT 1 FROM public.section_instructors si
     JOIN public.instructors i ON i.id=si.instructor_id
     WHERE si.section_id=s.id AND si.assignment_role='PRIMARY')
   OR NOT EXISTS (
    SELECT 1 FROM public.section_meetings m
     JOIN public.rooms r ON r.id=m.room_id AND r.is_active
     WHERE m.section_id=s.id AND m.meeting_status='ACTIVE'
       AND m.meeting_component_type IN ('LECTURE','LABORATORY','OTHER')
       AND m.day_of_week BETWEEN 1 AND 5 AND m.start_time<m.end_time
   )
   OR EXISTS (
    SELECT 1 FROM public.section_meetings m
    LEFT JOIN public.rooms r ON r.id=m.room_id AND r.is_active
    WHERE m.section_id=s.id AND m.meeting_status='ACTIVE'
      AND (m.start_time IS NULL OR m.end_time IS NULL
       OR m.start_time>=m.end_time OR m.day_of_week NOT BETWEEN 1 AND 5
       OR m.meeting_component_type IS NULL OR r.id IS NULL)
   )
 );
 SELECT count(*) INTO v_self_conflicts
 FROM public.block_subject_sections a
 JOIN public.section_meetings am ON am.section_id=a.section_id AND am.meeting_status='ACTIVE'
 JOIN public.block_subject_sections b ON b.block_id=a.block_id AND b.section_id>a.section_id
 JOIN public.section_meetings bm ON bm.section_id=b.section_id AND bm.meeting_status='ACTIVE'
  AND bm.day_of_week=am.day_of_week AND bm.start_time<am.end_time AND am.start_time<bm.end_time
 WHERE a.block_id=p_block;
 SELECT count(*) INTO v_resource_conflicts FROM public.block_subject_sections a
 JOIN public.section_meetings am ON am.section_id=a.section_id AND am.meeting_status='ACTIVE'
 JOIN public.section_meetings bm ON bm.id<>am.id AND bm.meeting_status='ACTIVE'
  AND bm.day_of_week=am.day_of_week AND bm.start_time<am.end_time AND am.start_time<bm.end_time
 JOIN public.sections bs ON bs.id=bm.section_id AND bs.term_id=v_block.term_id
 JOIN public.block_subject_sections otherb ON otherb.section_id=bs.id AND otherb.block_id<>p_block
 JOIN public.block_sections otherblock ON otherblock.id=otherb.block_id
   AND otherblock.synthetic_source_key LIKE 'PHASE8_PROJECT_2026:%'
 WHERE a.block_id=p_block AND
   (am.room_id=bm.room_id OR EXISTS (
     SELECT 1 FROM public.section_instructors ai JOIN public.section_instructors bi
       ON bi.instructor_id=ai.instructor_id
       WHERE ai.section_id=am.section_id AND bi.section_id=bm.section_id
   ));
 v_ready := v_rows BETWEEN 7 AND 8 AND v_subjects=v_rows
     AND v_students BETWEEN 1 AND LEAST(v_block.capacity,40)
     AND v_days=5 AND v_missing=0 AND v_self_conflicts=0 AND v_resource_conflicts=0
     AND v_rows=(
      SELECT count(*) FROM public.curriculum_subjects cs JOIN public.academic_terms t
       ON t.id=v_block.term_id WHERE cs.curriculum_code=v_block.curriculum_code
        AND cs.year_level_number=v_block.year_level
        AND lower(trim(cs.semester))=lower(trim(t.semester))
     );
 v_result:=jsonb_build_object('ready',v_ready,'subjects',v_subjects,'sections',v_rows,
  'students',v_students,'days',v_days,'missing_resources',v_missing,
  'internal_conflicts',v_self_conflicts,'resource_conflicts',v_resource_conflicts,
  'project_only',true);
 INSERT INTO public.project_phase8_schedule_validations
 (block_id,validation_status,summary,validated_at,source_key)
 VALUES (p_block,CASE WHEN v_ready THEN 'READY_PROJECT' ELSE 'INCOMPLETE' END,
   v_result,clock_timestamp(),'PHASE8_PROJECT_2026:VALIDATION:'||p_block::text)
 ON CONFLICT(block_id) DO UPDATE
 SET validation_status=EXCLUDED.validation_status,
     summary=EXCLUDED.summary,validated_at=EXCLUDED.validated_at;
 RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION public.phase8_validate_project_block_v1(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase8_validate_project_block_v1(uuid) TO service_role;

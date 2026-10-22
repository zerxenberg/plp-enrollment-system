-- Project-only contact-hours obligations: separate from official coordinator
-- approval table. A generated timetable is READY only when actual meeting
-- minutes equal its internal fictional curriculum source, by component.
CREATE TABLE IF NOT EXISTS public.project_phase8_contact_requirements (
 curriculum_code text NOT NULL,
 subject_code text NOT NULL,
 component_type text NOT NULL CHECK(component_type IN ('LECTURE','LABORATORY','OTHER')),
 weekly_minutes integer NOT NULL CHECK(weekly_minutes BETWEEN 60 AND 900),
 source_key text NOT NULL UNIQUE CHECK(source_key LIKE 'PHASE8_PROJECT_2026:%'),
 source_metadata jsonb NOT NULL DEFAULT '{"origin":"GENERATED_PROJECT","verified_institutionally":false}'::jsonb,
 PRIMARY KEY(curriculum_code,subject_code,component_type),
 FOREIGN KEY(curriculum_code,subject_code) REFERENCES public.curriculum_subjects(curriculum_code,subject_code)
  ON DELETE RESTRICT
);
ALTER TABLE public.project_phase8_contact_requirements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.project_phase8_contact_requirements FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON TABLE public.project_phase8_contact_requirements TO service_role;

CREATE OR REPLACE FUNCTION public.phase8_validate_project_block_hours_v1(p_block uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_state jsonb;v_bad int:=0;v_expected int:=0;
 v_item record;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'Trusted project service required' USING ERRCODE='42501';
 END IF;
 v_state:=public.phase8_validate_project_block_v1(p_block);
 SELECT count(*) INTO v_expected FROM public.block_subject_sections j
 JOIN public.sections s ON s.id=j.section_id
 JOIN public.block_sections b ON b.id=j.block_id
 JOIN public.project_phase8_contact_requirements cr
  ON cr.curriculum_code=b.curriculum_code AND cr.subject_code=s.subject_code
 WHERE j.block_id=p_block;
 SELECT count(*) INTO v_bad FROM public.block_subject_sections j
 JOIN public.sections s ON s.id=j.section_id
 JOIN public.block_sections b ON b.id=j.block_id
 LEFT JOIN public.project_phase8_contact_requirements cr
  ON cr.curriculum_code=b.curriculum_code AND cr.subject_code=s.subject_code
 WHERE j.block_id=p_block AND cr.subject_code IS NULL;
 FOR v_item IN
   SELECT s.id AS section_id,cr.component_type,cr.weekly_minutes
   FROM public.block_subject_sections j
   JOIN public.sections s ON s.id=j.section_id
   JOIN public.block_sections b ON b.id=j.block_id
   JOIN public.project_phase8_contact_requirements cr
     ON cr.curriculum_code=b.curriculum_code AND cr.subject_code=s.subject_code
   WHERE j.block_id=p_block
 LOOP
  IF v_item.weekly_minutes IS DISTINCT FROM (
    SELECT coalesce(sum(m.meeting_contact_minutes),0)::int
    FROM public.section_meetings m
    WHERE m.section_id=v_item.section_id
      AND m.meeting_status='ACTIVE'
      AND m.meeting_component_type=v_item.component_type
  ) THEN v_bad:=v_bad+1; END IF;
 END LOOP;
 IF EXISTS (
  SELECT 1 FROM public.block_subject_sections j
  JOIN public.section_meetings m ON m.section_id=j.section_id AND m.meeting_status='ACTIVE'
  JOIN public.sections s ON s.id=j.section_id
  JOIN public.block_sections b ON b.id=j.block_id
  LEFT JOIN public.project_phase8_contact_requirements cr
   ON cr.curriculum_code=b.curriculum_code AND cr.subject_code=s.subject_code
    AND cr.component_type=m.meeting_component_type
  WHERE j.block_id=p_block AND cr.subject_code IS NULL
 ) THEN v_bad:=v_bad+1; END IF;
 IF v_expected=0 THEN v_bad:=v_bad+1; END IF;
 v_state:=v_state||jsonb_build_object('contact_hour_mismatches',v_bad,
    'contact_requirements',v_expected,
    'ready',(v_state->>'ready')::boolean AND v_bad=0);
 UPDATE public.project_phase8_schedule_validations
 SET validation_status=CASE WHEN (v_state->>'ready')::boolean
  THEN 'READY_PROJECT' ELSE 'INCOMPLETE' END,
  summary=v_state,validated_at=clock_timestamp()
 WHERE block_id=p_block;
 RETURN v_state;
END $fn$;
REVOKE ALL ON FUNCTION public.phase8_validate_project_block_hours_v1(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase8_validate_project_block_hours_v1(uuid)
 TO service_role;

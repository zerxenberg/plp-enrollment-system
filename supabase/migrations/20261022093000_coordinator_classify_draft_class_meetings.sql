-- Academic Coordinator can classify an existing DRAFT class meeting after
-- consulting its approved curricular lecture/laboratory source.
SET lock_timeout='3s';
CREATE OR REPLACE FUNCTION public.coordinator_classify_draft_meeting_v1(
 p_meeting_id uuid,p_component text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_meeting public.section_meetings%ROWTYPE;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL
   OR public.current_role_code() IS DISTINCT FROM 'academic-coordinator' THEN
   RAISE EXCEPTION 'Academic Coordinator authorization required' USING ERRCODE='42501';
 END IF;
 IF p_component NOT IN ('LECTURE','LABORATORY','OTHER') THEN
   RAISE EXCEPTION 'A defined curricular session component is required';
 END IF;
 SELECT * INTO STRICT v_meeting FROM public.section_meetings
   WHERE id=p_meeting_id FOR UPDATE;
 IF v_meeting.meeting_status<>'ACTIVE' OR EXISTS (
     SELECT 1 FROM public.sections s
     JOIN public.block_subject_sections j ON j.section_id=s.id
     JOIN public.block_sections b ON b.id=j.block_id
     WHERE s.id=v_meeting.section_id
      AND (s.schedule_status='FINALIZED' OR b.planning_status='PUBLISHED')
 ) OR EXISTS (
     SELECT 1 FROM public.sections s WHERE s.id=v_meeting.section_id
       AND s.schedule_status='FINALIZED'
 ) THEN
   RAISE EXCEPTION 'Published meetings require an authorized schedule correction';
 END IF;
 UPDATE public.section_meetings SET meeting_component_type=p_component
   WHERE id=p_meeting_id;
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.coordinator_classify_draft_meeting_v1(uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.coordinator_classify_draft_meeting_v1(uuid,text)
 TO authenticated;

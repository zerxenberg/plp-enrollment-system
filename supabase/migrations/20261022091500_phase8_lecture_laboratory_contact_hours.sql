-- Record independently approved lecture/laboratory requirements before any
-- timetable is officially published. Existing DRAFT meetings remain unchanged.
SET lock_timeout = '3s';
ALTER TABLE public.section_meetings
 ADD COLUMN IF NOT EXISTS meeting_component_type text,
 ADD COLUMN IF NOT EXISTS meeting_contact_minutes integer GENERATED ALWAYS AS (
  CASE WHEN start_time IS NOT NULL AND end_time IS NOT NULL
        AND start_time < end_time
   THEN (extract(epoch FROM (end_time-start_time)) / 60)::integer
   ELSE NULL END
 ) STORED;
DO $constraints$
BEGIN
 IF NOT EXISTS (
 SELECT 1 FROM pg_constraint WHERE conrelid='public.section_meetings'::regclass
  AND conname='section_meetings_component_type_check'
 ) THEN
  ALTER TABLE public.section_meetings ADD CONSTRAINT section_meetings_component_type_check
   CHECK(meeting_component_type IS NULL OR meeting_component_type IN
       ('LECTURE','LABORATORY','OTHER'));
 END IF;
END $constraints$;

CREATE TABLE IF NOT EXISTS public.curriculum_subject_contact_requirements (
  curriculum_code text NOT NULL,
  subject_code text NOT NULL,
  meeting_component_type text NOT NULL CHECK
    (meeting_component_type IN ('LECTURE','LABORATORY','OTHER')),
  weekly_minutes integer NOT NULL CHECK (weekly_minutes BETWEEN 30 AND 900),
  approval_source_reference text NOT NULL CHECK
    (length(btrim(approval_source_reference)) > 0),
  approved_by_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT curriculum_contact_requirements_pk PRIMARY KEY
    (curriculum_code,subject_code,meeting_component_type),
  CONSTRAINT curriculum_contact_requirements_subject_fk
    FOREIGN KEY(curriculum_code,subject_code)
    REFERENCES public.curriculum_subjects(curriculum_code,subject_code)
    ON DELETE RESTRICT
);
ALTER TABLE public.curriculum_subject_contact_requirements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.curriculum_subject_contact_requirements
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.coordinator_set_subject_contact_requirement_v1(
 p_curriculum text,p_subject text,p_component text,
 p_minutes integer,p_source_reference text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_actor uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated'
   OR auth.uid() IS NULL
   OR public.current_role_code() IS DISTINCT FROM 'academic-coordinator' THEN
   RAISE EXCEPTION 'Academic Coordinator authorization required' USING ERRCODE='42501';
 END IF;
 SELECT id INTO STRICT v_actor FROM public.app_users
  WHERE auth_user_id=auth.uid() AND role_code='academic-coordinator'
    AND account_status='Active' AND login_enabled;
 IF p_component NOT IN ('LECTURE','LABORATORY','OTHER')
   OR p_minutes NOT BETWEEN 30 AND 900
   OR btrim(coalesce(p_source_reference,''))='' THEN
   RAISE EXCEPTION 'A valid contact-hour rule and approval source are required';
 END IF;
 -- Existing published schedules cannot be silently changed by a later
 -- curricular rule amendment without an independent correction workflow.
 IF EXISTS (
  SELECT 1 FROM public.block_sections b
  JOIN public.block_subject_sections j ON j.block_id=b.id
  JOIN public.sections s ON s.id=j.section_id
  WHERE b.curriculum_code=p_curriculum AND s.subject_code=p_subject
   AND b.planning_status='PUBLISHED'
 ) THEN
   RAISE EXCEPTION 'A published academic schedule requires formal revision';
 END IF;
 INSERT INTO public.curriculum_subject_contact_requirements
  (curriculum_code,subject_code,meeting_component_type,
   weekly_minutes,approval_source_reference,approved_by_user_id)
 VALUES (p_curriculum,p_subject,p_component,
  p_minutes,btrim(p_source_reference),v_actor)
 ON CONFLICT (curriculum_code,subject_code,meeting_component_type)
 DO UPDATE SET weekly_minutes=excluded.weekly_minutes,
  approval_source_reference=excluded.approval_source_reference,
  approved_by_user_id=excluded.approved_by_user_id,
  approved_at=clock_timestamp();
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION
 public.coordinator_set_subject_contact_requirement_v1(text,text,text,integer,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.coordinator_set_subject_contact_requirement_v1(text,text,text,integer,text)
 TO authenticated;

-- Publication requires documented contact-hour rules for all linked subjects,
-- equal to the sum of non-overlapping ACTIVE meetings of each component type.
-- Older draft schedule rows with NULL classifications remain untouched and
-- cannot be misrepresented as approved lecture/laboratory periods.
CREATE OR REPLACE FUNCTION public.zz_phase8_contact_hours_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_section record;
BEGIN
 IF TG_OP='INSERT' THEN RETURN NEW; END IF;
 IF NEW.planning_status IS DISTINCT FROM 'PUBLISHED'
   OR OLD.planning_status IS NOT DISTINCT FROM 'DRAFT' THEN
   RETURN NEW;
 END IF;
 FOR v_section IN
   SELECT s.id AS section_id,s.subject_code
   FROM public.block_subject_sections j
   JOIN public.sections s ON s.id=j.section_id
   WHERE j.block_id=NEW.id
 LOOP
   IF NOT EXISTS (
       SELECT 1 FROM public.curriculum_subject_contact_requirements r
       WHERE r.curriculum_code=NEW.curriculum_code
         AND r.subject_code=v_section.subject_code
     ) OR EXISTS (
       SELECT 1 FROM public.section_meetings m
       WHERE m.section_id=v_section.section_id AND m.meeting_status='ACTIVE'
         AND (m.meeting_component_type IS NULL OR m.meeting_contact_minutes IS NULL)
     ) OR EXISTS (
       SELECT 1 FROM public.curriculum_subject_contact_requirements r
       WHERE r.curriculum_code=NEW.curriculum_code
         AND r.subject_code=v_section.subject_code
         AND r.weekly_minutes IS DISTINCT FROM (
           SELECT coalesce(sum(m.meeting_contact_minutes),0)
           FROM public.section_meetings m
           WHERE m.section_id=v_section.section_id
             AND m.meeting_component_type=r.meeting_component_type
             AND m.meeting_status='ACTIVE'
         )
     ) OR EXISTS (
       SELECT 1 FROM public.section_meetings m
       WHERE m.section_id=v_section.section_id AND m.meeting_status='ACTIVE'
       AND NOT EXISTS (
         SELECT 1 FROM public.curriculum_subject_contact_requirements r
         WHERE r.curriculum_code=NEW.curriculum_code
           AND r.subject_code=v_section.subject_code
           AND r.meeting_component_type=m.meeting_component_type
       )
     ) THEN
     RAISE EXCEPTION 'Unapproved or incomplete lecture/laboratory contact hours block schedule publication'
       USING ERRCODE='23514';
   END IF;
 END LOOP;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.zz_phase8_contact_hours_guard()
 FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS zz_phase8_contact_hours_guard ON public.block_sections;
CREATE TRIGGER zz_phase8_contact_hours_guard
BEFORE INSERT OR UPDATE ON public.block_sections FOR EACH ROW
EXECUTE FUNCTION public.zz_phase8_contact_hours_guard();

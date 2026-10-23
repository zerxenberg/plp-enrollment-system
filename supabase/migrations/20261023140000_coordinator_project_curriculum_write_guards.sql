-- Coordinator curriculum protection for the 600 fictional project students.
-- ADDITIVE SAFETY MIGRATION. Reviewed release only; do not run from the GUI.
-- The existing RPC names and argument contracts remain unchanged.
--
-- Recovery: in a reviewed transaction, drop the two wrapper functions,
-- rename coordinator_manage_curriculum_version_original and
-- coordinator_save_curriculum_draft_original back to their prior names,
-- restore their original grants to authenticated/service_role, and drop
-- the five project protection triggers and both protection functions;
-- then NOTIFY pgrst,'reload schema' in the same reviewed transaction.

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $check$
BEGIN
  IF to_regprocedure('public.coordinator_manage_curriculum_version_original(text,text)') IS NOT NULL
     OR to_regprocedure('public.coordinator_save_curriculum_draft_original(jsonb,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'Project curriculum guards have already renamed an RPC';
  END IF;
  IF to_regprocedure('public.manage_curriculum_version(text,text)') IS NULL
     OR to_regprocedure('public.save_curriculum_draft(jsonb,text)') IS NULL THEN
    RAISE EXCEPTION 'Required existing Coordinator curriculum RPCs are missing';
  END IF;
END;
$check$;

-- Retain the original SQL implementations without copying or changing them.
-- Revoke direct execution, including PUBLIC, to prevent invoking the old
-- RPC implementation instead of the new protected public entry point.
ALTER FUNCTION public.manage_curriculum_version(text,text)
  RENAME TO coordinator_manage_curriculum_version_original;
ALTER FUNCTION public.save_curriculum_draft(jsonb,text)
  RENAME TO coordinator_save_curriculum_draft_original;

REVOKE ALL ON FUNCTION public.coordinator_manage_curriculum_version_original(text,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.coordinator_save_curriculum_draft_original(jsonb,text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.manage_curriculum_version(p_code text,p_action text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role('academic-coordinator') THEN
    RAISE EXCEPTION 'Academic Coordinator permission required' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.phase8_fictional_curriculum_provenance p
    WHERE p.curriculum_code = p_code AND p.is_official IS FALSE
  ) OR EXISTS (
    SELECT 1 FROM public.project_student_academic_placements p
    WHERE p.curriculum_code = p_code
  ) THEN
    RETURN jsonb_build_object('ok',false,
      'message','Assigned project simulation curricula are protected from lifecycle changes and duplication');
  END IF;
  RETURN public.coordinator_manage_curriculum_version_original(p_code,p_action);
END;
$function$;

CREATE FUNCTION public.save_curriculum_draft(
  p_record jsonb, p_existing_code text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role('academic-coordinator') THEN
    RAISE EXCEPTION 'Academic Coordinator permission required' USING ERRCODE = '42501';
  END IF;
  IF p_existing_code IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.phase8_fictional_curriculum_provenance p
      WHERE p.curriculum_code = p_existing_code AND p.is_official IS FALSE
    ) OR EXISTS (
      SELECT 1 FROM public.project_student_academic_placements p
      WHERE p.curriculum_code = p_existing_code
    )
  ) THEN
    RAISE EXCEPTION 'Assigned project simulation curricula are immutable'
      USING ERRCODE = '42501';
  END IF;
  RETURN public.coordinator_save_curriculum_draft_original(p_record,p_existing_code);
END;
$function$;

-- Guard the underlying rows as well: direct PostgREST DML and an elevated
-- SECURITY DEFINER transaction must both preserve fictional source history.
CREATE FUNCTION public.coordinator_protect_project_curriculum_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_old_code text;
  v_new_code text;
BEGIN
  -- Protect the 600 project-only subject masters themselves. They do not
  -- overlap with any of the institutional/non-project curriculum subjects.
  IF TG_TABLE_NAME = 'subjects' THEN
    IF EXISTS (
      SELECT 1 FROM public.curriculum_subjects cs
      JOIN public.phase8_fictional_curriculum_provenance p
        ON p.curriculum_code = cs.curriculum_code
      WHERE cs.subject_code = OLD.code AND p.is_official IS FALSE
    ) THEN
      RAISE EXCEPTION 'A project simulation subject master cannot be changed'
        USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- Approved importer retries use INSERT ... ON CONFLICT DO NOTHING.
  -- PostgreSQL still calls BEFORE INSERT triggers on duplicate rows; allow
  -- existing identities through because the constraint leaves them unchanged.
  -- ON CONFLICT DO UPDATE is still denied by the UPDATE trigger below.
  IF TG_OP = 'INSERT' AND TG_TABLE_NAME = 'curriculum_subjects'
     AND EXISTS (
       SELECT 1 FROM public.curriculum_subjects c
       WHERE c.curriculum_code = NEW.curriculum_code
         AND c.subject_code = NEW.subject_code
     ) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND TG_TABLE_NAME = 'subject_prerequisites'
     AND EXISTS (
       SELECT 1 FROM public.subject_prerequisites p
       WHERE p.curriculum_code = NEW.curriculum_code
         AND p.subject_code = NEW.subject_code
         AND p.prerequisite_subject_code = NEW.prerequisite_subject_code
     ) THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'curricula' THEN
    IF TG_OP <> 'INSERT' THEN v_old_code := OLD.code; END IF;
    IF TG_OP <> 'DELETE' THEN v_new_code := NEW.code; END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN v_old_code := OLD.curriculum_code; END IF;
    IF TG_OP <> 'DELETE' THEN v_new_code := NEW.curriculum_code; END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.phase8_fictional_curriculum_provenance p
    WHERE p.curriculum_code IN (v_old_code,v_new_code) AND p.is_official IS FALSE
  ) OR EXISTS (
    SELECT 1 FROM public.project_student_academic_placements p
    WHERE p.curriculum_code IN (v_old_code,v_new_code)
  ) THEN
    RAISE EXCEPTION 'Project simulation curriculum and its academic rules are immutable'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER coordinator_guard_project_curricula_v1
BEFORE UPDATE OR DELETE ON public.curricula
FOR EACH ROW EXECUTE FUNCTION public.coordinator_protect_project_curriculum_v1();

CREATE TRIGGER coordinator_guard_project_curriculum_subjects_v1
BEFORE INSERT OR UPDATE OR DELETE ON public.curriculum_subjects
FOR EACH ROW EXECUTE FUNCTION public.coordinator_protect_project_curriculum_v1();

CREATE TRIGGER coordinator_guard_project_prerequisites_v1
BEFORE INSERT OR UPDATE OR DELETE ON public.subject_prerequisites
FOR EACH ROW EXECUTE FUNCTION public.coordinator_protect_project_curriculum_v1();

CREATE TRIGGER coordinator_guard_project_subject_masters_v1
BEFORE UPDATE OR DELETE ON public.subjects
FOR EACH ROW EXECUTE FUNCTION public.coordinator_protect_project_curriculum_v1();

-- Student scheduling may still adjust home_block_id through the approved
-- planning flow. Academic identity and curriculum placement provenance may
-- not be silently reassigned by a service caller during this cohort's term.
CREATE FUNCTION public.coordinator_guard_project_placement_identity_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF ROW(
    NEW.term_id, NEW.program_code, NEW.program_track_code,
    NEW.curriculum_code, NEW.year_level, NEW.academic_classification,
    NEW.project_cohort_id, NEW.source_key
  ) IS DISTINCT FROM ROW(
    OLD.term_id, OLD.program_code, OLD.program_track_code,
    OLD.curriculum_code, OLD.year_level, OLD.academic_classification,
    OLD.project_cohort_id, OLD.source_key
  ) THEN
    RAISE EXCEPTION 'Project student academic placement identity is immutable'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER coordinator_guard_project_placement_identity_v1
BEFORE UPDATE ON public.project_student_academic_placements
FOR EACH ROW EXECUTE FUNCTION public.coordinator_guard_project_placement_identity_v1();

REVOKE ALL ON FUNCTION public.manage_curriculum_version(text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_curriculum_version(text,text)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_curriculum_draft(jsonb,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_curriculum_draft(jsonb,text)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.coordinator_protect_project_curriculum_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.coordinator_guard_project_placement_identity_v1()
  FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst,'reload schema';

COMMIT;

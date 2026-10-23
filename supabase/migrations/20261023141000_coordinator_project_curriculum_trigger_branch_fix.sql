-- Repair the already-applied coordinator curriculum trigger without rewriting
-- its history. PL/pgSQL Boolean expressions are not safe record-type guards:
-- AND does not guarantee that a reference to NEW.curriculum_code is skipped
-- when this trigger is executing on public.curricula (which has only code).
--
-- Preserve all P8F26 protections and the idempotent phase8 importer.
-- Only the trigger function body changes; existing triggers and RPCs remain.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $preflight$
BEGIN
  IF to_regprocedure('public.coordinator_protect_project_curriculum_v1()') IS NULL THEN
    RAISE EXCEPTION 'Required previously applied coordinator guard is absent';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.coordinator_protect_project_curriculum_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_old_code text;
  v_new_code text;
BEGIN
  -- Branch on the table BEFORE accessing any table-specific OLD/NEW fields.
  IF TG_TABLE_SCHEMA <> 'public' THEN
    RAISE EXCEPTION 'Unexpected project curriculum trigger schema'
      USING ERRCODE = '42501';
  END IF;

  IF TG_TABLE_NAME = 'subjects' THEN
    IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
      IF EXISTS (
        SELECT 1 FROM public.curriculum_subjects cs
        JOIN public.phase8_fictional_curriculum_provenance p
          ON p.curriculum_code = cs.curriculum_code
        WHERE cs.subject_code = OLD.code AND p.is_official IS FALSE
      ) THEN
        RAISE EXCEPTION 'A project simulation subject master cannot be changed'
          USING ERRCODE = '42501';
      END IF;
      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Unexpected project subject guard operation'
        USING ERRCODE = '42501';
    END IF;

  ELSIF TG_TABLE_NAME = 'curricula' THEN
    IF TG_OP = 'UPDATE' THEN
      v_old_code := OLD.code;
      v_new_code := NEW.code;
    ELSIF TG_OP = 'DELETE' THEN
      v_old_code := OLD.code;
    ELSE
      RAISE EXCEPTION 'Unexpected curriculum guard operation'
        USING ERRCODE = '42501';
    END IF;

  ELSIF TG_TABLE_NAME = 'curriculum_subjects' THEN
    IF TG_OP = 'INSERT' THEN
      v_new_code := NEW.curriculum_code;
    ELSIF TG_OP = 'UPDATE' THEN
      v_old_code := OLD.curriculum_code;
      v_new_code := NEW.curriculum_code;
    ELSIF TG_OP = 'DELETE' THEN
      v_old_code := OLD.curriculum_code;
    ELSE
      RAISE EXCEPTION 'Unexpected curriculum subject guard operation'
        USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
      -- Prevent using one of the 600 P8F26 subject codes in a regular
      -- curriculum. A protected subject may be shared among P8F26 versions.
      IF EXISTS (
        SELECT 1 FROM public.curriculum_subjects protected_subject
        JOIN public.phase8_fictional_curriculum_provenance source
          ON source.curriculum_code = protected_subject.curriculum_code
         AND source.is_official IS FALSE
        WHERE protected_subject.subject_code = NEW.subject_code
      ) AND NOT EXISTS (
        SELECT 1 FROM public.phase8_fictional_curriculum_provenance destination
        WHERE destination.curriculum_code = NEW.curriculum_code
          AND destination.is_official IS FALSE
      ) THEN
        RAISE EXCEPTION 'Project simulation subjects cannot be placed in institutional curricula'
          USING ERRCODE = '42501';
      END IF;

      IF TG_OP = 'INSERT' THEN
        -- BEFORE INSERT fires even for ON CONFLICT DO NOTHING. Keep the
        -- approved importer replay harmless when this identity already exists.
        IF EXISTS (
          SELECT 1 FROM public.curriculum_subjects c
          WHERE c.curriculum_code = NEW.curriculum_code
            AND c.subject_code = NEW.subject_code
        ) THEN
          RETURN NEW;
        END IF;
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'subject_prerequisites' THEN
    IF TG_OP = 'INSERT' THEN
      v_new_code := NEW.curriculum_code;
      -- Keep ON CONFLICT DO NOTHING replay of protected prerequisites.
      IF EXISTS (
        SELECT 1 FROM public.subject_prerequisites p
        WHERE p.curriculum_code = NEW.curriculum_code
          AND p.subject_code = NEW.subject_code
          AND p.prerequisite_subject_code = NEW.prerequisite_subject_code
      ) THEN
        RETURN NEW;
      END IF;
    ELSIF TG_OP = 'UPDATE' THEN
      v_old_code := OLD.curriculum_code;
      v_new_code := NEW.curriculum_code;
    ELSIF TG_OP = 'DELETE' THEN
      v_old_code := OLD.curriculum_code;
    ELSE
      RAISE EXCEPTION 'Unexpected prerequisite guard operation'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unexpected project curriculum guard table'
      USING ERRCODE = '42501';
  END IF;

  -- Immutable project curricula block all writes to their own definition,
  -- including attempts to move a row into or out of a protected curriculum.
  IF EXISTS (
    SELECT 1 FROM public.phase8_fictional_curriculum_provenance p
    WHERE p.curriculum_code IN (v_old_code, v_new_code) AND p.is_official IS FALSE
  ) OR EXISTS (
    SELECT 1 FROM public.project_student_academic_placements p
    WHERE p.curriculum_code IN (v_old_code, v_new_code)
  ) THEN
    RAISE EXCEPTION 'Project simulation curriculum and its academic rules are immutable'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

-- No trigger recreation required. CREATE OR REPLACE preserves the function
-- identity and existing EXECUTE revocations.
NOTIFY pgrst, 'reload schema';
COMMIT;

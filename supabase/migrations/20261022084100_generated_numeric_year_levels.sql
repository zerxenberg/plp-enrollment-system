-- Backward-compatible typed year levels. Existing text remains the write
-- authority until consumers have been migrated. Generated SMALLINT columns
-- cannot be directly written by students or stale clients.
-- No UPDATE to historic rows: this avoids changing 2,129 student timestamps,
-- firing 573 academic update audit events, or mutating 600 PROJECT_ONLY rows.
BEGIN;
SET LOCAL lock_timeout = '3s';

DO $preflight$
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'Approved postgres migration actor required';
  END IF;
  IF to_regclass('public.student_profiles') IS NULL
     OR to_regclass('public.curriculum_subjects') IS NULL
     OR EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public'
         AND table_name IN ('student_profiles','curriculum_subjects')
         AND column_name='year_level_number'
     ) THEN
    RAISE EXCEPTION 'Numeric year migration baseline differs';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.student_profiles
    WHERE year_level IS NOT NULL
      AND year_level NOT IN ('1st Year','2nd Year','3rd Year','4th Year')
  ) OR EXISTS (
    SELECT 1 FROM public.curriculum_subjects
    WHERE year_level IS NOT NULL
      AND year_level NOT IN ('1st Year','2nd Year','3rd Year','4th Year')
  ) THEN
    RAISE EXCEPTION 'Unrecognized historical year label requires source review';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.protect_student_profile_update()'::regprocedure
      AND p.prosecdef AND p.proowner='postgres'::regrole
      AND pg_get_functiondef(p.oid) LIKE '%to_jsonb(NEW) - ARRAY[%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid='public.student_profiles'::regclass
      AND t.tgname='trg_protect_student_profile_update'
      AND t.tgenabled='O'
  ) THEN
    RAISE EXCEPTION 'Profile contact-only security guard changed; review before adding year column';
  END IF;
END
$preflight$;

ALTER TABLE public.student_profiles
  ADD COLUMN year_level_number smallint
  GENERATED ALWAYS AS (
    (CASE year_level
      WHEN '1st Year' THEN 1
      WHEN '2nd Year' THEN 2
      WHEN '3rd Year' THEN 3
      WHEN '4th Year' THEN 4
      ELSE NULL
    END)::smallint
  ) STORED;

ALTER TABLE public.curriculum_subjects
  ADD COLUMN year_level_number smallint
  GENERATED ALWAYS AS (
    (CASE year_level
      WHEN '1st Year' THEN 1
      WHEN '2nd Year' THEN 2
      WHEN '3rd Year' THEN 3
      WHEN '4th Year' THEN 4
      ELSE NULL
    END)::smallint
  ) STORED;

-- Generated values may not be computed yet in a BEFORE UPDATE trigger.
-- Ignore only the derived column in the existing student contact guard:
-- changing authoritative year_level (or any identity/academic field)
-- still differs in JSON and remains forbidden to Student actors.
CREATE OR REPLACE FUNCTION public.protect_student_profile_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $guard$
BEGIN
  IF public.current_role_code() = 'student' THEN
    IF (to_jsonb(NEW) - ARRAY[
      'contact_number','address','emergency_contact_name',
      'emergency_contact_number','updated_at','year_level_number'
    ]::text[]) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY[
      'contact_number','address','emergency_contact_name',
      'emergency_contact_number','updated_at','year_level_number'
    ]::text[]) THEN
      RAISE EXCEPTION 'Students may edit only contact and emergency profile fields.'
        USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END
$guard$;
REVOKE ALL ON FUNCTION public.protect_student_profile_update()
  FROM PUBLIC, anon, authenticated;

-- Newly entered placement values must remain in the approved four-year
-- domain; existing NULLs (600 unverified project records plus 8 others)
-- remain NULL in the numeric columns.
ALTER TABLE public.student_profiles
  ADD CONSTRAINT student_profiles_year_level_labels_check
  CHECK (year_level IS NULL OR year_level IN
     ('1st Year','2nd Year','3rd Year','4th Year')) NOT VALID;
ALTER TABLE public.student_profiles
  VALIDATE CONSTRAINT student_profiles_year_level_labels_check;
ALTER TABLE public.curriculum_subjects
  ADD CONSTRAINT curriculum_subjects_year_level_labels_check
  CHECK (year_level IS NULL OR year_level IN
     ('1st Year','2nd Year','3rd Year','4th Year')) NOT VALID;
ALTER TABLE public.curriculum_subjects
  VALIDATE CONSTRAINT curriculum_subjects_year_level_labels_check;

DO $postflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.student_profiles
    WHERE year_level_number IS DISTINCT FROM
      CASE year_level WHEN '1st Year' THEN 1 WHEN '2nd Year' THEN 2
        WHEN '3rd Year' THEN 3 WHEN '4th Year' THEN 4 ELSE NULL END
  ) OR EXISTS (
    SELECT 1 FROM public.curriculum_subjects
    WHERE year_level_number IS DISTINCT FROM
      CASE year_level WHEN '1st Year' THEN 1 WHEN '2nd Year' THEN 2
        WHEN '3rd Year' THEN 3 WHEN '4th Year' THEN 4 ELSE NULL END
  ) OR EXISTS (
    SELECT 1 FROM public.student_profiles
    WHERE record_kind='PROJECT_ONLY' AND year_level_number IS NOT NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.protect_student_profile_update()'::regprocedure
      AND p.prosecdef AND p.proowner='postgres'::regrole
      AND pg_get_functiondef(p.oid) LIKE '%year_level_number%'
      AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
  ) OR EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name IN ('student_profiles','curriculum_subjects')
      AND column_name='year_level_number'
      AND (data_type<>'smallint' OR is_generated<>'ALWAYS')
  ) THEN
    RAISE EXCEPTION 'Generated numeric year postflight failed';
  END IF;
END
$postflight$;
COMMIT;

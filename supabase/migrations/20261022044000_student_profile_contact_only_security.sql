-- Phase 9 P1: permit only self-service Student contact edits at the database
-- layer; protect identity, academic state and institutional provenance.
-- Existing project-only, synthetic-source and Registrar guards stay intact.
BEGIN;
DO $preflight$
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'Approved postgres migration identity required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.protect_student_profile_update()'::regprocedure
      AND p.prosecdef AND p.proowner='postgres'::regrole
      AND pg_get_functiondef(p.oid) LIKE '%NEW.user_id IS DISTINCT FROM OLD.user_id%'
  ) THEN
    RAISE EXCEPTION 'Expected existing profile guard not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid='public.student_profiles'::regclass
      AND t.tgname='trg_protect_student_profile_update' AND t.tgenabled='O'
      AND t.tgfoid='public.protect_student_profile_update()'::regprocedure
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid='public.student_profiles'::regclass
      AND t.tgname='trg_student_profiles_updated_at' AND t.tgenabled='O'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid='public.student_profiles'::regclass
      AND p.polname='student_profiles_student_or_registrar_update'
      AND p.polcmd='w'
  ) THEN
    RAISE EXCEPTION 'Expected Student/Registrar profile protection has drifted';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.protect_student_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $guard$
BEGIN
  IF public.current_role_code() = 'student' THEN
    IF (to_jsonb(NEW) - ARRAY[
      'contact_number','address','emergency_contact_name',
      'emergency_contact_number','updated_at'
    ]::text[]) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY[
      'contact_number','address','emergency_contact_name',
      'emergency_contact_number','updated_at'
    ]::text[]) THEN
      RAISE EXCEPTION 'Students may edit only contact and emergency profile fields.'
        USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END
$guard$;

DO $postflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.protect_student_profile_update()'::regprocedure
      AND p.prosecdef AND p.proowner='postgres'::regrole
      AND pg_get_functiondef(p.oid) LIKE '%to_jsonb(NEW) - ARRAY[%'
      AND pg_get_functiondef(p.oid) LIKE '%emergency_contact_number%'
      AND pg_get_functiondef(p.oid) NOT LIKE '%NEW.user_id IS DISTINCT FROM OLD.user_id%'
      AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
      AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'Student Profile write guard postflight failed';
  END IF;
END
$postflight$;
COMMIT;

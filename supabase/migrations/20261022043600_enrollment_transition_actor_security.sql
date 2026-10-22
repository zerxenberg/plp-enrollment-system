-- Phase 9 P0: SECURITY DEFINER current_user shortcut enabled illegal
-- authenticated enrollment status transitions. Preserve owner, ACL, RLS,
-- table structure, rows and existing transition matrix.
BEGIN;
DO $preflight$
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'Approved postgres migration identity required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.validate_enrollment_status_transition()'::regprocedure
      AND p.prosecdef AND p.proowner='postgres'::regrole
      AND pg_get_functiondef(p.oid) LIKE '%current_user IN (%'
  ) THEN
    RAISE EXCEPTION 'Expected existing vulnerable transition function not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid='public.enrollments'::regclass
      AND t.tgname='trg_validate_enrollment_status_transition'
      AND t.tgenabled='O'
      AND t.tgfoid='public.validate_enrollment_status_transition()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'Expected enabled enrollment transition trigger not found';
  END IF;
  IF (SELECT count(*) FROM public.enrollment_status_transitions
      WHERE to_status='CONFIRMED' AND actor_code='REGISTRAR') <> 1
     OR EXISTS (SELECT 1 FROM public.enrollment_status_transitions
       WHERE to_status='CONFIRMED' AND actor_code <> 'REGISTRAR') THEN
    RAISE EXCEPTION 'Registrar-only confirmation transition matrix has drifted';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.validate_enrollment_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $guard$
DECLARE v_actor_code text;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- SECURITY DEFINER current_user is postgres, NOT the invoking user.
  -- The signed request role is installed by PostgREST; SQL Editor migration
  -- commands have postgres session_user and no Auth JWT identity.
  IF auth.role() = 'service_role'
     OR (session_user = 'postgres' AND auth.uid() IS NULL) THEN
    RETURN NEW;
  END IF;

  v_actor_code := CASE public.current_role_code()
    WHEN 'student' THEN 'STUDENT'
    WHEN 'registrar' THEN 'REGISTRAR'
    WHEN 'academic-coordinator' THEN 'ACADEMIC_COORDINATOR'
    ELSE NULL
  END;

  IF v_actor_code IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.enrollment_status_transitions t
    WHERE t.from_status=OLD.status
      AND t.to_status=NEW.status
      AND t.actor_code=v_actor_code
  ) THEN
    RAISE EXCEPTION 'Illegal enrollment status transition from % to % for current role.',
      OLD.status, NEW.status USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$guard$;

DO $postflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.validate_enrollment_status_transition()'::regprocedure
      AND p.prosecdef AND p.proowner='postgres'::regrole
      AND pg_get_functiondef(p.oid) LIKE '%t.actor_code=v_actor_code%'
      AND pg_get_functiondef(p.oid) NOT LIKE '%current_user IN (%'
      AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
      AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'Enrollment transition role postflight failed';
  END IF;
END
$postflight$;
COMMIT;

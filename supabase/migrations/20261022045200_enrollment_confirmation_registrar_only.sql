-- Phase 9 P0 follow-up: service role and direct SQL maintenance are limited
-- to explicitly defined SYSTEM transitions. Only a signed, active Registrar
-- may confirm an already VALIDATED enrollment. Does not change any data.
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
      AND pg_get_functiondef(p.oid) LIKE '%t.actor_code=v_actor_code%'
      AND pg_get_functiondef(p.oid) NOT LIKE '%current_user IN (%'
  ) THEN
    RAISE EXCEPTION 'Expected version 20261022043600 actor check not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid='public.enrollments'::regclass
      AND t.tgname='trg_validate_enrollment_status_transition'
      AND t.tgenabled='O'
      AND t.tgfoid='public.validate_enrollment_status_transition()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'Enrollment status trigger was changed';
  END IF;
  IF (SELECT count(*) FROM public.enrollment_status_transitions
      WHERE from_status='VALIDATED' AND to_status='CONFIRMED'
        AND actor_code='REGISTRAR') <> 1
    OR EXISTS (
      SELECT 1 FROM public.enrollment_status_transitions
      WHERE to_status='CONFIRMED'
        AND (actor_code <> 'REGISTRAR' OR from_status <> 'VALIDATED')
    ) THEN
    RAISE EXCEPTION 'Expected Registrar-only approval matrix changed';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.validate_enrollment_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $guard$
DECLARE
  v_actor_code text;
  v_request_role text;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  v_request_role := auth.role();
  v_actor_code := CASE public.current_role_code()
    WHEN 'student' THEN 'STUDENT'
    WHEN 'registrar' THEN 'REGISTRAR'
    WHEN 'academic-coordinator' THEN 'ACADEMIC_COORDINATOR'
    ELSE NULL
  END;

  -- Privileged technical sessions are NOT equivalent to the official
  -- Registrar. This restriction also applies to service-role RPC callers.
  IF NEW.status = 'CONFIRMED' THEN
    IF v_request_role IS DISTINCT FROM 'authenticated'
      OR auth.uid() IS NULL
      OR v_actor_code IS DISTINCT FROM 'REGISTRAR'
      OR OLD.status IS DISTINCT FROM 'VALIDATED' THEN
      RAISE EXCEPTION 'Only an authenticated Registrar may confirm validated enrollment.'
        USING ERRCODE='42501';
    END IF;
  END IF;

  -- The original scheduler/system transitions remain available only when
  -- they are explicitly present in the transition matrix as SYSTEM.
  IF v_request_role = 'service_role'
     OR (session_user = 'postgres' AND auth.uid() IS NULL) THEN
    IF EXISTS (
      SELECT 1 FROM public.enrollment_status_transitions t
      WHERE t.from_status=OLD.status
        AND t.to_status=NEW.status
        AND t.actor_code='SYSTEM'
    ) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'System execution is not authorized for this enrollment transition.'
      USING ERRCODE='42501';
  END IF;

  IF v_request_role IS DISTINCT FROM 'authenticated'
     OR v_actor_code IS NULL
     OR NOT EXISTS (
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
  IF NOT EXISTS(
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.validate_enrollment_status_transition()'::regprocedure
      AND p.prosecdef AND p.proowner='postgres'::regrole
      AND pg_get_functiondef(p.oid) LIKE '%Only an authenticated Registrar may confirm validated enrollment%'
      AND pg_get_functiondef(p.oid) LIKE '%t.actor_code=''SYSTEM''%'
      AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
      AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'Registrar-only transition postflight failed';
  END IF;
END
$postflight$;
COMMIT;

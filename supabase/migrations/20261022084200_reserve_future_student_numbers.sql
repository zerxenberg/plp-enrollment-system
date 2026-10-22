-- Protected, per-year future YY-NNNNN number reservation. Existing student
-- IDs, including all historical DEMO-* IDs and PROJECT_ONLY identities,
-- are never changed or repurposed. Number reservation is not admission,
-- account provisioning, or enrollment approval.
BEGIN;
SET LOCAL lock_timeout = '3s';

DO $preflight$
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'Approved postgres migration actor required';
  END IF;
  IF to_regclass('public.student_number_counters') IS NULL
     OR to_regclass('public.student_profiles') IS NULL
     OR to_regclass('public.student_number_reservations') IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.student_number_counters)
     OR EXISTS (
       SELECT 1 FROM pg_proc
       WHERE pronamespace='public'::regnamespace
         AND proname='reserve_future_student_number'
     ) THEN
    RAISE EXCEPTION 'Student number allocator already exists or baseline differs';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.student_profiles
    WHERE student_number ~ '^[0-9]{2}-[0-9]{5}$'
      AND substring(student_number FROM 4 FOR 5)::integer NOT BETWEEN 1 AND 99999
  ) THEN
    RAISE EXCEPTION 'Zero/out-of-range canonical student serial needs source review';
  END IF;
END
$preflight$;

-- A reservation remains consumed even if a later enrollment or provisioning
-- action fails. Issued IDs must never be recycled into another student.
CREATE TABLE public.student_number_reservations (
  student_number text PRIMARY KEY,
  entry_year integer NOT NULL REFERENCES public.student_number_counters(entry_year)
    ON DELETE RESTRICT,
  serial_number integer NOT NULL CHECK (serial_number BETWEEN 1 AND 99999),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_number_reservations_year_check
    CHECK (entry_year BETWEEN 2000 AND 2099),
  CONSTRAINT student_number_reservations_format_check
    CHECK (student_number =
      lpad((entry_year - 2000)::text, 2, '0') || '-' ||
      lpad(serial_number::text, 5, '0')),
  CONSTRAINT student_number_reservations_year_serial_key
    UNIQUE (entry_year, serial_number)
);
ALTER TABLE public.student_number_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.student_number_reservations
  FROM PUBLIC, anon, authenticated;

-- Initialize each observed year at the next unused serial above ALL existing
-- canonical IDs, both PROJECT_ONLY and institutional. No updates to profiles.
WITH existing AS (
  SELECT 2000 + left(student_number,2)::integer AS entry_year,
         substring(student_number FROM 4 FOR 5)::integer AS serial_number
  FROM public.student_profiles
  WHERE student_number ~ '^[0-9]{2}-[0-9]{5}$'
)
INSERT INTO public.student_number_counters (entry_year,next_serial)
SELECT entry_year,max(serial_number) + 1
FROM existing
GROUP BY entry_year;

WITH existing AS (
  SELECT student_number,
         2000 + left(student_number,2)::integer AS entry_year,
         substring(student_number FROM 4 FOR 5)::integer AS serial_number
  FROM public.student_profiles
  WHERE student_number ~ '^[0-9]{2}-[0-9]{5}$'
)
INSERT INTO public.student_number_reservations
  (student_number,entry_year,serial_number)
SELECT student_number,entry_year,serial_number FROM existing;

-- SECURITY DEFINER only to serialize counter increments and insert immutable
-- reservations. PostgREST clients lack table grants; only trusted service_role
-- can call. The caller must subsequently create the Student record through a
-- trusted workflow and retry its unique student_number insert on collision.
CREATE FUNCTION public.reserve_future_student_number(p_entry_year integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $allocate$
DECLARE
  v_serial integer;
  v_student_number text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Student number allocation requires trusted server access'
      USING ERRCODE='42501';
  END IF;
  IF p_entry_year IS NULL OR p_entry_year NOT BETWEEN 2000 AND 2099 THEN
    RAISE EXCEPTION 'Entry year must be between 2000 and 2099'
      USING ERRCODE='22023';
  END IF;

  -- Serialize cold-start counter creation for the year as well as issuance.
  PERFORM pg_catalog.pg_advisory_xact_lock(28721, p_entry_year);
  INSERT INTO public.student_number_counters (entry_year,next_serial)
  SELECT p_entry_year,
         coalesce(max(r.serial_number),0) + 1
  FROM public.student_number_reservations r
  WHERE r.entry_year=p_entry_year
  ON CONFLICT (entry_year) DO NOTHING;

  LOOP
    UPDATE public.student_number_counters
       SET next_serial=next_serial+1, updated_at=now()
     WHERE entry_year=p_entry_year AND next_serial<=99999
     RETURNING next_serial-1 INTO v_serial;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Student number space is exhausted for the requested entry year'
        USING ERRCODE='22003';
    END IF;
    v_student_number :=
      lpad((p_entry_year-2000)::text,2,'0') || '-' ||
      lpad(v_serial::text,5,'0');

    -- Handles legacy/manual IDs inserted since counter initialization.
    IF EXISTS (SELECT 1 FROM public.student_profiles
               WHERE student_number=v_student_number) THEN
      CONTINUE;
    END IF;
    BEGIN
      INSERT INTO public.student_number_reservations
        (student_number,entry_year,serial_number)
      VALUES (v_student_number,p_entry_year,v_serial);
      RETURN v_student_number;
    EXCEPTION WHEN unique_violation THEN
      -- Never issue the same ID even after an externally inserted reservation.
      CONTINUE;
    END;
  END LOOP;
END
$allocate$;

REVOKE ALL ON FUNCTION public.reserve_future_student_number(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_future_student_number(integer)
  TO service_role;

DO $postflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.student_profiles s
    WHERE s.student_number ~ '^[0-9]{2}-[0-9]{5}$'
      AND NOT EXISTS (
        SELECT 1 FROM public.student_number_reservations r
        WHERE r.student_number=s.student_number
      )
  ) OR EXISTS (
    SELECT 1 FROM public.student_number_counters c
    WHERE c.next_serial <= (
      SELECT max(r.serial_number) FROM public.student_number_reservations r
      WHERE r.entry_year=c.entry_year
    )
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.reserve_future_student_number(integer)'::regprocedure
      AND p.prosecdef AND p.proowner='postgres'::regrole
      AND has_function_privilege('service_role',p.oid,'EXECUTE')
      AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
      AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
  ) OR has_table_privilege('anon','public.student_number_reservations','SELECT')
    OR has_table_privilege('authenticated',
       'public.student_number_reservations','SELECT') THEN
    RAISE EXCEPTION 'Student number reservation postflight failed';
  END IF;
END
$postflight$;
COMMIT;

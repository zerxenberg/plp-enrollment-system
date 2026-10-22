-- Additive-only foundation; no updates to existing tables.
SET lock_timeout = '3s';
DO $new_table_guard$
BEGIN
  IF to_regclass('public.colleges') IS NOT NULL OR
     to_regclass('public.student_data_cohorts') IS NOT NULL OR
     to_regclass('public.student_data_cohort_members') IS NOT NULL OR
     to_regclass('public.student_number_counters') IS NOT NULL THEN
    RAISE EXCEPTION 'Additive cohort foundation must be applied only to an absent-table baseline';
  END IF;
END
$new_table_guard$;
DO $preflight$
DECLARE required_table text;
BEGIN
  FOREACH required_table IN ARRAY ARRAY[
    'public.organizational_units', 'public.academic_terms',
    'public.student_profiles', 'public.curriculum_subjects', 'public.app_users'
  ] LOOP
    IF to_regclass(required_table) IS NULL THEN
      RAISE EXCEPTION 'Missing expected baseline table: %', required_table;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizational_units'
      AND column_name = 'code' AND data_type = 'text'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizational_units'
      AND column_name = 'unit_type' AND data_type = 'text'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'academic_terms'
      AND column_name = 'id' AND data_type = 'text'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_profiles'
      AND column_name = 'id' AND data_type = 'uuid'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'app_users'
      AND column_name = 'id' AND data_type = 'uuid'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'app_users'
      AND column_name = 'full_name' AND data_type = 'text'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_profiles'
      AND column_name = 'year_level'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'curriculum_subjects'
      AND column_name = 'year_level'
  ) THEN
    RAISE EXCEPTION 'Baseline key or year_level column differs: reconcile before promotion';
  END IF;
END
$preflight$;

-- A college is a subtype of an existing organizational unit, not a second
-- institution or a replacement for organizational_units / programs.
-- The parent must have unit_type = 'COLLEGE'; enforce on new subtype writes.
CREATE TABLE IF NOT EXISTS public.colleges (
  code text PRIMARY KEY REFERENCES public.organizational_units(code) ON DELETE RESTRICT,
  internal_code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT colleges_code_not_blank CHECK (length(btrim(code)) > 0),
  CONSTRAINT colleges_internal_code_not_blank CHECK (
    length(btrim(internal_code)) > 0 AND internal_code = btrim(internal_code)
  )
);

CREATE OR REPLACE FUNCTION public.enforce_college_organizational_subtype()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organizational_units u
    WHERE u.code = NEW.code AND u.unit_type = 'COLLEGE'
  ) THEN
    RAISE EXCEPTION 'College code must reference an organizational unit of type COLLEGE'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION public.enforce_college_organizational_subtype()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER colleges_organizational_subtype_guard
BEFORE INSERT OR UPDATE OF code ON public.colleges
FOR EACH ROW EXECUTE FUNCTION public.enforce_college_organizational_subtype();
-- Future organizational_units.unit_type edits must also preserve this subtype
-- invariant. Its owner must enforce that via a separate authorized change path.

-- Student-data cohorts provide a stable term-scoped grouping. They are not academic block
-- assignments or Registrar-confirmed enrollment and do not grant eligibility.
CREATE TABLE IF NOT EXISTS public.student_data_cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_key text NOT NULL UNIQUE,
  academic_term_id text NOT NULL REFERENCES public.academic_terms(id) ON DELETE RESTRICT,
  expected_count integer NOT NULL CHECK (expected_count > 0),
  is_project_data boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_data_cohorts_key_nonblank CHECK (
    length(btrim(cohort_key)) > 0 AND cohort_key = btrim(cohort_key)
  )
);
CREATE INDEX IF NOT EXISTS student_data_cohorts_academic_term_project_idx
  ON public.student_data_cohorts (academic_term_id, is_project_data);

-- This classification identifies the admission/enrollment student category,
-- not REGULAR/IRREGULAR academic eligibility. A student can have distinct
-- term-specific cohort membership while keeping one permanent identity.
CREATE TABLE IF NOT EXISTS public.student_data_cohort_members (
  cohort_id uuid NOT NULL REFERENCES public.student_data_cohorts(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.student_profiles(id) ON DELETE RESTRICT,
  classification text NOT NULL CHECK (classification IN (
    'CONTINUING_STUDENT', 'NEW_STUDENT', 'TRANSFEREE'
  )),
  data_origin text NOT NULL CHECK (data_origin IN (
    'GENERATED_PROJECT', 'MIGRATED_TEST', 'INSTITUTION_VERIFIED'
  )),
  source_reference text,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cohort_id, student_id),
  CONSTRAINT student_data_cohort_members_source_evidence CHECK (
    data_origin <> 'INSTITUTION_VERIFIED'
    OR length(btrim(coalesce(source_reference, ''))) > 0
  )
);
CREATE INDEX IF NOT EXISTS student_data_cohort_members_student_idx
  ON public.student_data_cohort_members (student_id, cohort_id);

-- Counter values are RESERVED for a future trusted, atomic student-number
-- allocation transaction. No automatic assignments or changes to legacy
-- student_numbers are made here. A client must never update counters directly.
CREATE TABLE IF NOT EXISTS public.student_number_counters (
  entry_year integer PRIMARY KEY CHECK (entry_year BETWEEN 2000 AND 2099),
  next_serial integer NOT NULL CHECK (next_serial BETWEEN 1 AND 100000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Deny browser table access. No anon/authenticated table GRANTs or RLS
-- policies are provided; later approved workflows require trusted RPCs.
ALTER TABLE public.colleges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_data_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_data_cohort_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.colleges, public.student_data_cohorts,
  public.student_data_cohort_members, public.student_number_counters
  FROM PUBLIC, anon, authenticated;

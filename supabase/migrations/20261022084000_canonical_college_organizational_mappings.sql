-- Seven approved canonical colleges; preserve existing organizational unit
-- codes and all program foreign keys. CCSIT is an explicitly reviewed legacy
-- alias of CCS, not an eighth college. COED/COE remain distinct legacy codes.
-- Source: Final Normalized Cleaned ERD, section 8.2; approved-model-reconciliation.
BEGIN;
SET LOCAL lock_timeout = '3s';

DO $preflight$
DECLARE v_mismatch integer;
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'Approved postgres migration actor required';
  END IF;
  IF to_regclass('public.colleges') IS NULL
     OR to_regclass('public.programs') IS NULL
     OR to_regclass('public.organizational_units') IS NULL
     OR to_regclass('public.college_organizational_unit_mappings') IS NOT NULL THEN
    RAISE EXCEPTION 'College migration baseline differs: reconcile first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.colleges) THEN
    RAISE EXCEPTION 'College subtype is populated already: reconcile, do not overwrite';
  END IF;
  WITH expected(code, name) AS (
    VALUES
      ('CCS', 'College of Computer Studies'),
      ('CCSIT', 'College of Computer Studies and Information Technology'),
      ('CBA', 'College of Business and Accountancy'),
      ('CAS', 'College of Arts and Sciences'),
      ('COED', 'College of Education'),
      ('COE', 'College of Engineering'),
      ('CON', 'College of Nursing'),
      ('CIHM', 'College of International Hospitality Management')
  )
  SELECT count(*) INTO v_mismatch
  FROM expected e
  LEFT JOIN public.organizational_units u ON u.code=e.code
  WHERE u.code IS NULL OR u.name IS DISTINCT FROM e.name
     OR u.unit_type IS DISTINCT FROM 'COLLEGE';
  IF v_mismatch <> 0
     OR (SELECT count(*) FROM public.organizational_units WHERE unit_type='COLLEGE') <> 8
     OR (SELECT count(*) FROM public.programs) <> 11
     OR EXISTS (
       SELECT 1 FROM (
         VALUES
           ('BEED','COED'), ('BPA','CAS'), ('BSA','CBA'),
           ('BSBA','CBA'), ('BSCS','CCS'), ('BSECE','COE'),
           ('BSED','COED'), ('BSHM','CIHM'), ('BSIT','CCSIT'),
           ('BSN','CON'), ('BSP','CAS')
       ) AS expected_programs(program_code,unit_code)
       LEFT JOIN public.programs p ON p.code=expected_programs.program_code
       WHERE p.code IS NULL
          OR p.organizational_unit_code IS DISTINCT FROM expected_programs.unit_code
     )
     OR EXISTS (
       SELECT 1 FROM public.programs p
       WHERE p.organizational_unit_code NOT IN
           ('CCS','CCSIT','CBA','CAS','COED','COE','CON','CIHM')
          OR p.organizational_unit_code IS NULL
     ) THEN
    RAISE EXCEPTION 'Verified college codes, names or program assignments drifted';
  END IF;
END
$preflight$;

INSERT INTO public.colleges (code, internal_code)
VALUES
  ('CCS', 'CCS'),
  ('CBA', 'CBA'),
  ('CAS', 'CAS'),
  ('COED', 'EDU'),
  ('COE', 'ENG'),
  ('CON', 'CON'),
  ('CIHM', 'CIHM');

-- Every existing organizational-unit key used by programs resolves to one
-- canonical college without changing the program's existing FK or code.
CREATE TABLE public.college_organizational_unit_mappings (
  organizational_unit_code text PRIMARY KEY
    REFERENCES public.organizational_units(code) ON DELETE RESTRICT,
  college_code text NOT NULL
    REFERENCES public.colleges(code) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX college_organizational_unit_mappings_college_idx
  ON public.college_organizational_unit_mappings (college_code);
ALTER TABLE public.college_organizational_unit_mappings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.college_organizational_unit_mappings
  FROM PUBLIC, anon, authenticated;

INSERT INTO public.college_organizational_unit_mappings
  (organizational_unit_code, college_code)
VALUES
  ('CCS', 'CCS'),
  ('CCSIT', 'CCS'),
  ('CBA', 'CBA'),
  ('CAS', 'CAS'),
  ('COED', 'COED'),
  ('COE', 'COE'),
  ('CON', 'CON'),
  ('CIHM', 'CIHM');

DO $postflight$
BEGIN
  IF (SELECT count(*) FROM public.colleges) <> 7
     OR (SELECT count(*) FROM public.college_organizational_unit_mappings) <> 8
     OR (SELECT count(*) FROM public.programs p
         JOIN public.college_organizational_unit_mappings m
           ON m.organizational_unit_code=p.organizational_unit_code
         JOIN public.colleges c ON c.code=m.college_code) <> 11
     OR NOT EXISTS (SELECT 1 FROM public.colleges
                    WHERE code='COED' AND internal_code='EDU')
     OR NOT EXISTS (SELECT 1 FROM public.colleges
                    WHERE code='COE' AND internal_code='ENG')
     OR NOT EXISTS (SELECT 1 FROM public.college_organizational_unit_mappings
                    WHERE organizational_unit_code='CCSIT' AND college_code='CCS')
     OR NOT EXISTS (SELECT 1 FROM pg_class
       WHERE oid='public.college_organizational_unit_mappings'::regclass
         AND relrowsecurity)
     OR has_table_privilege('anon',
        'public.college_organizational_unit_mappings','SELECT')
     OR has_table_privilege('authenticated',
        'public.college_organizational_unit_mappings','SELECT') THEN
    RAISE EXCEPTION 'Canonical college mapping postflight failed';
  END IF;
END
$postflight$;
COMMIT;

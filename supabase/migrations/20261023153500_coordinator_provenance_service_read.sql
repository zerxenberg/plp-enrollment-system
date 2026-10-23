-- Permit the authenticated Coordinator server action to classify fictional
-- curricula without exposing the private provenance ledger to public clients.
-- The server action independently verifies the academic-coordinator role.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '20s';

DO $preflight$
BEGIN
  IF to_regclass('public.phase8_fictional_curriculum_provenance') IS NULL THEN
    RAISE EXCEPTION 'Required curriculum provenance table is missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'phase8_fictional_curriculum_provenance'
      AND (c.relrowsecurity IS FALSE OR pg_catalog.pg_get_userbyid(c.relowner) <> 'postgres')
  ) THEN
    RAISE EXCEPTION 'Curriculum provenance security preflight failed';
  END IF;
  IF pg_catalog.has_table_privilege('anon',
      'public.phase8_fictional_curriculum_provenance', 'SELECT')
    OR pg_catalog.has_table_privilege('authenticated',
      'public.phase8_fictional_curriculum_provenance', 'SELECT') THEN
    RAISE EXCEPTION 'Curriculum provenance already has an unsafe public read grant';
  END IF;
END;
$preflight$;

-- RLS stays enabled; service_role already has BYPASSRLS but still requires
-- explicit PostgreSQL SELECT privilege. Ordinary browser roles remain denied.
GRANT SELECT ON TABLE public.phase8_fictional_curriculum_provenance TO service_role;

DO $postflight$
BEGIN
  IF NOT pg_catalog.has_table_privilege('service_role',
      'public.phase8_fictional_curriculum_provenance', 'SELECT')
    OR pg_catalog.has_table_privilege('anon',
      'public.phase8_fictional_curriculum_provenance', 'SELECT')
    OR pg_catalog.has_table_privilege('authenticated',
      'public.phase8_fictional_curriculum_provenance', 'SELECT') THEN
    RAISE EXCEPTION 'Curriculum provenance service grant verification failed';
  END IF;
END;
$postflight$;

NOTIFY pgrst, 'reload schema';
COMMIT;

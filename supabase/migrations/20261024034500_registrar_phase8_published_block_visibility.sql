-- Keep the restrictive synthetic block guard while allowing the Registrar
-- to read only published, validated-source Phase 8 demonstration blocks.
-- Original synthetic planning fixtures remain hidden from the Registrar.
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'block_sections'
      AND policyname = 'block_sections_synthetic_coordinator_visibility'
      AND permissive = 'RESTRICTIVE'
  ) THEN
    RAISE EXCEPTION 'Expected restrictive block sections policy is missing or changed';
  END IF;
END
$guard$;

ALTER POLICY block_sections_synthetic_coordinator_visibility
ON public.block_sections
USING (
  (NOT is_synthetic_demo)
  OR public.has_role('academic-coordinator')
  OR (
    is_synthetic_demo IS TRUE
    AND public.has_role('registrar')
    AND auth.uid() IS NOT NULL
    AND term_id = 'TERM-2026-1'
    AND planning_status = 'PUBLISHED'
    AND left(curriculum_code, length('P8F26-')) = 'P8F26-'
    AND left(synthetic_source_key, length('PHASE8_PROJECT_2026:')) = 'PHASE8_PROJECT_2026:'
  )
);

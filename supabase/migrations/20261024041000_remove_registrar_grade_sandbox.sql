-- Remove sandbox-only grade import storage and staging endpoint.
-- IF EXISTS keeps this safe for databases where the sandbox migration was never applied.
DROP FUNCTION IF EXISTS public.registrar_stage_sandbox_grade_batch_v1(
  text,text,text,text,text,text,text,text,text,text,jsonb
);
DROP TABLE IF EXISTS public.registrar_sandbox_grade_rows;
DROP TABLE IF EXISTS public.registrar_sandbox_grade_batches;

-- Match the coordinator's protected Phase 8 roster contract for newly
-- created draft blocks that use a verified fictional Phase 8 curriculum.
-- This migration is repeatable and does not edit student/section records.
CREATE OR REPLACE FUNCTION public.project_phase8_block_roster_v1(p_block_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_rows jsonb;
  v_block record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated'
     OR auth.uid() IS NULL
     OR public.current_role_code() NOT IN ('registrar', 'academic-coordinator') THEN
    RAISE EXCEPTION 'Authorized academic staff required' USING ERRCODE = '42501';
  END IF;

  SELECT b.id, b.term_id, b.curriculum_code, b.is_synthetic_demo,
         b.synthetic_source_key
    INTO v_block
  FROM public.block_sections AS b
  WHERE b.id = p_block_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Block not found or unavailable' USING ERRCODE = '42501';
  END IF;

  -- is_synthetic_demo identifies generated fixtures, not whether an
  -- academic curriculum is fictional. Manually created sections based
  -- on the Phase 8 fictional curriculum remain unverified demonstrations.
  IF v_block.is_synthetic_demo IS FALSE
     AND v_block.synthetic_source_key IS NULL
     AND v_block.term_id = 'TERM-2026-1'
     AND EXISTS (
       SELECT 1
       FROM public.phase8_fictional_curriculum_provenance AS fp
       WHERE fp.curriculum_code = v_block.curriculum_code
         AND fp.is_official IS FALSE
         AND fp.source_type = 'PROJECT_ONLY_FICTIONAL'
     ) THEN

    -- This elevated project-only RPC must not leak ordinary student
    -- assignments that are outside the approved fictional cohort.
    IF EXISTS (
      SELECT 1
      FROM public.block_student_assignments AS a
      WHERE a.block_id = p_block_id
        AND a.status = 'PROPOSED'
        AND NOT EXISTS (
          SELECT 1 FROM public.project_student_academic_placements AS p
          WHERE p.student_id = a.student_id
            AND p.term_id = v_block.term_id
            AND p.project_cohort_id = 'PLP_PROJECT_600_2026_1'
        )
    ) THEN
      RAISE EXCEPTION 'Project roster contains a non-project student'
        USING ERRCODE = '42501';
    END IF;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'student_id', a.student_id,
      'student_number', sp.student_number,
      'full_name', au.full_name,
      'year_level', p.year_level,
      'academic_classification', p.academic_classification,
      'enrollment_status', 'NOT_CONFIRMED'
    ) ORDER BY sp.student_number), '[]'::jsonb)
    INTO v_rows
    FROM public.block_student_assignments AS a
    JOIN public.project_student_academic_placements AS p
      ON p.student_id = a.student_id
      AND p.term_id = v_block.term_id
      AND p.project_cohort_id = 'PLP_PROJECT_600_2026_1'
    JOIN public.student_profiles AS sp ON sp.id = a.student_id
    JOIN public.app_users AS au ON au.id = sp.user_id
    WHERE a.block_id = p_block_id
      AND a.status = 'PROPOSED';

    RETURN jsonb_build_object(
      'fictional_only', true,
      'block_id', p_block_id,
      'students', v_rows,
      'verified_institutionally', false
    );
  END IF;

  -- Preserve the original validation gate for generated project fixtures.
  IF NOT EXISTS (
    SELECT 1
    FROM public.block_sections AS b
    JOIN public.project_phase8_schedule_validations AS v
      ON v.block_id = b.id
    WHERE b.id = p_block_id
      AND b.is_synthetic_demo IS TRUE
      AND v.validation_status = 'READY_PROJECT'
      AND b.synthetic_source_key LIKE 'PHASE8_PROJECT_2026:%'
  ) THEN
    RAISE EXCEPTION 'Unvalidated project block' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'student_id', p.student_id,
    'student_number', sp.student_number,
    'full_name', au.full_name,
    'year_level', p.year_level,
    'academic_classification', p.academic_classification,
    'enrollment_status', 'NOT_CONFIRMED'
  ) ORDER BY sp.student_number), '[]'::jsonb)
  INTO v_rows
  FROM public.project_student_academic_placements AS p
  JOIN public.student_profiles AS sp ON sp.id = p.student_id
  JOIN public.app_users AS au ON au.id = sp.user_id
  WHERE p.home_block_id = p_block_id
    AND p.project_cohort_id = 'PLP_PROJECT_600_2026_1';

  RETURN jsonb_build_object(
    'fictional_only', true,
    'block_id', p_block_id,
    'students', v_rows,
    'verified_institutionally', false
  );
END
$function$;

REVOKE ALL ON FUNCTION public.project_phase8_block_roster_v1(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_phase8_block_roster_v1(uuid)
  TO authenticated;

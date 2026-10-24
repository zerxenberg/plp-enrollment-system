-- Atomic proposed block transfers keep the Phase 8 fictional academic placement
-- synchronized with the new active assignment. Existing historical assignments
-- and official enrollments remain untouched. See live incident BSIT-1A -> BSIT-1M.
CREATE OR REPLACE FUNCTION public.transfer_proposed_block_student(p_student_id uuid, p_from_block_id uuid, p_to_block_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  first_block record;
  second_block record;
  roster_record record;
  student_record record;
  project_record public.project_student_academic_placements%ROWTYPE;
  new_assignment_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role('academic-coordinator') THEN
    RAISE EXCEPTION 'Academic Coordinator authorization required'
      USING ERRCODE = '42501';
  END IF;

  IF p_from_block_id = p_to_block_id OR p_student_id IS NULL OR
     length(btrim(coalesce(p_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'Different blocks and a transfer reason are required'
      USING ERRCODE = '23514';
  END IF;

  -- Stable lock ordering, with student-term serialization retained.
  PERFORM 1 FROM public.block_sections
    WHERE id IN (p_from_block_id, p_to_block_id)
    ORDER BY id FOR UPDATE;

  SELECT * INTO first_block FROM public.block_sections
    WHERE id = p_from_block_id;
  SELECT * INTO second_block FROM public.block_sections
    WHERE id = p_to_block_id;
  IF first_block.term_id IS NULL OR second_block.term_id IS NULL OR
     first_block.term_id <> second_block.term_id OR
     first_block.program_code <> second_block.program_code OR
     first_block.curriculum_code <> second_block.curriculum_code OR
     coalesce(first_block.program_track_code, '') <>
       coalesce(second_block.program_track_code, '') OR
     first_block.year_level <> second_block.year_level OR
     second_block.planning_status = 'ARCHIVED' THEN
    RAISE EXCEPTION 'Blocks are not compatible for transfer'
      USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_student_id::text || ':' || first_block.term_id, 0));
  SELECT * INTO student_record FROM public.student_profiles
    WHERE id = p_student_id FOR UPDATE;

  -- Existing PROJECT_ONLY pilot profiles have a NULL legacy status.
  IF NOT FOUND OR
     (student_record.student_status IS NOT NULL AND
      student_record.student_status <> 'ACTIVE') OR
     student_record.program_code IS DISTINCT FROM second_block.program_code THEN
    RAISE EXCEPTION 'Student does not match the transfer destination'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO roster_record
    FROM public.block_student_assignments
    WHERE block_id = p_from_block_id AND student_id = p_student_id
      AND term_id = first_block.term_id AND status = 'PROPOSED'
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student has no active proposal in the source block'
      USING ERRCODE = '23514';
  END IF;

  IF (SELECT count(*) FROM public.block_student_assignments
      WHERE student_id = p_student_id AND term_id = first_block.term_id
        AND status = 'PROPOSED') <> 1 THEN
    RAISE EXCEPTION 'Student has conflicting active block assignments'
      USING ERRCODE = '23514';
  END IF;

  -- The protected project roster snapshots use this separately maintained
  -- placement; transfer it in the SAME database transaction.
  SELECT * INTO project_record
    FROM public.project_student_academic_placements
    WHERE student_id = p_student_id AND term_id = first_block.term_id
    FOR UPDATE;

  IF project_record.student_id IS NOT NULL THEN
    IF project_record.project_cohort_id <> 'PLP_PROJECT_600_2026_1'
       OR project_record.home_block_id IS DISTINCT FROM p_from_block_id
       OR project_record.curriculum_code IS DISTINCT FROM second_block.curriculum_code
       OR project_record.program_code IS DISTINCT FROM second_block.program_code
       OR project_record.year_level IS DISTINCT FROM second_block.year_level
       OR student_record.record_kind IS DISTINCT FROM 'PROJECT_ONLY'
       OR student_record.project_cohort_id IS DISTINCT FROM
          'PLP_PROJECT_600_2026_1'
       OR NOT EXISTS (
         SELECT 1 FROM public.phase8_fictional_curriculum_provenance fp
         WHERE fp.curriculum_code = second_block.curriculum_code
           AND fp.is_official IS FALSE
           AND fp.source_type = 'PROJECT_ONLY_FICTIONAL'
       ) THEN
      RAISE EXCEPTION 'Project academic placement is not eligible for transfer'
        USING ERRCODE = '23514';
    END IF;
  ELSIF student_record.record_kind = 'PROJECT_ONLY' THEN
    RAISE EXCEPTION 'Project academic placement is missing'
      USING ERRCODE = '23514';
  END IF;

  IF (SELECT count(*) FROM public.block_student_assignments
      WHERE block_id = p_to_block_id AND status = 'PROPOSED') >= second_block.capacity THEN
    RAISE EXCEPTION 'Destination proposed roster is full'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.block_student_assignments
    SET status = 'TRANSFERRED', ended_at = now(), transfer_reason = btrim(p_reason)
    WHERE id = roster_record.id;

  INSERT INTO public.block_student_assignments (
    block_id, term_id, student_id, status, assigned_by
  ) VALUES (
    p_to_block_id, second_block.term_id, p_student_id,
    'PROPOSED', public.current_app_user_id()
  ) RETURNING id INTO new_assignment_id;

  IF project_record.student_id IS NOT NULL THEN
    UPDATE public.project_student_academic_placements AS placement
    SET home_block_id = p_to_block_id,
        source_metadata = placement.source_metadata || jsonb_build_object(
          'proposed_block_code', second_block.code,
          'previous_block_code', first_block.code,
          'placement_last_transfer_at', now()
        )
    WHERE placement.student_id = p_student_id
      AND placement.term_id = first_block.term_id
      AND placement.project_cohort_id = 'PLP_PROJECT_600_2026_1'
      AND placement.home_block_id = p_from_block_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Project placement update failed; transfer rolled back'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN new_assignment_id;
END
$function$
;

REVOKE ALL ON FUNCTION public.transfer_proposed_block_student(uuid,uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_proposed_block_student(uuid,uuid,uuid,text)
  TO authenticated;

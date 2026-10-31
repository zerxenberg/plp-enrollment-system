-- Institutional Admissions visibility and safe placement for Academic Coordinators.
-- Independent from the fictional Phase 8 Admissions demonstration roster.
BEGIN;

CREATE OR REPLACE FUNCTION public.coordinator_verified_admissions_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role('academic-coordinator') THEN
    RAISE EXCEPTION 'Academic Coordinator authorization required'
      USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.student_id,
      'studentNumber', q.student_number,
      'fullName', q.full_name,
      'programCode', q.program_code,
      'studentType', q.student_type,
      'studentStatus', q.student_status,
      'yearLevelNumber', q.year_level_number,
      'curriculumCode', q.current_curriculum_code,
      'classification', q.academic_classification,
      'accountStatus', q.account_status,
      'applicantReference', q.applicant_reference
    ) ORDER BY q.full_name, q.student_number
  ), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT DISTINCT ON (s.id)
      s.id AS student_id, s.student_number, u.full_name,
      s.program_code, s.student_type, s.student_status,
      s.year_level_number, s.current_curriculum_code,
      s.academic_classification, u.account_status, h.applicant_reference
    FROM public.admission_handoffs h
    JOIN public.student_profiles s ON s.id = h.student_id
    JOIN public.app_users u ON u.id = s.user_id
    WHERE h.source_name = 'PLP Admissions'
      AND h.admission_status = 'ACCEPTED'
      AND h.synchronization_status = 'Successful'
      AND s.student_status IN ('ADMITTED', 'ACTIVE')
      AND s.institutional_verified_at IS NOT NULL
      AND s.is_synthetic_demo IS FALSE
      AND s.record_kind IS DISTINCT FROM 'PROJECT_ONLY'
      AND u.role_code = 'student'
      AND u.is_synthetic_demo IS FALSE
      AND u.source_account_key = 'PLP_ADMISSIONS:' || h.applicant_reference
    ORDER BY s.id, h.received_at DESC
    LIMIT 500
  ) q;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.coordinator_verified_admissions_v1()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coordinator_verified_admissions_v1()
  TO authenticated;

-- An independent RPC prevents any attempt to insert real Admissions students
-- into synthetic project sections or to bypass transferee academic review.
CREATE OR REPLACE FUNCTION public.coordinator_assign_verified_admission_v1(
  p_block_id uuid, p_student_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_block public.block_sections%ROWTYPE;
  v_student public.student_profiles%ROWTYPE;
  v_handoff public.admission_handoffs%ROWTYPE;
  v_account public.app_users%ROWTYPE;
  v_current_block uuid;
  v_occupancy integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role('academic-coordinator') THEN
    RAISE EXCEPTION 'Academic Coordinator authorization required'
      USING ERRCODE='42501';
  END IF;
  IF p_block_id IS NULL OR p_student_id IS NULL THEN
    RAISE EXCEPTION 'Choose a block and a verified Admissions student'
      USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_block
  FROM public.block_sections WHERE id=p_block_id FOR UPDATE;
  IF NOT FOUND OR v_block.is_synthetic_demo IS DISTINCT FROM FALSE
     OR v_block.planning_status NOT IN ('DRAFT','PUBLISHED')
     OR v_block.curriculum_code IS NULL THEN
    RAISE EXCEPTION 'A genuine institutional block is required; synthetic sections are excluded'
      USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.curricula c
    WHERE c.code=v_block.curriculum_code AND c.status='Active'
  ) OR EXISTS (
    SELECT 1 FROM public.phase8_fictional_curriculum_provenance p
    WHERE p.curriculum_code=v_block.curriculum_code
      AND p.is_official IS FALSE
  ) THEN
    RAISE EXCEPTION 'Official active curriculum is required for real student placement'
      USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_student FROM public.student_profiles
  WHERE id=p_student_id FOR UPDATE;
  IF NOT FOUND OR v_student.is_synthetic_demo IS DISTINCT FROM FALSE
     OR v_student.record_kind='PROJECT_ONLY'
     OR v_student.institutional_verified_at IS NULL
     OR v_student.student_status NOT IN ('ADMITTED','ACTIVE')
     OR v_student.program_code IS DISTINCT FROM v_block.program_code
     OR v_student.year_level_number IS NULL
     OR v_student.year_level_number <> v_block.year_level
     OR v_student.current_curriculum_code IS NULL
     OR v_student.current_curriculum_code <> v_block.curriculum_code THEN
    RAISE EXCEPTION 'Student needs verified program, curriculum, and matching evaluated year level'
      USING ERRCODE='23514';
  END IF;
  IF v_student.student_type='TRANSFEREE'
     AND v_student.academic_classification IS NULL THEN
    RAISE EXCEPTION 'Transferee academic standing must be evaluated by the Registrar'
      USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_account FROM public.app_users WHERE id=v_student.user_id;
  IF NOT FOUND OR v_account.role_code<>'student'
     OR v_account.is_synthetic_demo IS DISTINCT FROM FALSE
     OR v_account.account_status<>'Active' THEN
    RAISE EXCEPTION 'A verified active institutional application account is required'
      USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_handoff FROM public.admission_handoffs h
  WHERE h.student_id=v_student.id AND h.source_name='PLP Admissions'
    AND h.admission_status='ACCEPTED'
    AND h.synchronization_status='Successful'
    AND v_account.source_account_key='PLP_ADMISSIONS:'||h.applicant_reference
  ORDER BY h.received_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verified successful Admissions handoff is required'
      USING ERRCODE='23514';
  END IF;
  IF v_block.program_track_code IS NOT NULL
     AND v_handoff.approved_program_track_code IS DISTINCT FROM v_block.program_track_code THEN
    RAISE EXCEPTION 'Admission track does not match the official block'
      USING ERRCODE='23514';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_student.id::text||':'||v_block.term_id,0));
  SELECT a.block_id INTO v_current_block
  FROM public.block_student_assignments a
  WHERE a.student_id=v_student.id AND a.term_id=v_block.term_id
    AND a.status='PROPOSED'
  ORDER BY a.assigned_at DESC LIMIT 1;
  IF FOUND THEN
    IF v_current_block=v_block.id THEN
      RETURN jsonb_build_object('status','already_proposed',
        'student_number',v_student.student_number);
    END IF;
    RAISE EXCEPTION 'Student already has a proposed block for this academic term'
      USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO v_occupancy
  FROM public.block_student_assignments
  WHERE block_id=v_block.id AND status='PROPOSED';
  IF v_occupancy>=v_block.capacity THEN
    RAISE EXCEPTION 'Block proposed roster is full' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.block_student_assignments
    (block_id,term_id,student_id,status,assigned_by,is_synthetic_demo)
  VALUES (v_block.id,v_block.term_id,v_student.id,'PROPOSED',
    public.current_app_user_id(),false);

  RETURN jsonb_build_object('status','proposed',
    'student_number',v_student.student_number,'block_id',v_block.id);
END;
$$;
REVOKE ALL ON FUNCTION public.coordinator_assign_verified_admission_v1(uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.coordinator_assign_verified_admission_v1(uuid,uuid)
  TO authenticated;
COMMIT;

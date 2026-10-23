-- Student academic portal read contract. These two PROJECT_ONLY tables are
-- intentionally inaccessible to service_role and authenticated directly.
-- The database authorizes each requested identity before returning narrow data.
BEGIN;
SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.project_phase8_student_portal_status_v1(
  p_student_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_account_id uuid;
  v_curriculum_code text;
  v_sim public.project_phase8_enrollment_simulations%ROWTYPE;
  v_return_reason text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authenticated student required' USING ERRCODE = '42501';
  END IF;

  SELECT a.id, p.curriculum_code INTO v_account_id, v_curriculum_code
  FROM public.app_users a
  JOIN public.project_auth_student_links l ON l.app_user_id = a.id
  JOIN public.student_profiles s ON s.id = l.student_id AND s.user_id = a.id
  JOIN public.project_student_academic_placements p ON p.student_id = s.id
  WHERE a.auth_user_id = auth.uid() AND a.role_code = 'student'
    AND a.account_status = 'Active' AND a.login_enabled
    AND a.account_kind = 'PROJECT_ONLY'
    AND l.auth_user_id = auth.uid() AND l.student_id = p_student_id
    AND l.state = 'ACTIVE' AND l.initial_password_changed_at IS NOT NULL
    AND l.cohort_id = 'PLP_PROJECT_600_2026_1'
    AND s.record_kind = 'PROJECT_ONLY'
    AND s.project_cohort_id = 'PLP_PROJECT_600_2026_1'
    AND s.is_synthetic_demo IS TRUE
    AND p.term_id = 'TERM-2026-1'
    AND p.project_cohort_id = 'PLP_PROJECT_600_2026_1'
    AND EXISTS (
      SELECT 1 FROM public.phase8_fictional_curriculum_provenance f
      WHERE f.curriculum_code = p.curriculum_code AND f.is_official IS FALSE
    );
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Student academic record access denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_sim FROM public.project_phase8_enrollment_simulations
    WHERE student_id = p_student_id AND term_id = 'TERM-2026-1'
      AND source_provenance = 'GENERATED_PROJECT'
      AND verified_institutionally IS FALSE;

  IF v_sim.id IS NOT NULL AND v_sim.status = 'RETURNED' THEN
    SELECT e.reason INTO v_return_reason
    FROM public.project_phase8_enrollment_simulation_events e
    WHERE e.simulation_id = v_sim.id AND e.action = 'RETURN'
    ORDER BY e.occurred_at DESC, e.id DESC LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'project_only', true, 'verified_institutionally', false,
    'data_origin', 'GENERATED_PROJECT',
    'curriculum_code', v_curriculum_code,
    'curriculum_is_official', false,
    'simulation', CASE WHEN v_sim.id IS NULL THEN 'null'::jsonb
      ELSE jsonb_build_object(
        'id', v_sim.id, 'status', v_sim.status,
        'term_id', v_sim.term_id, 'home_block_id', v_sim.home_block_id,
        'submitted_at', v_sim.submitted_at,
        'validated_at', v_sim.validated_at,
        'confirmed_at', v_sim.confirmed_at,
        'correction_reason', v_return_reason)
      END);
END $fn$;

REVOKE ALL ON FUNCTION public.project_phase8_student_portal_status_v1(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_phase8_student_portal_status_v1(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.project_phase8_registrar_simulation_queue_v1()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_rows jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.app_users a
      WHERE a.auth_user_id = auth.uid() AND a.role_code = 'registrar'
        AND a.account_status = 'Active' AND a.login_enabled
    ) THEN
    RAISE EXCEPTION 'Authorized Registrar account required' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', sim.id, 'student_id', sim.student_id,
    'student_number', sp.student_number, 'student_name', a.full_name,
    'term_id', sim.term_id, 'home_block_id', sim.home_block_id,
    'status', sim.status, 'submitted_at', sim.submitted_at,
    'validated_at', sim.validated_at, 'confirmed_at', sim.confirmed_at,
    'created_at', sim.created_at,
    'source_provenance', sim.source_provenance,
    'verified_institutionally', sim.verified_institutionally)
  ORDER BY sim.created_at DESC, sim.id), '[]'::jsonb) INTO v_rows
  FROM public.project_phase8_enrollment_simulations sim
  JOIN public.student_profiles sp ON sp.id = sim.student_id
  JOIN public.app_users a ON a.id = sp.user_id
  JOIN public.project_student_academic_placements p ON
    p.student_id = sp.id AND p.term_id = sim.term_id
  WHERE sim.term_id = 'TERM-2026-1'
    AND sim.source_provenance = 'GENERATED_PROJECT'
    AND sim.verified_institutionally IS FALSE
    AND sp.record_kind = 'PROJECT_ONLY'
    AND sp.project_cohort_id = 'PLP_PROJECT_600_2026_1'
    AND sp.is_synthetic_demo IS TRUE
    AND a.role_code = 'student' AND a.is_synthetic_demo IS TRUE
    AND p.project_cohort_id = 'PLP_PROJECT_600_2026_1'
    AND p.home_block_id = sim.home_block_id;

  RETURN jsonb_build_object(
    'fictional_only', true, 'verified_institutionally', false,
    'records', v_rows);
END $fn$;

REVOKE ALL ON FUNCTION public.project_phase8_registrar_simulation_queue_v1()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_phase8_registrar_simulation_queue_v1()
  TO authenticated;

COMMIT;

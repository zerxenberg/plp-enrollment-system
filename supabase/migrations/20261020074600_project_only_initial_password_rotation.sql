-- PROJECT_ONLY Step 3: durable, per-identity first-login password rotation.
-- Apply after 740-745. No changes to the 2,128 original synthetic students.
BEGIN;
SET LOCAL lock_timeout='5s';

DO $preflight$
BEGIN
  IF current_user IS DISTINCT FROM 'postgres'
     OR session_user IS DISTINCT FROM 'postgres'
     OR (SELECT rolsuper FROM pg_roles WHERE rolname='postgres') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'PROJECT_ONLY 746 requires reviewed non-superuser postgres owner'
      USING ERRCODE='42501';
  END IF;
  IF to_regclass('public.project_auth_student_links') IS NULL
     OR to_regclass('public.project_auth_cohort_control') IS NULL
     OR to_regprocedure('public.project_auth_eligible_v1(uuid)') IS NULL
     OR to_regprocedure('public.project_auth_can_view_self_v1(uuid)') IS NULL
     OR to_regprocedure('public.project_auth_admin_approve_v1(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'PROJECT_ONLY foundation and per-account approval migration 745 required'
      USING ERRCODE='23514';
  END IF;
END
$preflight$;

ALTER TABLE public.project_auth_student_links
  ADD COLUMN IF NOT EXISTS initial_password_changed_at timestamptz;

COMMENT ON COLUMN public.project_auth_student_links.initial_password_changed_at
  IS 'NULL means temporary credential not yet changed by the linked Student. Only trusted Auth verification can mark completion.';

-- Do not expose the actual Student profile to a temporary-password session.
-- Other legacy/institutional accounts and all existing synthetic planning
-- students retain their preexisting RLS behavior.
CREATE OR REPLACE FUNCTION public.project_auth_can_view_self_v1(p_app_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
  SELECT EXISTS(
    SELECT 1 FROM public.app_users u
    JOIN public.project_auth_student_links l ON l.app_user_id=u.id
    JOIN public.project_auth_cohort_control ctl ON ctl.cohort_id=l.cohort_id
    JOIN public.student_profiles s ON s.id=l.student_id AND s.user_id=u.id
    JOIN public.student_data_cohorts c ON c.id=ctl.cohort_id
    JOIN public.student_data_cohort_members m
      ON m.cohort_id=c.id AND m.student_id=s.id
    WHERE u.id=p_app_user_id AND u.auth_user_id=auth.uid()
      AND u.role_code='student' AND u.is_synthetic_demo
      AND u.account_kind='PROJECT_ONLY'
      AND u.account_status='Active' AND u.login_enabled
      AND s.is_synthetic_demo AND s.record_kind='PROJECT_ONLY'
      AND u.institutional_verified_at IS NULL
      AND s.institutional_verified_at IS NULL
      AND m.data_origin='GENERATED_PROJECT'
      AND ctl.enabled AND ctl.source_type='GENERATED_PROJECT'
      AND upper(ctl.manifest_sha256)=
        '592B2C56BAF3334FFC4898996BB3A3976C808ADA5652D564141096E150CB66BC'
      AND c.is_project_data
      AND c.cohort_key='PLP_PROJECT_600_2026_1' AND c.expected_count=600
      AND l.state='ACTIVE' AND l.auth_user_id=auth.uid()
      AND l.initial_password_changed_at IS NOT NULL
  )
$fn$;
REVOKE ALL ON FUNCTION public.project_auth_can_view_self_v1(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_auth_can_view_self_v1(uuid)
  TO authenticated;

-- Called exclusively by the trusted Next.js server immediately after a
-- successful authenticated Supabase Auth updateUser({password}) response.
-- No browser role has EXECUTE or direct UPDATE on the link table.
CREATE FUNCTION public.project_auth_record_initial_password_change_v1(
  p_app_user_id uuid, p_auth_user_id uuid
)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $rpc$
DECLARE
  v_link public.project_auth_student_links%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     OR p_app_user_id IS NULL OR p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Trusted service identity required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_link
  FROM public.project_auth_student_links l
  WHERE l.app_user_id=p_app_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_link.state<>'ACTIVE'
     OR v_link.auth_user_id IS DISTINCT FROM p_auth_user_id
     OR NOT public.project_auth_eligible_v1(p_app_user_id)
     OR NOT EXISTS(
       SELECT 1 FROM public.app_users u
       JOIN public.student_profiles s ON s.user_id=u.id
       WHERE u.id=p_app_user_id AND u.auth_user_id=p_auth_user_id
         AND u.role_code='student' AND u.account_kind='PROJECT_ONLY'
         AND u.account_status='Active' AND u.login_enabled IS TRUE
         AND s.id=v_link.student_id AND s.record_kind='PROJECT_ONLY'
         AND u.project_activation_approved_at IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'PROJECT_ONLY student identity is not approved and active'
      USING ERRCODE='23514';
  END IF;
  IF v_link.initial_password_changed_at IS NULL THEN
    UPDATE public.project_auth_student_links
    SET initial_password_changed_at=clock_timestamp()
    WHERE app_user_id=p_app_user_id
      AND auth_user_id=p_auth_user_id AND state='ACTIVE'
      AND initial_password_changed_at IS NULL;
  END IF;
  RETURN TRUE;
END
$rpc$;
REVOKE ALL ON FUNCTION public.project_auth_record_initial_password_change_v1(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_auth_record_initial_password_change_v1(uuid,uuid)
  TO service_role;

DO $postflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.project_auth_student_links
    WHERE initial_password_changed_at IS NOT NULL
      AND state NOT IN ('ACTIVE','REVOKED')
  ) THEN
    RAISE EXCEPTION 'Password-rotation state inconsistent' USING ERRCODE='23514';
  END IF;
END
$postflight$;
COMMIT;

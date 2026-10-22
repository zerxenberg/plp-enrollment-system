-- Step 4 continuation: explicit, attributable 600-student cohort approval.
-- DDL only. A real signed-in System Administrator must invoke the resulting
-- RPC after externally verifying notification settings and web-app readiness.
-- No project cohort, student, Auth user, approval or credential is created here.
BEGIN;
SET LOCAL lock_timeout='5s';

DO $preflight$
BEGIN
  IF current_user IS DISTINCT FROM 'postgres'
     OR session_user IS DISTINCT FROM 'postgres'
     OR (SELECT rolsuper FROM pg_roles WHERE rolname='postgres') IS DISTINCT FROM false
     OR to_regprocedure('public.project_auth_authenticated_admin_v1()') IS NULL
     OR to_regprocedure('public.project_auth_record_initial_password_change_v1(uuid,uuid)') IS NULL
     OR to_regprocedure('public.project_auth_official_guards_ready_v1()') IS NULL
     OR NOT public.project_auth_official_guards_ready_v1()
     OR to_regclass('public.project_auth_cohort_control') IS NULL
     OR to_regclass('public.project_auth_account_approvals') IS NULL
     OR to_regclass('public.student_data_cohorts') IS NULL THEN
    RAISE EXCEPTION 'Reviewed 740-746 protections and postgres owner are required'
      USING ERRCODE='23514';
  END IF;
  IF to_regclass('public.project_auth_cohort_release_evidence') IS NOT NULL
     OR to_regprocedure('public.project_auth_admin_register_cohort_v1(text,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'PROJECT_ONLY cohort registration already exists; reconcile history first'
      USING ERRCODE='23514';
  END IF;
END
$preflight$;

CREATE TABLE public.project_auth_cohort_release_evidence (
  cohort_id uuid PRIMARY KEY REFERENCES public.project_auth_cohort_control(cohort_id)
    ON DELETE RESTRICT,
  approved_by uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  manifest_sha256 text NOT NULL
    CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  verified_auth_config_sha256 text NOT NULL
    CHECK (verified_auth_config_sha256 ~ '^[0-9a-f]{64}$'),
  deployment_attestation text NOT NULL
    CHECK (deployment_attestation='VERIFIED_PROTECTED_PORTAL_LIVE'),
  approved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_auth_cohort_release_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_auth_cohort_release_evidence FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.project_auth_cohort_release_evidence TO service_role;

CREATE FUNCTION public.project_auth_admin_register_cohort_v1(
  p_manifest_sha256 text,
  p_verified_auth_config_sha256 text,
  p_deployment_attestation text
)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $approval$
DECLARE
  v_actor uuid;
  v_cohort_id uuid;
  v_cohort public.student_data_cohorts%ROWTYPE;
  v_control public.project_auth_cohort_control%ROWTYPE;
  v_evidence public.project_auth_cohort_release_evidence%ROWTYPE;
BEGIN
  -- JWT principal is resolved in the database; a service_role caller cannot
  -- impersonate a System Administrator or supply another person's actor ID.
  v_actor:=public.project_auth_authenticated_admin_v1();
  IF lower(coalesce(p_manifest_sha256,'')) IS DISTINCT FROM
      '592b2c56baf3334ffc4898996bb3a3976c808ada5652d564141096e150cb66bc'
     OR coalesce(p_verified_auth_config_sha256,'') !~ '^[0-9a-f]{64}$'
     OR p_deployment_attestation IS DISTINCT FROM 'VERIFIED_PROTECTED_PORTAL_LIVE' THEN
    RAISE EXCEPTION 'Review exact cohort digest, verified Auth configuration and deployed Student Portal'
      USING ERRCODE='22023';
  END IF;

  IF (SELECT count(*) FROM public.app_users u
      WHERE u.is_synthetic_demo
        AND u.source_account_key LIKE 'SYNTHETIC_PLANNING:%'
        AND u.account_status='Inactive' AND NOT u.login_enabled
        AND u.auth_user_id IS NULL) <> 2128
     OR NOT public.project_auth_official_guards_ready_v1()
     OR to_regprocedure('public.project_auth_phase9_default_acl_activation_guard()') IS NULL
     OR EXISTS(
       SELECT 1 FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relkind IN ('r','p')
         AND (NOT c.relrowsecurity OR c.relowner <> 'postgres'::regrole
              OR pg_catalog.has_table_privilege('anon',c.oid,'TRUNCATE')
              OR pg_catalog.has_table_privilege('authenticated',c.oid,'TRUNCATE'))
     )
     OR NOT EXISTS(
       SELECT 1 FROM pg_catalog.pg_trigger t
       WHERE t.tgrelid='public.project_auth_student_links'::regclass
         AND t.tgname='project_auth_phase9_default_acl_activation_guard'
         AND t.tgenabled='O'
     )
     OR NOT EXISTS(
       SELECT 1 FROM pg_catalog.pg_trigger t
       WHERE t.tgrelid='public.project_auth_student_links'::regclass
         AND t.tgname='project_auth_consume_individual_approval_v1'
         AND t.tgenabled='O'
     ) THEN
    RAISE EXCEPTION 'Project protection/legacy/approval preflight failed'
      USING ERRCODE='23514';
  END IF;

  -- No way to turn a pre-existing unrelated cohort into the approved 600.
  SELECT * INTO v_cohort FROM public.student_data_cohorts
    WHERE cohort_key='PLP_PROJECT_600_2026_1' FOR UPDATE;
  IF FOUND AND (v_cohort.academic_term_id<>'TERM-2026-1'
      OR v_cohort.expected_count<>600 OR NOT v_cohort.is_project_data) THEN
    RAISE EXCEPTION 'Existing cohort conflicts with approved project identity'
      USING ERRCODE='23514';
  END IF;
  IF NOT FOUND THEN
    INSERT INTO public.student_data_cohorts
      (cohort_key,academic_term_id,expected_count,is_project_data)
    VALUES ('PLP_PROJECT_600_2026_1','TERM-2026-1',600,true)
    RETURNING id INTO v_cohort_id;
  ELSE
    v_cohort_id:=v_cohort.id;
  END IF;
  SELECT * INTO v_control FROM public.project_auth_cohort_control
    WHERE cohort_id=v_cohort_id FOR UPDATE;
  IF FOUND AND (v_control.approved_by IS DISTINCT FROM v_actor
      OR v_control.approved_via<>'AUTHORIZED_SYSTEM_ADMIN'
      OR lower(v_control.manifest_sha256) <> lower(p_manifest_sha256)
      OR v_control.purpose <> 'PROJECT_ONLY'
      OR NOT v_control.enabled
      OR NOT v_control.production_write_approved
      OR NOT v_control.email_side_effects_disabled
      OR NOT v_control.first_login_rotation_enforced
      OR NOT v_control.manual_activation_guarded
      OR NOT v_control.official_academic_writes_blocked_reviewed) THEN
    RAISE EXCEPTION 'Conflicting or incomplete cohort control requires manual reconciliation'
      USING ERRCODE='23514';
  END IF;
  IF NOT FOUND THEN
    INSERT INTO public.project_auth_cohort_control(
      cohort_id,manifest_sha256,source_type,approved_by,approved_via,
      enabled,test_only_admin_confirmation_approved,email_side_effects_disabled,
      first_login_rotation_enforced,manual_activation_guarded,
      official_academic_writes_blocked_reviewed,production_write_approved,
      activation_approval_reference,purpose
    ) VALUES(
      v_cohort_id,lower(p_manifest_sha256),'GENERATED_PROJECT',v_actor,
      'AUTHORIZED_SYSTEM_ADMIN',
      true,true,true,true,true,true,true,
      'PLP-600-RELEASE:'||pg_catalog.gen_random_uuid()::text,'PROJECT_ONLY'
    );
  END IF;
  SELECT * INTO v_evidence FROM public.project_auth_cohort_release_evidence
    WHERE cohort_id=v_cohort_id FOR UPDATE;
  IF FOUND AND (v_evidence.approved_by IS DISTINCT FROM v_actor
      OR v_evidence.manifest_sha256<>lower(p_manifest_sha256)
      OR v_evidence.verified_auth_config_sha256<>p_verified_auth_config_sha256
      OR v_evidence.deployment_attestation<>p_deployment_attestation) THEN
    RAISE EXCEPTION 'Existing release attestation differs; never overwrite'
      USING ERRCODE='23514';
  END IF;
  IF NOT FOUND THEN
    INSERT INTO public.project_auth_cohort_release_evidence(
      cohort_id,approved_by,manifest_sha256,
      verified_auth_config_sha256,deployment_attestation
    ) VALUES(
      v_cohort_id,v_actor,lower(p_manifest_sha256),
      p_verified_auth_config_sha256,p_deployment_attestation
    );
  END IF;
  RETURN v_cohort_id;
END
$approval$;
REVOKE ALL ON FUNCTION public.project_auth_admin_register_cohort_v1(text,text,text)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.project_auth_admin_register_cohort_v1(text,text,text)
  TO authenticated;

DO $postflight$
BEGIN
  IF pg_catalog.has_table_privilege('anon','public.project_auth_cohort_release_evidence','SELECT')
     OR pg_catalog.has_table_privilege('authenticated','public.project_auth_cohort_release_evidence','INSERT')
     OR pg_catalog.has_function_privilege('anon',
         'public.project_auth_admin_register_cohort_v1(text,text,text)','EXECUTE')
     OR pg_catalog.has_function_privilege('service_role',
         'public.project_auth_admin_register_cohort_v1(text,text,text)','EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated',
         'public.project_auth_admin_register_cohort_v1(text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Cohort administrator approval privilege postflight failed'
      USING ERRCODE='42501';
  END IF;
END
$postflight$;
COMMIT;

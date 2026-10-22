-- NONDEPLOYED server-only PROJECT_ONLY RPC contract v1.
-- NO project accounts, Auth accounts, approvals or enrollments created by
-- applying this migration. Auth Admin createUser is intentionally external.
-- p_payload JSON is for a server-only service_role caller after an approved
-- project manifest; never invoke these RPCs from the browser.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $check$
BEGIN
  IF to_regclass('public.project_auth_cohort_control') IS NULL
      OR to_regclass('public.project_auth_student_links') IS NULL
      OR to_regprocedure('public.project_auth_eligible_v1(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Apply reviewed PROJECT_ONLY guard foundation first';
  END IF;
END
$check$;

-- Deployment-order gate: this function compiles safely before 74300,
-- returning FALSE until the four official writer guards and immutable
-- project-profile guard are actually present and enabled. A manual
-- "reviewed" checkbox and original enrollment trigger alone do not prove
-- that official academic writes are blocked.
CREATE FUNCTION public.project_auth_official_guards_ready_v1()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
  SELECT
    (
      SELECT count(*) = 4
      FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace ns ON ns.oid=c.relnamespace
      WHERE ns.nspname='public'
        AND c.relname IN (
          'academic_results','admission_handoffs',
          'student_subject_eligibility','grade_import_rows'
        )
        AND t.tgname='project_auth_deny_official_child_v1'
        AND t.tgenabled IN ('O','A')
        AND NOT t.tgisinternal
        AND (t.tgtype::integer & 23) = 23
        AND t.tgfoid = to_regprocedure(
          'public.project_auth_reject_official_child_write_v1()'
        )
    )
    AND EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid='public.student_profiles'::regclass
        AND t.tgname='project_auth_immutable_profile_v1'
        AND t.tgenabled IN ('O','A') AND NOT t.tgisinternal
        AND (t.tgtype::integer & 31) = 31
        AND t.tgfoid = to_regprocedure(
          'public.project_auth_protect_student_profile_v1()'
        )
    )
    AND EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid='public.enrollments'::regclass
        AND t.tgname='reject_synthetic_official_enrollment'
        AND t.tgenabled IN ('O','A') AND NOT t.tgisinternal
        AND (t.tgtype::integer & 23) = 23
        AND t.tgfoid = to_regprocedure(
          'public.reject_synthetic_official_enrollment()'
        )
    )
$fn$;
REVOKE ALL ON FUNCTION public.project_auth_official_guards_ready_v1()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_auth_official_guards_ready_v1()
  TO service_role;

CREATE FUNCTION public.project_auth_readiness_v1()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $rpc$
DECLARE
  v_cohort_id uuid;
  v_approved boolean := false;
  v_manifest text;
  v_control public.project_auth_cohort_control%ROWTYPE;
  v_members bigint := 0;
  v_staged bigint := 0;
  v_linked bigint := 0;
  v_active bigint := 0;
  v_eligible bigint := 0;
  v_legacy bigint := 0;
  v_unsafe_truncates integer := 0;
  v_unsafe_future_truncates integer := 0;
  v_unsafe_client_role_memberships integer := 0;
  v_phase9_activation_guard boolean := false;
  v_required text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted server service role required' USING ERRCODE='42501';
  END IF;
  SELECT c.id, (ctl.enabled IS TRUE),ctl.manifest_sha256
    INTO v_cohort_id,v_approved,v_manifest
  FROM public.student_data_cohorts c
  LEFT JOIN public.project_auth_cohort_control ctl ON ctl.cohort_id=c.id
  WHERE c.cohort_key='PLP_PROJECT_600_2026_1'
    AND c.is_project_data IS TRUE AND c.expected_count=600;
  IF v_cohort_id IS NOT NULL THEN
    SELECT * INTO v_control FROM public.project_auth_cohort_control
      WHERE cohort_id=v_cohort_id;
    SELECT count(*) INTO v_members FROM public.student_data_cohort_members
      WHERE cohort_id=v_cohort_id;
    SELECT count(*) FILTER(WHERE l.state='STAGED'),
           count(*) FILTER(WHERE l.state='LINKED'),
           count(*) FILTER(WHERE l.state='ACTIVE'),
           count(*) FILTER(WHERE public.project_auth_eligible_v1(l.app_user_id))
    INTO v_staged,v_linked,v_active,v_eligible
    FROM public.project_auth_student_links l
    WHERE l.cohort_id=v_cohort_id;
  END IF;
  SELECT count(*) INTO v_legacy FROM public.app_users
    WHERE is_synthetic_demo AND source_account_key LIKE 'SYNTHETIC_PLANNING:%'
      AND auth_user_id IS NULL AND account_status='Inactive'
      AND login_enabled IS FALSE;
  FOR v_required IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
    WHERE ns.nspname='public' AND c.relkind IN ('r','p')
  LOOP
    IF has_table_privilege('authenticated',format('public.%I',v_required),'TRUNCATE')
       OR has_table_privilege('anon',format('public.%I',v_required),'TRUNCATE') THEN
      v_unsafe_truncates := v_unsafe_truncates+1;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_unsafe_future_truncates
  FROM pg_default_acl d
  LEFT JOIN pg_namespace ns ON ns.oid=d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) x
  WHERE d.defaclobjtype='r'
    AND d.defaclrole='postgres'::regrole
    AND (d.defaclnamespace=0 OR ns.nspname='public')
    AND x.privilege_type='TRUNCATE'
    AND x.grantee IN (0,'anon'::regrole,'authenticated'::regrole);
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid='public.project_auth_student_links'::regclass
      AND t.tgname='project_auth_phase9_default_acl_activation_guard'
      AND t.tgenabled IN ('O','A') AND NOT t.tgisinternal
      AND t.tgfoid=to_regprocedure(
        'public.project_auth_phase9_default_acl_activation_guard()')
  ) INTO v_phase9_activation_guard;
  SELECT count(*) INTO v_unsafe_client_role_memberships
  FROM pg_auth_members am
  WHERE am.member IN ('anon'::regrole,'authenticated'::regrole);
  RETURN jsonb_build_object(
    'contract_version','plp_project_auth_v1',
    'rpc_signature','PLP_PROJECT_AUTH_RPC_V1_JSON_PAYLOAD',
    'cohort_id','PLP_PROJECT_600_2026_1',
    'source_csv_sha256',upper(v_manifest),
    'scoped_project_only_linking',to_regprocedure(
        'public.project_auth_eligible_v1(uuid)') IS NOT NULL,
    'legacy_synthetic_guard_intact',v_legacy=2128,
    'project_only_rls_isolated',coalesce(
        (SELECT bool_and(permissive='RESTRICTIVE')
         FROM pg_policies WHERE schemaname='public'
           AND policyname IN ('app_users_synthetic_admin_visibility',
                              'student_profiles_synthetic_coordinator_visibility')),false),
    'official_academic_writes_blocked',
      coalesce(v_control.official_academic_writes_blocked_reviewed,false)
      AND public.project_auth_official_guards_ready_v1(),
    'test_only_admin_confirmation_approved',
      coalesce(v_control.test_only_admin_confirmation_approved,false),
    'email_side_effects_disabled',
      coalesce(v_control.email_side_effects_disabled,false),
    'manual_activation_guarded',
      coalesce(v_control.manual_activation_guarded,false)
      AND v_control.activation_approval_reference IS NOT NULL,
    'first_login_rotation_enforced',
      coalesce(v_control.first_login_rotation_enforced,false),
    'production_write_approved',
      coalesce(v_control.production_write_approved,false),
    'officially_verified',false,
    'actual_cohort_uuid',v_cohort_id,
    'cohort_exists',v_cohort_id IS NOT NULL,
    'manifest_approved',coalesce(v_approved,false),
    'manifest_sha256',v_manifest,
    'cohort_expected_count',600,
    'cohort_member_count',v_members,
    'stage_count',v_staged,
    'linked_count',v_linked,
    'active_count',v_active,
    'eligible_link_rows',v_eligible,
    'legacy_2128_inactive',v_legacy=2128,
    'old_synthetic_unchanged',v_legacy=2128,
    'unsafe_authenticated_truncates',v_unsafe_truncates,
    'unsafe_project_creator_future_truncate_defaults',v_unsafe_future_truncates,
    'unsafe_client_role_memberships',v_unsafe_client_role_memberships,
    'phase9_activation_guard_enabled',v_phase9_activation_guard,
    'ready_for_staging',v_cohort_id IS NOT NULL
      AND coalesce(v_approved,false) AND v_legacy=2128
      AND v_unsafe_truncates=0 AND v_members<=600
      AND coalesce(v_control.official_academic_writes_blocked_reviewed,false)
      AND public.project_auth_official_guards_ready_v1(),
    'ready_for_linking',v_cohort_id IS NOT NULL
      AND coalesce(v_approved,false) AND v_members=600 AND v_legacy=2128
      AND v_eligible=600 AND v_unsafe_truncates=0
      AND coalesce(v_control.official_academic_writes_blocked_reviewed,false)
      AND public.project_auth_official_guards_ready_v1(),
    'ready_for_activation',v_cohort_id IS NOT NULL
      AND coalesce(v_approved,false) AND v_members=600 AND v_legacy=2128
      AND v_eligible=600 AND v_unsafe_truncates=0
      AND v_unsafe_future_truncates=0
      AND v_unsafe_client_role_memberships=0
      AND v_phase9_activation_guard
      AND coalesce(v_control.production_write_approved,false)
      AND coalesce(v_control.test_only_admin_confirmation_approved,false)
      AND coalesce(v_control.email_side_effects_disabled,false)
      AND coalesce(v_control.manual_activation_guarded,false)
      AND coalesce(v_control.first_login_rotation_enforced,false)
      AND v_control.activation_approval_reference IS NOT NULL
      AND coalesce(v_control.official_academic_writes_blocked_reviewed,false)
      AND public.project_auth_official_guards_ready_v1()
  );
END
$rpc$;

CREATE FUNCTION public.stage_student_v1(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $rpc$
DECLARE
  v_cohort uuid;
  v_actor uuid;
  v_key text;
  v_name text;
  v_email text;
  v_number text;
  v_program text;
  v_fingerprint text;
  v_type text;
  v_full_source text;
  v_app_id uuid;
  v_student_id uuid;
  v_existing record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted server service role required' USING ERRCODE='42501';
  END IF;
  -- Defense in depth: readiness is diagnostic, NOT the authorization gate.
  -- Even a direct privileged call to stage_student_v1 must refuse writes
  -- while a PUBLIC/anon/authenticated TRUNCATE grant survives on ANY current
  -- public base table. This does not change the 74200 ACL fingerprint.
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
    WHERE ns.nspname='public' AND c.relkind IN ('r','p')
      AND (has_table_privilege('anon',c.oid,'TRUNCATE')
        OR has_table_privilege('authenticated',c.oid,'TRUNCATE'))
  ) THEN
    RAISE EXCEPTION 'PROJECT_ONLY staging blocked: public tables retain client TRUNCATE privileges'
      USING ERRCODE='42501';
  END IF;
  IF NOT public.project_auth_official_guards_ready_v1() THEN
    RAISE EXCEPTION 'PROJECT_ONLY staging blocked: complete 74300 official-academic write guards are not installed and enabled'
      USING ERRCODE='42501';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' THEN
    RAISE EXCEPTION 'A validated JSON payload is required' USING ERRCODE='22023';
  END IF;
  IF coalesce(p_payload->>'cohort_key',p_payload->>'cohort_id',
       'PLP_PROJECT_600_2026_1') <> 'PLP_PROJECT_600_2026_1' THEN
    RAISE EXCEPTION 'Unapproved project cohort' USING ERRCODE='23514';
  END IF;
  v_key := upper(btrim(coalesce(p_payload->>'source_key',p_payload->>'sourceKey','')));
  v_name := btrim(coalesce(p_payload->>'full_name',p_payload->>'fullName',''));
  v_email := lower(btrim(coalesce(p_payload->>'email','')));
  v_number := upper(btrim(coalesce(p_payload->>'student_number',
       p_payload->>'studentNumber','')));
  v_program := nullif(btrim(coalesce(p_payload->>'program_code',
       p_payload->>'programCode','')),'');
  v_fingerprint := lower(btrim(coalesce(p_payload->>'row_fingerprint',
       p_payload->>'source_fingerprint',p_payload->>'sourceFingerprint','')));
  v_type := coalesce(p_payload->>'student_type',p_payload->>'studentType','NEW_STUDENT');
  IF v_key !~ '^PROJECT_ONLY:TERM-2026-1:[A-Z0-9][A-Z0-9._/-]{2,63}$'
      OR length(v_name)<3
      OR v_email !~ '^[a-z0-9][a-z0-9._+-]*@example[.]invalid$'
      OR v_number !~ '^[A-Z0-9][A-Z0-9._/-]{2,63}$'
      OR v_fingerprint !~ '^[0-9a-f]{64}$'
      OR coalesce(p_payload->>'source_csv_sha256','') <>
          '592B2C56BAF3334FFC4898996BB3A3976C808ADA5652D564141096E150CB66BC'
      OR p_payload->>'account_kind' IS DISTINCT FROM 'PROJECT_ONLY'
      OR p_payload->>'record_kind' IS DISTINCT FROM 'PROJECT_ONLY'
      OR p_payload->>'institutional_verified' IS DISTINCT FROM 'false'
      OR p_payload->>'admission_approved' IS DISTINCT FROM 'false'
      OR p_payload->>'official_enrollment' IS DISTINCT FROM 'false'
      OR v_type NOT IN ('NEW_STUDENT','TRANSFEREE','CONTINUING_STUDENT') THEN
    RAISE EXCEPTION 'Invalid PROJECT_ONLY source/name/email/number/fingerprint/type'
      USING ERRCODE='22023';
  END IF;
  v_full_source := v_key;

  SELECT c.id INTO v_cohort
  FROM public.student_data_cohorts c
  JOIN public.project_auth_cohort_control ctl ON ctl.cohort_id=c.id
  WHERE c.cohort_key='PLP_PROJECT_600_2026_1'
    AND c.is_project_data AND c.expected_count=600
    AND c.academic_term_id='TERM-2026-1'
    AND p_payload->>'term_code'='TERM-2026-1'
    AND ctl.enabled AND ctl.source_type='GENERATED_PROJECT'
    AND upper(ctl.manifest_sha256)=
      '592B2C56BAF3334FFC4898996BB3A3976C808ADA5652D564141096E150CB66BC'
    AND ctl.production_write_approved
    AND ctl.test_only_admin_confirmation_approved
    AND ctl.email_side_effects_disabled
    AND ctl.manual_activation_guarded
    AND ctl.first_login_rotation_enforced
    AND ctl.official_academic_writes_blocked_reviewed
  FOR UPDATE OF c;
  IF v_cohort IS NULL THEN
    RAISE EXCEPTION '600-member cohort/approved manifest is not available'
      USING ERRCODE='23514';
  END IF;
  -- No client-supplied actor ID is trusted as evidence of a human admin.
  -- Only an Admin-authenticated backend may access the service key.
  SELECT ctl.approved_by INTO v_actor FROM public.project_auth_cohort_control ctl
    WHERE ctl.cohort_id=v_cohort;
  IF v_actor IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.app_users u WHERE u.id=v_actor
      AND u.role_code='system-administrator' AND u.account_status='Active'
      AND u.login_enabled
  ) THEN
    RAISE EXCEPTION 'Manifest approver is not an active administrator'
      USING ERRCODE='23514';
  END IF;

  SELECT l.app_user_id,l.student_id,u.email,s.student_number,l.source_fingerprint
    INTO v_existing
  FROM public.project_auth_student_links l
  JOIN public.app_users u ON u.id=l.app_user_id
  JOIN public.student_profiles s ON s.id=l.student_id
  WHERE l.source_key=v_full_source;
  IF FOUND THEN
    IF v_existing.email<>v_email OR v_existing.student_number<>v_number
       OR v_existing.source_fingerprint<>v_fingerprint THEN
      RAISE EXCEPTION 'PROJECT_ONLY source key already used for different identity'
        USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('state','EXISTS','app_user_id',
       v_existing.app_user_id,'student_id',v_existing.student_id,
       'contract_version','plp_project_auth_v1');
  END IF;
  IF (SELECT count(*) FROM public.project_auth_student_links
        WHERE cohort_id=v_cohort)>=600
     OR (SELECT count(*) FROM public.student_data_cohort_members
        WHERE cohort_id=v_cohort)>=600 THEN
    RAISE EXCEPTION 'PROJECT_ONLY cohort capacity 600 reached'
      USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.app_users
      WHERE lower(email)=v_email OR source_account_key=v_full_source)
     OR EXISTS(SELECT 1 FROM public.student_profiles
      WHERE student_number=v_number OR synthetic_source_key=v_full_source)
     OR EXISTS(SELECT 1 FROM public.user_login_identifiers
      WHERE identifier_value=v_number
         OR (identifier_type='EMAIL' AND lower(identifier_value)=v_email)) THEN
    RAISE EXCEPTION 'Fictional email/source/student number collides with existing data'
      USING ERRCODE='23505';
  END IF;
  INSERT INTO public.app_users
     (role_code,full_name,email,source_account_key,account_status,
      login_enabled,is_synthetic_demo,auth_user_id,account_kind,
      project_cohort_id,institutional_verified_at,first_name,middle_name,last_name)
  VALUES ('student',v_name,v_email,v_full_source,'Inactive',false,true,NULL,
          'PROJECT_ONLY','PLP_PROJECT_600_2026_1',NULL,
          nullif(p_payload->>'first_name',''),
          nullif(p_payload->>'middle_name',''),
          nullif(p_payload->>'last_name',''))
  RETURNING id INTO v_app_id;

  INSERT INTO public.student_profiles
     (user_id,student_number,program_code,student_status,student_type,
      is_synthetic_demo,synthetic_source_key,synthetic_source_attributes,
      record_kind,project_cohort_id,institutional_verified_at)
  VALUES(v_app_id,v_number,v_program,NULL,v_type,true,v_full_source,
         jsonb_build_object(
           'purpose','PROJECT_ONLY','cohort_key','PLP_PROJECT_600_2026_1',
           'data_origin','GENERATED_PROJECT','row_fingerprint',v_fingerprint,
           'year_level_proposed',p_payload->>'year_level_proposed',
           'major_code_proposed',p_payload->>'major_code_proposed',
           'major_alias_proposed',p_payload->>'major_alias_proposed',
           'curriculum_code_proposed',p_payload->>'curriculum_code_proposed',
           'block_proposed',p_payload->>'block_proposed',
           'admission_approved',false,'official_enrollment',false,
           'institutional_verified',false),
         'PROJECT_ONLY','PLP_PROJECT_600_2026_1',NULL)
  RETURNING id INTO v_student_id;

  INSERT INTO public.student_data_cohort_members
     (cohort_id,student_id,classification,data_origin,source_reference)
  VALUES (v_cohort,v_student_id,v_type,'GENERATED_PROJECT',v_full_source);
  INSERT INTO public.project_auth_student_links
     (app_user_id,student_id,cohort_id,source_key,source_fingerprint,
      auth_user_id,state,approved_by)
  VALUES (v_app_id,v_student_id,v_cohort,v_full_source,v_fingerprint,
          NULL,'STAGED',v_actor);
  INSERT INTO public.user_login_identifiers
     (user_id,identifier_type,identifier_value,is_primary)
  VALUES(v_app_id,'STUDENT_NUMBER',v_number,true);
  INSERT INTO public.user_login_identifiers
     (user_id,identifier_type,identifier_value,is_primary)
  VALUES(v_app_id,'EMAIL',v_email,false);

  RETURN jsonb_build_object('state','STAGED','app_user_id',v_app_id,
    'student_id',v_student_id,'contract_version','plp_project_auth_v1');
END
$rpc$;

CREATE FUNCTION public.link_student_v1(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $rpc$
DECLARE
  v_app_id uuid;
  v_auth_id uuid;
  v_link public.project_auth_student_links%ROWTYPE;
  v_app public.app_users%ROWTYPE;
  v_auth_email text;
  v_confirmed timestamptz;
  v_auth_meta jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted server service role required' USING ERRCODE='42501';
  END IF;
  v_app_id := coalesce(p_payload->>'app_user_id',p_payload->>'appUserId')::uuid;
  v_auth_id := coalesce(p_payload->>'auth_user_id',p_payload->>'authUserId')::uuid;
  IF v_app_id IS NULL AND p_payload->>'source_key' IS NOT NULL THEN
    SELECT app_user_id INTO v_app_id FROM public.project_auth_student_links
      WHERE source_key=p_payload->>'source_key';
  END IF;
  IF v_app_id IS NULL OR v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Exact app_user_id and returned Auth user UUID required'
      USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_link FROM public.project_auth_student_links
     WHERE app_user_id=v_app_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROJECT_ONLY staged link missing' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_app FROM public.app_users WHERE id=v_app_id FOR UPDATE;
  IF NOT FOUND OR v_link.state<>'STAGED'
      OR v_app.auth_user_id IS NOT NULL
      OR v_app.account_status<>'Inactive' OR v_app.login_enabled
      OR NOT public.project_auth_eligible_v1(v_app_id) THEN
    RAISE EXCEPTION 'App user is not an eligible STAGED PROJECT_ONLY account'
      USING ERRCODE='23514';
  END IF;
  IF p_payload->>'source_key' IS DISTINCT FROM v_link.source_key
      OR lower(coalesce(p_payload->>'row_fingerprint',''))
          IS DISTINCT FROM v_link.source_fingerprint
      OR lower(coalesce(p_payload->>'expected_email',''))
          IS DISTINCT FROM v_app.email
      OR p_payload->>'cohort_id' IS DISTINCT FROM 'PLP_PROJECT_600_2026_1'
      OR p_payload->>'institutional_verified' IS DISTINCT FROM 'false'
      OR (p_payload ? 'student_profile_id' AND
          p_payload->>'student_profile_id' IS DISTINCT FROM v_link.student_id::text) THEN
    RAISE EXCEPTION 'PROJECT_ONLY Auth binding payload/source mismatch'
      USING ERRCODE='23514';
  END IF;
  SELECT email,email_confirmed_at,raw_app_meta_data
    INTO v_auth_email,v_confirmed,v_auth_meta
    FROM auth.users WHERE id=v_auth_id;
  -- Admin creates unconfirmed Auth first. Email is administratively confirmed
  -- ONLY later, just before manual activation; never send verification email.
  IF v_auth_email IS NULL
      OR lower(v_auth_email)<>v_app.email
      OR v_auth_meta->>'project_only' IS DISTINCT FROM 'true'
      OR v_auth_meta->>'project_cohort_id' IS DISTINCT FROM 'PLP_PROJECT_600_2026_1'
      OR v_auth_meta->>'source_key' IS DISTINCT FROM v_link.source_key
      OR v_auth_meta->>'source_fingerprint' IS DISTINCT FROM v_link.source_fingerprint
      OR v_auth_meta->>'institutional_verified' IS DISTINCT FROM 'false'
      OR EXISTS(SELECT 1 FROM public.app_users u
         WHERE u.auth_user_id=v_auth_id AND u.id<>v_app_id) THEN
    RAISE EXCEPTION 'Auth identity does not match a confirmed, unique staged account'
      USING ERRCODE='23514';
  END IF;
  UPDATE public.project_auth_student_links
     SET auth_user_id=v_auth_id,state='LINKED',linked_at=now()
   WHERE app_user_id=v_app_id;
  PERFORM set_config('plp.project_auth_mutation','link',true);
  UPDATE public.app_users SET auth_user_id=v_auth_id WHERE id=v_app_id;
  RETURN jsonb_build_object('state','LINKED','app_user_id',v_app_id,
      'auth_user_id',v_auth_id,'contract_version','plp_project_auth_v1');
END
$rpc$;

CREATE FUNCTION public.activate_student_v1(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $rpc$
DECLARE
  v_app_id uuid;
  v_link public.project_auth_student_links%ROWTYPE;
  v_app public.app_users%ROWTYPE;
  v_total bigint;
  v_valid bigint;
  v_continuing bigint;
  v_new bigint;
  v_transfer bigint;
  v_target text;
  v_control public.project_auth_cohort_control%ROWTYPE;
  v_approval text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted server service role required' USING ERRCODE='42501';
  END IF;
  v_app_id := coalesce(p_payload->>'app_user_id',p_payload->>'appUserId')::uuid;
  IF v_app_id IS NULL AND p_payload->>'source_key' IS NOT NULL THEN
    SELECT app_user_id INTO v_app_id FROM public.project_auth_student_links
      WHERE source_key=p_payload->>'source_key';
  END IF;
  IF v_app_id IS NULL THEN
    RAISE EXCEPTION 'Explicit app_user_id is required' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_link FROM public.project_auth_student_links
    WHERE app_user_id=v_app_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROJECT_ONLY link missing' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_app FROM public.app_users WHERE id=v_app_id FOR UPDATE;
  IF NOT FOUND OR v_link.state<>'LINKED' OR v_link.auth_user_id IS NULL
    OR v_app.auth_user_id IS DISTINCT FROM v_link.auth_user_id
    OR v_app.account_status<>'Inactive' OR v_app.login_enabled
    OR NOT public.project_auth_eligible_v1(v_app_id) THEN
    RAISE EXCEPTION 'No approved LINKED PROJECT_ONLY identity available'
      USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_control FROM public.project_auth_cohort_control
    WHERE cohort_id=v_link.cohort_id;
  v_approval := p_payload->>'operator_approval_reference';
  IF NOT FOUND OR NOT v_control.enabled
      OR NOT v_control.manual_activation_guarded
      OR NOT v_control.production_write_approved
      OR v_approval IS NULL
      OR v_approval IS DISTINCT FROM v_control.activation_approval_reference
      OR p_payload->>'source_key' IS DISTINCT FROM v_link.source_key
      OR p_payload->>'cohort_id' IS DISTINCT FROM 'PLP_PROJECT_600_2026_1'
      OR lower(coalesce(p_payload->>'row_fingerprint',''))
          IS DISTINCT FROM v_link.source_fingerprint
      OR p_payload->>'auth_user_id' IS DISTINCT FROM v_link.auth_user_id::text
      OR p_payload->>'institutional_verified' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'PROJECT_ONLY activation approval, identity, or source mismatch'
      USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users au
      WHERE au.id=v_link.auth_user_id AND au.email_confirmed_at IS NOT NULL
        AND lower(au.email)=v_app.email) THEN
    RAISE EXCEPTION 'Authenticated email/identity did not match approved account'
      USING ERRCODE='23514';
  END IF;
  SELECT count(*),count(*) FILTER (WHERE
    m.data_origin='GENERATED_PROJECT'
      AND s.is_synthetic_demo AND u.is_synthetic_demo
      AND u.role_code='student'
      AND l.app_user_id IS NOT NULL
      AND l.source_key=u.source_account_key),
    count(*) FILTER (WHERE m.classification='CONTINUING_STUDENT'),
    count(*) FILTER (WHERE m.classification='NEW_STUDENT'),
    count(*) FILTER (WHERE m.classification='TRANSFEREE')
  INTO v_total,v_valid,v_continuing,v_new,v_transfer
  FROM public.student_data_cohort_members m
  JOIN public.student_profiles s ON s.id=m.student_id
  JOIN public.app_users u ON u.id=s.user_id
  LEFT JOIN public.project_auth_student_links l
    ON l.student_id=m.student_id AND l.cohort_id=m.cohort_id
  WHERE m.cohort_id=v_link.cohort_id;
  IF v_total<>600 OR v_valid<>600 OR v_continuing<>400
     OR v_new<>150 OR v_transfer<>50 THEN
    RAISE EXCEPTION 'PROJECT_ONLY must have exactly 600 valid members: 400 continuing, 150 new, 50 transferees'
      USING ERRCODE='23514';
  END IF;
  FOR v_target IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
    WHERE ns.nspname='public' AND c.relkind IN ('r','p')
  LOOP
    IF has_table_privilege('authenticated',format('public.%I',v_target),'TRUNCATE')
       OR has_table_privilege('anon',format('public.%I',v_target),'TRUNCATE') THEN
      RAISE EXCEPTION 'Unsafe authenticated TRUNCATE on % prevents activation',v_target
        USING ERRCODE='42501';
    END IF;
  END LOOP;
  UPDATE public.project_auth_student_links SET state='ACTIVE',
       activated_at=now(),operator_approval_reference=v_approval
    WHERE app_user_id=v_app_id;
  PERFORM set_config('plp.project_auth_mutation','activate',true);
  UPDATE public.app_users
    SET account_status='Active',login_enabled=true,
        project_activation_approved_at=now()
    WHERE id=v_app_id;
  RETURN jsonb_build_object('state','ACTIVE','app_user_id',v_app_id,
    'auth_user_id',v_link.auth_user_id,
    'contract_version','plp_project_auth_v1');
END
$rpc$;

-- Optional emergency access revocation. Existing tokens may remain valid at
-- Supabase Auth temporarily, but DB role/RLS helpers deny after this change.
-- The trusted backend should also ban sessions/rotate credentials via Admin API.
CREATE FUNCTION public.revoke_student_v1(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $rpc$
DECLARE
  v_app_id uuid;
  v_link public.project_auth_student_links%ROWTYPE;
  v_app public.app_users%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted server service role required' USING ERRCODE='42501';
  END IF;
  v_app_id := coalesce(p_payload->>'app_user_id',p_payload->>'appUserId')::uuid;
  IF v_app_id IS NULL THEN
    RAISE EXCEPTION 'Explicit app_user_id required' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_link FROM public.project_auth_student_links
    WHERE app_user_id=v_app_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROJECT_ONLY link missing' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_app FROM public.app_users WHERE id=v_app_id FOR UPDATE;
  IF NOT FOUND OR v_link.state<>'ACTIVE'
      OR v_app.auth_user_id IS DISTINCT FROM v_link.auth_user_id
      OR v_app.account_status<>'Active' OR NOT v_app.login_enabled
      OR v_app.account_kind IS DISTINCT FROM 'PROJECT_ONLY'
      OR v_app.project_cohort_id IS DISTINCT FROM 'PLP_PROJECT_600_2026_1' THEN
    RAISE EXCEPTION 'Account is not an active PROJECT_ONLY student'
      USING ERRCODE='23514';
  END IF;
  UPDATE public.project_auth_student_links
     SET state='REVOKED',revoked_at=now() WHERE app_user_id=v_app_id;
  PERFORM set_config('plp.project_auth_mutation','revoke',true);
  UPDATE public.app_users SET account_status='Inactive',login_enabled=false
    WHERE id=v_app_id;
  RETURN jsonb_build_object('state','REVOKED',
      'app_user_id',v_app_id,'contract_version','plp_project_auth_v1');
END
$rpc$;

-- Public schema is PostgREST-exposed. Do not let a browser discover usable
-- write RPCs through default PUBLIC EXECUTE grants.
REVOKE ALL ON FUNCTION public.project_auth_readiness_v1() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.stage_student_v1(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.link_student_v1(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.activate_student_v1(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.revoke_student_v1(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.project_auth_readiness_v1() TO service_role;
GRANT EXECUTE ON FUNCTION public.stage_student_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.link_student_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_student_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_student_v1(jsonb) TO service_role;
COMMIT;

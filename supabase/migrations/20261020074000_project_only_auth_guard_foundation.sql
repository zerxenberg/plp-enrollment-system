-- NONDEPLOYED PROJECT_ONLY authorization foundation.
-- No Auth users, cohort approvals, project students, or real academic records
-- are inserted by this migration. Requires a separately authorized deploy.
-- Keep all 2,128 legacy synthetic identities Inactive/unlinked.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $preflight$
BEGIN
  -- Project-owned objects must be created only by the reviewed postgres actor.
  IF current_user IS DISTINCT FROM 'postgres'
     OR session_user IS DISTINCT FROM 'postgres'
     OR (SELECT rolsuper FROM pg_roles WHERE rolname='postgres') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'PROJECT_ONLY foundation requires reviewed non-superuser postgres owner'
      USING ERRCODE='42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_default_acl d
    LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) x
    WHERE d.defaclobjtype='r'
      AND d.defaclrole='postgres'::regrole
      AND (d.defaclnamespace=0 OR n.nspname='public')
      AND x.privilege_type='TRUNCATE'
      AND x.grantee IN (0,'anon'::regrole,'authenticated'::regrole)
  ) OR EXISTS (
    SELECT 1 FROM pg_auth_members
    WHERE member IN ('anon'::regrole,'authenticated'::regrole)
  ) OR has_schema_privilege('anon','public','CREATE')
     OR has_schema_privilege('authenticated','public','CREATE') THEN
    RAISE EXCEPTION 'PROJECT_ONLY creation guard: unsafe postgres future TRUNCATE or client schema CREATE/inheritance'
      USING ERRCODE='23514';
  END IF;
  IF to_regclass('public.student_data_cohorts') IS NULL
     OR to_regclass('public.student_data_cohort_members') IS NULL
     OR to_regclass('public.student_profiles') IS NULL
     OR to_regclass('public.app_users') IS NULL
     OR to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'PROJECT_ONLY requires the existing normalized cohort/auth baseline';
  END IF;
  IF to_regclass('public.project_auth_cohort_control') IS NOT NULL
     OR to_regclass('public.project_auth_student_links') IS NOT NULL THEN
    RAISE EXCEPTION 'PROJECT_ONLY tables already exist; reconcile instead of replaying';
  END IF;
  IF (SELECT count(*) FROM public.app_users
      WHERE is_synthetic_demo AND source_account_key LIKE 'SYNTHETIC_PLANNING:%') <> 2128
     OR EXISTS(SELECT 1 FROM public.app_users
       WHERE is_synthetic_demo AND source_account_key LIKE 'SYNTHETIC_PLANNING:%'
         AND (auth_user_id IS NOT NULL OR account_status <> 'Inactive'
              OR login_enabled)) THEN
    RAISE EXCEPTION 'Existing 2128 SYNTHETIC_PLANNING accounts differ from reviewed inactive baseline';
  END IF;
  IF EXISTS(SELECT 1 FROM public.app_users
            WHERE source_account_key LIKE 'PROJECT_ONLY:TERM-2026-1:%') THEN
    RAISE EXCEPTION 'PROJECT_ONLY account prefix unexpectedly in use';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
       AND tablename='app_users' AND policyname='app_users_synthetic_admin_visibility'
       AND permissive='RESTRICTIVE')
     OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
       AND tablename='student_profiles'
       AND policyname='student_profiles_synthetic_coordinator_visibility'
       AND permissive='RESTRICTIVE') THEN
    RAISE EXCEPTION 'Baseline synthetic RESTRICTIVE RLS policies differ; stop';
  END IF;
END
$preflight$;

-- These effective TRUNCATE privileges exist today even though RLS is enabled.
-- RLS does not restrict TRUNCATE. This is targeted least-privilege hardening;
-- trusted SECURITY DEFINER server transactions do not need client TRUNCATE.
REVOKE TRUNCATE ON TABLE
  public.app_users, public.student_profiles, public.enrollments,
  public.academic_results, public.roles, public.role_permissions,
  public.user_login_identifiers, public.block_student_assignments,
  public.audit_events
FROM PUBLIC, anon, authenticated;
DO $privileges$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'app_users','student_profiles','enrollments','academic_results',
    'roles','role_permissions','user_login_identifiers',
    'block_student_assignments','audit_events'
  ] LOOP
    IF has_table_privilege('authenticated',format('public.%I',t),'TRUNCATE')
       OR has_table_privilege('anon',format('public.%I',t),'TRUNCATE') THEN
      RAISE EXCEPTION 'Unsafe effective client TRUNCATE privilege remains on %',t;
    END IF;
  END LOOP;
END
$privileges$;

-- Additive nullable provenance fields required by the separately developed
-- approved importer. Existing 2,128 planning accounts retain NULL kind/cohort
-- without data updates. Never infer institution verification from Auth.
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS account_kind text,
  ADD COLUMN IF NOT EXISTS project_cohort_id text,
  ADD COLUMN IF NOT EXISTS institutional_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS project_activation_approved_at timestamptz;
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS record_kind text,
  ADD COLUMN IF NOT EXISTS project_cohort_id text,
  ADD COLUMN IF NOT EXISTS institutional_verified_at timestamptz;

ALTER TABLE public.app_users
 ADD CONSTRAINT project_only_app_truth_check
 CHECK (account_kind IS DISTINCT FROM 'PROJECT_ONLY'
    OR (is_synthetic_demo IS TRUE AND role_code='student'
        AND institutional_verified_at IS NULL
        AND project_cohort_id='PLP_PROJECT_600_2026_1'
        AND source_account_key LIKE 'PROJECT_ONLY:TERM-2026-1:%'));
ALTER TABLE public.student_profiles
 ADD CONSTRAINT project_only_profile_truth_check
 CHECK (record_kind IS DISTINCT FROM 'PROJECT_ONLY'
    OR (is_synthetic_demo IS TRUE
        AND student_status IS NULL
        AND institutional_verified_at IS NULL
        AND project_cohort_id='PLP_PROJECT_600_2026_1'
        AND synthetic_source_key LIKE 'PROJECT_ONLY:TERM-2026-1:%'));

-- Approval is explicit and server-owned; no rows created by this migration.
-- An authorized human must review the 600-record manifest, SHA-256 digest,
-- academic term and exact cohort before a service process can stage students.
CREATE TABLE public.project_auth_cohort_control (
  cohort_id uuid PRIMARY KEY
    REFERENCES public.student_data_cohorts(id) ON DELETE RESTRICT,
  manifest_sha256 text NOT NULL
    CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  source_type text NOT NULL DEFAULT 'GENERATED_PROJECT'
    CHECK (source_type='GENERATED_PROJECT'),
  approved_by uuid
    REFERENCES public.app_users(id) ON DELETE RESTRICT,
  approved_via text NOT NULL DEFAULT 'SYSTEM_MIGRATION'
    CHECK (approved_via IN ('SYSTEM_MIGRATION','AUTHORIZED_SYSTEM_ADMIN')),
  CONSTRAINT project_auth_cohort_approver_evidence_check
    CHECK (approved_via='SYSTEM_MIGRATION' OR approved_by IS NOT NULL),
  approved_at timestamptz NOT NULL DEFAULT now(),
  enabled boolean NOT NULL DEFAULT false,
  test_only_admin_confirmation_approved boolean NOT NULL DEFAULT false,
  email_side_effects_disabled boolean NOT NULL DEFAULT false,
  first_login_rotation_enforced boolean NOT NULL DEFAULT false,
  manual_activation_guarded boolean NOT NULL DEFAULT false,
  official_academic_writes_blocked_reviewed boolean NOT NULL DEFAULT false,
  production_write_approved boolean NOT NULL DEFAULT false,
  activation_approval_reference text
    CHECK (activation_approval_reference ~ '^[A-Za-z0-9._:-]{12,128}$'),
  purpose text NOT NULL DEFAULT 'PROJECT_ONLY'
    CHECK (purpose='PROJECT_ONLY'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.project_auth_student_links (
  app_user_id uuid PRIMARY KEY
    REFERENCES public.app_users(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL UNIQUE
    REFERENCES public.student_profiles(id) ON DELETE RESTRICT,
  cohort_id uuid NOT NULL
    REFERENCES public.project_auth_cohort_control(cohort_id) ON DELETE RESTRICT,
  source_key text NOT NULL UNIQUE
    CHECK (source_key ~ '^PROJECT_ONLY:TERM-2026-1:[A-Z0-9][A-Z0-9._/-]{2,63}$'),
  source_fingerprint text NOT NULL UNIQUE
    CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'),
  source_type text NOT NULL DEFAULT 'PROJECT_ONLY'
    CHECK (source_type='PROJECT_ONLY'),
  auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  state text NOT NULL DEFAULT 'STAGED'
    CHECK (state IN ('STAGED','LINKED','ACTIVE','REVOKED')),
  approved_by uuid
    REFERENCES public.app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  linked_at timestamptz,
  activated_at timestamptz,
  revoked_at timestamptz,
  operator_approval_reference text
    CHECK (operator_approval_reference ~ '^[A-Za-z0-9._:-]{12,128}$'),
  CHECK ((state='STAGED' AND auth_user_id IS NULL)
         OR (state IN ('LINKED','ACTIVE','REVOKED') AND auth_user_id IS NOT NULL))
);
CREATE INDEX project_auth_student_links_cohort_state_idx
  ON public.project_auth_student_links(cohort_id,state);

ALTER TABLE public.project_auth_cohort_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_auth_student_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_auth_cohort_control,
              public.project_auth_student_links
FROM PUBLIC, anon, authenticated;
-- Dedicated server-side provisioning uses the service key, never a browser JWT.
GRANT SELECT,INSERT,UPDATE ON public.project_auth_cohort_control
  TO service_role;
GRANT SELECT ON public.project_auth_student_links TO service_role;

-- Trusted predicate for exact approved new-project accounts (not the original
-- 2,128 synthetic identities). No INSTITUTION_VERIFIED provenance accepted.
CREATE FUNCTION public.project_auth_eligible_v1(p_app_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_auth_student_links l
    JOIN public.project_auth_cohort_control ctl ON ctl.cohort_id=l.cohort_id
    JOIN public.student_data_cohorts c ON c.id=ctl.cohort_id
    JOIN public.student_data_cohort_members m
      ON m.cohort_id=c.id AND m.student_id=l.student_id
    JOIN public.student_profiles s ON s.id=l.student_id AND s.user_id=l.app_user_id
    JOIN public.app_users u ON u.id=l.app_user_id
    WHERE l.app_user_id=p_app_user_id
      AND c.cohort_key='PLP_PROJECT_600_2026_1'
      AND c.expected_count=600 AND c.is_project_data IS TRUE
      AND ctl.enabled IS TRUE AND ctl.purpose='PROJECT_ONLY'
      AND ctl.source_type='GENERATED_PROJECT'
      AND upper(ctl.manifest_sha256)=
        '592B2C56BAF3334FFC4898996BB3A3976C808ADA5652D564141096E150CB66BC'
      AND m.data_origin='GENERATED_PROJECT'
      AND m.classification IN ('NEW_STUDENT','TRANSFEREE','CONTINUING_STUDENT')
      AND u.role_code='student' AND u.is_synthetic_demo IS TRUE
      AND s.is_synthetic_demo IS TRUE
      AND u.source_account_key=l.source_key
      AND s.synthetic_source_key=l.source_key
      AND u.account_kind='PROJECT_ONLY'
      AND s.record_kind='PROJECT_ONLY'
      AND u.project_cohort_id=c.cohort_key
      AND s.project_cohort_id=c.cohort_key
      AND u.institutional_verified_at IS NULL
      AND s.institutional_verified_at IS NULL
      AND u.email=lower(u.email)
      AND u.email ~ '^[a-z0-9][a-z0-9._+-]*@example[.]invalid$'
  )
$fn$;
REVOKE ALL ON FUNCTION public.project_auth_eligible_v1(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_auth_eligible_v1(uuid)
  TO service_role;

-- RLS helper permits ONLY a properly activated synthetic Student to read
-- their OWN app user/profile after RLS's existing permissive ownership test.
CREATE FUNCTION public.project_auth_can_view_self_v1(p_app_user_id uuid)
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
  )
$fn$;
REVOKE ALL ON FUNCTION public.project_auth_can_view_self_v1(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_auth_can_view_self_v1(uuid)
  TO authenticated;

-- Original nonfixture email-linking behavior remains unchanged. The new
-- confirmed-email trigger MUST NEVER bind synthetic records by email alone.
CREATE OR REPLACE FUNCTION public.link_preprovisioned_app_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
  IF NEW.email IS NOT NULL AND NEW.email_confirmed_at IS NOT NULL THEN
    UPDATE public.app_users
       SET auth_user_id=NEW.id, updated_at=now()
     WHERE auth_user_id IS NULL
       AND is_synthetic_demo IS NOT TRUE
       AND lower(email)=lower(NEW.email);
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION public.link_preprovisioned_app_user()
  FROM PUBLIC, anon, authenticated;

-- Preserve the legacy synthetic immutability invariant. Only a service-only
-- RPC may LINK or ACTIVATE a member of the exact approved PROJECT_ONLY cohort.
-- Normal login audit updates of unchanged identity fields remain possible.
CREATE OR REPLACE FUNCTION public.reject_synthetic_account_promotion()
RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $guard$
DECLARE
  v_link public.project_auth_student_links%ROWTYPE;
  v_mutation text := current_setting('plp.project_auth_mutation',true);
BEGIN
  IF TG_OP='UPDATE' AND OLD.is_synthetic_demo IS TRUE THEN
    IF NEW.is_synthetic_demo IS DISTINCT FROM TRUE
      OR NEW.source_account_key IS DISTINCT FROM OLD.source_account_key
      OR NEW.role_code IS DISTINCT FROM OLD.role_code
      OR NEW.account_kind IS DISTINCT FROM OLD.account_kind
      OR NEW.project_cohort_id IS DISTINCT FROM OLD.project_cohort_id
      OR NEW.institutional_verified_at IS DISTINCT FROM OLD.institutional_verified_at THEN
      RAISE EXCEPTION 'Synthetic identity, source, and role are immutable'
        USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.is_synthetic_demo IS NOT TRUE THEN RETURN NEW; END IF;

  -- Inactive, unlinked planning-only data (including existing 2128) is allowed.
  IF NEW.auth_user_id IS NULL AND NEW.account_status='Inactive'
       AND NEW.login_enabled IS FALSE THEN
    IF TG_OP='UPDATE' AND OLD.auth_user_id IS NOT NULL
        AND OLD.auth_user_id IS DISTINCT FROM NEW.auth_user_id THEN
      RAISE EXCEPTION 'Synthetic Auth links may not be cleared through account UPDATE'
        USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP='INSERT' OR NEW.role_code <> 'student'
      OR (v_mutation IS DISTINCT FROM 'revoke'
          AND NOT public.project_auth_eligible_v1(NEW.id)) THEN
    RAISE EXCEPTION 'Only approved PROJECT_ONLY synthetic students may authenticate'
      USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_link FROM public.project_auth_student_links
    WHERE app_user_id=NEW.id;
  IF NOT FOUND OR NEW.auth_user_id IS DISTINCT FROM v_link.auth_user_id
      OR v_link.auth_user_id IS NULL THEN
    RAISE EXCEPTION 'PROJECT_ONLY identity link mismatch'
      USING ERRCODE='23514';
  END IF;

  -- Unchanged protected fields permit normal trusted login-audit timestamps.
  IF OLD.auth_user_id IS NOT DISTINCT FROM NEW.auth_user_id
      AND OLD.account_status IS NOT DISTINCT FROM NEW.account_status
      AND OLD.login_enabled IS NOT DISTINCT FROM NEW.login_enabled
      AND OLD.email IS NOT DISTINCT FROM NEW.email THEN
    IF (v_link.state='ACTIVE' AND NEW.account_status='Active'
        AND NEW.login_enabled)
      OR (v_link.state='LINKED' AND NEW.account_status='Inactive'
          AND NOT NEW.login_enabled) THEN
      RETURN NEW;
    END IF;
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only the trusted service may mutate PROJECT_ONLY auth state'
      USING ERRCODE='42501';
  END IF;
  IF v_mutation='link'
      AND OLD.auth_user_id IS NULL
      AND v_link.state='LINKED'
      AND NEW.account_status='Inactive' AND NEW.login_enabled IS FALSE
      AND OLD.account_status='Inactive' AND OLD.login_enabled IS FALSE
      AND NEW.email IS NOT DISTINCT FROM OLD.email THEN
    RETURN NEW;
  END IF;
  IF v_mutation='activate'
      AND OLD.auth_user_id=NEW.auth_user_id
      AND v_link.state='ACTIVE'
      AND OLD.account_status='Inactive' AND OLD.login_enabled IS FALSE
      AND NEW.account_status='Active' AND NEW.login_enabled IS TRUE
      AND NEW.project_activation_approved_at IS NOT NULL
      AND NEW.email IS NOT DISTINCT FROM OLD.email THEN
    RETURN NEW;
  END IF;
  IF v_mutation='revoke'
      AND OLD.auth_user_id=NEW.auth_user_id
      AND v_link.state='REVOKED'
      AND NEW.account_kind='PROJECT_ONLY'
      AND NEW.project_cohort_id='PLP_PROJECT_600_2026_1'
      AND OLD.account_status='Active' AND OLD.login_enabled IS TRUE
      AND NEW.account_status='Inactive' AND NEW.login_enabled IS FALSE
      AND NEW.email IS NOT DISTINCT FROM OLD.email THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'PROJECT_ONLY state transition is not authorized'
    USING ERRCODE='23514';
END
$guard$;
REVOKE ALL ON FUNCTION public.reject_synthetic_account_promotion()
  FROM PUBLIC,anon,authenticated;

-- Retain original restrictive SELECT policy semantics and append only a
-- verified same-user project exception. The permissive self / staff policies
-- remain in force and are NOT broadened.
DROP POLICY app_users_synthetic_admin_visibility ON public.app_users;
CREATE POLICY app_users_synthetic_admin_visibility ON public.app_users
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT is_synthetic_demo
    OR public.has_role('system-administrator')
    OR public.project_auth_can_view_self_v1(id));

DROP POLICY student_profiles_synthetic_coordinator_visibility
  ON public.student_profiles;
CREATE POLICY student_profiles_synthetic_coordinator_visibility
  ON public.student_profiles
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT is_synthetic_demo
    OR public.has_role('academic-coordinator')
    -- Registrar already has a permissive roster-read policy. This narrowly
    -- restores it for PROJECT_ONLY enrollment students while keeping the
    -- original 2,128 planning-only synthetic profiles coordinator-scoped.
    OR (record_kind='PROJECT_ONLY' AND public.has_role('registrar'))
    OR public.project_auth_can_view_self_v1(user_id));

-- Existing self-service UPDATE permits ordinary students. PROJECT_ONLY
-- profiles are entirely read-only until a reviewed contact-only API exists.
CREATE POLICY project_auth_profile_update_deny_v1
  ON public.student_profiles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (record_kind IS DISTINCT FROM 'PROJECT_ONLY')
  WITH CHECK (record_kind IS DISTINCT FROM 'PROJECT_ONLY');

-- DO NOT alter public.reject_synthetic_official_enrollment() or its trigger.
-- All project student_profiles must remain is_synthetic_demo=true forever.
COMMIT;

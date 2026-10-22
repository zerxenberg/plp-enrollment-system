-- PROJECT_ONLY 745: narrowly authorized per-account System Administrator approval.
-- SOURCE ONLY / NOT DEPLOYED BY THIS WORKER. No records, users, tokens, or
-- cohort approvals are inserted. Preserve all 2,128 LEGACY_SYNTHETIC identities.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $preflight$
BEGIN
  IF current_user IS DISTINCT FROM 'postgres'
     OR session_user IS DISTINCT FROM 'postgres'
     OR (SELECT rolsuper FROM pg_roles WHERE rolname='postgres') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'PROJECT_ONLY 745 requires reviewed non-superuser postgres owner'
      USING ERRCODE='42501';
  END IF;
  IF to_regclass('public.project_auth_student_links') IS NULL
     OR to_regclass('public.project_auth_cohort_control') IS NULL
     OR to_regprocedure('public.activate_student_v1(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Apply and independently verify 740/741 before 745';
  END IF;
  IF to_regprocedure('public.has_permission(text)') IS NULL THEN
    RAISE EXCEPTION 'Existing PLP role-permission check is required';
  END IF;
  IF to_regprocedure('public.project_auth_official_guards_ready_v1()') IS NULL
     OR NOT public.project_auth_official_guards_ready_v1()
     OR to_regprocedure('public.project_auth_phase9_default_acl_activation_guard()') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger t
       WHERE t.tgrelid='public.project_auth_student_links'::regclass
         AND t.tgname='project_auth_phase9_default_acl_activation_guard'
         AND t.tgenabled IN ('O','A') AND NOT t.tgisinternal
         AND t.tgfoid=to_regprocedure(
           'public.project_auth_phase9_default_acl_activation_guard()'
         )
     ) THEN
    RAISE EXCEPTION 'Reviewed 742 activation and 743 official-write physical guards are required'
      USING ERRCODE='23514';
  END IF;
  IF to_regclass('public.project_auth_account_approvals') IS NOT NULL
     OR to_regprocedure('public.project_auth_admin_approve_v1(uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION '745 already partly installed; reconcile before rerunning';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND (has_table_privilege('anon',c.oid,'TRUNCATE')
           OR has_table_privilege('authenticated',c.oid,'TRUNCATE'))
  ) OR has_schema_privilege('anon','public','CREATE')
     OR has_schema_privilege('authenticated','public','CREATE')
     OR EXISTS (
       SELECT 1 FROM pg_default_acl d
       LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
       CROSS JOIN LATERAL aclexplode(d.defaclacl) x
       WHERE d.defaclobjtype='r' AND d.defaclrole='postgres'::regrole
         AND (d.defaclnamespace=0 OR n.nspname='public')
         AND x.privilege_type='TRUNCATE'
         AND x.grantee IN (0,'anon'::regrole,'authenticated'::regrole)
     ) THEN
    RAISE EXCEPTION '745 project-scoped client privilege release condition failed';
  END IF;
END
$preflight$;

CREATE TABLE public.project_auth_account_approvals (
  approval_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  app_user_id uuid NOT NULL
    REFERENCES public.project_auth_student_links(app_user_id) ON DELETE RESTRICT,
  cohort_id uuid NOT NULL
    REFERENCES public.project_auth_cohort_control(cohort_id) ON DELETE RESTRICT,
  source_key text NOT NULL,
  source_fingerprint text NOT NULL
    CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'),
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_by uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 12 AND 500),
  state text NOT NULL DEFAULT 'APPROVED'
    CHECK (state IN ('APPROVED','HANDED_OFF','CONSUMED','REVOKED','EXPIRED')),
  sealed_handoff_sha256 text
    CHECK (sealed_handoff_sha256 ~ '^[0-9a-f]{64}$'),
  approved_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  handoff_confirmed_at timestamptz,
  handoff_confirmed_by uuid REFERENCES public.app_users(id) ON DELETE RESTRICT,
  consumed_at timestamptz,
  CHECK ((state='APPROVED' AND sealed_handoff_sha256 IS NULL)
         OR (state IN ('HANDED_OFF','CONSUMED') AND sealed_handoff_sha256 IS NOT NULL)
         OR state IN ('REVOKED','EXPIRED')),
  CHECK (state IS DISTINCT FROM 'CONSUMED' OR consumed_at IS NOT NULL),
  CHECK (expires_at > approved_at AND expires_at <= approved_at + interval '4 hours')
);
CREATE UNIQUE INDEX project_auth_one_pending_activation_v1
 ON public.project_auth_account_approvals(app_user_id)
 WHERE state IN ('APPROVED','HANDED_OFF');
CREATE INDEX project_auth_admin_approvals_cohort_v1
 ON public.project_auth_account_approvals(cohort_id,state);
ALTER TABLE public.project_auth_account_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_auth_account_approvals FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.project_auth_account_approvals TO service_role;
-- No client table WRITE grants, including the administrators. Admin-only
-- authenticated RPCs resolve actual auth.uid and validate the DB role.

CREATE FUNCTION public.project_auth_authenticated_admin_v1()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_actor uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'An authenticated System Administrator is required'
      USING ERRCODE='42501';
  END IF;
  SELECT u.id INTO v_actor FROM public.app_users u
  WHERE u.auth_user_id=auth.uid() AND u.role_code='system-administrator'
    AND u.account_status='Active' AND u.login_enabled
    AND u.is_synthetic_demo IS DISTINCT FROM TRUE
    AND u.account_kind IS DISTINCT FROM 'PROJECT_ONLY'
    AND public.has_permission('system.users_manage') IS TRUE;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Only an active institutional System Administrator may approve'
      USING ERRCODE='42501';
  END IF;
  RETURN v_actor;
END
$fn$;
REVOKE ALL ON FUNCTION public.project_auth_authenticated_admin_v1()
 FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.project_auth_authenticated_admin_v1()
 TO authenticated;

CREATE FUNCTION public.project_auth_admin_approve_v1(
 p_app_user_id uuid,p_reason text
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_actor uuid;
 v_link public.project_auth_student_links%ROWTYPE;
 v_app public.app_users%ROWTYPE;
 v_new uuid;
BEGIN
  v_actor := public.project_auth_authenticated_admin_v1();
  IF p_app_user_id IS NULL OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 12 AND 500 THEN
    RAISE EXCEPTION 'Exact project account and meaningful reason required'
      USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_link FROM public.project_auth_student_links
   WHERE app_user_id=p_app_user_id FOR UPDATE;
  SELECT * INTO v_app FROM public.app_users WHERE id=p_app_user_id;
  IF NOT FOUND OR v_link.app_user_id IS NULL OR v_link.state <> 'LINKED'
     OR v_link.auth_user_id IS NULL
     OR v_app.auth_user_id IS DISTINCT FROM v_link.auth_user_id
     OR v_app.is_synthetic_demo IS DISTINCT FROM TRUE
     OR v_app.account_kind IS DISTINCT FROM 'PROJECT_ONLY'
     OR v_app.role_code IS DISTINCT FROM 'student'
     OR v_app.account_status IS DISTINCT FROM 'Inactive' OR v_app.login_enabled
     OR NOT public.project_auth_eligible_v1(p_app_user_id) THEN
    RAISE EXCEPTION 'Per-account approval requires linked inactive PROJECT_ONLY student'
      USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.project_auth_cohort_control ctl
    WHERE ctl.cohort_id=v_link.cohort_id
      AND ctl.enabled AND ctl.manual_activation_guarded
      AND ctl.production_write_approved
      AND ctl.test_only_admin_confirmation_approved
      AND ctl.email_side_effects_disabled
      AND ctl.first_login_rotation_enforced
      AND ctl.official_academic_writes_blocked_reviewed
      AND ctl.approved_via='AUTHORIZED_SYSTEM_ADMIN'
      AND ctl.approved_by=v_actor
  ) THEN
    RAISE EXCEPTION 'Cohort activation controls are not approved'
      USING ERRCODE='23514';
  END IF;
  UPDATE public.project_auth_account_approvals
     SET state='EXPIRED'
   WHERE app_user_id=p_app_user_id
     AND state IN ('APPROVED','HANDED_OFF') AND expires_at<=now();
  IF EXISTS (
    SELECT 1 FROM public.project_auth_account_approvals
    WHERE app_user_id=p_app_user_id AND state IN ('APPROVED','HANDED_OFF')
  ) THEN
    RAISE EXCEPTION 'Existing live account approval cannot be overwritten'
      USING ERRCODE='23505';
  END IF;
  INSERT INTO public.project_auth_account_approvals
    (app_user_id,cohort_id,source_key,source_fingerprint,auth_user_id,
     approved_by,reason,expires_at)
  VALUES (v_link.app_user_id,v_link.cohort_id,v_link.source_key,
          v_link.source_fingerprint,v_link.auth_user_id,
          v_actor,btrim(p_reason),now()+interval '4 hours')
  RETURNING approval_id INTO v_new;
  RETURN v_new;
END
$fn$;
REVOKE ALL ON FUNCTION public.project_auth_admin_approve_v1(uuid,text)
 FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.project_auth_admin_approve_v1(uuid,text)
 TO authenticated;

CREATE FUNCTION public.project_auth_admin_confirm_handoff_v1(
 p_approval_id uuid,p_sealed_sha256 text
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_actor uuid;v_approval public.project_auth_account_approvals%ROWTYPE;
BEGIN
  v_actor := public.project_auth_authenticated_admin_v1();
  IF p_approval_id IS NULL
     OR p_sealed_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Exact approval and SHA-256 sealed recipient package required'
      USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_approval FROM public.project_auth_account_approvals
    WHERE approval_id=p_approval_id FOR UPDATE;
  IF NOT FOUND OR v_approval.state<>'APPROVED'
     OR v_approval.expires_at<=now()
     OR v_approval.approved_by IS DISTINCT FROM v_actor
     OR NOT EXISTS (
       SELECT 1 FROM public.project_auth_student_links l
       WHERE l.app_user_id=v_approval.app_user_id
         AND l.cohort_id=v_approval.cohort_id
         AND l.source_key=v_approval.source_key
         AND l.source_fingerprint=v_approval.source_fingerprint
         AND l.auth_user_id=v_approval.auth_user_id
         AND l.state='LINKED'
     ) THEN
    RAISE EXCEPTION 'Handoff confirmation rejected: approval expired, mismatched or already used'
      USING ERRCODE='23514';
  END IF;
  UPDATE public.project_auth_account_approvals
    SET state='HANDED_OFF',sealed_handoff_sha256=p_sealed_sha256,
        handoff_confirmed_at=now(),handoff_confirmed_by=v_actor
    WHERE approval_id=p_approval_id;
  RETURN true;
END
$fn$;
REVOKE ALL ON FUNCTION public.project_auth_admin_confirm_handoff_v1(uuid,text)
 FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.project_auth_admin_confirm_handoff_v1(uuid,text)
 TO authenticated;

CREATE FUNCTION public.project_auth_validate_activation_approval_v1(
 p_app_user_id uuid,p_approval_id uuid,p_auth_user_id uuid,
 p_source_fingerprint text,p_handoff_sha256 text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
 SELECT EXISTS (
   SELECT 1 FROM public.project_auth_account_approvals a
   JOIN public.project_auth_student_links l ON l.app_user_id=a.app_user_id
   JOIN public.app_users u ON u.id=a.app_user_id
   JOIN public.app_users admin ON admin.id=a.approved_by
   WHERE a.app_user_id=p_app_user_id AND a.approval_id=p_approval_id
     AND a.auth_user_id=p_auth_user_id AND l.auth_user_id=p_auth_user_id
     AND a.source_fingerprint=p_source_fingerprint
     AND a.source_fingerprint=l.source_fingerprint
     AND a.source_key=l.source_key AND a.cohort_id=l.cohort_id
     AND a.sealed_handoff_sha256=p_handoff_sha256
     AND a.state='HANDED_OFF' AND a.expires_at>now()
     AND a.handoff_confirmed_at IS NOT NULL
     AND a.handoff_confirmed_by=a.approved_by
     AND l.state='LINKED'
     AND u.account_kind='PROJECT_ONLY' AND u.is_synthetic_demo
     AND u.account_status='Inactive' AND NOT u.login_enabled
     AND u.institutional_verified_at IS NULL
     AND admin.role_code='system-administrator'
     AND admin.account_status='Active' AND admin.login_enabled
 )
$fn$;
REVOKE ALL ON FUNCTION public.project_auth_validate_activation_approval_v1(
 uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.project_auth_validate_activation_approval_v1(
 uuid,uuid,uuid,text,text) TO service_role;

CREATE FUNCTION public.project_auth_validate_consumed_approval_v1(
 p_app_user_id uuid,p_approval_id uuid,p_auth_user_id uuid,
 p_source_fingerprint text,p_handoff_sha256 text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
 SELECT EXISTS(
   SELECT 1 FROM public.project_auth_account_approvals a
   JOIN public.project_auth_student_links l ON l.app_user_id=a.app_user_id
   JOIN public.app_users u ON u.id=a.app_user_id
   JOIN public.app_users admin ON admin.id=a.approved_by
   WHERE a.app_user_id=p_app_user_id AND a.approval_id=p_approval_id
     AND a.auth_user_id=p_auth_user_id AND l.auth_user_id=p_auth_user_id
     AND a.source_fingerprint=p_source_fingerprint
     AND l.source_fingerprint=a.source_fingerprint
     AND a.source_key=l.source_key AND a.cohort_id=l.cohort_id
     AND a.sealed_handoff_sha256=p_handoff_sha256
     AND a.state='CONSUMED' AND a.consumed_at IS NOT NULL
     AND a.handoff_confirmed_by=a.approved_by
     AND a.handoff_confirmed_at IS NOT NULL
     AND l.state='ACTIVE' AND u.auth_user_id=p_auth_user_id
     AND u.account_kind='PROJECT_ONLY' AND u.is_synthetic_demo
     AND u.account_status='Active' AND u.login_enabled
     AND u.institutional_verified_at IS NULL
     AND admin.role_code='system-administrator'
     AND admin.account_status='Active' AND admin.login_enabled
 )
$fn$;
REVOKE ALL ON FUNCTION public.project_auth_validate_consumed_approval_v1(
 uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.project_auth_validate_consumed_approval_v1(
 uuid,uuid,uuid,text,text) TO service_role;

-- The EXISTING 741 activation RPC still checks its cohort control reference.
-- This additional BEFORE transition trigger enforces a real individually
-- authenticated System Administrator handoff approval, and consumes it
-- transactionally. It cannot be bypassed with a guessed cohort-wide code.
CREATE FUNCTION public.project_auth_consume_account_approval_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_id uuid;v_count integer;v_admin uuid;
BEGIN
  IF TG_OP <> 'UPDATE' OR OLD.state IS NOT DISTINCT FROM NEW.state
     OR NEW.state <> 'ACTIVE' THEN RETURN NEW; END IF;
  IF OLD.state <> 'LINKED' OR auth.role() IS DISTINCT FROM 'service_role'
     OR NEW.app_user_id IS DISTINCT FROM OLD.app_user_id
     OR NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
     OR NEW.source_key IS DISTINCT FROM OLD.source_key
     OR NEW.source_fingerprint IS DISTINCT FROM OLD.source_fingerprint THEN
    RAISE EXCEPTION 'Unapproved PROJECT_ONLY activation transition'
      USING ERRCODE='42501';
  END IF;
  SELECT a.approval_id,a.approved_by INTO v_id,v_admin
    FROM public.project_auth_account_approvals a
    JOIN public.app_users admin ON admin.id=a.approved_by
    JOIN public.project_auth_cohort_control ctl ON ctl.cohort_id=a.cohort_id
    WHERE a.app_user_id=OLD.app_user_id
      AND a.cohort_id=OLD.cohort_id
      AND a.source_key=OLD.source_key
      AND a.source_fingerprint=OLD.source_fingerprint
      AND a.auth_user_id=OLD.auth_user_id
      AND a.state='HANDED_OFF'
      AND a.expires_at>now()
      AND a.handoff_confirmed_by=a.approved_by
      AND a.handoff_confirmed_at IS NOT NULL
      AND a.sealed_handoff_sha256 IS NOT NULL
      AND ctl.approved_via='AUTHORIZED_SYSTEM_ADMIN'
      AND ctl.approved_by=a.approved_by
      AND admin.role_code='system-administrator'
      AND admin.account_status='Active' AND admin.login_enabled
    FOR UPDATE OF a;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Missing individual approved recipient handoff for PROJECT_ONLY activation'
      USING ERRCODE='23514';
  END IF;
  UPDATE public.project_auth_account_approvals
    SET state='CONSUMED',consumed_at=now()
    WHERE approval_id=v_id AND state='HANDED_OFF';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Per-account activation approval was already consumed'
      USING ERRCODE='23514';
  END IF;
  NEW.approved_by := v_admin;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION public.project_auth_consume_account_approval_v1()
 FROM PUBLIC,anon,authenticated;
CREATE TRIGGER project_auth_consume_individual_approval_v1
 BEFORE UPDATE OF state ON public.project_auth_student_links
 FOR EACH ROW EXECUTE FUNCTION public.project_auth_consume_account_approval_v1();

-- The approval table is strictly internal; a caller cannot simply INSERT
-- its own proof, update an approval, or obtain privileged access through RLS.
DO $postflight$
BEGIN
  IF has_table_privilege('anon','public.project_auth_account_approvals','INSERT')
     OR has_table_privilege('authenticated','public.project_auth_account_approvals','INSERT')
     OR has_table_privilege('authenticated','public.project_auth_account_approvals','UPDATE')
     OR NOT EXISTS(
       SELECT 1 FROM pg_trigger
       WHERE tgrelid='public.project_auth_student_links'::regclass
         AND tgname='project_auth_consume_individual_approval_v1'
         AND tgenabled='O'
     ) THEN
    RAISE EXCEPTION '745 approval protection postflight failed';
  END IF;
END
$postflight$;
COMMIT;

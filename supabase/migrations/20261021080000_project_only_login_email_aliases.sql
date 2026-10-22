-- Additive, identity-preserving login email update for the already registered
-- PLP_PROJECT_600_2026_1. Original pinned CSV/fingerprints never change.
-- Requires authenticated project account linkage and service-only execution.
BEGIN;

DO $preflight$
DECLARE v_guard text; v_elig text;
BEGIN
  IF current_user <> 'postgres'
     OR (SELECT count(*) FROM public.project_auth_student_links) <> 600
     OR (SELECT count(*) FROM public.app_users
         WHERE account_kind='PROJECT_ONLY') <> 600
     OR (SELECT count(*) FROM public.app_users
         WHERE is_synthetic_demo AND account_status='Inactive'
           AND login_enabled=false AND auth_user_id IS NULL
           AND (source_account_key IS NULL OR
                source_account_key NOT LIKE 'PROJECT_ONLY:%')) <> 2128 THEN
    RAISE EXCEPTION 'Unexpected project owner, roster or original synthetic baseline';
  END IF;
  v_guard:=pg_get_functiondef(
    'public.reject_synthetic_account_promotion()'::regprocedure);
  v_elig:=pg_get_functiondef(
    'public.project_auth_eligible_v1(uuid)'::regprocedure);
  IF position('IF v_mutation=''link''' IN v_guard)=0
     OR position(
       'AND u.email ~ ''^[a-z0-9][a-z0-9._+-]*@example[.]invalid$'''
       IN v_elig)=0 THEN
    RAISE EXCEPTION 'Immutable PROJECT_ONLY baseline guard differs; no migration';
  END IF;

  -- Keep the existing complete eligibility predicate; allow the new strict
  -- email syntax in addition to the original fictional address format.
  EXECUTE replace(v_elig,
    'AND u.email ~ ''^[a-z0-9][a-z0-9._+-]*@example[.]invalid$''',
    'AND (u.email ~ ''^[a-z0-9][a-z0-9._+-]*@example[.]invalid$''
      OR u.email ~ ''^[a-z0-9]+[.][a-z0-9]+([.][0-9]{7})?@plp[.]edu[.]ph$'')');

  -- This branch is AFTER the original auth.role()=service_role assertion.
  -- All prior source, academic and role immutability checks remain intact.
  EXECUTE replace(v_guard,
    'IF v_mutation=''link''',
    $newbranch$
IF v_mutation='email' AND TG_OP='UPDATE'
      AND OLD.account_kind='PROJECT_ONLY'
      AND v_link.state IN ('LINKED','ACTIVE')
      AND NEW.email ~ '^[a-z0-9]+[.][a-z0-9]+([.][0-9]{7})?@plp[.]edu[.]ph$'
      AND OLD.email IS DISTINCT FROM NEW.email
      AND OLD.auth_user_id IS NOT DISTINCT FROM NEW.auth_user_id
      AND OLD.account_status IS NOT DISTINCT FROM NEW.account_status
      AND OLD.login_enabled IS NOT DISTINCT FROM NEW.login_enabled
      AND OLD.role_code IS NOT DISTINCT FROM NEW.role_code
      AND OLD.source_account_key IS NOT DISTINCT FROM NEW.source_account_key
      AND OLD.project_cohort_id IS NOT DISTINCT FROM NEW.project_cohort_id
      AND OLD.account_kind IS NOT DISTINCT FROM NEW.account_kind THEN
    RETURN NEW;
  END IF;
  IF v_mutation='link'$newbranch$);
END
$preflight$;

CREATE FUNCTION public.project_auth_set_student_login_email_v1(
  p_app_user_id uuid,p_auth_user_id uuid,p_new_email text
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_app public.app_users%ROWTYPE;
        v_identifier uuid; v_identifier_email text;
        v_target text:=lower(btrim(coalesce(p_new_email,'')));
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     OR p_app_user_id IS NULL OR p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Trusted project service role required' USING ERRCODE='42501';
  END IF;
  IF v_target !~ '^[a-z0-9]+[.][a-z0-9]+([.][0-9]{7})?@plp[.]edu[.]ph$'
     OR v_target <> p_new_email THEN
    RAISE EXCEPTION 'Invalid normalized project email address'
      USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_app FROM public.app_users
    WHERE id=p_app_user_id FOR UPDATE;
  IF NOT FOUND OR v_app.account_kind<>'PROJECT_ONLY'
     OR v_app.role_code<>'student' OR NOT v_app.is_synthetic_demo
     OR v_app.project_cohort_id<>'PLP_PROJECT_600_2026_1'
     OR v_app.institutional_verified_at IS NOT NULL
     OR v_app.auth_user_id IS DISTINCT FROM p_auth_user_id
     OR NOT EXISTS (
       SELECT 1 FROM public.project_auth_student_links l
       JOIN public.student_profiles s
         ON s.id=l.student_id AND s.user_id=l.app_user_id
       WHERE l.app_user_id=p_app_user_id
         AND l.auth_user_id=p_auth_user_id
         AND l.state IN ('ACTIVE','LINKED')
         AND l.source_key=v_app.source_account_key
         AND s.record_kind='PROJECT_ONLY'
         AND s.institutional_verified_at IS NULL
     )
     OR NOT public.project_auth_eligible_v1(p_app_user_id) THEN
    RAISE EXCEPTION 'Only the approved immutable PROJECT_ONLY identity may change'
      USING ERRCODE='23514';
  END IF;
  -- The Supabase Auth Admin operation happens first, and must read back the
  -- same UUID and new email. This transaction then synchronizes app + login ID.
  IF NOT EXISTS (
    SELECT 1 FROM auth.users a
    WHERE a.id=p_auth_user_id AND lower(a.email)=v_target
  ) OR EXISTS (
    SELECT 1 FROM auth.users a
    WHERE a.id<>p_auth_user_id AND lower(a.email)=v_target
  ) OR EXISTS (
    SELECT 1 FROM public.app_users u
    WHERE u.id<>p_app_user_id AND lower(u.email)=v_target
  ) OR EXISTS (
    SELECT 1 FROM public.user_login_identifiers i
    WHERE i.user_id<>p_app_user_id
      AND lower(i.identifier_value)=v_target
  ) THEN
    RAISE EXCEPTION 'Auth identity mismatch or login/email collision'
      USING ERRCODE='23505';
  END IF;
  SELECT i.id,i.identifier_value INTO v_identifier,v_identifier_email
  FROM public.user_login_identifiers i
  WHERE i.user_id=p_app_user_id AND i.identifier_type='EMAIL';
  IF v_identifier IS NULL OR
     (SELECT count(*) FROM public.user_login_identifiers
      WHERE user_id=p_app_user_id AND identifier_type='EMAIL')<>1 OR
     lower(v_identifier_email)<>lower(v_app.email) THEN
    RAISE EXCEPTION 'Expected one exact existing email login identifier'
      USING ERRCODE='23514';
  END IF;
  IF v_app.email=v_target THEN RETURN true; END IF;
  IF v_app.email !~ '^[a-z0-9][a-z0-9._+-]*@example[.]invalid$' THEN
    RAISE EXCEPTION 'Unexpected email migration source: manual review required'
      USING ERRCODE='23514';
  END IF;

  PERFORM set_config('plp.project_auth_mutation','email',true);
  UPDATE public.app_users SET email=v_target WHERE id=p_app_user_id;
  UPDATE public.user_login_identifiers SET identifier_value=v_target
    WHERE id=v_identifier;
  IF (SELECT email FROM public.app_users WHERE id=p_app_user_id)<>v_target
     OR (SELECT identifier_value FROM public.user_login_identifiers
         WHERE id=v_identifier)<>v_target THEN
    RAISE EXCEPTION 'Email identity synchronization failed'
      USING ERRCODE='23514';
  END IF;
  RETURN true;
END
$fn$;
REVOKE ALL ON FUNCTION public.project_auth_set_student_login_email_v1(uuid,uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.project_auth_set_student_login_email_v1(uuid,uuid,text)
  TO service_role;

CREATE FUNCTION public.project_auth_email_update_readiness_v1()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $ready$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     OR (SELECT count(*) FROM public.project_auth_student_links)<>600
     OR (SELECT count(*) FROM public.project_auth_student_links l
         JOIN public.app_users u ON u.id=l.app_user_id
         JOIN auth.users a ON a.id=l.auth_user_id
         WHERE u.account_kind='PROJECT_ONLY'
           AND u.role_code='student'
           AND l.state IN ('ACTIVE','LINKED')
           AND u.auth_user_id=a.id
           AND a.raw_app_meta_data->>'source_key'=l.source_key)<>600 THEN
    RAISE EXCEPTION 'Not eligible for controlled project email migration'
      USING ERRCODE='42501';
  END IF;
  RETURN true;
END
$ready$;
REVOKE ALL ON FUNCTION public.project_auth_email_update_readiness_v1()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.project_auth_email_update_readiness_v1()
  TO service_role;
COMMIT;

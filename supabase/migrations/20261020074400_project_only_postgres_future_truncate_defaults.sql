-- NONDEPLOYED, PROJECT-CREATOR-SCOPED DEFAULT ACL HARDENING.
-- DRAFT ONLY: needs separate prime approval and platform review before use.
-- In migration order AFTER 74000, 74100, 74200 and 74300.
--
-- This migration modifies only default table privileges for the actual PLP
-- table creator, postgres. The approved standalone Step 1 repair may already
-- have revoked its client bits:
-- accept only the exactly reviewed original pair OR an entirely removed pair.
--
-- No Auth accounts, student records, existing table privileges, owner roles,
-- policies, default ACLs for other owners or service_role grants are changed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

DO $preflight$
DECLARE
  v_owner_anon_count integer;
  v_owner_authenticated_count integer;
  v_owner_service_count integer;
  v_unexpected integer;
BEGIN
  IF current_user IS DISTINCT FROM 'postgres'
     OR session_user IS DISTINCT FROM 'postgres'
     OR (SELECT rolsuper FROM pg_roles WHERE rolname='postgres') IS DISTINCT FROM false THEN
    RAISE EXCEPTION '74400 requires the reviewed non-superuser postgres owner'
      USING ERRCODE='42501';
  END IF;
  IF to_regprocedure('public.project_auth_phase9_default_acl_activation_guard()') IS NULL
     OR to_regprocedure('public.project_auth_is_project_student_v1(uuid)') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger t
       WHERE t.tgrelid='public.project_auth_student_links'::regclass
         AND t.tgname='project_auth_phase9_default_acl_activation_guard'
         AND t.tgenabled IN ('O','A')
     ) THEN
    RAISE EXCEPTION '74400 requires deployed reviewed 74000–74300 and enabled activation guard'
      USING ERRCODE='23514';
  END IF;

  SELECT count(*) FILTER(WHERE x.grantee='anon'::regrole),
         count(*) FILTER(WHERE x.grantee='authenticated'::regrole),
         count(*) FILTER(WHERE x.grantee='service_role'::regrole)
    INTO v_owner_anon_count,v_owner_authenticated_count,v_owner_service_count
  FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) x
  WHERE n.nspname='public' AND d.defaclobjtype='r'
    AND d.defaclrole='postgres'::regrole
    AND x.privilege_type='TRUNCATE';
  SELECT count(*) INTO v_unexpected
  FROM pg_default_acl d
  LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) x
  WHERE d.defaclobjtype='r'
    AND d.defaclrole='postgres'::regrole
    AND (d.defaclnamespace=0 OR n.nspname='public')
    AND x.privilege_type='TRUNCATE'
    AND x.grantee IN (0,'anon'::regrole,'authenticated'::regrole)
    AND (d.defaclnamespace=0 OR x.grantee=0
      OR x.grantor<>d.defaclrole OR x.is_grantable);

  IF v_owner_anon_count NOT IN (0,1)
     OR v_owner_anon_count<>v_owner_authenticated_count
     OR v_owner_service_count<>1
     OR v_unexpected<>0 THEN
    RAISE EXCEPTION '74400 project creator default ACL drift: anon/auth/service=%/%/%, unreviewed=%; stop before change',
      v_owner_anon_count,v_owner_authenticated_count,v_owner_service_count,
      v_unexpected
      USING ERRCODE='23514';
  END IF;
END
$preflight$;

-- PostgreSQL 17 allows modifying the actual creator's future privileges.
-- This removes only two client TRUNCATE bits in postgres/public TABLE defaults.
-- Keep every other grant (including service_role) unchanged.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM anon, authenticated;

DO $postflight$
DECLARE v_remaining integer; v_service integer;
BEGIN
  SELECT count(*) INTO v_remaining
  FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) x
  WHERE n.nspname='public' AND d.defaclobjtype='r'
    AND d.defaclrole='postgres'::regrole
    AND x.privilege_type='TRUNCATE'
    AND x.grantee IN (0,'anon'::regrole,'authenticated'::regrole);
  SELECT count(*) INTO v_service
  FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) x
  WHERE n.nspname='public' AND d.defaclobjtype='r'
    AND d.defaclrole='postgres'::regrole
    AND x.privilege_type='TRUNCATE'
    AND x.grantee='service_role'::regrole;
  IF v_remaining<>0 OR v_service<>1 THEN
    RAISE EXCEPTION '74400 postflight: unexpected project creator defaults clients=%, service_role=%',
       v_remaining,v_service
       USING ERRCODE='23514';
  END IF;
  RAISE NOTICE '74400 project creator future-table client grants verified; other authentication and academic readiness checks still apply.';
END
$postflight$;
COMMIT;

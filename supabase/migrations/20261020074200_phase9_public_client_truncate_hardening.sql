-- NONDEPLOYED PHASE 9: remove effective client TRUNCATE from ALL existing
-- public base/partitioned tables without changing CRUD, RLS or service/admin
-- privileges. NOT approved for live application by this worker.
--
-- Exact guarded baseline: 64 public tables independently inspected on
-- 2026-10-20, PLUS the two empty PROJECT_ONLY tables in migration 074000.
-- Accept either the original 42-authenticated/1-anon residual grants after
-- 74000, OR all current tables already hardened by approved Step 1. The
-- complete 66-table name fingerprint and independent owner/RLS/ACL checks
-- must pass in BOTH cases. Never accept a partly changed privileges state.
--
-- The release checks apply to existing public table privileges and default
-- privileges of the reviewed postgres creator of PLP application objects.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

DO $preflight$
DECLARE
  v_total bigint;
  v_auth_count bigint;
  v_anon_count bigint;
  v_expected_auth_md5 text;
  v_anon_name text;
  v_rec record;
  v_name_md5 text;
  v_postgres_anon_defaults bigint;
  v_postgres_authenticated_defaults bigint;
  v_postgres_service_defaults bigint;
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'Phase9 expected migration role postgres, observed %', current_user
      USING ERRCODE='42501';
  END IF;
  IF to_regclass('public.project_auth_cohort_control') IS NULL
     OR to_regclass('public.project_auth_student_links') IS NULL
     OR to_regprocedure('public.project_auth_readiness_v1()') IS NULL
     OR to_regprocedure('public.stage_student_v1(jsonb)') IS NULL
     OR to_regprocedure('public.link_student_v1(jsonb)') IS NULL
     OR to_regprocedure('public.activate_student_v1(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Phase9 requires both previous, reviewed PROJECT_ONLY migrations'
      USING ERRCODE='23514';
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE has_table_privilege('authenticated',c.oid,'TRUNCATE')),
         count(*) FILTER (WHERE has_table_privilege('anon',c.oid,'TRUNCATE')),
         md5(string_agg(c.relname,',' ORDER BY c.relname)
           FILTER (WHERE has_table_privilege('authenticated',c.oid,'TRUNCATE'))),
         min(c.relname) FILTER (WHERE has_table_privilege('anon',c.oid,'TRUNCATE')),
         md5(string_agg(c.relname,',' ORDER BY c.relname))
    INTO v_total,v_auth_count,v_anon_count,v_expected_auth_md5,v_anon_name,v_name_md5
  FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
  WHERE ns.nspname='public' AND c.relkind IN ('r','p');

  IF v_total<>66
     OR v_name_md5 IS DISTINCT FROM
          '8fdc6d5d8d06f260ee613ae0132fba5e'
     OR NOT (
       (v_auth_count=42 AND v_anon_count=1
        AND v_anon_name IS NOT DISTINCT FROM 'user_preferences'
        AND v_expected_auth_md5 IS NOT DISTINCT FROM
             '397c0c659845f3e77291db6c2de38853')
       OR (v_auth_count=0 AND v_anon_count=0)
     ) THEN
    RAISE EXCEPTION 'Phase9 public privileges differ from BOTH reviewed legacy and approved all-hardened baselines (tables=%, names_md5=%, authenticated=%, anon=%, auth_md5=%); NO CHANGES',
      v_total,v_name_md5,v_auth_count,v_anon_count,v_expected_auth_md5
      USING ERRCODE='23514';
  END IF;

  -- All base tables were individually postgres-owned, had RLS enabled and
  -- still allowed service_role TRUNCATE. Fail if the owner, role hierarchy,
  -- direct ACL, or any hidden PUBLIC client grant has drifted.
  IF EXISTS (
    SELECT 1 FROM pg_auth_members am
    WHERE am.member IN ('anon'::regrole,'authenticated'::regrole)
  ) THEN
    RAISE EXCEPTION 'Unexpected client role inheritance; effective REVOKE assumptions invalid'
      USING ERRCODE='23514';
  END IF;
  FOR v_rec IN
    SELECT c.oid,c.relname,c.relacl,c.relrowsecurity,
           pg_get_userbyid(c.relowner) AS owner_name
    FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
    WHERE ns.nspname='public' AND c.relkind IN ('r','p')
  LOOP
    IF v_rec.owner_name<>'postgres' OR NOT v_rec.relrowsecurity
       OR NOT has_table_privilege('service_role',v_rec.oid,'TRUNCATE')
       OR NOT has_table_privilege('postgres',v_rec.oid,'TRUNCATE')
       OR EXISTS (
          SELECT 1 FROM aclexplode(v_rec.relacl) x
          WHERE x.privilege_type='TRUNCATE'
            AND (x.grantee=0 OR x.is_grantable)
       )
       OR EXISTS (
          SELECT 1 FROM aclexplode(v_rec.relacl) x
          WHERE x.privilege_type='TRUNCATE'
            AND x.grantee IN ('anon'::regrole,'authenticated'::regrole)
            AND x.grantor<>'postgres'::regrole
       )
       OR has_table_privilege('authenticated',v_rec.oid,'TRUNCATE')
            IS DISTINCT FROM EXISTS (
              SELECT 1 FROM aclexplode(v_rec.relacl) x
              WHERE x.privilege_type='TRUNCATE'
                AND x.grantee='authenticated'::regrole
            )
       OR has_table_privilege('anon',v_rec.oid,'TRUNCATE')
            IS DISTINCT FROM EXISTS (
              SELECT 1 FROM aclexplode(v_rec.relacl) x
              WHERE x.privilege_type='TRUNCATE'
                AND x.grantee='anon'::regrole
            ) THEN
      RAISE EXCEPTION 'Phase9 ACL/owner/RLS mismatch on public.% (NO CHANGES)',
        v_rec.relname USING ERRCODE='23514';
    END IF;
  END LOOP;

  -- Only defaults for the actual PLP table creator are in release scope.
  -- The approved Step 1 repair may already have revoked its client pair.
  SELECT
    count(*) FILTER (WHERE x.grantee='anon'::regrole),
    count(*) FILTER (WHERE x.grantee='authenticated'::regrole),
    count(*) FILTER (WHERE x.grantee='service_role'::regrole)
  INTO v_postgres_anon_defaults,v_postgres_authenticated_defaults,
       v_postgres_service_defaults
  FROM pg_default_acl d JOIN pg_namespace ns ON ns.oid=d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) x
  WHERE ns.nspname='public' AND d.defaclobjtype='r'
    AND d.defaclrole='postgres'::regrole
    AND x.privilege_type='TRUNCATE'
    AND x.grantee IN ('anon'::regrole,'authenticated'::regrole,
                     'service_role'::regrole);
  IF v_postgres_anon_defaults NOT IN (0,1)
     OR v_postgres_anon_defaults<>v_postgres_authenticated_defaults
     OR v_postgres_service_defaults<>1
     OR EXISTS (
       SELECT 1 FROM pg_default_acl d
       LEFT JOIN pg_namespace ns ON ns.oid=d.defaclnamespace
       CROSS JOIN LATERAL aclexplode(d.defaclacl) x
       WHERE d.defaclobjtype='r'
         AND d.defaclrole='postgres'::regrole
         AND (d.defaclnamespace=0 OR ns.nspname='public')
         AND x.privilege_type='TRUNCATE'
         AND x.grantee IN (0,'anon'::regrole,'authenticated'::regrole)
         AND (d.defaclnamespace=0 OR x.grantee=0
              OR x.grantor<>d.defaclrole OR x.is_grantable)
     ) THEN
    RAISE EXCEPTION 'Phase9 application creator default privileges differ from reviewed state'
      USING ERRCODE='23514';
  END IF;
END
$preflight$;

-- Precisely one existing-table privilege only; no GRANT, TRUNCATE command,
-- DELETE, RLS policy, DEFAULT ACL, sequence, owner or service_role change.
-- Explicitly iterate public base tables (not views/foreign tables) because
-- TRUNCATE is not a meaningful VIEW privilege. This also covers the 13
-- existing tables that already had no client TRUNCATE to begin with.
DO $harden_current_tables$
DECLARE v_table record;
BEGIN
  FOR v_table IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
    WHERE ns.nspname='public' AND c.relkind IN ('r','p')
    ORDER BY c.relname
  LOOP
    EXECUTE format('REVOKE TRUNCATE ON TABLE public.%I FROM anon, authenticated',
                   v_table.relname);
  END LOOP;
END
$harden_current_tables$;

DO $postflight$
DECLARE
  v_rec record;
  v_remaining bigint;
BEGIN
  SELECT count(*) INTO v_remaining
  FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
  WHERE ns.nspname='public' AND c.relkind IN ('r','p')
    AND (has_table_privilege('anon',c.oid,'TRUNCATE')
      OR has_table_privilege('authenticated',c.oid,'TRUNCATE'));
  IF v_remaining<>0 THEN
    RAISE EXCEPTION 'Phase9 failed: % public tables retain client TRUNCATE',
      v_remaining USING ERRCODE='23514';
  END IF;
  FOR v_rec IN
    SELECT c.oid,c.relname,c.relrowsecurity
    FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
    WHERE ns.nspname='public' AND c.relkind IN ('r','p')
  LOOP
    IF NOT v_rec.relrowsecurity
       OR NOT has_table_privilege('service_role',v_rec.oid,'TRUNCATE')
       OR NOT has_table_privilege('postgres',v_rec.oid,'TRUNCATE') THEN
      RAISE EXCEPTION 'Phase9 server/admin access or RLS unexpectedly changed: %',
        v_rec.relname USING ERRCODE='23514';
    END IF;
  END LOOP;
  RAISE NOTICE 'Phase9 current-table hardening complete; activation checks current table grants and project creator privileges.';
END
$postflight$;

-- Guard PROJECT_ONLY activation against unsafe actual public table grants,
-- unsafe defaults for the postgres creator of PLP tables, and role inheritance.
-- Leave other owners' unrelated default privilege configuration out of scope.
CREATE FUNCTION public.project_auth_phase9_default_acl_activation_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $guard$
BEGIN
  IF TG_OP='UPDATE' AND NEW.state='ACTIVE'
      AND OLD.state IS DISTINCT FROM 'ACTIVE' THEN
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
      WHERE ns.nspname='public' AND c.relkind IN ('r','p')
        AND (has_table_privilege('anon',c.oid,'TRUNCATE')
          OR has_table_privilege('authenticated',c.oid,'TRUNCATE'))
    ) OR EXISTS (
      SELECT 1 FROM pg_default_acl d
      LEFT JOIN pg_namespace ns ON ns.oid=d.defaclnamespace
      CROSS JOIN LATERAL aclexplode(d.defaclacl) x
      WHERE d.defaclobjtype='r'
        AND d.defaclrole='postgres'::regrole
        AND (d.defaclnamespace=0 OR ns.nspname='public')
        AND x.privilege_type='TRUNCATE'
        AND x.grantee IN (0,'anon'::regrole,'authenticated'::regrole)
    ) OR EXISTS (
      SELECT 1 FROM pg_auth_members am
      WHERE am.member IN ('anon'::regrole,'authenticated'::regrole)
    ) THEN
      RAISE EXCEPTION 'PROJECT_ONLY activation blocked: current public or project-creator permissions are unsafe'
        USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END
$guard$;
REVOKE ALL ON FUNCTION public.project_auth_phase9_default_acl_activation_guard()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER project_auth_phase9_default_acl_activation_guard
  BEFORE UPDATE OF state ON public.project_auth_student_links
  FOR EACH ROW EXECUTE FUNCTION
    public.project_auth_phase9_default_acl_activation_guard();
COMMIT;

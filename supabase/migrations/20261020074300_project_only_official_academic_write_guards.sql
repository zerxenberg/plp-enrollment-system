-- NONDEPLOYED, NOT AUTHORIZED FOR LIVE EXECUTION.
-- PROJECT_ONLY academic-write containment after guarded migrations
-- 20261020074000, 74100 and 74200.
-- Never invent admission, eligibility, grades or institutional verification
-- for the 600 fictional project logins. Preserve all 2,128 original synthetic
-- planning students and all existing legitimate academic records.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

DO $preflight$
DECLARE
  v_table text;
  v_id_type text;
  v_ref record;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'PROJECT_ONLY 74300 needs reviewed postgres migration owner'
      USING ERRCODE='42501';
  END IF;
  IF to_regclass('public.project_auth_student_links') IS NULL
     OR to_regclass('public.project_auth_cohort_control') IS NULL
     OR to_regprocedure('public.project_auth_eligible_v1(uuid)') IS NULL
     OR to_regprocedure('public.activate_student_v1(jsonb)') IS NULL
     OR to_regprocedure('public.project_auth_phase9_default_acl_activation_guard()') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgrelid='public.project_auth_student_links'::regclass
         AND tgname='project_auth_phase9_default_acl_activation_guard'
         AND tgenabled IN ('O','A')
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgrelid='public.enrollments'::regclass
         AND tgname='reject_synthetic_official_enrollment'
         AND tgenabled IN ('O','A')
     ) THEN
    RAISE EXCEPTION 'PROJECT_ONLY 74300 requires reviewed 740/741/742 and enabled original enrollment guard'
      USING ERRCODE='23514';
  END IF;
  IF to_regprocedure('public.project_auth_is_project_student_v1(uuid)') IS NOT NULL
     OR to_regprocedure('public.project_auth_is_project_app_v1(uuid)') IS NOT NULL
     OR to_regprocedure('public.project_auth_reject_official_child_write_v1()') IS NOT NULL
     OR to_regprocedure('public.project_auth_protect_student_profile_v1()') IS NOT NULL THEN
    RAISE EXCEPTION 'PROJECT_ONLY 74300 function already exists; refuse replacing unknown code';
  END IF;

  -- Check types and physical-column presence, including the additive
  -- PROJECT_ONLY classification from migration 740; never assume a column
  -- exists because a migration filename was found.
  FOR v_ref IN
    SELECT * FROM (VALUES
      ('public.app_users','id','uuid'),
      ('public.app_users','account_kind','text'),
      ('public.app_users','project_cohort_id','text'),
      ('public.app_users','source_account_key','text'),
      ('public.app_users','institutional_verified_at','timestamp with time zone'),
      ('public.student_profiles','id','uuid'),
      ('public.student_profiles','user_id','uuid'),
      ('public.student_profiles','student_number','text'),
      ('public.student_profiles','is_synthetic_demo','boolean'),
      ('public.student_profiles','record_kind','text'),
      ('public.student_profiles','project_cohort_id','text'),
      ('public.student_profiles','synthetic_source_key','text'),
      ('public.student_profiles','synthetic_source_attributes','jsonb'),
      ('public.student_profiles','institutional_verified_at','timestamp with time zone'),
      ('public.student_profiles','student_status','text'),
      ('public.academic_results','student_id','uuid'),
      ('public.admission_handoffs','student_id','uuid'),
      ('public.student_subject_eligibility','student_id','uuid'),
      ('public.grade_import_rows','student_id','uuid'),
      ('public.grade_import_rows','source_student_number','text'),
      ('public.grade_import_rows','enrollment_id','uuid'),
      ('public.grade_import_rows','published_result_id','uuid')
    ) AS v(relation_name,column_name,type_name)
  LOOP
    IF to_regclass(v_ref.relation_name) IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM pg_attribute a
         WHERE a.attrelid=v_ref.relation_name::regclass
           AND a.attname=v_ref.column_name
           AND a.attnum>0 AND NOT a.attisdropped
           AND format_type(a.atttypid,a.atttypmod)=v_ref.type_name
       ) THEN
      RAISE EXCEPTION 'PROJECT_ONLY 74300 unexpected/missing column %.% expected %',
        v_ref.relation_name,v_ref.column_name,v_ref.type_name
        USING ERRCODE='23514';
    END IF;
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY[
    'academic_results','admission_handoffs','student_subject_eligibility',
    'grade_import_rows','student_profiles'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
      WHERE ns.nspname='public' AND c.relname=v_table
        AND c.relkind='r' AND c.relrowsecurity
        AND pg_get_userbyid(c.relowner)='postgres'
    ) THEN
      RAISE EXCEPTION 'PROJECT_ONLY 74300 table ownership/RLS drift: %',v_table
        USING ERRCODE='23514';
    END IF;
  END LOOP;

  -- Do not mask an unexpected pre-existing trigger with CREATE OR REPLACE.
  IF EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace ns ON ns.oid=c.relnamespace
    WHERE ns.nspname='public' AND
     (t.tgname='project_auth_deny_official_child_v1'
       OR t.tgname='project_auth_immutable_profile_v1')
  ) THEN
    RAISE EXCEPTION 'PROJECT_ONLY 74300 trigger-name collision';
  END IF;
END
$preflight$;

-- PostgreSQL SECURITY DEFINER is necessary only for fixed trusted catalog
-- checks from privileged trigger paths. Never derive project identity from a
-- client-controlled JWT/user_metadata or bare @example.invalid suffix.
-- Positive immutable project classification tolerates a single broken marker:
-- linked membership, app or profile PROJECT_ONLY kind, canonical cohort,
-- OR canonical project source key all independently identify project-only.
CREATE FUNCTION public.project_auth_is_project_app_v1(p_app_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users u
    WHERE u.id=p_app_id
      AND (
        u.account_kind='PROJECT_ONLY'
        OR u.project_cohort_id='PLP_PROJECT_600_2026_1'
        OR u.source_account_key LIKE 'PROJECT_ONLY:TERM-2026-1:%'
        OR EXISTS (
           SELECT 1 FROM public.project_auth_student_links l
           WHERE l.app_user_id=u.id
        )
      )
  )
$fn$;

CREATE FUNCTION public.project_auth_is_project_student_v1(p_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.student_profiles s
    LEFT JOIN public.app_users u ON u.id=s.user_id
    WHERE s.id=p_student_id
      AND (
        s.record_kind='PROJECT_ONLY'
        OR s.project_cohort_id='PLP_PROJECT_600_2026_1'
        OR s.synthetic_source_key LIKE 'PROJECT_ONLY:TERM-2026-1:%'
        OR u.account_kind='PROJECT_ONLY'
        OR u.project_cohort_id='PLP_PROJECT_600_2026_1'
        OR u.source_account_key LIKE 'PROJECT_ONLY:TERM-2026-1:%'
        OR EXISTS (
           SELECT 1 FROM public.project_auth_student_links l
           WHERE l.student_id=s.id OR l.app_user_id=s.user_id
        )
      )
  )
$fn$;
REVOKE ALL ON FUNCTION public.project_auth_is_project_app_v1(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.project_auth_is_project_student_v1(uuid)
  FROM PUBLIC, anon, authenticated;

-- Guard direct official grade, admission and eligibility writers on INSERT
-- and *every* UPDATE (not only UPDATE OF student_id). Privileged service-role
-- / SECURITY DEFINER code still passes through this physical row trigger.
-- The registrar may still write ordinary student rows; planning-only legacy
-- SYNTHETIC_PLANNING profiles are deliberately outside this NEW predicate.
-- grade_import_rows.student_id may be NULL: prevent unresolved project grade
-- staging by matching the canonical source_student_number as well. Also cover
-- nullable enrollment_id and published_result_id pointing to a project row.
CREATE FUNCTION public.project_auth_reject_official_child_write_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $guard$
DECLARE
  v_project boolean := false;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public'
     OR TG_TABLE_NAME NOT IN (
       'academic_results','admission_handoffs','student_subject_eligibility',
       'grade_import_rows'
     ) OR TG_OP NOT IN ('INSERT','UPDATE') THEN
    RAISE EXCEPTION 'PROJECT_ONLY guard installed on unexpected event'
      USING ERRCODE='23514';
  END IF;

  v_project := public.project_auth_is_project_student_v1(NEW.student_id);
  IF TG_OP='UPDATE' AND NOT v_project THEN
    v_project := public.project_auth_is_project_student_v1(OLD.student_id);
  END IF;
  IF TG_TABLE_NAME='grade_import_rows' AND NOT v_project THEN
    -- A NULL student_id is NOT a bypass. The source number is required by
    -- this table and compared against the immutable student number.
    v_project := EXISTS (
      SELECT 1 FROM public.student_profiles s
      WHERE upper(btrim(s.student_number)) =
            upper(btrim(NEW.source_student_number))
        AND public.project_auth_is_project_student_v1(s.id)
    );
    IF TG_OP='UPDATE' AND NOT v_project THEN
      v_project := EXISTS (
        SELECT 1 FROM public.student_profiles s
        WHERE upper(btrim(s.student_number)) =
              upper(btrim(OLD.source_student_number))
          AND public.project_auth_is_project_student_v1(s.id)
      );
    END IF;
    IF NOT v_project AND NEW.enrollment_id IS NOT NULL THEN
      v_project := EXISTS (
        SELECT 1 FROM public.enrollments e
        WHERE e.id=NEW.enrollment_id
          AND public.project_auth_is_project_student_v1(e.student_id)
      );
    END IF;
    IF NOT v_project AND NEW.published_result_id IS NOT NULL THEN
      v_project := EXISTS (
        SELECT 1 FROM public.academic_results ar
        WHERE ar.id=NEW.published_result_id
          AND public.project_auth_is_project_student_v1(ar.student_id)
      );
    END IF;
    IF TG_OP='UPDATE' AND NOT v_project
       AND OLD.enrollment_id IS NOT NULL THEN
      v_project := EXISTS (
        SELECT 1 FROM public.enrollments e
        WHERE e.id=OLD.enrollment_id
          AND public.project_auth_is_project_student_v1(e.student_id)
      );
    END IF;
    IF TG_OP='UPDATE' AND NOT v_project
       AND OLD.published_result_id IS NOT NULL THEN
      v_project := EXISTS (
        SELECT 1 FROM public.academic_results ar
        WHERE ar.id=OLD.published_result_id
          AND public.project_auth_is_project_student_v1(ar.student_id)
      );
    END IF;
  END IF;
  IF v_project THEN
    RAISE EXCEPTION 'PROJECT_ONLY fictional students cannot be written into authoritative academic results, admission, eligibility or grade imports'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$guard$;
REVOKE ALL ON FUNCTION public.project_auth_reject_official_child_write_v1()
  FROM PUBLIC, anon, authenticated;

-- Fail closed on pre-existing project-linked authoritative rows: this
-- migration may install safeguards, but must not silently legitimize data
-- written outside the approved source workflow. No records are deleted.
DO $no_existing_project_official_rows$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.academic_results ar
    WHERE public.project_auth_is_project_student_v1(ar.student_id)
  ) OR EXISTS (
    SELECT 1 FROM public.admission_handoffs ah
    WHERE public.project_auth_is_project_student_v1(ah.student_id)
  ) OR EXISTS (
    SELECT 1 FROM public.student_subject_eligibility e
    WHERE public.project_auth_is_project_student_v1(e.student_id)
  ) OR EXISTS (
    SELECT 1 FROM public.grade_import_rows gir
    WHERE public.project_auth_is_project_student_v1(gir.student_id)
       OR EXISTS (
         SELECT 1 FROM public.student_profiles s
         WHERE upper(btrim(s.student_number)) =
               upper(btrim(gir.source_student_number))
           AND public.project_auth_is_project_student_v1(s.id)
       )
       OR EXISTS (
         SELECT 1 FROM public.enrollments en
         WHERE en.id=gir.enrollment_id
           AND public.project_auth_is_project_student_v1(en.student_id)
       )
       OR EXISTS (
         SELECT 1 FROM public.academic_results ar
         WHERE ar.id=gir.published_result_id
           AND public.project_auth_is_project_student_v1(ar.student_id)
       )
  ) THEN
    RAISE EXCEPTION 'Pre-existing PROJECT_ONLY official academic records require independent remediation; stop'
      USING ERRCODE='23514';
  END IF;
END
$no_existing_project_official_rows$;

CREATE TRIGGER project_auth_deny_official_child_v1
  BEFORE INSERT OR UPDATE ON public.academic_results
  FOR EACH ROW EXECUTE FUNCTION public.project_auth_reject_official_child_write_v1();
CREATE TRIGGER project_auth_deny_official_child_v1
  BEFORE INSERT OR UPDATE ON public.admission_handoffs
  FOR EACH ROW EXECUTE FUNCTION public.project_auth_reject_official_child_write_v1();
CREATE TRIGGER project_auth_deny_official_child_v1
  BEFORE INSERT OR UPDATE ON public.student_subject_eligibility
  FOR EACH ROW EXECUTE FUNCTION public.project_auth_reject_official_child_write_v1();
CREATE TRIGGER project_auth_deny_official_child_v1
  BEFORE INSERT OR UPDATE ON public.grade_import_rows
  FOR EACH ROW EXECUTE FUNCTION public.project_auth_reject_official_child_write_v1();

-- Project profile creation is allowed ONLY by a trusted staging service
-- using a matching already-created app_users PROJECT_ONLY identity. Once
-- present, the entire fictional profile is immutable: changing any field,
-- including hidden metadata/status, cannot turn a project fixture into an
-- apparently official university identity. Ordinary/legacy student UPDATEs
-- proceed unchanged through their existing profile triggers.
CREATE FUNCTION public.project_auth_protect_student_profile_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $guard$
DECLARE
  v_old_project boolean := false;
  v_new_project boolean := false;
  v_app public.app_users%ROWTYPE;
BEGIN
  IF TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME<>'student_profiles' THEN
    RAISE EXCEPTION 'PROJECT_ONLY profile guard installed on wrong table'
      USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN
    IF public.project_auth_is_project_student_v1(OLD.id)
       OR OLD.record_kind='PROJECT_ONLY'
       OR OLD.project_cohort_id='PLP_PROJECT_600_2026_1'
       OR OLD.synthetic_source_key LIKE 'PROJECT_ONLY:TERM-2026-1:%' THEN
      RAISE EXCEPTION 'PROJECT_ONLY profile deletion needs separate reviewed cleanup authorization'
        USING ERRCODE='23514';
    END IF;
    RETURN OLD;
  END IF;
  v_new_project := coalesce(
       NEW.record_kind='PROJECT_ONLY'
       OR NEW.project_cohort_id='PLP_PROJECT_600_2026_1'
       OR NEW.synthetic_source_key LIKE 'PROJECT_ONLY:TERM-2026-1:%'
       OR public.project_auth_is_project_app_v1(NEW.user_id),
       false);
  IF TG_OP='UPDATE' THEN
    v_old_project := coalesce(
         OLD.record_kind='PROJECT_ONLY'
         OR OLD.project_cohort_id='PLP_PROJECT_600_2026_1'
         OR OLD.synthetic_source_key LIKE 'PROJECT_ONLY:TERM-2026-1:%'
         OR public.project_auth_is_project_student_v1(OLD.id),
         false);
    IF v_old_project OR v_new_project THEN
      RAISE EXCEPTION 'PROJECT_ONLY profile is immutable; cannot promote or rewrite fictional provenance'
        USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'PROJECT_ONLY profile guard unexpected operation'
      USING ERRCODE='23514';
  END IF;
  IF NOT v_new_project THEN RETURN NEW; END IF;

  -- The service_role claim is verified at the protected staging RPC layer;
  -- no direct authenticated client can forge institution-verified identities.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'PROJECT_ONLY profile creation requires trusted service'
      USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_app FROM public.app_users WHERE id=NEW.user_id;
  IF NOT FOUND
     OR NEW.record_kind IS DISTINCT FROM 'PROJECT_ONLY'
     OR NEW.project_cohort_id IS DISTINCT FROM 'PLP_PROJECT_600_2026_1'
     OR NEW.is_synthetic_demo IS DISTINCT FROM true
     OR NEW.institutional_verified_at IS NOT NULL
     OR NEW.student_status IS NOT NULL
     OR NEW.synthetic_source_key IS DISTINCT FROM v_app.source_account_key
     OR NEW.synthetic_source_key NOT LIKE 'PROJECT_ONLY:TERM-2026-1:%'
     OR v_app.account_kind IS DISTINCT FROM 'PROJECT_ONLY'
     OR v_app.project_cohort_id IS DISTINCT FROM 'PLP_PROJECT_600_2026_1'
     OR v_app.role_code IS DISTINCT FROM 'student'
     OR v_app.is_synthetic_demo IS DISTINCT FROM true
     OR v_app.institutional_verified_at IS NOT NULL
     OR v_app.auth_user_id IS NOT NULL
     OR v_app.account_status IS DISTINCT FROM 'Inactive'
     OR v_app.login_enabled IS DISTINCT FROM false
     OR coalesce(NEW.synthetic_source_attributes->>'data_origin','')
        <> 'GENERATED_PROJECT'
     OR coalesce(NEW.synthetic_source_attributes->>'purpose','')
        <> 'PROJECT_ONLY' THEN
    RAISE EXCEPTION 'Malformed or unapproved PROJECT_ONLY fictional profile'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$guard$;
REVOKE ALL ON FUNCTION public.project_auth_protect_student_profile_v1()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER project_auth_immutable_profile_v1
  BEFORE INSERT OR UPDATE OR DELETE ON public.student_profiles
  FOR EACH ROW EXECUTE FUNCTION public.project_auth_protect_student_profile_v1();

-- Final stop checks. Neither the original synthetic enrollment guard nor
-- any existing legitimate student trigger/policy is modified by this draft.
DO $postflight$
DECLARE v_name text; v_count integer;
BEGIN
  FOR v_name IN SELECT unnest(ARRAY[
      'academic_results','admission_handoffs','student_subject_eligibility',
      'grade_import_rows'
    ])
  LOOP
    SELECT count(*) INTO v_count FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace ns ON ns.oid=c.relnamespace
      WHERE ns.nspname='public' AND c.relname=v_name
        AND t.tgname='project_auth_deny_official_child_v1'
        AND t.tgenabled IN ('O','A') AND NOT t.tgisinternal;
    IF v_count<>1 THEN
      RAISE EXCEPTION 'PROJECT_ONLY official writer trigger missing on %',v_name;
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.student_profiles'::regclass
      AND tgname='project_auth_immutable_profile_v1'
      AND tgenabled IN ('O','A') AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.enrollments'::regclass
      AND tgname='reject_synthetic_official_enrollment'
      AND tgenabled IN ('O','A') AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'PROJECT_ONLY profile or original enrollment guard disabled';
  END IF;
END
$postflight$;
COMMIT;

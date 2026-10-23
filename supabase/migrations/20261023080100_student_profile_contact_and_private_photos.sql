-- Student self-service profile: preserve all PROJECT_ONLY identity, academic and
-- institutional guards while permitting only mobile, alternate contact and address.
-- This migration is additive and must be reviewed before deployment.
BEGIN;

DO $preflight$
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'Approved postgres migration actor required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.project_auth_protect_student_profile_v1()'::regprocedure
      AND p.prosecdef AND p.proowner = 'postgres'::regrole
      AND pg_get_functiondef(p.oid) LIKE '%PROJECT_ONLY profile is immutable%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.student_profiles'::regclass
      AND tgname = 'project_auth_immutable_profile_v1' AND tgenabled = 'O'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='student_profiles'
      AND policyname='project_auth_profile_update_deny_v1'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.protect_student_profile_update()'::regprocedure
      AND p.prosecdef AND p.proowner='postgres'::regrole
      AND pg_get_functiondef(p.oid) LIKE '%year_level_number%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid='public.student_profiles'::regclass
      AND t.tgname='trg_protect_student_profile_update' AND t.tgenabled='O'
  ) THEN
    RAISE EXCEPTION 'Expected PROJECT_ONLY profile protections have drifted';
  END IF;
  IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='student-profile-photos') THEN
    RAISE EXCEPTION 'Photo bucket already exists; review its configuration first';
  END IF;
  -- The bucket is served only through authenticated, owner-checked server
  -- actions using privileged Storage. Direct Data API Storage access stays
  -- denied by existing RLS without any permissive object policies.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='storage' AND c.relname='objects' AND c.relrowsecurity
  ) OR EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
  ) THEN
    RAISE EXCEPTION 'Private photo storage requires storage.objects RLS without client policies';
  END IF;
END
$preflight$;

-- Alternate contact is a separate field from emergency contact; neither
-- existing emergency field is repurposed to represent it.
ALTER TABLE public.student_profiles
  ADD COLUMN alternate_contact_number text NULL;
ALTER TABLE public.student_profiles
  ADD CONSTRAINT student_profile_alternate_contact_length
  CHECK (alternate_contact_number IS NULL OR char_length(alternate_contact_number) <= 24);

-- This trigger also protects ordinary Student profile updates. Preserve its
-- existing contact and derived year protections, adding the single new field.
CREATE OR REPLACE FUNCTION public.protect_student_profile_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $guard$
BEGIN
  IF public.current_role_code() = 'student' THEN
    IF (to_jsonb(NEW) - ARRAY[
      'contact_number','address','emergency_contact_name',
      'emergency_contact_number','alternate_contact_number',
      'updated_at','year_level_number'
    ]::text[]) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY[
      'contact_number','address','emergency_contact_name',
      'emergency_contact_number','alternate_contact_number',
      'updated_at','year_level_number'
    ]::text[]) THEN
      RAISE EXCEPTION 'Students may edit only contact and emergency profile fields.'
        USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END
$guard$;
REVOKE ALL ON FUNCTION public.protect_student_profile_update()
  FROM PUBLIC, anon, authenticated;

-- The existing restrictive update policy must allow owner contact edits to
-- reach the guards. Other project accounts still cannot update this profile.
DROP POLICY project_auth_profile_update_deny_v1 ON public.student_profiles;
CREATE POLICY project_auth_profile_update_deny_v1
  ON public.student_profiles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    record_kind IS DISTINCT FROM 'PROJECT_ONLY'
    OR (record_kind = 'PROJECT_ONLY' AND
      user_id = public.current_app_user_id() AND
      public.current_role_code() = 'student' AND
      public.project_auth_can_view_self_v1(user_id)))
  WITH CHECK (
    record_kind IS DISTINCT FROM 'PROJECT_ONLY'
    OR (record_kind = 'PROJECT_ONLY' AND
      user_id = public.current_app_user_id() AND
      public.current_role_code() = 'student' AND
      public.project_auth_can_view_self_v1(user_id)));

-- Keep existing INSERT and DELETE rules exactly as before. UPDATE now has
-- one narrow student-authenticated exception; project provenance remains
-- immutable even for service and staff actors in the normal workflow.
CREATE OR REPLACE FUNCTION public.project_auth_protect_student_profile_v1()
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
      IF NOT (
        v_old_project AND v_new_project AND
        public.current_role_code()='student' AND
        OLD.user_id=public.current_app_user_id() AND
        public.project_auth_can_view_self_v1(OLD.user_id) AND
        (to_jsonb(NEW) - ARRAY[
          'contact_number','address','alternate_contact_number',
          'updated_at','year_level_number'
        ]::text[]) = (to_jsonb(OLD) - ARRAY[
          'contact_number','address','alternate_contact_number',
          'updated_at','year_level_number'
        ]::text[])
      ) THEN
        RAISE EXCEPTION 'PROJECT_ONLY profile identity and academic fields are immutable'
          USING ERRCODE='23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'PROJECT_ONLY profile guard unexpected operation'
      USING ERRCODE='23514';
  END IF;
  IF NOT v_new_project THEN RETURN NEW; END IF;
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
     OR coalesce(NEW.synthetic_source_attributes->>'data_origin','') <> 'GENERATED_PROJECT'
     OR coalesce(NEW.synthetic_source_attributes->>'purpose','') <> 'PROJECT_ONLY' THEN
    RAISE EXCEPTION 'Malformed or unapproved PROJECT_ONLY fictional profile'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$guard$;
REVOKE ALL ON FUNCTION public.project_auth_protect_student_profile_v1()
  FROM PUBLIC, anon, authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('student-profile-photos','student-profile-photos',false,2097152,
        ARRAY['image/jpeg','image/png','image/webp']);

CREATE TABLE public.student_profile_photos (
  student_id uuid PRIMARY KEY REFERENCES public.student_profiles(id) ON DELETE RESTRICT,
  auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  object_path text NOT NULL UNIQUE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_profile_photo_path CHECK (
    object_path ~ ('^' || auth_user_id::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$'))
);
ALTER TABLE public.student_profile_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.student_profile_photos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.student_profile_photos TO authenticated;

-- The session must belong to the linked and approved PROJECT_ONLY student.
CREATE POLICY student_profile_photos_read ON public.student_profile_photos
FOR SELECT TO authenticated USING (
  auth_user_id = (SELECT auth.uid()) AND
  public.current_role_code()='student' AND EXISTS (
    SELECT 1 FROM public.student_profiles s
    WHERE s.id=student_id AND s.user_id=public.current_app_user_id()
      AND s.record_kind='PROJECT_ONLY' AND
      public.project_auth_can_view_self_v1(s.user_id)));
CREATE POLICY student_profile_photos_insert ON public.student_profile_photos
FOR INSERT TO authenticated WITH CHECK (
  auth_user_id = (SELECT auth.uid()) AND
  public.current_role_code()='student' AND EXISTS (
    SELECT 1 FROM public.student_profiles s
    WHERE s.id=student_id AND s.user_id=public.current_app_user_id()
      AND s.record_kind='PROJECT_ONLY' AND
      public.project_auth_can_view_self_v1(s.user_id)));
CREATE POLICY student_profile_photos_update ON public.student_profile_photos
FOR UPDATE TO authenticated USING (
  auth_user_id = (SELECT auth.uid()) AND
  public.current_role_code()='student' AND EXISTS (
    SELECT 1 FROM public.student_profiles s
    WHERE s.id=student_id AND s.user_id=public.current_app_user_id()
      AND s.record_kind='PROJECT_ONLY' AND
      public.project_auth_can_view_self_v1(s.user_id)))
WITH CHECK (
  auth_user_id = (SELECT auth.uid()) AND
  public.current_role_code()='student' AND EXISTS (
    SELECT 1 FROM public.student_profiles s
    WHERE s.id=student_id AND s.user_id=public.current_app_user_id()
      AND s.record_kind='PROJECT_ONLY' AND
      public.project_auth_can_view_self_v1(s.user_id)));
CREATE POLICY student_profile_photos_delete ON public.student_profile_photos
FOR DELETE TO authenticated USING (
  auth_user_id = (SELECT auth.uid()) AND
  public.current_role_code()='student' AND EXISTS (
    SELECT 1 FROM public.student_profiles s
    WHERE s.id=student_id AND s.user_id=public.current_app_user_id()
      AND s.record_kind='PROJECT_ONLY' AND
      public.project_auth_can_view_self_v1(s.user_id)));

-- Do not create policies on storage.objects. Its owner is the Supabase
-- Storage-managed role, not the approved postgres migrator. Browser Storage
-- requests remain denied by existing RLS; server-only Storage is mediated by
-- the validated Auth -> ACTIVE project link -> password-rotation context.

DO $postflight$
BEGIN
  IF (SELECT public FROM storage.buckets WHERE id='student-profile-photos')
    IS DISTINCT FROM false
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
       AND tablename='student_profile_photos' AND policyname='student_profile_photos_read')
     OR NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n
       ON n.oid=c.relnamespace WHERE n.nspname='public'
       AND c.relname='student_profile_photos' AND c.relrowsecurity)
     OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage'
       AND tablename='objects') THEN
    RAISE EXCEPTION 'Private student profile photo policy setup failed';
  END IF;
END
$postflight$;
COMMIT;

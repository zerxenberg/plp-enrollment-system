-- Add only nullable name components. Existing full_name and identity stay unchanged.
-- No existing row UPDATE, login/account promotion, or Auth interaction.
SET lock_timeout = '3s';
DO $guard$
BEGIN
  IF to_regclass('public.app_users') IS NULL THEN
    RAISE EXCEPTION 'Expected app_users not found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='app_users'
      AND column_name IN ('first_name','middle_name','last_name')
  ) THEN
    RAISE EXCEPTION 'Name components already defined: stop and reconcile';
  END IF;
END
$guard$;
ALTER TABLE public.app_users
  ADD COLUMN first_name text,
  ADD COLUMN middle_name text,
  ADD COLUMN last_name text;

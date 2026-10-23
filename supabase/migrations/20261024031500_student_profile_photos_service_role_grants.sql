-- The profile photo metadata table is queried by trusted server-only
-- handlers using the Supabase service_role client. RLS bypass does not grant
-- table privileges, so explicitly grant only the operations those handlers use.
-- Browser access remains governed by the existing authenticated grants and RLS.
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.student_profile_photos
TO service_role;

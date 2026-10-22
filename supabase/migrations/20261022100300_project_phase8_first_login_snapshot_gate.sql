-- Do not expose simulated academic records to a project student until the
-- trusted initial password-change requirement has been completed.
SET lock_timeout='3s';
CREATE OR REPLACE FUNCTION public.project_phase8_student_snapshot_v2(p_student_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_role text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
  RAISE EXCEPTION 'Signed-in academic account required' USING ERRCODE='42501';
 END IF;
 v_role:=public.current_role_code();
 IF v_role='student' AND NOT EXISTS (
  SELECT 1 FROM public.project_auth_student_links l
  JOIN public.student_profiles s ON s.id=l.student_id
  JOIN public.app_users a ON a.id=s.user_id
  WHERE l.student_id=p_student_id AND l.auth_user_id=auth.uid()
   AND a.auth_user_id=auth.uid() AND a.account_status='Active'
   AND a.login_enabled AND l.state='ACTIVE'
   AND l.initial_password_changed_at IS NOT NULL
 ) THEN
  RAISE EXCEPTION 'Complete first login password change before academic access'
    USING ERRCODE='42501';
 END IF;
 RETURN public.project_phase8_student_snapshot_v1(p_student_id);
END $fn$;
REVOKE ALL ON FUNCTION public.project_phase8_student_snapshot_v1(uuid)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.project_phase8_student_snapshot_v2(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.project_phase8_student_snapshot_v2(uuid)
 TO authenticated;

-- Audited grade amendments and independent transfer-credit approval.
-- This migration does not insert or revise an official student record.
SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.registrar_amend_academic_result_v1(
 p_result_id uuid,p_new_status text,p_new_grade numeric,
 p_source_reference text,p_verification_method text,p_reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = '' AS $fn$
DECLARE v_actor uuid; v_prior public.academic_results%ROWTYPE;
 v_revision_number int; v_revision_id uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL
    OR public.current_role_code() IS DISTINCT FROM 'registrar' THEN
  RAISE EXCEPTION 'Registrar authorization required' USING ERRCODE='42501';
 END IF;
 SELECT id INTO STRICT v_actor FROM public.app_users
 WHERE auth_user_id=auth.uid() AND role_code='registrar'
   AND account_status='Active' AND login_enabled;
 IF p_new_status NOT IN ('COMPLETED','FAILED','INCOMPLETE','CREDITED')
    OR p_new_grade < 0 OR btrim(coalesce(p_source_reference,''))=''
    OR btrim(coalesce(p_verification_method,''))=''
    OR btrim(coalesce(p_reason,''))='' THEN
  RAISE EXCEPTION 'Invalid amended grade or missing verified amendment evidence';
 END IF;
 SELECT * INTO STRICT v_prior FROM public.academic_results WHERE id=p_result_id FOR UPDATE;
 IF v_prior.term_id IS NULL
    OR (v_prior.result_status,v_prior.official_grade_value) IS NOT DISTINCT FROM
       (p_new_status,p_new_grade) THEN
  RAISE EXCEPTION 'A traceable material grade correction is required';
 END IF;
 SELECT coalesce(max(revision_number),0)+1 INTO v_revision_number
 FROM public.academic_result_revisions WHERE academic_result_id=p_result_id;
 INSERT INTO public.academic_result_revisions(
   academic_result_id,revision_number,prior_value,revised_value,
   source_record_reference,verification_method,reason,authorized_by
 ) VALUES (
   p_result_id,v_revision_number,
   jsonb_build_object('status',v_prior.result_status,'grade_value',v_prior.official_grade_value),
   jsonb_build_object('status',p_new_status,'grade_value',p_new_grade),
   btrim(p_source_reference),btrim(p_verification_method),btrim(p_reason),v_actor
 ) RETURNING id INTO v_revision_id;
 UPDATE public.academic_results SET result_status=p_new_status,
   official_grade_value=p_new_grade WHERE id=p_result_id;
 RETURN v_revision_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.registrar_record_transfer_evaluation_v1(
 p_student_id uuid,p_curriculum_code text,p_subject_code text,
 p_source_institution text,p_external_subject_reference text,
 p_source_course_name text,p_evidence_reference text,
 p_requested_units numeric
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = '' AS $fn$
DECLARE v_actor uuid; v_evaluation uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL
    OR public.current_role_code() IS DISTINCT FROM 'registrar' THEN
  RAISE EXCEPTION 'Registrar authorization required' USING ERRCODE='42501';
 END IF;
 SELECT id INTO STRICT v_actor FROM public.app_users
 WHERE auth_user_id=auth.uid() AND role_code='registrar'
  AND account_status='Active' AND login_enabled;
 IF NOT EXISTS (SELECT 1 FROM public.student_profiles
   WHERE id=p_student_id AND record_kind IS DISTINCT FROM 'PROJECT_ONLY') THEN
  RAISE EXCEPTION 'Project-only accounts cannot receive verified transfer results';
 END IF;
 INSERT INTO public.transfer_credit_evaluations (
  student_id,target_curriculum_code,target_subject_code,source_institution,
  external_subject_reference,source_course_name,evidence_reference,
  requested_units,recorded_by_user_id
 ) VALUES (
  p_student_id,p_curriculum_code,p_subject_code,btrim(p_source_institution),
  btrim(p_external_subject_reference),nullif(btrim(coalesce(p_source_course_name,'')),''),
  btrim(p_evidence_reference),p_requested_units,v_actor
 ) RETURNING id INTO v_evaluation;
 RETURN v_evaluation;
END $fn$;

CREATE OR REPLACE FUNCTION public.coordinator_decide_transfer_evaluation_v1(
 p_evaluation_id uuid,p_decision_status text,p_credited_units numeric,
 p_decision_reason text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = '' AS $fn$
DECLARE v_actor uuid; v_row public.transfer_credit_evaluations%ROWTYPE;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL
    OR public.current_role_code() IS DISTINCT FROM 'academic-coordinator' THEN
  RAISE EXCEPTION 'Academic Coordinator authorization required' USING ERRCODE='42501';
 END IF;
 SELECT id INTO STRICT v_actor FROM public.app_users
  WHERE auth_user_id=auth.uid() AND role_code='academic-coordinator'
   AND account_status='Active' AND login_enabled;
 IF p_decision_status NOT IN ('CREDITED','DENIED','REQUIRES_REVIEW')
    OR btrim(coalesce(p_decision_reason,''))='' THEN
  RAISE EXCEPTION 'A supported decision and reason are required';
 END IF;
 SELECT * INTO STRICT v_row FROM public.transfer_credit_evaluations
  WHERE id=p_evaluation_id FOR UPDATE;
 IF v_row.decision_status <> 'PENDING' THEN
  RAISE EXCEPTION 'Only pending transfer decisions can be completed';
 END IF;
 IF p_decision_status='CREDITED' AND
    (p_credited_units IS NULL OR p_credited_units <= 0
     OR (v_row.requested_units IS NOT NULL
       AND p_credited_units>v_row.requested_units)) THEN
  RAISE EXCEPTION 'Credited units require supported source evidence';
 END IF;
 UPDATE public.transfer_credit_evaluations SET
   decision_status=p_decision_status,
   credited_units=CASE WHEN p_decision_status='CREDITED' THEN p_credited_units ELSE NULL END,
   decision_reason=btrim(p_decision_reason),
   evaluator_user_id=v_actor,decided_at=clock_timestamp()
 WHERE id=p_evaluation_id;
 -- The decision does not invent a PLP academic grade.
 RETURN true;
END $fn$;

REVOKE ALL ON FUNCTION
 public.registrar_amend_academic_result_v1(uuid,text,numeric,text,text,text),
 public.registrar_record_transfer_evaluation_v1(uuid,text,text,text,text,text,text,numeric),
 public.coordinator_decide_transfer_evaluation_v1(uuid,text,numeric,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.registrar_amend_academic_result_v1(uuid,text,numeric,text,text,text),
 public.registrar_record_transfer_evaluation_v1(uuid,text,text,text,text,text,text,numeric),
 public.coordinator_decide_transfer_evaluation_v1(uuid,text,numeric,text)
 TO authenticated;

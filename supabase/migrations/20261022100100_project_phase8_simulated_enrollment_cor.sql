-- Fictional first-enrollment demonstration lifecycle. Never writes official
-- enrollments, academic results, admission or verified university confirmation.
SET lock_timeout='3s';
CREATE TABLE IF NOT EXISTS public.project_phase8_enrollment_simulations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 student_id uuid NOT NULL REFERENCES public.student_profiles(id) ON DELETE RESTRICT,
 term_id text NOT NULL REFERENCES public.academic_terms(id) ON DELETE RESTRICT,
 home_block_id uuid NOT NULL REFERENCES public.block_sections(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(
   status IN ('DRAFT','SUBMITTED','RETURNED','VALIDATED','CONFIRMED_SIMULATION')),
 source_provenance text NOT NULL DEFAULT 'GENERATED_PROJECT'
  CHECK(source_provenance='GENERATED_PROJECT'),
 verified_institutionally boolean NOT NULL DEFAULT false CHECK (verified_institutionally=false),
 created_at timestamptz NOT NULL DEFAULT now(),
 submitted_at timestamptz,
 validated_at timestamptz,
 confirmed_at timestamptz,
 confirmed_by_user_id uuid REFERENCES public.app_users(id) ON DELETE RESTRICT,
 UNIQUE(student_id,term_id)
);
CREATE TABLE IF NOT EXISTS public.project_phase8_enrollment_simulation_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 simulation_id uuid NOT NULL REFERENCES public.project_phase8_enrollment_simulations(id)
  ON DELETE RESTRICT,
 actor_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
 actor_role text NOT NULL,
 prior_status text,
 next_status text NOT NULL,
 action text NOT NULL,
 reason text,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_phase8_enrollment_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_phase8_enrollment_simulation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_phase8_enrollment_simulations,
 public.project_phase8_enrollment_simulation_events FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.project_phase8_simulated_enrollment_action_v1(
 p_student_id uuid,p_action text,p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid;v_role text;v_link public.project_auth_student_links%ROWTYPE;
 v_placement public.project_student_academic_placements%ROWTYPE;
 v_existing public.project_phase8_enrollment_simulations%ROWTYPE;
 v_old text;v_new text;v_action text;v_eligible integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
  RAISE EXCEPTION 'Authenticated PLP account required' USING ERRCODE='42501';
 END IF;
 SELECT id,role_code INTO v_actor,v_role FROM public.app_users
 WHERE auth_user_id=auth.uid() AND account_status='Active' AND login_enabled
  AND role_code IN ('student','registrar');
 IF v_actor IS NULL THEN
  RAISE EXCEPTION 'Student or Registrar authorization required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO STRICT v_placement FROM public.project_student_academic_placements
 WHERE student_id=p_student_id AND term_id='TERM-2026-1'
   AND project_cohort_id='PLP_PROJECT_600_2026_1';
 IF v_placement.home_block_id IS NULL OR NOT EXISTS (
  SELECT 1 FROM public.project_phase8_schedule_validations v
  WHERE v.block_id=v_placement.home_block_id AND v.validation_status='READY_PROJECT'
 ) THEN
  RAISE EXCEPTION 'Validated project curriculum and block timetable are required';
 END IF;
 IF v_role='student' THEN
  SELECT * INTO STRICT v_link FROM public.project_auth_student_links
  WHERE student_id=p_student_id AND auth_user_id=auth.uid() AND state='ACTIVE'
   AND initial_password_changed_at IS NOT NULL;
 END IF;
 SELECT count(*) INTO v_eligible FROM public.project_subject_eligibility e
 WHERE e.student_id=p_student_id AND e.term_id=v_placement.term_id
   AND e.curriculum_code=v_placement.curriculum_code
   AND e.eligibility_status IN ('ELIGIBLE','RETAKE');
 IF v_eligible<1 THEN
  RAISE EXCEPTION 'No eligible project subjects for this student';
 END IF;
 v_action:=upper(trim(coalesce(p_action,'')));
 IF (v_role='student' AND v_action NOT IN ('OPEN','SUBMIT'))
   OR (v_role='registrar' AND v_action NOT IN ('VALIDATE','RETURN','CONFIRM')) THEN
  RAISE EXCEPTION 'This role cannot perform this simulated enrollment action'
    USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_existing FROM public.project_phase8_enrollment_simulations
 WHERE student_id=p_student_id AND term_id=v_placement.term_id FOR UPDATE;
 IF v_action='OPEN' THEN
  IF v_existing.id IS NULL THEN
    INSERT INTO public.project_phase8_enrollment_simulations
     (student_id,term_id,home_block_id,status)
    VALUES (p_student_id,v_placement.term_id,v_placement.home_block_id,'DRAFT')
    RETURNING * INTO v_existing;
    v_old:=NULL;v_new:='DRAFT';
  ELSE
    IF v_existing.home_block_id IS DISTINCT FROM v_placement.home_block_id THEN
      RAISE EXCEPTION 'Academic placement changed: review required';
    END IF;
    RETURN jsonb_build_object('simulation_id',v_existing.id,
      'status',v_existing.status,'fictional_only',true,'changed',false);
  END IF;
 ELSIF v_existing.id IS NULL THEN
  RAISE EXCEPTION 'Student must open a project enrollment before submission';
 ELSE
  v_old:=v_existing.status;
  IF v_action='SUBMIT' AND v_old IN ('DRAFT','RETURNED') THEN v_new:='SUBMITTED';
  ELSIF v_action='VALIDATE' AND v_old='SUBMITTED' THEN v_new:='VALIDATED';
  ELSIF v_action='RETURN' AND v_old IN ('SUBMITTED','VALIDATED') THEN v_new:='RETURNED';
  ELSIF v_action='CONFIRM' AND v_old='VALIDATED' THEN v_new:='CONFIRMED_SIMULATION';
  ELSE RAISE EXCEPTION 'Invalid simulated enrollment status transition'; END IF;
  IF v_action IN ('RETURN','CONFIRM') AND btrim(coalesce(p_reason,''))='' THEN
    RAISE EXCEPTION 'A Registrar source or return reason is required';
  END IF;
  UPDATE public.project_phase8_enrollment_simulations SET
   status=v_new,
   submitted_at=CASE WHEN v_new='SUBMITTED' THEN clock_timestamp()
    ELSE submitted_at END,
   validated_at=CASE WHEN v_new='VALIDATED' THEN clock_timestamp()
    ELSE validated_at END,
   confirmed_at=CASE WHEN v_new='CONFIRMED_SIMULATION' THEN clock_timestamp()
    ELSE confirmed_at END,
   confirmed_by_user_id=CASE WHEN v_new='CONFIRMED_SIMULATION' THEN v_actor
    ELSE confirmed_by_user_id END
  WHERE id=v_existing.id;
 END IF;
 INSERT INTO public.project_phase8_enrollment_simulation_events
  (simulation_id,actor_user_id,actor_role,prior_status,next_status,action,reason)
 VALUES(v_existing.id,v_actor,v_role,v_old,v_new,v_action,
  nullif(btrim(coalesce(p_reason,'')),''));
 RETURN jsonb_build_object('simulation_id',v_existing.id,'status',v_new,
  'fictional_only',true,'verified_institutionally',false,'changed',true);
END $fn$;

CREATE OR REPLACE FUNCTION public.project_phase8_demonstration_cor_v1(p_simulation_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_sim public.project_phase8_enrollment_simulations%ROWTYPE;
 v_actor uuid;v_role text;v_snapshot jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
  RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
 END IF;
 SELECT id,role_code INTO v_actor,v_role FROM public.app_users
 WHERE auth_user_id=auth.uid() AND account_status='Active' AND login_enabled;
 IF v_actor IS NULL OR v_role NOT IN ('student','registrar') THEN
  RAISE EXCEPTION 'Authorized academic account required' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT v_sim FROM public.project_phase8_enrollment_simulations
 WHERE id=p_simulation_id AND status='CONFIRMED_SIMULATION';
 IF v_role='student' AND NOT EXISTS (
  SELECT 1 FROM public.student_profiles WHERE id=v_sim.student_id AND user_id=v_actor
 ) THEN RAISE EXCEPTION 'Another student COR is not accessible' USING ERRCODE='42501'; END IF;
 SELECT public.project_phase8_student_snapshot_v1(v_sim.student_id)
 INTO v_snapshot;
 RETURN jsonb_build_object('simulation_only',true,'official',false,
   'institutionally_verified',false,'document_title','Enrollment Registration Demonstration',
   'registration_status','CONFIRMED FOR PROJECT SIMULATION',
   'simulation_id',v_sim.id,'confirmed_at',v_sim.confirmed_at,
   'student',v_snapshot,'certificate_of_official_registration',false);
END $fn$;
REVOKE ALL ON FUNCTION
 public.project_phase8_simulated_enrollment_action_v1(uuid,text,text),
 public.project_phase8_demonstration_cor_v1(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.project_phase8_simulated_enrollment_action_v1(uuid,text,text),
 public.project_phase8_demonstration_cor_v1(uuid)
 TO authenticated;

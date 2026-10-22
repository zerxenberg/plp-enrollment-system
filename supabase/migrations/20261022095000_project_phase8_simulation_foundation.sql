-- Authorized fictional Phase 8 education project data.
-- Does not bypass immutable PROJECT_ONLY profiles or authoritative grade guards.
-- Existing Auth users, enrollment confirmations and historical records untouched.
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.project_student_academic_placements (
 student_id uuid PRIMARY KEY REFERENCES public.student_profiles(id) ON DELETE RESTRICT,
 term_id text NOT NULL REFERENCES public.academic_terms(id) ON DELETE RESTRICT,
 program_code text NOT NULL REFERENCES public.programs(code) ON DELETE RESTRICT,
 program_track_code text REFERENCES public.program_tracks(code) ON DELETE RESTRICT,
 curriculum_code text NOT NULL REFERENCES public.curricula(code) ON DELETE RESTRICT,
 year_level smallint NOT NULL CHECK(year_level BETWEEN 1 AND 4),
 academic_classification text NOT NULL CHECK(academic_classification IN ('REGULAR','IRREGULAR')),
 progression_status text NOT NULL DEFAULT 'ELIGIBLE_NORMAL',
 home_block_id uuid REFERENCES public.block_sections(id) ON DELETE RESTRICT,
 project_cohort_id text NOT NULL DEFAULT 'PLP_PROJECT_600_2026_1'
   CHECK(project_cohort_id='PLP_PROJECT_600_2026_1'),
 source_key text UNIQUE NOT NULL,
 source_metadata jsonb NOT NULL DEFAULT '{"origin":"GENERATED_PROJECT","verified_institutionally":false}'::jsonb,
 generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS phase8_project_placement_student_term_uq
 ON public.project_student_academic_placements(student_id,term_id);
CREATE INDEX IF NOT EXISTS phase8_project_placement_block_idx
 ON public.project_student_academic_placements(home_block_id)
 WHERE home_block_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.project_simulated_academic_results (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 student_id uuid NOT NULL REFERENCES public.student_profiles(id) ON DELETE RESTRICT,
 term_id text NOT NULL REFERENCES public.academic_terms(id) ON DELETE RESTRICT,
 curriculum_code text NOT NULL REFERENCES public.curricula(code) ON DELETE RESTRICT,
 subject_code text NOT NULL REFERENCES public.subjects(code) ON DELETE RESTRICT,
 grade_value numeric(4,2) CHECK(grade_value IS NULL OR grade_value BETWEEN 1 AND 5),
 result_status text NOT NULL CHECK(result_status IN ('COMPLETED','FAILED','INCOMPLETE')),
 academic_units smallint NOT NULL CHECK(academic_units BETWEEN 1 AND 18),
 source_key text UNIQUE NOT NULL,
 source_metadata jsonb NOT NULL DEFAULT '{"origin":"GENERATED_PROJECT","verified_institutionally":false}'::jsonb,
 simulated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT phase8_project_result_one_subject_per_term_uq
  UNIQUE(student_id,term_id,subject_code),
 CONSTRAINT phase8_project_grade_consistency_ck CHECK(
 (result_status='COMPLETED' AND grade_value IS NOT NULL AND grade_value BETWEEN 1 AND 3)
 OR (result_status='FAILED' AND grade_value IS NOT NULL AND grade_value>3 AND grade_value<=5)
 OR (result_status='INCOMPLETE' AND grade_value IS NULL))
);
CREATE INDEX IF NOT EXISTS phase8_project_grade_student_idx
 ON public.project_simulated_academic_results(student_id,term_id);

CREATE TABLE IF NOT EXISTS public.project_simulated_transfer_credits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 student_id uuid NOT NULL REFERENCES public.student_profiles(id) ON DELETE RESTRICT,
 curriculum_code text NOT NULL REFERENCES public.curricula(code) ON DELETE RESTRICT,
 target_subject_code text NOT NULL REFERENCES public.subjects(code) ON DELETE RESTRICT,
 source_course_name text NOT NULL,
 source_institution text NOT NULL,
 credited_units numeric(5,2) NOT NULL CHECK (credited_units>0 AND credited_units<=18),
 decision_status text NOT NULL DEFAULT 'PROJECT_CREDITED'
   CHECK(decision_status IN ('PROJECT_CREDITED','PROJECT_DENIED','PROJECT_PENDING')),
 source_key text UNIQUE NOT NULL,
 source_metadata jsonb NOT NULL DEFAULT '{"origin":"GENERATED_PROJECT","verified_institutionally":false}'::jsonb,
 simulated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT phase8_project_transfer_one_target_uq UNIQUE(student_id,curriculum_code,target_subject_code)
);

CREATE TABLE IF NOT EXISTS public.project_subject_eligibility (
 student_id uuid NOT NULL REFERENCES public.student_profiles(id) ON DELETE RESTRICT,
 term_id text NOT NULL REFERENCES public.academic_terms(id) ON DELETE RESTRICT,
 curriculum_code text NOT NULL REFERENCES public.curricula(code) ON DELETE RESTRICT,
 subject_code text NOT NULL REFERENCES public.subjects(code) ON DELETE RESTRICT,
 eligibility_status text NOT NULL
   CHECK(eligibility_status IN ('ELIGIBLE','RETAKE','RESTRICTED','CREDITED','COMPLETED')),
 reason text,
 source_key text UNIQUE NOT NULL,
 source_metadata jsonb NOT NULL DEFAULT '{"origin":"GENERATED_PROJECT","verified_institutionally":false}'::jsonb,
 evaluated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT phase8_project_eligibility_pk PRIMARY KEY(student_id,term_id,subject_code)
);

CREATE TABLE IF NOT EXISTS public.phase8_retired_proposal_archive (
 assignment_id uuid PRIMARY KEY REFERENCES public.block_student_assignments(id) ON DELETE RESTRICT,
 original_row jsonb NOT NULL,
 archive_key text NOT NULL UNIQUE,
 retired_at timestamptz NOT NULL DEFAULT now(),
 provenance text NOT NULL DEFAULT 'PHASE8_2026_PROJECT_REPLACEMENT'
  CHECK(provenance='PHASE8_2026_PROJECT_REPLACEMENT')
);

CREATE OR REPLACE FUNCTION public.phase8_verify_simulated_student_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_match boolean;
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Project Phase 8 simulation records may only be retired through a separately reviewed archival process'
   USING ERRCODE='42501';
 END IF;
 SELECT EXISTS (
  SELECT 1 FROM public.student_profiles sp
  JOIN public.project_auth_student_links l ON l.student_id=sp.id
  WHERE sp.id=NEW.student_id AND sp.record_kind='PROJECT_ONLY'
   AND sp.project_cohort_id='PLP_PROJECT_600_2026_1'
   AND sp.is_synthetic_demo AND l.state='ACTIVE'
 ) INTO v_match;
 IF NOT v_match OR coalesce(NEW.source_metadata->>'origin','')<>'GENERATED_PROJECT'
    OR coalesce(NEW.source_metadata->>'verified_institutionally','')<>'false'
    OR NEW.source_key NOT LIKE 'PHASE8_PROJECT_2026:%' THEN
  RAISE EXCEPTION 'Only immutable linked PROJECT_ONLY identities with fictional provenance may be populated'
   USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND
    (OLD.student_id IS DISTINCT FROM NEW.student_id
     OR OLD.source_key IS DISTINCT FROM NEW.source_key
     OR OLD.source_metadata->>'origin' IS DISTINCT FROM NEW.source_metadata->>'origin') THEN
  RAISE EXCEPTION 'Immutable project academic simulation identity' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $fn$;

DO $triggers$
DECLARE v_table text;
BEGIN
 FOREACH v_table IN ARRAY ARRAY[
 'project_student_academic_placements','project_simulated_academic_results',
 'project_simulated_transfer_credits','project_subject_eligibility'] LOOP
   EXECUTE format('DROP TRIGGER IF EXISTS phase8_project_provenance_guard ON public.%I',v_table);
   EXECUTE format('CREATE TRIGGER phase8_project_provenance_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.phase8_verify_simulated_student_v1()',v_table);
 END LOOP;
END $triggers$;

ALTER TABLE public.project_student_academic_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_simulated_academic_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_simulated_transfer_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_subject_eligibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phase8_retired_proposal_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_student_academic_placements,
 public.project_simulated_academic_results,
 public.project_simulated_transfer_credits,
 public.project_subject_eligibility,
 public.phase8_retired_proposal_archive FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase8_verify_simulated_student_v1() FROM PUBLIC,anon,authenticated;

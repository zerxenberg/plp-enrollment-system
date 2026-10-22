-- Newly added project-only tables had no explicit service_role privileges.
-- Allow only trusted backend provisioning. Browsers retain no direct access.
GRANT SELECT,INSERT,UPDATE ON TABLE
 public.project_student_academic_placements,
 public.project_simulated_academic_results,
 public.project_simulated_transfer_credits,
 public.project_subject_eligibility,
 public.project_phase8_schedule_validations
 TO service_role;
REVOKE ALL ON TABLE
 public.project_student_academic_placements,
 public.project_simulated_academic_results,
 public.project_simulated_transfer_credits,
 public.project_subject_eligibility,
 public.project_phase8_schedule_validations
 FROM PUBLIC,anon,authenticated;

-- Guard all future CONFIRMED transitions, independent of frontend or RPC path.
-- Existing four confirmed records remain unchanged and historical.
SET lock_timeout='3s';
CREATE OR REPLACE FUNCTION public.enforce_official_enrollment_academic_gate_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
 IF NEW.status IS DISTINCT FROM 'CONFIRMED'
   OR OLD.status IS NOT DISTINCT FROM 'VALIDATED' THEN RETURN NEW; END IF;
 IF auth.role() IS DISTINCT FROM 'authenticated'
   OR auth.uid() IS NULL
   OR public.current_role_code() IS DISTINCT FROM 'registrar' THEN
   RAISE EXCEPTION 'Only a signed Registrar can complete official enrollment'
      USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.enrollment_subjects es
   WHERE es.enrollment_id=NEW.id AND es.registration_status='CONFIRMED'
 ) OR EXISTS (
   SELECT 1 FROM public.enrollment_subjects es
   LEFT JOIN public.sections sec ON sec.id=es.section_id
   LEFT JOIN public.student_subject_eligibility elig
     ON elig.student_id=NEW.student_id AND elig.term_id=NEW.term_id
       AND elig.subject_code=es.subject_code
   WHERE es.enrollment_id=NEW.id AND es.registration_status='CONFIRMED'
     AND (sec.id IS NULL OR sec.term_id IS DISTINCT FROM NEW.term_id
      OR sec.subject_code IS DISTINCT FROM es.subject_code
      OR sec.schedule_status IS DISTINCT FROM 'FINALIZED'
      OR elig.eligibility_status IS NULL
      OR elig.eligibility_status NOT IN ('ELIGIBLE','RETAKE'))
 ) THEN
   RAISE EXCEPTION 'Confirmed enrollment requires published schedules and authorized eligible subjects'
      USING ERRCODE='23514';
 END IF;
 IF EXISTS (
  SELECT 1 FROM public.enrollment_subjects a
  JOIN public.section_meetings am ON am.section_id=a.section_id AND am.meeting_status='ACTIVE'
  JOIN public.enrollment_subjects b ON b.enrollment_id=a.enrollment_id
    AND b.subject_code>a.subject_code AND b.registration_status='CONFIRMED'
  JOIN public.section_meetings bm ON bm.section_id=b.section_id AND bm.meeting_status='ACTIVE'
   AND bm.day_of_week=am.day_of_week
   AND bm.start_time<am.end_time AND am.start_time<bm.end_time
  WHERE a.enrollment_id=NEW.id AND a.registration_status='CONFIRMED'
 ) THEN
   RAISE EXCEPTION 'Official enrollment has overlapping subjects' USING ERRCODE='23514';
 END IF;
 IF EXISTS (
  SELECT 1 FROM public.enrollment_subjects es
  JOIN public.sections sec ON sec.id=es.section_id
  WHERE es.enrollment_id=NEW.id AND es.registration_status='CONFIRMED'
    AND (SELECT count(DISTINCT e.student_id)
      FROM public.enrollments e
      JOIN public.enrollment_subjects other ON other.enrollment_id=e.id
      WHERE e.term_id=NEW.term_id AND e.status='CONFIRMED'
       AND other.section_id=sec.id AND other.registration_status='CONFIRMED')
       >= LEAST(sec.capacity,40)
 ) THEN
   RAISE EXCEPTION 'Published class exceeds approved capacity' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.enforce_official_enrollment_academic_gate_v1()
 FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS enforce_official_enrollment_academic_gate_v1 ON public.enrollments;
CREATE TRIGGER enforce_official_enrollment_academic_gate_v1
BEFORE UPDATE OF status ON public.enrollments FOR EACH ROW
EXECUTE FUNCTION public.enforce_official_enrollment_academic_gate_v1();

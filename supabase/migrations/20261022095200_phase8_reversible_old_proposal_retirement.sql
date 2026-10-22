-- Run ONLY after project placement and block schedule seed passes its checks.
-- Retires 1,915 old synthetic operational proposals without deleting rows.
-- The before-image is retained with a permanent FK and exact re-run handling.
SET lock_timeout='5s';
DO $retire$
DECLARE v_old integer; v_archived integer; v_changed integer;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('PHASE8_PROJECT_2026:ARCHIVE_LEGACY',0));
 SELECT count(*) INTO v_old FROM public.block_student_assignments a
 WHERE a.status='PROPOSED' AND a.is_synthetic_demo
   AND a.synthetic_source_key IS NOT NULL
   AND NOT EXISTS (
    SELECT 1 FROM public.student_profiles sp
    WHERE sp.id=a.student_id AND sp.record_kind='PROJECT_ONLY'
   );
 SELECT count(*) INTO v_archived FROM public.phase8_retired_proposal_archive
 WHERE provenance='PHASE8_2026_PROJECT_REPLACEMENT';
 IF v_old=0 AND v_archived=1915 THEN
   RETURN; -- Already retired in a successful prior transaction.
 END IF;
 IF v_old<>1915 OR v_archived<>0 THEN
   RAISE EXCEPTION 'Obsolete assignment scope differs from the approved 1,915: pending %, archived %',
      v_old,v_archived;
 END IF;
 -- Do not retire until all 600 replacement students have a complete distinct
 -- project block plus a validated project-only timetable.
 IF (SELECT count(*) FROM public.project_student_academic_placements
      WHERE term_id='TERM-2026-1' AND home_block_id IS NOT NULL)<>600
    OR (SELECT count(*) FROM public.project_phase8_schedule_validations
      WHERE validation_status='READY_PROJECT')<>(
        SELECT count(DISTINCT home_block_id)
        FROM public.project_student_academic_placements
        WHERE term_id='TERM-2026-1')
    OR EXISTS (
      SELECT 1 FROM public.project_student_academic_placements p
      JOIN public.block_sections b ON b.id=p.home_block_id
      WHERE p.term_id<>'TERM-2026-1'
       OR b.term_id<>p.term_id
       OR b.program_code<>p.program_code
       OR b.year_level<>p.year_level
       OR b.curriculum_code<>p.curriculum_code
       OR b.capacity>40)
    OR (SELECT count(*) FROM public.block_student_assignments a
      JOIN public.student_profiles s ON s.id=a.student_id
      WHERE s.record_kind='PROJECT_ONLY' AND a.term_id='TERM-2026-1'
       AND a.status='PROPOSED')<>600 THEN
   RAISE EXCEPTION 'Project replacement is not complete: cannot retire legacy proposals';
 END IF;
 INSERT INTO public.phase8_retired_proposal_archive(assignment_id,original_row,archive_key)
 SELECT a.id,to_jsonb(a),'PHASE8_PROJECT_2026:ARCHIVE:'||a.id::text
 FROM public.block_student_assignments a
 WHERE a.status='PROPOSED' AND a.is_synthetic_demo
   AND a.synthetic_source_key IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.student_profiles sp
     WHERE sp.id=a.student_id AND sp.record_kind='PROJECT_ONLY'
   );
 GET DIAGNOSTICS v_archived=ROW_COUNT;
 IF v_archived<>1915 THEN
  RAISE EXCEPTION 'Archival snapshot truncated: %',v_archived;
 END IF;
 UPDATE public.block_student_assignments a
 SET status='CANCELLED',ended_at=clock_timestamp(),
  transfer_reason='REPLACED_BY_VERIFIED_PROJECT_ONLY_PHASE8'
 WHERE a.status='PROPOSED' AND a.id IN (
  SELECT assignment_id FROM public.phase8_retired_proposal_archive
 );
 GET DIAGNOSTICS v_changed=ROW_COUNT;
 IF v_changed<>1915 OR (
  SELECT count(*) FROM public.phase8_retired_proposal_archive x
  JOIN public.block_student_assignments a ON a.id=x.assignment_id
  WHERE a.status='CANCELLED')<>1915 THEN
    RAISE EXCEPTION 'Retirement reconciliation failed: %',v_changed;
 END IF;
END $retire$;

-- Phase 8: publication-only academic and timetable gate.
-- No data backfill, no change to existing schedule RPC signatures or grants,
-- and no transition of the 122 existing DRAFT planning blocks.
-- The Academic Coordinator must approve the curriculum before publication.
BEGIN;

CREATE OR REPLACE FUNCTION public.phase8_guard_block_schedule_publication()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $phase8$
DECLARE
  v_term public.academic_terms%ROWTYPE;
  v_curriculum public.curricula%ROWTYPE;
  v_year_label text;
  v_expected_subjects integer;
  v_section_count integer;
  v_distinct_subjects integer;
  v_taught_days integer;
  v_occupied integer;
  v_day smallint;
BEGIN
  -- Publishing must use a previously saved DRAFT block. Even a privileged
  -- direct INSERT cannot create an already PUBLISHED block.
  IF TG_OP = 'INSERT' THEN
    IF NEW.planning_status = 'PUBLISHED' THEN
      RAISE EXCEPTION 'Create the block as DRAFT before publishing'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- Published academic context and capacity are immutable through this
  -- scheduling path. Archiving is still a separate allowed status change.
  IF OLD.planning_status = 'PUBLISHED'
     AND (NEW.term_id, NEW.code, NEW.program_code,
          NEW.program_track_code, NEW.curriculum_code,
          NEW.year_level, NEW.capacity)
         IS DISTINCT FROM
         (OLD.term_id, OLD.code, OLD.program_code,
          OLD.program_track_code, OLD.curriculum_code,
          OLD.year_level, OLD.capacity) THEN
    RAISE EXCEPTION 'Published block academic context requires an authorized correction'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.planning_status IS DISTINCT FROM 'PUBLISHED'
     OR OLD.planning_status IS NOT DISTINCT FROM 'PUBLISHED' THEN
    RETURN NEW;
  END IF;

  IF OLD.planning_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'Only a DRAFT schedule may be published'
      USING ERRCODE = '23514';
  END IF;
  IF auth.role() IS DISTINCT FROM 'authenticated'
     OR auth.uid() IS NULL
     OR NOT public.has_role('academic-coordinator') THEN
    RAISE EXCEPTION 'Academic Coordinator permission required'
      USING ERRCODE = '42501';
  END IF;

  -- The existing save/publish RPCs use these locks. Acquiring them here
  -- also protects a direct status update from racing a meeting editor.
  FOR v_day IN 1..7 LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'MEETINGS:' || NEW.term_id || ':' || v_day::text, 0));
  END LOOP;

  SELECT * INTO v_term FROM public.academic_terms WHERE id = NEW.term_id;
  SELECT * INTO v_curriculum FROM public.curricula
    WHERE code = NEW.curriculum_code;
  IF v_term.id IS NULL OR v_curriculum.code IS NULL
     OR v_curriculum.status IS DISTINCT FROM 'Active'
     OR v_curriculum.program_code IS DISTINCT FROM NEW.program_code
     OR v_curriculum.program_track_code
          IS DISTINCT FROM NEW.program_track_code THEN
    RAISE EXCEPTION 'Publishing requires an Active approved curriculum matching the block'
      USING ERRCODE = '23514';
  END IF;

  v_year_label := CASE NEW.year_level
    WHEN 1 THEN '1st Year' WHEN 2 THEN '2nd Year'
    WHEN 3 THEN '3rd Year' WHEN 4 THEN '4th Year'
    ELSE NULL END;
  IF v_year_label IS NULL THEN
    RAISE EXCEPTION 'The block year level is not a recognized curriculum year'
      USING ERRCODE = '23514';
  END IF;

  -- The approved curriculum, not a fabricated count or the number of
  -- meeting rows, determines whether this semester has six or seven classes.
  SELECT count(*) INTO v_expected_subjects
  FROM public.curriculum_subjects cs
  WHERE cs.curriculum_code = NEW.curriculum_code
    AND lower(btrim(cs.year_level)) = lower(v_year_label)
    AND lower(btrim(cs.semester)) = lower(btrim(v_term.semester));
  IF v_expected_subjects NOT IN (6, 7) THEN
    RAISE EXCEPTION 'Approved curriculum must define six or seven subjects in this year and semester'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*), count(DISTINCT s.subject_code)
    INTO v_section_count, v_distinct_subjects
  FROM public.block_subject_sections j
  JOIN public.sections s ON s.id = j.section_id
  WHERE j.block_id = NEW.id;
  IF v_section_count <> v_expected_subjects
     OR v_distinct_subjects <> v_expected_subjects THEN
    RAISE EXCEPTION 'The block must contain exactly the approved six or seven distinct subjects'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.capacity IS DISTINCT FROM 40
     OR EXISTS (
       SELECT 1 FROM public.block_subject_sections j
       JOIN public.sections s ON s.id = j.section_id
       LEFT JOIN public.subject_offerings o ON o.id = s.subject_offering_id
       LEFT JOIN public.subjects subject ON subject.code = s.subject_code
       WHERE j.block_id = NEW.id
         AND (
           s.term_id IS DISTINCT FROM NEW.term_id
           OR s.capacity IS DISTINCT FROM 40
           OR s.schedule_status IS DISTINCT FROM 'DRAFT'
           OR subject.status IS DISTINCT FROM 'Active'
           OR subject.units IS NULL OR subject.units <= 0
           OR o.status IS DISTINCT FROM 'ACTIVE'
           OR o.term_id IS DISTINCT FROM NEW.term_id
           OR o.program_code IS DISTINCT FROM NEW.program_code
           OR o.curriculum_code IS DISTINCT FROM NEW.curriculum_code
           OR o.subject_code IS DISTINCT FROM s.subject_code
           OR NOT EXISTS (
             SELECT 1 FROM public.curriculum_subjects cs
             WHERE cs.curriculum_code = NEW.curriculum_code
               AND cs.subject_code = s.subject_code
               AND lower(btrim(cs.year_level)) = lower(v_year_label)
               AND lower(btrim(cs.semester)) = lower(btrim(v_term.semester))
           )
         )
     ) THEN
    RAISE EXCEPTION 'Block classes must match the approved curriculum, active offerings and capacity 40'
      USING ERRCODE = '23514';
  END IF;

  -- One valid meeting and assigned PRIMARY instructor per subject is the
  -- minimum; check EVERY active meeting, including multiple lecture/lab
  -- periods. No contact hours or session types are invented here.
  IF EXISTS (
    SELECT 1 FROM public.block_subject_sections j
    WHERE j.block_id = NEW.id AND NOT EXISTS (
      SELECT 1 FROM public.section_meetings m
      JOIN public.rooms r ON r.id = m.room_id AND r.is_active
      JOIN public.section_instructors si ON si.section_id = m.section_id
        AND si.assignment_role = 'PRIMARY'
      JOIN public.instructors i ON i.id = si.instructor_id
      WHERE m.section_id = j.section_id
        AND m.meeting_status = 'ACTIVE'
        AND m.day_of_week BETWEEN 1 AND 5
        AND m.start_time IS NOT NULL AND m.end_time IS NOT NULL
        AND m.start_time < m.end_time
    )
  ) OR EXISTS (
    SELECT 1 FROM public.block_subject_sections j
    JOIN public.section_meetings m ON m.section_id = j.section_id
    WHERE j.block_id = NEW.id AND m.meeting_status = 'ACTIVE'
      AND (m.day_of_week IS NULL OR m.day_of_week NOT BETWEEN 1 AND 5
           OR m.start_time IS NULL OR m.end_time IS NULL
           OR m.start_time >= m.end_time
           OR NOT EXISTS (
             SELECT 1 FROM public.rooms r
             WHERE r.id = m.room_id AND r.is_active
           )
           OR NOT EXISTS (
             SELECT 1 FROM public.section_instructors si
             JOIN public.instructors i ON i.id = si.instructor_id
             WHERE si.section_id = j.section_id AND si.assignment_role = 'PRIMARY'
           ))
  ) THEN
    RAISE EXCEPTION 'Every active class meeting needs a Monday-Friday time, active room and assigned instructor'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(DISTINCT m.day_of_week) INTO v_taught_days
  FROM public.block_subject_sections j
  JOIN public.section_meetings m ON m.section_id = j.section_id
  WHERE j.block_id = NEW.id AND m.meeting_status = 'ACTIVE';
  -- Explicit five-taught-day policy currently applies to the approved
  -- 2026/2027 project academic year. Other years require their own decision.
  IF v_term.academic_year = '2026 to 2027' AND v_taught_days <> 5 THEN
    RAISE EXCEPTION 'This term requires classes taught on all five weekdays'
      USING ERRCODE = '23514';
  END IF;

  -- Counts actual distinct students, combining reserved block seats and
  -- existing confirmed section seats without counting a student twice.
  SELECT count(*) INTO v_occupied FROM (
    SELECT a.student_id
    FROM public.block_student_assignments a
    WHERE a.block_id = NEW.id AND a.term_id = NEW.term_id
      AND a.status IN ('PROPOSED', 'CONFIRMED')
    UNION
    SELECT e.student_id
    FROM public.enrollments e
    JOIN public.enrollment_subjects es ON es.enrollment_id = e.id
    JOIN public.block_subject_sections j ON j.section_id = es.section_id
    WHERE j.block_id = NEW.id AND e.term_id = NEW.term_id
      AND e.status = 'CONFIRMED'
  ) occupied_students;
  IF v_occupied > NEW.capacity
     OR EXISTS (
       SELECT 1 FROM public.block_subject_sections j
       JOIN public.sections s ON s.id = j.section_id
       WHERE j.block_id = NEW.id AND (
         SELECT count(DISTINCT e.student_id)
         FROM public.enrollments e
         JOIN public.enrollment_subjects es ON es.enrollment_id = e.id
         WHERE es.section_id = s.id AND e.term_id = NEW.term_id
           AND e.status = 'CONFIRMED'
       ) > s.capacity
     ) THEN
    RAISE EXCEPTION 'A published class or block may not exceed capacity 40'
      USING ERRCODE = '23514';
  END IF;

  -- All current timetable resources are checked across the same term,
  -- including historical sections that are not linked to another block.
  IF EXISTS (
    SELECT 1 FROM public.block_subject_sections j
    JOIN public.section_meetings m ON m.section_id = j.section_id
    JOIN public.section_meetings other ON other.id <> m.id
      AND other.day_of_week = m.day_of_week
      AND other.meeting_status = 'ACTIVE'
      AND other.start_time < m.end_time AND m.start_time < other.end_time
    JOIN public.sections other_section ON other_section.id = other.section_id
      AND other_section.term_id = NEW.term_id
    WHERE j.block_id = NEW.id AND m.meeting_status = 'ACTIVE'
      AND (
        m.room_id = other.room_id
        OR EXISTS (
          SELECT 1 FROM public.section_instructors ours
          JOIN public.section_instructors theirs
            ON theirs.instructor_id = ours.instructor_id
          WHERE ours.section_id = m.section_id
            AND theirs.section_id = other.section_id
        )
        OR EXISTS (
          SELECT 1 FROM public.block_subject_sections same_block
          WHERE same_block.block_id = NEW.id
            AND same_block.section_id = other.section_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'Overlapping room, instructor or block meetings prevent publication'
      USING ERRCODE = '23514';
  END IF;

  -- A proposed student cannot attend overlapping classes in another
  -- proposed block, even if those classes use different rooms/professors.
  IF EXISTS (
    SELECT 1 FROM public.block_student_assignments ours
    JOIN public.block_student_assignments theirs
      ON theirs.student_id = ours.student_id
      AND theirs.term_id = NEW.term_id
      AND theirs.block_id <> NEW.id
      AND theirs.status IN ('PROPOSED', 'CONFIRMED')
    JOIN public.block_subject_sections j ON j.block_id = NEW.id
    JOIN public.section_meetings m ON m.section_id = j.section_id
      AND m.meeting_status = 'ACTIVE'
    JOIN public.block_subject_sections other_j ON other_j.block_id = theirs.block_id
    JOIN public.section_meetings other ON other.section_id = other_j.section_id
      AND other.meeting_status = 'ACTIVE'
      AND other.day_of_week = m.day_of_week
      AND other.start_time < m.end_time AND m.start_time < other.end_time
    WHERE ours.block_id = NEW.id AND ours.term_id = NEW.term_id
      AND ours.status IN ('PROPOSED', 'CONFIRMED')
  ) THEN
    RAISE EXCEPTION 'A proposed student has an overlapping block timetable'
      USING ERRCODE = '23514';
  END IF;

  -- Also protect students with real registration choices, including students
  -- recorded through enrollment_subjects but absent from a proposed roster.
  IF EXISTS (
    WITH affected_students AS (
      SELECT a.student_id FROM public.block_student_assignments a
      WHERE a.block_id = NEW.id AND a.term_id = NEW.term_id
        AND a.status IN ('PROPOSED', 'CONFIRMED')
      UNION
      SELECT e.student_id FROM public.enrollments e
      JOIN public.enrollment_subjects es ON es.enrollment_id = e.id
      JOIN public.block_subject_sections j ON j.section_id = es.section_id
      WHERE j.block_id = NEW.id AND e.term_id = NEW.term_id
        AND e.status NOT IN ('CANCELLED', 'NOT_ELIGIBLE')
    )
    SELECT 1 FROM affected_students st
    JOIN public.enrollments e ON e.student_id = st.student_id
      AND e.term_id = NEW.term_id
      AND e.status NOT IN ('CANCELLED', 'NOT_ELIGIBLE')
    JOIN public.enrollment_subjects es ON es.enrollment_id = e.id
    JOIN public.sections other_section ON other_section.id = es.section_id
      AND other_section.term_id = NEW.term_id
    JOIN public.section_meetings other ON other.section_id = other_section.id
      AND other.meeting_status = 'ACTIVE'
    JOIN public.block_subject_sections j ON j.block_id = NEW.id
    JOIN public.section_meetings m ON m.section_id = j.section_id
      AND m.meeting_status = 'ACTIVE'
      AND m.day_of_week = other.day_of_week
      AND m.start_time < other.end_time AND other.start_time < m.end_time
    WHERE NOT EXISTS (
      SELECT 1 FROM public.block_subject_sections already_in_block
      WHERE already_in_block.block_id = NEW.id
        AND already_in_block.section_id = other.section_id
    )
  ) THEN
    RAISE EXCEPTION 'A registered student has an overlapping class timetable'
      USING ERRCODE = '23514';
  END IF;

  -- The publisher's existing UPDATE finalizes linked sections and records
  -- published_at; this guard intentionally does not edit any record itself.
  RETURN NEW;
END;
$phase8$;

REVOKE ALL ON FUNCTION public.phase8_guard_block_schedule_publication()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS phase8_guard_block_schedule_publication
  ON public.block_sections;
CREATE TRIGGER phase8_guard_block_schedule_publication
BEFORE INSERT OR UPDATE ON public.block_sections
FOR EACH ROW
EXECUTE FUNCTION public.phase8_guard_block_schedule_publication();

COMMIT;

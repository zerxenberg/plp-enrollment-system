-- Measured planner issue: 4,398 scoped rows are sequentially scanned then
-- sorted for the latest 25 Academic Coordinator change events.
-- This index matches actual module-scoped ORDER BY occurred_at DESC,id DESC.
SET lock_timeout='3s';
CREATE INDEX IF NOT EXISTS academic_change_history_recent_page_idx
 ON public.academic_change_history(occurred_at DESC,id DESC)
 INCLUDE (module);

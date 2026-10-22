-- Bounded, transactional service-role import of approved fictional curriculum manifest.
-- No changes to historically assigned curricula or existing subject definitions.
SET lock_timeout='3s';
CREATE TABLE IF NOT EXISTS public.phase8_fictional_curriculum_provenance (
 curriculum_code text PRIMARY KEY REFERENCES public.curricula(code) ON DELETE RESTRICT,
 source_type text NOT NULL DEFAULT 'PROJECT_ONLY_FICTIONAL'
  CHECK (source_type='PROJECT_ONLY_FICTIONAL'),
 generator_id text NOT NULL,
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 is_official boolean NOT NULL DEFAULT false CHECK(is_official=false),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.phase8_fictional_curriculum_provenance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.phase8_fictional_curriculum_provenance FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.phase8_import_fictional_curriculum_v1(
 p_table text,p_source_sha256 text,p_rows jsonb
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_count integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'Project academic import requires trusted service' USING ERRCODE='42501';
 END IF;
 IF p_source_sha256 <> '333adf03e97dad235608392496a8570140e275bc620eb6a547a20aa3091fa32d'
 OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
 OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 120 THEN
  RAISE EXCEPTION 'Unsupported Phase 8 manifest or batch size';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('PHASE8_PROJECT_2026:CURRICULUM:'||p_table,0));
 IF p_table='subjects' THEN
  IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_rows) AS x(code text,name text,description text,units integer)
   WHERE x.code NOT LIKE 'P8F26-%' OR x.name IS NULL OR length(btrim(x.name))<4
   OR x.description NOT LIKE '%PHASE8_PROJECT_ONLY_FICTION_2026_V1%'
   OR x.units NOT BETWEEN 1 AND 4) THEN
   RAISE EXCEPTION 'Invalid fictional subject row';
  END IF;
  IF EXISTS(
   SELECT 1 FROM jsonb_to_recordset(p_rows) AS x(code text,name text,units smallint,description text,status text)
   JOIN public.subjects old ON old.code=x.code
   WHERE (old.name,old.units,old.description,old.status)
    IS DISTINCT FROM(x.name,x.units,x.description,x.status)) THEN
   RAISE EXCEPTION 'Subject code belongs to different data'; END IF;
  INSERT INTO public.subjects(code,name,units,description,status)
   SELECT code,name,units,description,status
   FROM jsonb_to_recordset(p_rows) AS x(code text,name text,units smallint,description text,status text)
   ON CONFLICT(code) DO NOTHING;
 ELSIF p_table='curricula' THEN
  IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_rows)
    AS x(code text,name text,status text)
    WHERE code NOT LIKE 'P8F26-%' OR status<>'Draft' OR name IS NULL)
   THEN RAISE EXCEPTION 'Only new draft project curricula are accepted'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_rows) AS x(
     code text,program_code text,program_track_code text,name text,version_label text)
    LEFT JOIN public.programs p ON p.code=x.program_code
    LEFT JOIN public.program_tracks t ON t.code=x.program_track_code
    WHERE p.code IS NULL OR (x.program_track_code IS NOT NULL AND
      (t.code IS NULL OR t.program_code<>x.program_code))) THEN
   RAISE EXCEPTION 'Invalid program or major in project curriculum'; END IF;
  INSERT INTO public.curricula(code,program_code,program_track_code,name,
   version_label,effective_year_start,effective_academic_year,status)
  SELECT code,program_code,program_track_code,name,version_label,
   effective_year_start,effective_academic_year,status
  FROM jsonb_to_recordset(p_rows) AS x(code text,program_code text,
   program_track_code text,name text,version_label text,
   effective_year_start integer,effective_academic_year text,status text)
  ON CONFLICT(code) DO NOTHING;
  INSERT INTO public.phase8_fictional_curriculum_provenance
   (curriculum_code,source_type,generator_id,source_sha256,is_official)
  SELECT x.code,'PROJECT_ONLY_FICTIONAL','PHASE8_PROJECT_ONLY_FICTION_2026_V1',
   p_source_sha256,false FROM jsonb_to_recordset(p_rows) AS x(code text)
  ON CONFLICT(curriculum_code) DO NOTHING;
 ELSIF p_table='curriculum_subjects' THEN
  IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_rows)
   AS x(curriculum_code text,subject_code text,year_level_number smallint)
   WHERE x.curriculum_code NOT LIKE 'P8F26-%' OR
    x.subject_code NOT LIKE 'P8F26-%' OR x.year_level_number NOT BETWEEN 1 AND 4)
   THEN RAISE EXCEPTION 'Invalid project curriculum placement'; END IF;
  INSERT INTO public.curriculum_subjects(curriculum_code,subject_code,
   year_level,year_level_number,semester,is_required,display_category,
   display_order,units_override)
  SELECT curriculum_code,subject_code,year_level,year_level_number,
    semester,is_required,display_category,display_order,units_override
  FROM jsonb_to_recordset(p_rows) AS x(curriculum_code text,subject_code text,
   year_level text,year_level_number smallint,semester text,is_required boolean,
   display_category text,display_order integer,units_override smallint)
  ON CONFLICT(curriculum_code,subject_code) DO NOTHING;
 ELSIF p_table='subject_prerequisites' THEN
  IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_rows)
   AS x(curriculum_code text,subject_code text,prerequisite_subject_code text)
   WHERE x.curriculum_code NOT LIKE 'P8F26-%' OR
    x.subject_code NOT LIKE 'P8F26-%' OR x.prerequisite_subject_code NOT LIKE 'P8F26-%')
   THEN RAISE EXCEPTION 'Invalid project prerequisite identity'; END IF;
  INSERT INTO public.subject_prerequisites(curriculum_code,subject_code,
   prerequisite_subject_code,is_active)
  SELECT curriculum_code,subject_code,prerequisite_subject_code,is_active
  FROM jsonb_to_recordset(p_rows) AS x(curriculum_code text,subject_code text,
   prerequisite_subject_code text,is_active boolean)
  ON CONFLICT(curriculum_code,subject_code,prerequisite_subject_code) DO NOTHING;
 ELSE RAISE EXCEPTION 'Unsupported academic import destination';
 END IF;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN v_count;
END $fn$;
REVOKE ALL ON FUNCTION public.phase8_import_fictional_curriculum_v1(text,text,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase8_import_fictional_curriculum_v1(text,text,jsonb)
 TO service_role;

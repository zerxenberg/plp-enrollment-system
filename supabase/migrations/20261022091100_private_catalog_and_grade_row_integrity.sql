SET lock_timeout = '3s';
CREATE UNIQUE INDEX IF NOT EXISTS grade_import_rows_one_student_per_batch
 ON public.grade_import_rows(batch_id,lower(btrim(source_student_number)));

CREATE OR REPLACE FUNCTION public.authorized_college_program_catalog_v1()
RETURNS TABLE (
 college_code text,college_name text,internal_code text,
 program_code text,program_name text,
 legacy_organizational_unit_code text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL
  OR public.current_role_code() NOT IN
   ('student','registrar','academic-coordinator','system-administrator') THEN
   RAISE EXCEPTION 'Active PLP account required' USING ERRCODE='42501';
 END IF;
 RETURN QUERY
 SELECT c.code,u.name,c.internal_code,p.code,p.name,p.organizational_unit_code
 FROM public.programs p
 JOIN public.college_organizational_unit_mappings map
   ON map.organizational_unit_code=p.organizational_unit_code
 JOIN public.colleges c ON c.code=map.college_code
 JOIN public.organizational_units u ON u.code=c.code
 ORDER BY c.code,p.code;
END $fn$;
REVOKE ALL ON FUNCTION public.authorized_college_program_catalog_v1()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.authorized_college_program_catalog_v1()
 TO authenticated;

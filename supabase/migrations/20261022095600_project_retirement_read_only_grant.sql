-- Trusted seeder may confirm the archive is empty, but cannot edit it.
-- Actual 1,915 archival writes remain postgres migration owned.
GRANT SELECT ON TABLE public.phase8_retired_proposal_archive TO service_role;
REVOKE ALL ON TABLE public.phase8_retired_proposal_archive FROM PUBLIC,anon,authenticated;

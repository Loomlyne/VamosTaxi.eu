-- 20261002100000_consent_choice_reader.sql
--
-- Phase 27 (Consent record), META-03 / META-05. One narrow reader over consent_log: the latest
-- choice for the bound consent subject under one policy version, optionally as of a time T.
--
-- The subject comes only from the GUC request.vamos.consent_subject (the same one record_consent
-- uses), so no caller, including a Data API caller, can read another visitor's choice. Rows under
-- another policy version never count (D-08, D-03b). Rows recorded after p_as_of never count
-- (D-20: an Accept after payment does not backfill). Ties on recorded_at go to the higher id.
-- No arrays (the Worker client runs with fetch_types:false). No table grant is added.

create or replace function public.consent_choice(
  p_policy_version pg_catalog.text,
  p_as_of          pg_catalog.timestamptz default null
)
returns table (
  method      pg_catalog.text,
  necessary   pg_catalog.bool,
  functional  pg_catalog.bool,
  analytics   pg_catalog.bool,
  marketing   pg_catalog.bool,
  recorded_at pg_catalog.timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.method, l.necessary, l.functional, l.analytics, l.marketing, l.recorded_at
    from public.consent_log as l
   where l.consent_subject_id =
         nullif(pg_catalog.current_setting('request.vamos.consent_subject', true), '')::pg_catalog.uuid
     and l.policy_version = p_policy_version
     and (p_as_of is null or l.recorded_at <= p_as_of)
   order by l.recorded_at desc, l.id desc
   limit 1
$$;

revoke all on function public.consent_choice(pg_catalog.text, pg_catalog.timestamptz) from public;
revoke all on function public.consent_choice(pg_catalog.text, pg_catalog.timestamptz) from authenticated;
grant execute on function public.consent_choice(pg_catalog.text, pg_catalog.timestamptz) to anon;

comment on function public.consent_choice(pg_catalog.text, pg_catalog.timestamptz) is
  'Latest consent_log row for the bound consent subject under p_policy_version, as of p_as_of (null = now). 0 or 1 row, no arrays. EXECUTE: anon only (GET /api/consent/state via asAnon). Phase 29 adds its own role grant.';

-- 20261012270000_reviews_language.sql
--
-- Phase 32 plan 02 (D-09, T-32-08). Home-page reviews get a translate-on-tap button. For that a
-- review needs (1) the language it is written in and (2) a public handle that is not its row id
-- (Security S10, 2026-10-05: the public list carries no row id).
--
--   reviews.language            ISO 639-1 code, null until the review job detects it (after every
--                               staff create or body change, and from the nightly backlog).
--   review_ref(body)            opaque 16-hex handle = first 16 hex of sha256(body). The public list
--                               sends it; the translate route resolves it.
--   review_translation_source   resolves a ref to the body and language of a PUBLISHED review only.
--   system_review_language_*    the review job's reader and writer (vamos_system only).
--
-- Column grants (20261005120000): a new column is invisible to lib/public/reviews.ts until it is
-- granted, so both grant blocks are repeated with `language` appended. No other role changes.
-- No table or column is dropped. No amount.

begin;

alter table public.reviews
  add column language text constraint reviews_language_check check (language ~ '^[a-z]{2}$');

comment on column public.reviews.language is
  'Phase 32 (D-09): ISO 639-1 language of body, set by the review job (system_review_language_set). Null until detected.';

grant select (
  id, source, author_name, author_role, body, rating, route_label, vehicle_class_id,
  avatar_path, source_url, verified, published, sort_order, created_at,
  language
) on public.reviews to anon, vamos_public;

grant select (
  id, source, author_name, author_role, body, rating, route_label, vehicle_class_id,
  avatar_path, source_url, verified, published, sort_order, created_at,
  booking_id,
  language
) on public.reviews to authenticated;

-- ---------------------------------------------------------------------------
-- Opaque public handle. Same body, same ref; a body change gives a new ref.
-- ---------------------------------------------------------------------------
create or replace function public.review_ref(p_body pg_catalog.text)
returns pg_catalog.text
language sql
immutable
parallel safe
security definer
set search_path = ''
as $$
  select pg_catalog.left(
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_body, 'UTF8')), 'hex'),
    16
  )
$$;

revoke all on function public.review_ref(text) from public;
grant execute on function public.review_ref(text) to anon, vamos_public, authenticated, vamos_system;

comment on function public.review_ref(pg_catalog.text) is
  'Phase 32 (D-09, T-32-08): opaque 16-hex public handle of a review (sha256 of its body), never the row id. EXECUTE: anon, vamos_public, authenticated, vamos_system.';

-- ---------------------------------------------------------------------------
-- Public: the body and language behind a ref, published reviews only.
-- ---------------------------------------------------------------------------
create or replace function public.review_translation_source(p_ref pg_catalog.text)
returns table (body pg_catalog.text, language pg_catalog.text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.body, r.language
    from public.reviews as r
   where p_ref ~ '^[0-9a-f]{16}$'
     and r.published
     and public.review_ref(r.body) = p_ref
   order by r.sort_order asc, r.created_at desc
   limit 1
$$;

revoke all on function public.review_translation_source(pg_catalog.text) from public;
grant execute on function public.review_translation_source(pg_catalog.text) to anon, vamos_public, vamos_system;

comment on function public.review_translation_source(pg_catalog.text) is
  'Phase 32 (D-09, T-32-08): body and language of the published review behind an opaque ref; nothing for an unpublished review or an unknown ref. EXECUTE: anon, vamos_public, vamos_system.';

-- ---------------------------------------------------------------------------
-- The review job (vamos_system): read a review by id, then store its detected language.
-- ---------------------------------------------------------------------------
create or replace function public.system_review_language_source(p_review_id pg_catalog.uuid)
returns table (body pg_catalog.text, language pg_catalog.text, published pg_catalog.bool)
language sql
stable
security definer
set search_path = ''
as $$
  select r.body, r.language, r.published
    from public.reviews as r
   where r.id = p_review_id
$$;

create or replace function public.system_review_language_set(p_review_id pg_catalog.uuid, p_lang pg_catalog.text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_lang is null or p_lang !~ '^[a-z]{2}$' then
    raise exception 'system_review_language_set: language must be an ISO 639-1 code' using errcode = '22023';
  end if;

  update public.reviews
     set language = p_lang
   where id = p_review_id
     and language is distinct from p_lang;
end
$$;

do $$
declare
  f pg_catalog.regprocedure;
begin
  foreach f in array array[
    'public.system_review_language_source(pg_catalog.uuid)',
    'public.system_review_language_set(pg_catalog.uuid, pg_catalog.text)'
  ]::pg_catalog.regprocedure[]
  loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated', f);
    execute pg_catalog.format('grant execute on function %s to vamos_system', f);
    execute pg_catalog.format(
      'comment on function %s is %L', f,
      'Phase 32 (D-09): review language job (runs after every staff create or body change, and nightly for rows still null). EXECUTE: vamos_system only.'
    );
  end loop;
end
$$;

commit;

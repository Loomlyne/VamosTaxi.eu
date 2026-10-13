-- 20261012260000_translations_cache.sql
--
-- Phase 32 plan 02 (F-05, F-06, D-09). The public-safe translation cache. One row per
-- (source text, target language): the key is source_hash = sha256_hex(source_lang + "\n" +
-- normalised source) computed by apps/web/lib/translate/hash.ts. prompt_version is a column, not
-- part of the key, so a house-rule bump re-translates machine rows without orphaning a human row.
--
-- Public-safe only: the one allowed context is 'review' (published home-page reviews, already
-- public). Customer text (support messages, booking notes) never enters this table: it lives in the
-- staff-only tables of 20261012280000 (RESEARCH pitfall 3, T-32-07).
--
-- Human wins (F-05, T-32-09): system_translation_put_machine upserts with a conflict clause that
-- updates machine rows only, and system_translation_mark never touches a human or a done row.
-- Every write goes through SECURITY DEFINER functions: vamos_system is definer-only (no table grant).
-- No table or column is dropped. No amount.

begin;

create table public.translations (
  id bigint generated always as identity primary key,
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  -- A review may be written in any language (reviews.language is any ISO 639-1 code).
  source_lang text not null check (source_lang ~ '^[a-z]{2,3}$'),
  target_lang text not null check (target_lang in ('en', 'de', 'fr', 'ar')),
  source_text text not null check (char_length(source_text) between 1 and 4000),
  translated_text text check (translated_text is null or char_length(translated_text) between 1 and 8000),
  origin text not null default 'machine' check (origin in ('machine', 'human')),
  status text not null default 'pending' check (status in ('pending', 'done', 'rejected', 'failed')),
  context text not null check (context in ('review')),
  -- null on a row that never had an accepted answer (a mark before any put).
  prompt_version integer check (prompt_version is null or prompt_version >= 1),
  attempts integer not null default 0 check (attempts >= 0),
  -- A reason code from lib/translate (e.g. 'guard', 'timeout'), never model output or source text.
  last_error text check (last_error is null or last_error ~ '^[a-z_]{1,40}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint translations_target_differs check (target_lang <> source_lang),
  constraint translations_done_has_text check (status <> 'done' or (translated_text is not null and prompt_version is not null)),
  constraint translations_hash_lang_key unique (source_hash, target_lang)
);

create index translations_retry_idx on public.translations (status)
  where status in ('pending', 'failed');

alter table public.translations enable row level security;
revoke all on table public.translations
  from public, anon, authenticated, vamos_public, vamos_edge, vamos_guest, vamos_staff, vamos_checkout, vamos_system;

create trigger audit_translations
  after insert or update or delete on public.translations
  for each row execute function public.tg_audit_row();

comment on table public.translations is
  'Phase 32 (F-05, F-06, D-09): public-safe translation cache keyed by (source_hash, target_lang). Context review only; customer text never here. No table grant: read through translation_read(), written through system_translation_put_machine() / system_translation_mark() (vamos_system). A machine write never overwrites a human row.';

-- ---------------------------------------------------------------------------
-- Read (public): the review translate-on-tap route reads the cache before any model call.
-- ---------------------------------------------------------------------------
create or replace function public.translation_read(p_hash pg_catalog.text, p_lang pg_catalog.text)
returns table (
  translated_text pg_catalog.text,
  status pg_catalog.text,
  attempts pg_catalog.int4,
  updated_at pg_catalog.timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.translated_text, t.status, t.attempts, t.updated_at
    from public.translations as t
   where t.source_hash = p_hash
     and t.target_lang = p_lang
     and t.context = 'review'
$$;

revoke all on function public.translation_read(pg_catalog.text, pg_catalog.text) from public;
grant execute on function public.translation_read(pg_catalog.text, pg_catalog.text)
  to anon, vamos_public, vamos_system;

comment on function public.translation_read(pg_catalog.text, pg_catalog.text) is
  'Phase 32 (D-09, T-32-07): cached translation of one public review text into one language; rows of context review only. EXECUTE: anon, vamos_public, vamos_system.';

-- ---------------------------------------------------------------------------
-- Machine write: insert or refresh a machine row; a human row is left exactly as it is.
-- Returns the stored row after the write, so the caller serves a human text when one exists.
-- ---------------------------------------------------------------------------
create or replace function public.system_translation_put_machine(
  p_hash pg_catalog.text,
  p_source_lang pg_catalog.text,
  p_target_lang pg_catalog.text,
  p_source_text pg_catalog.text,
  p_text pg_catalog.text,
  p_context pg_catalog.text,
  p_prompt_version pg_catalog.int4
)
returns table (translated_text pg_catalog.text, origin pg_catalog.text, status pg_catalog.text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_text is null or pg_catalog.btrim(p_text) = '' then
    raise exception 'system_translation_put_machine: empty translation' using errcode = '22023';
  end if;

  insert into public.translations
    (source_hash, source_lang, target_lang, source_text, translated_text, origin, status, context,
     prompt_version, attempts, last_error, updated_at, updated_by)
  values
    (p_hash, p_source_lang, p_target_lang, p_source_text, p_text, 'machine', 'done', p_context,
     p_prompt_version, 1, null, pg_catalog.now(), null)
  on conflict (source_hash, target_lang) do update
     set source_lang = excluded.source_lang,
         source_text = excluded.source_text,
         translated_text = excluded.translated_text,
         status = 'done',
         context = excluded.context,
         prompt_version = excluded.prompt_version,
         attempts = translations.attempts + 1,
         last_error = null,
         updated_at = pg_catalog.now(),
         updated_by = null
   where translations.origin = 'machine';

  return query
    select t.translated_text, t.origin, t.status
      from public.translations as t
     where t.source_hash = p_hash
       and t.target_lang = p_target_lang;
end
$$;

-- ---------------------------------------------------------------------------
-- Record a rejected or failed attempt (reason code only). Never touches a human row or a row that
-- already holds an accepted text: a failed re-translation keeps the earlier good answer.
-- ---------------------------------------------------------------------------
create or replace function public.system_translation_mark(
  p_hash pg_catalog.text,
  p_target_lang pg_catalog.text,
  p_source_lang pg_catalog.text,
  p_source_text pg_catalog.text,
  p_context pg_catalog.text,
  p_status pg_catalog.text,
  p_reason pg_catalog.text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason pg_catalog.text := case
    when p_reason ~ '^[a-z_]{1,40}$' then p_reason
    else 'other'
  end;
begin
  if p_status is null or p_status not in ('rejected', 'failed') then
    raise exception 'system_translation_mark: status must be rejected or failed' using errcode = '22023';
  end if;

  insert into public.translations
    (source_hash, source_lang, target_lang, source_text, translated_text, origin, status, context,
     prompt_version, attempts, last_error, updated_at, updated_by)
  values
    (p_hash, p_source_lang, p_target_lang, p_source_text, null, 'machine', p_status, p_context,
     null, 1, v_reason, pg_catalog.now(), null)
  on conflict (source_hash, target_lang) do update
     set status = excluded.status,
         attempts = translations.attempts + 1,
         last_error = excluded.last_error,
         updated_at = pg_catalog.now()
   where translations.origin <> 'human'
     and translations.status <> 'done';
end
$$;

-- ---------------------------------------------------------------------------
-- House-rule bump (plan 32-05, F-06): the nightly sweep re-queues machine rows written under an older
-- prompt_version. Human rows are never listed and never returned (F-05). Ids only from the list; the
-- job reads the source at run time and re-checks origin and version, so a row that turned human (or was
-- refreshed) between the sweep and the job is skipped.
-- ---------------------------------------------------------------------------
create or replace function public.system_translation_stale(p_prompt_version pg_catalog.int4, p_limit pg_catalog.int4)
returns table (id pg_catalog.text, origin pg_catalog.text, prompt_version pg_catalog.int4)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id::pg_catalog.text, t.origin, t.prompt_version
    from public.translations as t
   where t.origin = 'machine'
     and t.prompt_version is not null
     and t.prompt_version < p_prompt_version
   order by t.updated_at, t.id
   limit least(greatest(coalesce(p_limit, 100), 1), 200)
$$;

create or replace function public.system_translation_stale_source(p_id pg_catalog.int8, p_prompt_version pg_catalog.int4)
returns table (
  source_hash pg_catalog.text,
  source_lang pg_catalog.text,
  target_lang pg_catalog.text,
  source_text pg_catalog.text,
  context pg_catalog.text
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.source_hash, t.source_lang, t.target_lang, t.source_text, t.context
    from public.translations as t
   where t.id = p_id
     and t.origin = 'machine'
     and t.prompt_version is not null
     and t.prompt_version < p_prompt_version
$$;

do $$
declare
  f pg_catalog.regprocedure;
begin
  foreach f in array array[
    'public.system_translation_put_machine(pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.int4)',
    'public.system_translation_mark(pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text)',
    'public.system_translation_stale(pg_catalog.int4, pg_catalog.int4)',
    'public.system_translation_stale_source(pg_catalog.int8, pg_catalog.int4)'
  ]::pg_catalog.regprocedure[]
  loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated', f);
    execute pg_catalog.format('grant execute on function %s to vamos_system', f);
    execute pg_catalog.format(
      'comment on function %s is %L', f,
      'Phase 32 (F-05, F-06, T-32-09): translation cache writer; a machine write never overwrites a human row. EXECUTE: vamos_system only.'
    );
  end loop;
end
$$;

comment on function public.system_translation_stale(pg_catalog.int4, pg_catalog.int4) is
  'Phase 32 plan 05 (F-06): ids of machine rows written under an older prompt_version, for the nightly re-queue. Human rows never listed. EXECUTE: vamos_system only.';
comment on function public.system_translation_stale_source(pg_catalog.int8, pg_catalog.int4) is
  'Phase 32 plan 05 (F-06): source of one stale machine row for the re-translation job; nothing for a human or current row. EXECUTE: vamos_system only.';

commit;

-- 20261012280000_support_and_note_translations.sql
--
-- Phase 32 plan 02 (D-01, D-07, D-08, D-12; RESEARCH pitfall 3; T-32-06, T-32-10). Customer text is
-- translated for him (into his dashboard language and the other site languages) and stored ONLY here,
-- in two staff-only tables. It never enters public.translations, which feeds a public endpoint.
--
--   support_messages.detected_lang   the language the customer wrote in (any ISO 639 code, 'und' allowed).
--   support_message_translations     one row per (message, target language).
--   booking_note_translations        one row per (booking, target language) for the CURRENT note: the
--                                    note's sha256 (note_hash) is stored with each row; a changed note
--                                    gives a new hash and the old rows are replaced. D-12: stored, no
--                                    screen shows them until he signs a design.
--
-- No column is added to public.bookings (the customer column-grant list stays untouched).
-- An erased booking (bookings.erased_at set by staff_erase_unpaid_booking) is never read, written or
-- listed here: its note never reaches the translator (PR #83 review, privacy).
-- Both tables: enable + force RLS, every client role revoked, vamos_staff SELECT through app.is_staff().
-- Writes: SECURITY DEFINER system_* functions, EXECUTE vamos_system only (vamos_system is definer-only).
-- jsonb parameters, never arrays (the Worker pg client has no array types). No table or column is
-- dropped. No amount.

begin;

-- ---------------------------------------------------------------------------
-- support_messages.detected_lang
-- ---------------------------------------------------------------------------
alter table public.support_messages
  add column detected_lang text
  constraint support_messages_detected_lang_check check (detected_lang ~ '^[a-z]{2,3}$');

comment on column public.support_messages.detected_lang is
  'Phase 32: language the customer wrote in (ISO 639, und when unknown), set by the translate job. Null until detected.';

-- ---------------------------------------------------------------------------
-- support_message_translations (staff-only)
-- ---------------------------------------------------------------------------
create table public.support_message_translations (
  message_id uuid not null references public.support_messages (id) on delete cascade,
  target_lang text not null check (target_lang in ('en', 'de', 'fr', 'ar')),
  body text check (body is null or char_length(body) between 1 and 8000),
  status text not null check (status in ('done', 'failed', 'rejected')),
  prompt_version integer check (prompt_version is null or prompt_version >= 1),
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now(),
  primary key (message_id, target_lang),
  constraint support_message_translations_done_has_body check (status <> 'done' or body is not null)
);

alter table public.support_message_translations enable row level security;
alter table public.support_message_translations force row level security;
revoke all on table public.support_message_translations
  from public, vamos_public, vamos_edge, vamos_guest, anon, authenticated, vamos_checkout, vamos_system;
grant select on table public.support_message_translations to vamos_staff;

create policy support_message_translations_staff_select
  on public.support_message_translations
  for select
  to vamos_staff
  using ((select app.is_staff()));

comment on table public.support_message_translations is
  'Phase 32 (RESEARCH pitfall 3, T-32-06): translations of customer support messages. Staff SELECT only (app.is_staff()); written by system_support_translation_put / _fail (vamos_system). Never public.';

-- ---------------------------------------------------------------------------
-- booking_note_translations (staff-only)
-- ---------------------------------------------------------------------------
create table public.booking_note_translations (
  booking_id uuid not null references public.bookings (id) on delete cascade,
  source_lang text check (source_lang ~ '^[a-z]{2,3}$'),
  target_lang text not null check (target_lang in ('en', 'de', 'fr', 'ar')),
  body text check (body is null or char_length(body) between 1 and 8000),
  status text not null check (status in ('done', 'failed', 'rejected')),
  prompt_version integer check (prompt_version is null or prompt_version >= 1),
  attempts integer not null default 0 check (attempts >= 0),
  note_hash text not null check (note_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now(),
  primary key (booking_id, target_lang),
  constraint booking_note_translations_done_has_body check (status <> 'done' or body is not null)
);

alter table public.booking_note_translations enable row level security;
alter table public.booking_note_translations force row level security;
revoke all on table public.booking_note_translations
  from public, vamos_public, vamos_edge, vamos_guest, anon, authenticated, vamos_checkout, vamos_system;
grant select on table public.booking_note_translations to vamos_staff;

create policy booking_note_translations_staff_select
  on public.booking_note_translations
  for select
  to vamos_staff
  using ((select app.is_staff()));

comment on table public.booking_note_translations is
  'Phase 32 (D-12, T-32-06): translations of the customer''s current booking note (note_hash = sha256 of bookings.note). Staff SELECT only (app.is_staff()); written by system_booking_note_translation_put / _fail (vamos_system). No screen shows them until he signs a design.';

-- ---------------------------------------------------------------------------
-- Support message: readers
-- ---------------------------------------------------------------------------
create or replace function public.system_support_translation_source(p_message_id pg_catalog.uuid)
returns table (
  body_text pg_catalog.text,
  direction pg_catalog.text,
  form_locale pg_catalog.text,
  detected_lang pg_catalog.text
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.body_text, m.direction, s.locale, m.detected_lang
    from public.support_messages as m
    join public.contact_submissions as s on s.id = m.submission_id
   where m.id = p_message_id
$$;

create or replace function public.system_support_form_message_id(p_submission_id pg_catalog.uuid)
returns pg_catalog.uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
    from public.support_messages as m
   where m.submission_id = p_submission_id
     and m.direction = 'inbound_form'
   order by m.created_at asc, m.id asc
   limit 1
$$;

-- ---------------------------------------------------------------------------
-- Support message: writers
-- p_rows = { "<en|de|fr|ar>": { "body": text|null, "status": "done"|"rejected", "prompt_version": int? } }
-- Unknown keys and unknown statuses are ignored; a done entry without a usable body (blank or longer
-- than 8000 characters) is stored as rejected with no body. A rejected answer never replaces a done one.
-- ---------------------------------------------------------------------------
create or replace function public.system_support_translation_put(
  p_message_id pg_catalog.uuid,
  p_detected pg_catalog.text,
  p_rows pg_catalog.jsonb
)
returns pg_catalog.int4
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows pg_catalog.jsonb := p_rows;
  v_detected pg_catalog.text := pg_catalog.lower(pg_catalog.btrim(p_detected));
  v_lang pg_catalog.text;
  v_entry pg_catalog.jsonb;
  v_status pg_catalog.text;
  v_body pg_catalog.text;
  v_pv pg_catalog.int4;
  v_written pg_catalog.int4 := 0;
begin
  if v_rows is not null and pg_catalog.jsonb_typeof(v_rows) = 'string' then
    v_rows := (v_rows #>> '{}')::pg_catalog.jsonb;
  end if;
  if v_rows is null or pg_catalog.jsonb_typeof(v_rows) <> 'object' then
    raise exception 'system_support_translation_put: rows must be a JSON object' using errcode = '22023';
  end if;
  if v_detected is not null and v_detected !~ '^[a-z]{2,3}$' then
    v_detected := null;
  end if;

  perform 1 from public.support_messages as m where m.id = p_message_id for update;
  if not found then
    return 0;
  end if;

  if v_detected is not null then
    update public.support_messages as m set detected_lang = v_detected where m.id = p_message_id;
  end if;

  foreach v_lang in array array['en', 'de', 'fr', 'ar']::pg_catalog.text[] loop
    v_entry := v_rows -> v_lang;
    continue when v_entry is null or pg_catalog.jsonb_typeof(v_entry) <> 'object';
    v_status := v_entry ->> 'status';
    continue when v_status is null or v_status not in ('done', 'rejected');
    v_body := null;
    if v_status = 'done' then
      v_body := case when pg_catalog.jsonb_typeof(v_entry -> 'body') = 'string' then v_entry ->> 'body' end;
      if v_body is null or pg_catalog.btrim(v_body) = '' or pg_catalog.char_length(v_body) > 8000 then
        v_status := 'rejected';
        v_body := null;
      end if;
    end if;
    v_pv := case when (v_entry ->> 'prompt_version') ~ '^[1-9][0-9]{0,5}$' then (v_entry ->> 'prompt_version')::pg_catalog.int4 end;

    insert into public.support_message_translations as t
      (message_id, target_lang, body, status, prompt_version, attempts, updated_at)
    values
      (p_message_id, v_lang, v_body, v_status, v_pv, 1, pg_catalog.now())
    on conflict (message_id, target_lang) do update
       set body = excluded.body,
           status = excluded.status,
           prompt_version = excluded.prompt_version,
           attempts = t.attempts + 1,
           updated_at = pg_catalog.now()
     where t.status <> 'done' or excluded.status = 'done';
    v_written := v_written + 1;
  end loop;

  return v_written;
end
$$;

-- The DLQ path: all four targets failed, unless a done row already exists for the message.
create or replace function public.system_support_translation_fail(p_message_id pg_catalog.uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.support_messages as m where m.id = p_message_id for update;
  if not found then
    return;
  end if;
  if exists (
    select 1 from public.support_message_translations as d
     where d.message_id = p_message_id and d.status = 'done'
  ) then
    return;
  end if;

  insert into public.support_message_translations as t
    (message_id, target_lang, body, status, prompt_version, attempts, updated_at)
  select p_message_id, l.lang, null, 'failed', null, 1, pg_catalog.now()
    from pg_catalog.unnest(array['en', 'de', 'fr', 'ar']::pg_catalog.text[]) as l (lang)
  on conflict (message_id, target_lang) do update
     set status = 'failed',
         body = null,
         attempts = t.attempts + 1,
         updated_at = pg_catalog.now()
   where t.status <> 'done';
end
$$;

-- ---------------------------------------------------------------------------
-- Booking note: reader and writers. The hash is sha256 of the stored note text; a job queued for an
-- older note (stale hash) writes nothing. An erased booking returns no source and takes no write.
-- ---------------------------------------------------------------------------
-- has_done: a done row already exists for this note_hash, so the job skips the model call (a retry or a
-- duplicate delivery never translates the same note twice; PR #83 review).
create or replace function public.system_booking_note_source(p_booking_id pg_catalog.uuid)
returns table (note pg_catalog.text, note_hash pg_catalog.text, has_done pg_catalog.bool)
language sql
stable
security definer
set search_path = ''
as $$
  select s.note,
         s.note_hash,
         exists (
           select 1 from public.booking_note_translations as t
            where t.booking_id = p_booking_id and t.note_hash = s.note_hash and t.status = 'done'
         )
    from (
      select b.note,
             pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(b.note, 'UTF8')), 'hex') as note_hash
        from public.bookings as b
       where b.id = p_booking_id
         and b.erased_at is null
         and pg_catalog.btrim(b.note) <> ''
    ) as s
$$;

create or replace function public.system_booking_note_translation_put(
  p_booking_id pg_catalog.uuid,
  p_detected pg_catalog.text,
  p_note_hash pg_catalog.text,
  p_rows pg_catalog.jsonb
)
returns pg_catalog.int4
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows pg_catalog.jsonb := p_rows;
  v_detected pg_catalog.text := pg_catalog.lower(pg_catalog.btrim(p_detected));
  v_note pg_catalog.text;
  v_lang pg_catalog.text;
  v_entry pg_catalog.jsonb;
  v_status pg_catalog.text;
  v_body pg_catalog.text;
  v_pv pg_catalog.int4;
  v_written pg_catalog.int4 := 0;
begin
  if v_rows is not null and pg_catalog.jsonb_typeof(v_rows) = 'string' then
    v_rows := (v_rows #>> '{}')::pg_catalog.jsonb;
  end if;
  if v_rows is null or pg_catalog.jsonb_typeof(v_rows) <> 'object' then
    raise exception 'system_booking_note_translation_put: rows must be a JSON object' using errcode = '22023';
  end if;
  if v_detected is not null and v_detected !~ '^[a-z]{2,3}$' then
    v_detected := null;
  end if;

  select b.note into v_note from public.bookings as b
   where b.id = p_booking_id and b.erased_at is null
     for update;
  if not found or pg_catalog.btrim(v_note) = ''
     or p_note_hash is distinct from pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_note, 'UTF8')), 'hex') then
    return 0;  -- erased booking, no note, or the note changed since the job was queued
  end if;

  -- Rows of an earlier note go: the table holds the current note's translations only.
  delete from public.booking_note_translations as o
   where o.booking_id = p_booking_id and o.note_hash <> p_note_hash;

  foreach v_lang in array array['en', 'de', 'fr', 'ar']::pg_catalog.text[] loop
    v_entry := v_rows -> v_lang;
    continue when v_entry is null or pg_catalog.jsonb_typeof(v_entry) <> 'object';
    v_status := v_entry ->> 'status';
    continue when v_status is null or v_status not in ('done', 'rejected');
    v_body := null;
    if v_status = 'done' then
      v_body := case when pg_catalog.jsonb_typeof(v_entry -> 'body') = 'string' then v_entry ->> 'body' end;
      if v_body is null or pg_catalog.btrim(v_body) = '' or pg_catalog.char_length(v_body) > 8000 then
        v_status := 'rejected';
        v_body := null;
      end if;
    end if;
    v_pv := case when (v_entry ->> 'prompt_version') ~ '^[1-9][0-9]{0,5}$' then (v_entry ->> 'prompt_version')::pg_catalog.int4 end;

    -- A done row for the same note_hash is final: a second answer (retry, duplicate delivery) neither
    -- overwrites it nor counts an attempt (PR #83 review). Only rows actually written are counted.
    insert into public.booking_note_translations as t
      (booking_id, source_lang, target_lang, body, status, prompt_version, attempts, note_hash, updated_at)
    values
      (p_booking_id, v_detected, v_lang, v_body, v_status, v_pv, 1, p_note_hash, pg_catalog.now())
    on conflict (booking_id, target_lang) do update
       set source_lang = coalesce(excluded.source_lang, t.source_lang),
           body = excluded.body,
           status = excluded.status,
           prompt_version = excluded.prompt_version,
           note_hash = excluded.note_hash,
           attempts = t.attempts + 1,
           updated_at = pg_catalog.now()
     where t.status <> 'done' or t.note_hash <> excluded.note_hash;
    if found then
      v_written := v_written + 1;
    end if;
  end loop;

  return v_written;
end
$$;

-- The DLQ path for note jobs: all four targets failed for that note_hash, unless a done row exists
-- for it. A stale hash (the note changed since the job was queued) writes nothing.
create or replace function public.system_booking_note_translation_fail(
  p_booking_id pg_catalog.uuid,
  p_note_hash pg_catalog.text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note pg_catalog.text;
begin
  select b.note into v_note from public.bookings as b
   where b.id = p_booking_id and b.erased_at is null
     for update;
  if not found or pg_catalog.btrim(v_note) = ''
     or p_note_hash is distinct from pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_note, 'UTF8')), 'hex') then
    return;
  end if;
  if exists (
    select 1 from public.booking_note_translations as d
     where d.booking_id = p_booking_id and d.note_hash = p_note_hash and d.status = 'done'
  ) then
    return;
  end if;

  delete from public.booking_note_translations as o
   where o.booking_id = p_booking_id and o.note_hash <> p_note_hash;

  insert into public.booking_note_translations as t
    (booking_id, source_lang, target_lang, body, status, prompt_version, attempts, note_hash, updated_at)
  select p_booking_id, null, l.lang, null, 'failed', null, 1, p_note_hash, pg_catalog.now()
    from pg_catalog.unnest(array['en', 'de', 'fr', 'ar']::pg_catalog.text[]) as l (lang)
  on conflict (booking_id, target_lang) do update
     set status = 'failed',
         body = null,
         attempts = t.attempts + 1,
         updated_at = pg_catalog.now()
   where t.status <> 'done';
end
$$;

-- ---------------------------------------------------------------------------
-- Nightly backlog: what still needs a translation job. Kinds match lib/translate/jobs-contract.ts
-- ('support', 'note', 'review'). Ids only, never text. A failed item is retried when every row of it is
-- failed, fewer than 10 attempts were made and the last one is more than 24 hours old.
-- ---------------------------------------------------------------------------
create or replace function public.system_translation_backlog(p_limit pg_catalog.int4)
returns table (kind pg_catalog.text, id pg_catalog.text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit pg_catalog.int4 := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  return query
  select x.kind, x.id
    from (
      (select 'support'::pg_catalog.text as kind, m.id::pg_catalog.text as id, 1 as ord, m.created_at as at
         from public.support_messages as m
        where m.direction in ('inbound_form', 'inbound_email')
          and not exists (
                select 1 from public.support_message_translations as t
                 where t.message_id = m.id
                   and (t.status <> 'failed' or t.attempts >= 10
                        or t.updated_at > pg_catalog.now() - interval '24 hours'))
        order by m.created_at desc
        limit v_limit)
      union all
      (select 'note'::pg_catalog.text, b.id::pg_catalog.text, 2, b.created_at
         from public.bookings as b
        where b.erased_at is null
          and pg_catalog.btrim(b.note) <> ''
          and not exists (
                select 1 from public.booking_note_translations as t
                 where t.booking_id = b.id
                   and t.note_hash = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(b.note, 'UTF8')), 'hex')
                   and (t.status <> 'failed' or t.attempts >= 10
                        or t.updated_at > pg_catalog.now() - interval '24 hours'))
        order by b.created_at desc
        limit v_limit)
      union all
      (select 'review'::pg_catalog.text, r.id::pg_catalog.text, 3, r.created_at
         from public.reviews as r
        where r.published
          and r.language is null
        order by r.created_at desc
        limit v_limit)
    ) as x
   order by x.ord, x.at desc
   limit v_limit;
end
$$;

-- ---------------------------------------------------------------------------
-- Grants: vamos_system only
-- ---------------------------------------------------------------------------
do $$
declare
  f pg_catalog.regprocedure;
begin
  foreach f in array array[
    'public.system_support_translation_source(pg_catalog.uuid)',
    'public.system_support_form_message_id(pg_catalog.uuid)',
    'public.system_support_translation_put(pg_catalog.uuid, pg_catalog.text, pg_catalog.jsonb)',
    'public.system_support_translation_fail(pg_catalog.uuid)',
    'public.system_booking_note_source(pg_catalog.uuid)',
    'public.system_booking_note_translation_put(pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.jsonb)',
    'public.system_booking_note_translation_fail(pg_catalog.uuid, pg_catalog.text)',
    'public.system_translation_backlog(pg_catalog.int4)'
  ]::pg_catalog.regprocedure[]
  loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated', f);
    execute pg_catalog.format('grant execute on function %s to vamos_system', f);
    execute pg_catalog.format(
      'comment on function %s is %L', f,
      'Phase 32 (T-32-06, T-32-10): customer-text translation job (support messages, booking notes, backlog). Staff-only tables, never public. EXECUTE: vamos_system only.'
    );
  end loop;
end
$$;

commit;

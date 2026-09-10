-- 20260904182631_contact_ticket_schema.sql
--
-- Reconstruct hosted contact_ticket_schema for local db:reset.
-- Historical CHECK is four statuses (new/open/replied/closed). `responded` is 20260910180000.
-- Do not MCP-apply this version — hosted schema_migrations already has it.

alter table public.contact_submissions
  add column if not exists ticket_status text;
alter table public.contact_submissions
  add column if not exists reply_token text;
alter table public.contact_submissions
  add column if not exists last_activity_at timestamptz;
alter table public.contact_submissions
  add column if not exists closed_at timestamptz;

update public.contact_submissions
   set ticket_status = coalesce(nullif(ticket_status, ''), 'new'),
       reply_token = coalesce(
         nullif(reply_token, ''),
         replace(extensions.gen_random_uuid()::text, '-'::text, ''::text)
       ),
       last_activity_at = coalesce(last_activity_at, created_at, now())
 where ticket_status is null
    or ticket_status = ''
    or reply_token is null
    or reply_token = ''
    or last_activity_at is null;

alter table public.contact_submissions
  alter column ticket_status set default 'new';
alter table public.contact_submissions
  alter column ticket_status set not null;
alter table public.contact_submissions
  alter column reply_token set default replace((extensions.gen_random_uuid())::text, '-'::text, ''::text);
alter table public.contact_submissions
  alter column reply_token set not null;
alter table public.contact_submissions
  alter column last_activity_at set default now();
alter table public.contact_submissions
  alter column last_activity_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'contact_submissions_ticket_status_check'
       and conrelid = 'public.contact_submissions'::regclass
  ) then
    alter table public.contact_submissions
      add constraint contact_submissions_ticket_status_check
      check (ticket_status in ('new', 'open', 'replied', 'closed'));
  end if;
end $$;

create unique index if not exists contact_submissions_reply_token_key
  on public.contact_submissions (reply_token);

create table if not exists public.support_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  submission_id uuid not null references public.contact_submissions (id) on delete cascade,
  direction text not null,
  body_text text not null,
  body_html text,
  actor_user_id uuid,
  resend_email_id text,
  rfc_message_id text,
  from_address extensions.citext,
  created_at timestamptz not null default now(),
  constraint support_messages_direction_check
    check (direction in ('inbound_form', 'outbound_staff', 'inbound_email')),
  constraint support_messages_body_text_check
    check (char_length(body_text) between 1 and 8000)
);

create index if not exists support_messages_submission_created_idx
  on public.support_messages (submission_id, created_at);

create table if not exists public.support_inbound_events (
  email_id text primary key,
  created_at timestamptz not null default now()
);

comment on table public.support_messages is
  'Ops Support thread. Directions inbound_form / outbound_staff / inbound_email. Writes: DEFINER RPC + staff insert.';
comment on table public.support_inbound_events is
  'Resend inbound idempotency (email_id). Phase 14 owns inserts. No staff grants.';

insert into public.support_messages (submission_id, direction, body_text)
select s.id, 'inbound_form', s.message
  from public.contact_submissions s
 where not exists (
         select 1
           from public.support_messages m
          where m.submission_id = s.id
       )
   and char_length(s.message) between 1 and 8000;

alter table public.support_messages enable row level security;
alter table public.support_messages force row level security;
alter table public.support_inbound_events enable row level security;
alter table public.support_inbound_events force row level security;

revoke all on table public.support_messages from public, vamos_public, vamos_edge, vamos_guest, anon, authenticated;
revoke all on table public.support_inbound_events from public, vamos_public, vamos_edge, vamos_guest, anon, authenticated;

grant select, update on table public.contact_submissions to vamos_staff;
grant select, insert on table public.support_messages to vamos_staff;

drop policy if exists contact_submissions_staff_update on public.contact_submissions;
create policy contact_submissions_staff_update
  on public.contact_submissions
  for update
  to vamos_staff
  using ((select app.is_staff()))
  with check ((select app.is_staff()));

drop policy if exists support_messages_staff_select on public.support_messages;
create policy support_messages_staff_select
  on public.support_messages
  for select
  to vamos_staff
  using ((select app.is_staff()));

drop policy if exists support_messages_staff_insert on public.support_messages;
create policy support_messages_staff_insert
  on public.support_messages
  for insert
  to vamos_staff
  with check ((select app.is_staff()));

create or replace function public.submit_contact_message(
  p_idempotency_key text,
  p_name text,
  p_email extensions.citext,
  p_phone text,
  p_booking_ref text,
  p_message text,
  p_locale text
) returns table (id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_token text;
begin
  v_token := replace(extensions.gen_random_uuid()::text, '-', '');

  insert into public.contact_submissions (
    idempotency_key, name, email, phone, booking_ref, message, locale,
    ticket_status, reply_token, last_activity_at
  ) values (
    p_idempotency_key, p_name, p_email, coalesce(p_phone, ''), coalesce(p_booking_ref, ''),
    p_message, coalesce(p_locale, 'en'),
    'new', v_token, now()
  )
  on conflict (idempotency_key) do nothing
  returning public.contact_submissions.id into v_id;

  if v_id is null then
    select s.id into v_id
      from public.contact_submissions s
     where s.idempotency_key = p_idempotency_key;
    return query select v_id, false;
    return;
  end if;

  insert into public.support_messages (submission_id, direction, body_text)
  values (v_id, 'inbound_form', p_message);

  return query select v_id, true;
end;
$$;

comment on function public.submit_contact_message(text, text, extensions.citext, text, text, text, text) is
  'SITE-04 / D-23: anon write door. Mints reply_token, ticket_status new, seeds inbound_form. Returns id + created only.';

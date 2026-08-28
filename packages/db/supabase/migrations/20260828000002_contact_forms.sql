-- 20260828000002_contact_forms.sql
--
-- SITE-04, D-21, D-22, D-23.
-- Anonymous write path is a SECURITY DEFINER RPC because Phase 3's asQuote doc comment
-- names that as the house pattern, and because a table grant to anon would give the
-- public role a permanent, policy-only-guarded door onto a table that stores personal data.
-- Form-consent facts on partner_applications are local to this application and are
-- deliberately NOT written to consent_log — D-20: consent_log's method vocabulary is
-- purpose-built for the Phase 10 cookie banner's four categories, not for a generic form.

create table public.contact_submissions (
  id               uuid primary key default extensions.gen_random_uuid(),
  idempotency_key  text not null unique,
  name             text not null check (char_length(name) between 1 and 200),
  email            extensions.citext not null,
  phone            text not null default '' check (char_length(phone) <= 40),
  booking_ref      text not null default '' check (char_length(booking_ref) <= 32),
  message          text not null check (char_length(message) between 1 and 4000),
  locale           text not null default 'en' check (locale in ('en','de','fr','ar')),
  handled_at       timestamptz,
  created_at       timestamptz not null default now()
);
comment on table public.contact_submissions is
  'SITE-04 contact form rows. Writes only via public.submit_contact_message.';

create table public.partner_applications (
  id               uuid primary key default extensions.gen_random_uuid(),
  idempotency_key  text not null unique,
  name             text not null check (char_length(name) between 1 and 200),
  city             text not null default '' check (char_length(city) <= 200),
  phone            text not null default '' check (char_length(phone) <= 40),
  email            extensions.citext not null,
  vehicle          text not null default '' check (char_length(vehicle) <= 200),
  permit           text not null default '' check (char_length(permit) <= 200),
  accepted_terms   boolean not null,
  accepted_privacy boolean not null,
  locale           text not null default 'en' check (locale in ('en','de','fr','ar')),
  handled_at       timestamptz,
  created_at       timestamptz not null default now()
);
comment on table public.partner_applications is
  'SITE-04 partner application rows. V1 has no public partner page; table exists for SITE-04.';

alter table public.contact_submissions enable row level security;
alter table public.partner_applications enable row level security;

create policy contact_submissions_staff_select
  on public.contact_submissions
  for select
  to vamos_staff, authenticated
  using ((select app.is_staff()));

create policy partner_applications_staff_select
  on public.partner_applications
  for select
  to vamos_staff, authenticated
  using ((select app.is_staff()));

revoke all on table public.contact_submissions from public, vamos_public, vamos_edge, vamos_guest, anon;
revoke all on table public.partner_applications from public, vamos_public, vamos_edge, vamos_guest, anon;
grant select on table public.contact_submissions to vamos_staff, authenticated;
grant select on table public.partner_applications to vamos_staff, authenticated;

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
begin
  insert into public.contact_submissions (
    idempotency_key, name, email, phone, booking_ref, message, locale
  ) values (
    p_idempotency_key, p_name, p_email, coalesce(p_phone, ''), coalesce(p_booking_ref, ''),
    p_message, coalesce(p_locale, 'en')
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
  return query select v_id, true;
end;
$$;

comment on function public.submit_contact_message(text, text, extensions.citext, text, text, text, text) is
  'SITE-04 / D-23: anon write door. Idempotent on idempotency_key. Returns id + created only.';

revoke all on function public.submit_contact_message(text, text, extensions.citext, text, text, text, text) from public;
grant execute on function public.submit_contact_message(text, text, extensions.citext, text, text, text, text)
  to anon, authenticated;

create or replace function public.submit_partner_application(
  p_idempotency_key text,
  p_name text,
  p_city text,
  p_phone text,
  p_email extensions.citext,
  p_vehicle text,
  p_permit text,
  p_locale text
) returns table (id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.partner_applications (
    idempotency_key, name, city, phone, email, vehicle, permit,
    accepted_terms, accepted_privacy, locale
  ) values (
    p_idempotency_key, p_name, coalesce(p_city, ''), coalesce(p_phone, ''), p_email,
    coalesce(p_vehicle, ''), coalesce(p_permit, ''), true, true, coalesce(p_locale, 'en')
  )
  on conflict (idempotency_key) do nothing
  returning public.partner_applications.id into v_id;

  if v_id is null then
    select a.id into v_id
      from public.partner_applications a
     where a.idempotency_key = p_idempotency_key;
    return query select v_id, false;
    return;
  end if;
  return query select v_id, true;
end;
$$;

comment on function public.submit_partner_application(text, text, text, text, extensions.citext, text, text, text) is
  'SITE-04 / D-23: anon write door. Idempotent on idempotency_key. Returns id + created only.';

revoke all on function public.submit_partner_application(text, text, text, text, extensions.citext, text, text, text) from public;
grant execute on function public.submit_partner_application(text, text, text, text, extensions.citext, text, text, text)
  to anon, authenticated;

do $$
declare v_ungoverned integer;
begin
  select count(*) into v_ungoverned
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if v_ungoverned > 0 then
    raise exception 'a public table has RLS disabled (% table(s))', v_ungoverned
      using errcode = 'restrict_violation',
            hint = 'Add the table to the array in this migration''s DO block, or a later migration''s own enable statement.';
  end if;
end $$;

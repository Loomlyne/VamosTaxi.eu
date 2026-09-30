-- 20261001100000_account_agreement_records.sql
--
-- Phase 26.5 plan 01 (D-02, D-04, D-05, D-06, D-09, D-12, D-13, D-19).
--
-- The database side of the account choice at checkout:
--   * settings.guest_accounts_live -- the guest-account switch. Defaults false here; the control
--     session sets it at ship (hosted SQL), never this migration.
--   * account_agreement_records -- one dedicated append-only table for every account choice.
--     Storage note (D-06): NOT the cookie table. Phase 27 decides Meta events from the latest
--     cookie-consent row, so an account choice in there would move that decision. The table is
--     shared with /sign-up (Phase 27, D-19): every row names its surface.
--   * five narrow SECURITY DEFINER functions the Worker calls (one write function for both
--     surfaces). No table grant is given to any role.
-- The cookie consent table and its write function are not touched.

-- ---------------------------------------------------------------------------
-- 1. The switch
-- ---------------------------------------------------------------------------

alter table public.settings
  add column guest_accounts_live pg_catalog.bool not null default false;

comment on column public.settings.guest_accounts_live is
  'Set by the control session at the 26.5 ship (D-13); the texts are approved, so the condition is met. Kill switch without deploy.';

-- ---------------------------------------------------------------------------
-- 2. The record table
-- ---------------------------------------------------------------------------

create table public.account_agreement_records (
  id            pg_catalog.int8 generated always as identity primary key,
  surface       pg_catalog.text not null,
  booking_id    pg_catalog.uuid references public.bookings (id) on delete set null,
  email         pg_catalog.text not null,
  choice        pg_catalog.text not null check (choice in ('create', 'guest')),
  record_kind   pg_catalog.text not null check (record_kind in ('consent', 'informed')),
  text_version  pg_catalog.text not null check (pg_catalog.btrim(text_version) <> ''),
  locale        pg_catalog.text not null check (locale in ('en', 'de', 'fr', 'ar')),
  user_agent    pg_catalog.text,
  ip_truncated  pg_catalog.inet,
  recorded_at   pg_catalog.timestamptz not null default pg_catalog.now(),
  constraint account_agreement_records_surface_check check (surface in ('checkout', 'sign-up')),
  constraint account_agreement_records_kind_check check (
    (choice = 'create' and record_kind = 'consent') or (choice = 'guest' and record_kind = 'informed')
  ),
  constraint account_agreement_records_signup_shape_check check (
    surface <> 'sign-up' or (choice = 'create' and booking_id is null)
  )
);

create index account_agreement_records_booking_idx
  on public.account_agreement_records (booking_id, recorded_at desc);
create index account_agreement_records_email_idx
  on public.account_agreement_records (pg_catalog.lower(email), recorded_at desc);

comment on table public.account_agreement_records is
  'One row per account choice. create = consent to Text 1 (tick, D-12); guest = informed by Text 2 (D-13, no consent asked, checkout only). surface says where it was given (D-19; /sign-up writes from Phase 27). Separate from the cookie consent table because Phase 27 decides Meta from the latest cookie-consent row. Append-only.';

alter table public.account_agreement_records enable row level security;
revoke all on table public.account_agreement_records from public, anon, authenticated;

create trigger account_agreement_records_append_only
  before update or delete on public.account_agreement_records
  for each row execute function public.tg_append_only();
create trigger account_agreement_records_no_truncate
  before truncate on public.account_agreement_records
  execute function public.tg_append_only();

-- ---------------------------------------------------------------------------
-- 3. Functions
-- ---------------------------------------------------------------------------

-- Public read of the switch: the checkout page decides whether to show the guest choice.
create or replace function public.checkout_account_settings()
returns pg_catalog.bool
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select s.guest_accounts_live from public.settings as s where s.id = 1),
    false
  )
$$;

revoke all on function public.checkout_account_settings() from public;
grant execute on function public.checkout_account_settings() to anon, authenticated, vamos_checkout, vamos_system;
comment on function public.checkout_account_settings() is
  'guest_accounts_live of the settings singleton (false if no row). D-13.';

-- Known-e-mail check (D-04) without exposing auth.users: boolean only.
create or replace function public.checkout_email_has_account(p_email pg_catalog.text)
returns pg_catalog.bool
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from auth.users as u
     where pg_catalog.lower(u.email::pg_catalog.text) = pg_catalog.lower(pg_catalog.btrim(p_email))
  )
$$;

revoke all on function public.checkout_email_has_account(pg_catalog.text) from public;
grant execute on function public.checkout_email_has_account(pg_catalog.text) to vamos_checkout;
comment on function public.checkout_email_has_account(pg_catalog.text) is
  'True when any auth user (confirmed or not) has this e-mail. Boolean only; vamos_checkout only (D-04).';

-- The one write function for both surfaces (D-19).
create or replace function public.record_account_agreement(
  p_surface       pg_catalog.text,
  p_booking_id    pg_catalog.uuid,
  p_email         pg_catalog.text,
  p_choice        pg_catalog.text,
  p_text_version  pg_catalog.text,
  p_locale        pg_catalog.text,
  p_user_agent    pg_catalog.text,
  p_ip_truncated  pg_catalog.inet
)
returns pg_catalog.int8
language plpgsql security definer set search_path = ''
as $$
declare
  v_email pg_catalog.text;
  v_kind  pg_catalog.text;
  v_id    pg_catalog.int8;
begin
  if p_surface is null or p_surface not in ('checkout', 'sign-up') then
    raise exception 'record_account_agreement: unknown surface' using errcode = '22023';
  end if;
  if p_choice is null or p_choice not in ('create', 'guest') then
    raise exception 'record_account_agreement: unknown choice' using errcode = '22023';
  end if;
  if p_text_version is null or pg_catalog.btrim(p_text_version) = '' then
    raise exception 'record_account_agreement: text version required' using errcode = '22023';
  end if;
  if p_locale is null or p_locale not in ('en', 'de', 'fr', 'ar') then
    raise exception 'record_account_agreement: unknown locale' using errcode = '22023';
  end if;

  if p_surface = 'checkout' then
    if p_booking_id is null then
      raise exception 'record_account_agreement: booking required for checkout' using errcode = '22023';
    end if;
    if p_email is not null then
      raise exception 'record_account_agreement: e-mail is copied from the booking on checkout' using errcode = '22023';
    end if;
    select b.contact_email::pg_catalog.text into v_email
      from public.bookings as b where b.id = p_booking_id;
    if v_email is null then
      raise exception 'record_account_agreement: booking not found' using errcode = '22023';
    end if;
    if p_choice = 'guest' and not public.checkout_account_settings() then
      raise exception 'record_account_agreement: guest accounts are not live' using errcode = '22023';
    end if;
  else
    if p_booking_id is not null then
      raise exception 'record_account_agreement: sign-up has no booking' using errcode = '22023';
    end if;
    if p_choice <> 'create' then
      raise exception 'record_account_agreement: sign-up is always create' using errcode = '22023';
    end if;
    v_email := pg_catalog.lower(pg_catalog.btrim(p_email));
    if v_email is null or v_email = '' then
      raise exception 'record_account_agreement: e-mail required for sign-up' using errcode = '22023';
    end if;
  end if;

  v_kind := case p_choice when 'create' then 'consent' else 'informed' end;

  insert into public.account_agreement_records
    (surface, booking_id, email, choice, record_kind, text_version, locale, user_agent, ip_truncated)
  values
    (p_surface, p_booking_id, v_email, p_choice, v_kind, pg_catalog.btrim(p_text_version), p_locale,
     p_user_agent, p_ip_truncated)
  returning id into v_id;

  return v_id;
end
$$;

revoke all on function public.record_account_agreement(
  pg_catalog.text, pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.text,
  pg_catalog.text, pg_catalog.text, pg_catalog.inet) from public;
grant execute on function public.record_account_agreement(
  pg_catalog.text, pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.text,
  pg_catalog.text, pg_catalog.text, pg_catalog.inet) to vamos_checkout;
comment on function public.record_account_agreement(
  pg_catalog.text, pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.text,
  pg_catalog.text, pg_catalog.text, pg_catalog.inet) is
  'The one write function for account choices (D-19). create = consent, guest = informed; record_kind is derived here. Checkout copies the e-mail from the booking and refuses a passed e-mail. Phase 27 adds EXECUTE for the /sign-up route''s role by its own migration; anon and authenticated never.';

-- The record the settle step turns into an account (D-02).
create or replace function public.checkout_account_request_for_booking(p_booking_id pg_catalog.uuid)
returns table (email pg_catalog.text, choice pg_catalog.text, full_name pg_catalog.text, locale pg_catalog.text)
language sql stable security definer set search_path = ''
as $$
  select r.email, r.choice, b.contact_name, r.locale
    from public.bookings as b
    join public.account_agreement_records as r
      on r.booking_id = b.id
     and r.surface = 'checkout'
     and pg_catalog.lower(r.email) = pg_catalog.lower(b.contact_email::pg_catalog.text)
   where b.id = p_booking_id
     and exists (
       select 1 from public.booking_payments as p
        where p.booking_id = b.id and p.status = 'succeeded'
     )
     and (r.choice = 'create' or public.checkout_account_settings())
   order by r.recorded_at desc, r.id desc
   limit 1
$$;

revoke all on function public.checkout_account_request_for_booking(pg_catalog.uuid) from public;
grant execute on function public.checkout_account_request_for_booking(pg_catalog.uuid) to vamos_system;
comment on function public.checkout_account_request_for_booking(pg_catalog.uuid) is
  'Latest checkout account record for a PAID booking whose e-mail still matches; guest rows are ignored while guest_accounts_live is false. vamos_system only (D-02).';

-- Lets the settle step retry the finish mail for an unconfirmed checkout-made user.
create or replace function public.checkout_account_user_state(p_email pg_catalog.text)
returns table (user_exists pg_catalog.bool, confirmed pg_catalog.bool, checkout_origin pg_catalog.bool)
language sql stable security definer set search_path = ''
as $$
  select pg_catalog.count(*) > 0,
         coalesce(pg_catalog.bool_or(u.email_confirmed_at is not null), false),
         coalesce(pg_catalog.bool_or(u.raw_user_meta_data ->> 'vamos_account_origin' like 'checkout%'), false)
    from auth.users as u
   where pg_catalog.lower(u.email::pg_catalog.text) = pg_catalog.lower(pg_catalog.btrim(p_email))
$$;

revoke all on function public.checkout_account_user_state(pg_catalog.text) from public;
grant execute on function public.checkout_account_user_state(pg_catalog.text) to vamos_system;
comment on function public.checkout_account_user_state(pg_catalog.text) is
  'exists / confirmed / made-by-checkout for an e-mail, booleans only. vamos_system only (D-05).';

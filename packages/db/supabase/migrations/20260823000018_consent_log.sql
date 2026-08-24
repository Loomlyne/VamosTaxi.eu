-- 20260823000018_consent_log.sql
--
-- Server-side, provable consent (D-32, nFADP/GDPR -- a browser cookie cannot prove consent to a
-- regulator). The anchor is `consent_subject_id`, set in a first-party functional cookie BEFORE
-- any account exists -- itself exempt from consent-gating because it exists to *prove* consent.
-- Signing up inserts a NEW row with `customer_id` set; nothing is ever rewritten. Withdrawal is
-- a new row. Must exist before ...19_append_only.sql, which attaches this table's append-only
-- trigger, revokes UPDATE/DELETE/TRUNCATE on it, and forces RLS on it.

create table public.consent_log (
  id                 bigint generated always as identity primary key,
  consent_subject_id uuid not null,
  customer_id        uuid references public.customers(id) on delete set null,
  booking_id         uuid references public.bookings(id)  on delete set null,
  policy_version     text not null,
  -- CHECK, not an enum: the banner's interaction vocabulary may grow.
  method             text not null check (method in
                       ('accept_all','reject_all','save_choices','settings_change')),
  -- The four categories in app/pages/CookieBanner.dc.html, no more and no fewer.
  necessary          boolean not null default true,
  functional         boolean not null default false,
  analytics          boolean not null default false,
  marketing          boolean not null default false,
  locale             text not null check (locale in ('en','de','fr','ar')),
  user_agent         text,
  -- D-32/U10: nullable. Last octet / /64 zeroed BEFORE insert (never a raw IP); counsel decides
  -- the retention ceiling and collection policy for consent rows not tied to a booking before
  -- Phase 10 turns the banner live -- shipped nullable now so that decision is not blocked here.
  ip_truncated       inet,
  recorded_at        timestamptz not null default now()
);
comment on table public.consent_log is 'Append-only proof of cookie consent, anchored on an anonymous subject id so a guest choice survives having no account (nFADP / GDPR).';

create index consent_log_subject  on public.consent_log (consent_subject_id, recorded_at desc);
create index consent_log_customer on public.consent_log (customer_id, recorded_at desc)
  where customer_id is not null;

-- Consent is written through ONE function, never by a direct INSERT. A `grant insert` plus
-- `with check (true)` would accept every column from an unauthenticated caller -- including
-- customer_id and consent_subject_id -- and an attacker could post
-- {customer_id: <victim>, marketing: true}, making the table whose entire purpose is proving
-- consent to a regulator hold attacker-authored rows attributing marketing consent to someone
-- who never gave it, unremovable because the table is append-only. The same policy would also
-- be an unbounded write amplifier: an anon loop fills the disk and takes the bookings database
-- down with it. Rate limiting (Cloudflare, keyed per subject id and per IP) is the second half
-- of that amplifier defence and belongs to the Phase 10 banner work -- this function shape is
-- what makes it enforceable at all.
/**
 * The only write path into consent_log. `consent_subject_id` comes from the server-set GUC the
 * Worker fills from the first-party consent cookie, and `customer_id` from the verified JWT --
 * neither is ever an argument, so neither can be forged by the caller.
 */
create or replace function public.record_consent(
  p_necessary boolean, p_functional boolean, p_analytics boolean, p_marketing boolean,
  p_method text, p_locale text, p_policy_version text,
  p_booking_id uuid default null, p_user_agent text default null, p_ip_truncated inet default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_subject uuid;
begin
  v_subject := nullif(current_setting('request.vamos.consent_subject', true), '')::uuid;
  if v_subject is null then
    raise exception 'no consent subject bound to this request' using errcode = 'P0001';
  end if;

  insert into public.consent_log (consent_subject_id, customer_id, booking_id, policy_version,
                                  method, necessary, functional, analytics, marketing, locale,
                                  user_agent, ip_truncated)
  values (v_subject,
          (select c.id from public.customers c where c.user_id = app.uid()),
          p_booking_id, p_policy_version, p_method,
          coalesce(p_necessary, true), p_functional, p_analytics, p_marketing, p_locale,
          left(p_user_agent, 512), p_ip_truncated);
end $$;

revoke all on function public.record_consent(boolean,boolean,boolean,boolean,text,text,text,uuid,text,inet)
  from public;
grant execute on function public.record_consent(boolean,boolean,boolean,boolean,text,text,text,uuid,text,inet)
  to anon, authenticated, vamos_guest, vamos_public;

-- No table grant and no policy for these roles at all: you can record a choice through the
-- function, you cannot INSERT arbitrary rows and you cannot read the ledger.

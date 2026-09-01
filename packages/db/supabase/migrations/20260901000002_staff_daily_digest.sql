-- One row per eligible staff member and Zurich calendar day. The unique ledger is claimed
-- before the provider call so repeated cron delivery cannot send a second successful digest.
create table public.staff_daily_digests (
  staff_user_id uuid not null references public.staff(user_id) on delete cascade,
  digest_date date not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (staff_user_id, digest_date),
  check ((status = 'sent') = (sent_at is not null))
);

comment on table public.staff_daily_digests is
  'Scheduled Zurich 06:00 staff digest ledger. A failed provider send is retryable; sent rows are never claimed again.';

create or replace function public.staff_digest_recipients()
returns table (user_id uuid, email text, full_name text, lang text)
language sql stable security definer set search_path = '' as $$
  select s.user_id, u.email::text, s.full_name, s.lang
    from public.staff s
    join auth.users u on u.id = s.user_id
   where s.active
     and s.accepted_at is not null
     and s.digest_email
     and u.email is not null
$$;

create or replace function public.staff_digest_legs(p_digest_date date)
returns table (
  reference text,
  scheduled_local text,
  pickup_text text,
  dropoff_text text,
  status text
)
language sql stable security definer set search_path = '' as $$
  select b.reference,
         l.scheduled_local,
         l.pickup_text,
         l.dropoff_text,
         l.status::text
    from public.booking_legs l
    join public.bookings b on b.id = l.booking_id
   where (l.scheduled_at at time zone 'Europe/Zurich')::date = p_digest_date
     and l.status not in ('cancelled', 'no_show')
   order by l.scheduled_at, l.leg_seq
$$;

-- Returns true only to the one cron delivery allowed to send. Failed rows are deliberately
-- claimable again; sent and in-flight rows return false, preventing duplicate success sends.
create or replace function public.staff_digest_claim(p_staff_user_id uuid, p_digest_date date)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare claimed boolean := false;
begin
  insert into public.staff_daily_digests (staff_user_id, digest_date, status, attempt_count, claimed_at)
  values (p_staff_user_id, p_digest_date, 'pending', 1, now())
  on conflict (staff_user_id, digest_date) do nothing;

  if found then
    return true;
  end if;

  update public.staff_daily_digests
     set status = 'pending',
         attempt_count = attempt_count + 1,
         claimed_at = now(),
         failed_at = null,
         updated_at = now()
   where staff_user_id = p_staff_user_id
     and digest_date = p_digest_date
     and status = 'failed'
  returning true into claimed;

  return coalesce(claimed, false);
end $$;

create or replace function public.staff_digest_mark_sent(p_staff_user_id uuid, p_digest_date date)
returns void
language sql security definer set search_path = '' as $$
  update public.staff_daily_digests
     set status = 'sent', sent_at = now(), failed_at = null, updated_at = now()
   where staff_user_id = p_staff_user_id
     and digest_date = p_digest_date
     and status = 'pending'
$$;

create or replace function public.staff_digest_mark_failed(p_staff_user_id uuid, p_digest_date date)
returns void
language sql security definer set search_path = '' as $$
  update public.staff_daily_digests
     set status = 'failed', failed_at = now(), updated_at = now()
   where staff_user_id = p_staff_user_id
     and digest_date = p_digest_date
     and status = 'pending'
$$;

revoke all on table public.staff_daily_digests from public;
revoke all on function public.staff_digest_recipients() from public;
revoke all on function public.staff_digest_legs(date) from public;
revoke all on function public.staff_digest_claim(uuid, date) from public;
revoke all on function public.staff_digest_mark_sent(uuid, date) from public;
revoke all on function public.staff_digest_mark_failed(uuid, date) from public;
grant execute on function public.staff_digest_recipients() to service_role;
grant execute on function public.staff_digest_legs(date) to service_role;
grant execute on function public.staff_digest_claim(uuid, date) to service_role;
grant execute on function public.staff_digest_mark_sent(uuid, date) to service_role;
grant execute on function public.staff_digest_mark_failed(uuid, date) to service_role;

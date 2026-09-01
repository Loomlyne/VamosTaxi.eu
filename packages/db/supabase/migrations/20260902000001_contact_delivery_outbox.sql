-- Durable, private state for the two messages emitted for every contact submission.
-- Existing rows receive pending delivery records; no contact PII is duplicated here.
create table public.contact_delivery_outbox (
  submission_id uuid primary key references public.contact_submissions(id) on delete cascade,
  customer_state text not null default 'pending' check (customer_state in ('pending', 'sending', 'accepted', 'failed')),
  support_state text not null default 'pending' check (support_state in ('pending', 'sending', 'accepted', 'failed')),
  revision integer not null default 1 check (revision > 0),
  correlation_id uuid not null default extensions.gen_random_uuid(),
  customer_lease_token uuid,
  customer_lease_expires_at timestamptz,
  support_lease_token uuid,
  support_lease_expires_at timestamptz,
  customer_provider_suffix text,
  support_provider_suffix text,
  customer_accepted_at timestamptz,
  support_accepted_at timestamptz,
  customer_failed_at timestamptz,
  support_failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.contact_delivery_outbox (submission_id)
select id from public.contact_submissions
on conflict (submission_id) do nothing;

create or replace function public.create_contact_delivery_outbox()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.contact_delivery_outbox (submission_id) values (new.id)
  on conflict (submission_id) do nothing;
  return new;
end;
$$;

create trigger contact_submissions_delivery_outbox
  after insert on public.contact_submissions
  for each row execute function public.create_contact_delivery_outbox();

-- A claim fences the caller with a fresh opaque UUID. A sending row can be
-- reclaimed only after its five-minute lease expires, so concurrent live work
-- cannot claim the same channel twice.
create or replace function public.claim_contact_delivery(p_submission_id uuid, p_channel text)
returns table (
  claim_state text,
  correlation_id uuid,
  revision integer,
  lease_token uuid,
  lease_expires_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare v_state text;
begin
  if p_channel not in ('customer', 'support') then raise exception using errcode = '22023'; end if;

  update public.contact_delivery_outbox o
     set customer_state = case when p_channel = 'customer' then 'sending' else o.customer_state end,
         support_state = case when p_channel = 'support' then 'sending' else o.support_state end,
         customer_lease_token = case when p_channel = 'customer' then extensions.gen_random_uuid() else o.customer_lease_token end,
         customer_lease_expires_at = case when p_channel = 'customer' then now() + interval '5 minutes' else o.customer_lease_expires_at end,
         support_lease_token = case when p_channel = 'support' then extensions.gen_random_uuid() else o.support_lease_token end,
         support_lease_expires_at = case when p_channel = 'support' then now() + interval '5 minutes' else o.support_lease_expires_at end,
         revision = o.revision + 1,
         updated_at = now()
   where o.submission_id = p_submission_id
     and (
       (p_channel = 'customer' and (
         o.customer_state in ('pending', 'failed')
         or (o.customer_state = 'sending' and o.customer_lease_expires_at < now())
       ))
       or
       (p_channel = 'support' and (
         o.support_state in ('pending', 'failed')
         or (o.support_state = 'sending' and o.support_lease_expires_at < now())
       ))
     )
  returning
    case when p_channel = 'customer' then o.customer_state else o.support_state end,
    o.correlation_id,
    o.revision,
    case when p_channel = 'customer' then o.customer_lease_token else o.support_lease_token end,
    case when p_channel = 'customer' then o.customer_lease_expires_at else o.support_lease_expires_at end
  into v_state, correlation_id, revision, lease_token, lease_expires_at;

  if found then
    claim_state := 'claimed';
    return next;
    return;
  end if;

  select case when p_channel = 'customer' then o.customer_state else o.support_state end,
         o.correlation_id,
         o.revision
    into v_state, correlation_id, revision
    from public.contact_delivery_outbox o
   where o.submission_id = p_submission_id;
  claim_state := case when v_state = 'accepted' then 'accepted' else 'unavailable' end;
  lease_token := null;
  lease_expires_at := null;
  return next;
end;
$$;

-- Only the current, unexpired lease may change a sending channel. A reclaimed
-- token fences an older worker out of both accepted and failed transitions.
create or replace function public.finalize_contact_delivery(
  p_submission_id uuid,
  p_channel text,
  p_lease_token uuid,
  p_accepted boolean,
  p_provider_suffix text
)
returns text language plpgsql security definer set search_path = '' as $$
declare v_state text;
begin
  if p_channel not in ('customer', 'support') then raise exception using errcode = '22023'; end if;

  update public.contact_delivery_outbox o
     set customer_state = case when p_channel = 'customer' then case when p_accepted then 'accepted' else 'failed' end else o.customer_state end,
         support_state = case when p_channel = 'support' then case when p_accepted then 'accepted' else 'failed' end else o.support_state end,
         customer_lease_token = case when p_channel = 'customer' then null else o.customer_lease_token end,
         customer_lease_expires_at = case when p_channel = 'customer' then null else o.customer_lease_expires_at end,
         support_lease_token = case when p_channel = 'support' then null else o.support_lease_token end,
         support_lease_expires_at = case when p_channel = 'support' then null else o.support_lease_expires_at end,
         customer_provider_suffix = case when p_channel = 'customer' and p_accepted then right(coalesce(p_provider_suffix, ''), 12) else o.customer_provider_suffix end,
         support_provider_suffix = case when p_channel = 'support' and p_accepted then right(coalesce(p_provider_suffix, ''), 12) else o.support_provider_suffix end,
         customer_accepted_at = case when p_channel = 'customer' and p_accepted then now() else o.customer_accepted_at end,
         support_accepted_at = case when p_channel = 'support' and p_accepted then now() else o.support_accepted_at end,
         customer_failed_at = case when p_channel = 'customer' and not p_accepted then now() else o.customer_failed_at end,
         support_failed_at = case when p_channel = 'support' and not p_accepted then now() else o.support_failed_at end,
         updated_at = now()
   where o.submission_id = p_submission_id
     and (
       (p_channel = 'customer'
        and o.customer_state = 'sending'
        and o.customer_lease_token = p_lease_token
        and o.customer_lease_expires_at > now())
       or
       (p_channel = 'support'
        and o.support_state = 'sending'
        and o.support_lease_token = p_lease_token
        and o.support_lease_expires_at > now())
     )
  returning case when p_channel = 'customer' then o.customer_state else o.support_state end into v_state;

  return coalesce(v_state, 'unavailable');
end;
$$;

alter table public.contact_delivery_outbox enable row level security;
revoke all on table public.contact_delivery_outbox from public, anon, authenticated, vamos_public, vamos_edge, vamos_guest;
revoke all on function public.create_contact_delivery_outbox() from public;
revoke all on function public.claim_contact_delivery(uuid, text) from public;
revoke all on function public.finalize_contact_delivery(uuid, text, uuid, boolean, text) from public;
grant execute on function public.claim_contact_delivery(uuid, text) to anon, authenticated;
grant execute on function public.finalize_contact_delivery(uuid, text, uuid, boolean, text) to anon, authenticated;

-- Durable, private state for the two messages emitted for every contact submission.
-- Existing rows receive pending delivery records; no contact PII is duplicated here.
create table public.contact_delivery_outbox (
  submission_id uuid primary key references public.contact_submissions(id) on delete cascade,
  customer_state text not null default 'pending' check (customer_state in ('pending', 'sending', 'accepted', 'failed')),
  support_state text not null default 'pending' check (support_state in ('pending', 'sending', 'accepted', 'failed')),
  revision integer not null default 1 check (revision > 0),
  correlation_id uuid not null default extensions.gen_random_uuid(),
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

create or replace function public.claim_contact_delivery(p_submission_id uuid, p_channel text)
returns table (claim_state text, correlation_id uuid, revision integer)
language plpgsql security definer set search_path = '' as $$
declare v_state text;
begin
  if p_channel not in ('customer', 'support') then raise exception using errcode = '22023'; end if;
  update public.contact_delivery_outbox o
     set customer_state = case when p_channel = 'customer' and customer_state in ('pending','failed') then 'sending' else customer_state end,
         support_state = case when p_channel = 'support' and support_state in ('pending','failed') then 'sending' else support_state end,
         revision = revision + 1, updated_at = now()
   where o.submission_id = p_submission_id
     and ((p_channel = 'customer' and o.customer_state in ('pending','failed')) or (p_channel = 'support' and o.support_state in ('pending','failed')))
  returning case when p_channel = 'customer' then customer_state else support_state end, o.correlation_id, o.revision
       into v_state, correlation_id, revision;
  if found then
    claim_state := 'claimed';
    return next;
    return;
  end if;
  select case when p_channel = 'customer' then customer_state else support_state end, o.correlation_id, o.revision
    into v_state, correlation_id, revision from public.contact_delivery_outbox o where o.submission_id = p_submission_id;
  claim_state := case when v_state = 'accepted' then 'accepted' else 'unavailable' end;
  return next;
end;
$$;

create or replace function public.finalize_contact_delivery(p_submission_id uuid, p_channel text, p_accepted boolean, p_provider_suffix text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_state text;
begin
  if p_channel not in ('customer', 'support') then raise exception using errcode = '22023'; end if;
  update public.contact_delivery_outbox o
     set customer_state = case when p_channel = 'customer' and customer_state = 'sending' then case when p_accepted then 'accepted' else 'failed' end else customer_state end,
         support_state = case when p_channel = 'support' and support_state = 'sending' then case when p_accepted then 'accepted' else 'failed' end else support_state end,
         customer_provider_suffix = case when p_channel = 'customer' and p_accepted then right(coalesce(p_provider_suffix,''), 12) else customer_provider_suffix end,
         support_provider_suffix = case when p_channel = 'support' and p_accepted then right(coalesce(p_provider_suffix,''), 12) else support_provider_suffix end,
         customer_accepted_at = case when p_channel = 'customer' and p_accepted then now() else customer_accepted_at end,
         support_accepted_at = case when p_channel = 'support' and p_accepted then now() else support_accepted_at end,
         customer_failed_at = case when p_channel = 'customer' and not p_accepted then now() else customer_failed_at end,
         support_failed_at = case when p_channel = 'support' and not p_accepted then now() else support_failed_at end,
         updated_at = now()
   where o.submission_id = p_submission_id
  returning case when p_channel = 'customer' then customer_state else support_state end into v_state;
  return v_state;
end;
$$;

alter table public.contact_delivery_outbox enable row level security;
revoke all on table public.contact_delivery_outbox from public, anon, authenticated, vamos_public, vamos_edge, vamos_guest;
revoke all on function public.create_contact_delivery_outbox() from public;
revoke all on function public.claim_contact_delivery(uuid, text) from public;
revoke all on function public.finalize_contact_delivery(uuid, text, boolean, text) from public;
grant execute on function public.claim_contact_delivery(uuid, text) to anon, authenticated;
grant execute on function public.finalize_contact_delivery(uuid, text, boolean, text) to anon, authenticated;

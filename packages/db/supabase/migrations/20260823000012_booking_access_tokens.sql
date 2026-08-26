-- 20260823000012_booking_access_tokens.sql
--
-- The manage token surface (DATA-03, D-15, D-16). A separate table, not a `bookings` column, so
-- a link can be rotated and reissued without destroying the audit trail. Supersedes
-- GSD-LAUNCH's `bookings.manage_token uuid` (ADR-014 §2 Q2).
--
-- D-16 splits enforcement by operation: RLS for READS (vamos_guest, policy lands in Plan
-- 02-08), a SECURITY DEFINER RPC for MUTATIONS (this file) -- because token validation, the
-- booking state-machine check, the write and the booking_events row must be one atomic unit
-- with FOR UPDATE, not a check-then-act round trip from the Worker.

create table public.booking_access_tokens (
  id           uuid primary key default extensions.gen_random_uuid(),
  -- The one permitted cascade in this migration set: bookings rows are never deleted (D-19), so
  -- cascading from bookings can never silently orphan a live token.
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  purpose      text not null default 'manage' check (purpose in ('manage')),
  -- sha256 of the 32 raw token bytes. Postgres only ever sees the hash -- the Worker hashes
  -- first (Phase 3), so the raw value never reaches pg_stat_statements or a query log.
  token_hash   bytea not null unique,
  created_at   timestamptz not null default now(),
  -- NOT NULL: issuance must refuse rather than invent a window while the validity period
  -- (settings_versions.manage_link_validity_days, D-35) is not yet read. The window itself is
  -- Phase 4/7's job at issuance time -- never hard-coded here.
  expires_at   timestamptz not null,
  revoked_at   timestamptz,     -- claim into an account (AUTH-06), fraud, or reissue
  last_used_at timestamptz,     -- observability only, never part of the validity check
  use_count    integer not null default 0,
  constraint booking_access_tokens_hash_len check (octet_length(token_hash) = 32)
);
comment on table public.booking_access_tokens is 'Hashed guest manage-link bearer tokens (D-15). Reusable, revocable, rotatable -- never single-use, because corporate mail-gateway link scanners would burn a single-use token before the customer clicks. Reads are via RLS (Plan 02-08); mutations go through SECURITY DEFINER functions in this file.';

create index booking_access_tokens_booking on public.booking_access_tokens (booking_id)
  where revoked_at is null;

/**
 * Guest manage-token check, as a SECURITY DEFINER helper rather than an inline subquery. An
 * RLS policy expression is evaluated as the INVOKING role, so a policy that reads
 * public.booking_access_tokens directly would raise `42501 permission denied for table
 * booking_access_tokens` for vamos_guest -- which holds no grant on that table by design
 * (T-02-15). The definer helper is what lets the guest prove possession of a token without
 * ever being able to enumerate, read or join the token table. Declared here, next to the table
 * it reads: a `language sql` body is validated at CREATE time (check_function_bodies is on),
 * so this could not ship in ...002_roles_and_helpers.sql before this table existed.
 * Returns false, never an error, when the GUC is unset -- proven in manage_token_shape.test.sql.
 */
create or replace function app.booking_has_manage_token(p_booking uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.booking_access_tokens t
     where t.booking_id  = p_booking
       and t.token_hash  = app.manage_token_hash()
       and t.revoked_at is null
       and t.expires_at  > now()
  )
$$;
revoke all on function app.booking_has_manage_token(uuid) from public;
grant execute on function app.booking_has_manage_token(uuid) to vamos_guest;

/**
 * p_leg_seq NULL cancels the whole booking; p_leg_seq = 1|2 cancels one leg. ADR-006 requires
 * the second form -- a customer may cancel the return while the outbound has already run -- and
 * price_snapshot_legs.leg_subtotal_rappen (the migration numbered
 * ...013) exists for it. Without the argument,
 * cancelling a return would flip a completed, fully-earned outbound trip to 'cancelled' on the
 * ops board and leave the refund basis ambiguous.
 *
 * Every failure -- wrong token, expired, revoked, no such booking, already-terminal, already
 * past pickup -- raises exactly ONE of two generic errors (P0002 not_found / P0001
 * not_cancellable), never a distinguishing message, so there is no oracle telling a guest
 * "booking exists, wrong token" from "no such booking" (T-02-24).
 *
 * F-09 (a): the missing window guard. Refuses a cancellation whose target leg has already
 * started -- without it, a bearer token cancels a leg after the driver is at the kerb, the
 * cancelled leg drops out of BOTH exclusion-constraint predicates (`status not in
 * ('cancelled','no_show')`, ...011) and silently frees an assignment Phase 8 believes is held,
 * and the zero-notice cancellation is recorded with no tier, leaving Phase 9 no basis to
 * reconstruct what should have been refunded (T-02-45). Phase 2 ships this function live to
 * vamos_guest, so this is a window closed now, not a deferral.
 *
 * F-09 (b): the refund basis is read from the booking's OWN pinned price_snapshots.policy --
 * the copy taken from the settings_versions row the snapshot cites at quote time -- never the
 * live settings_versions table (LIFE-03: a re-price after booking must never change what a
 * cancellation now costs). public.price_snapshots does not exist until the migration numbered
 * ...013 (Plan 02-06); this is a plpgsql body, and unlike a `language sql`
 * function, a plpgsql body is compiled lazily -- Postgres parses it syntactically at CREATE
 * time but does not resolve table/column references in its SQL statements until first
 * execution, so creating this function now, ahead of that table, is safe. The read is exercised
 * by Plan 02-07's manage_booking_mutation.test.sql once price_snapshots exists;
 * manage_token_shape.test.sql (this plan) proves the token/expiry/revocation shape only and
 * never calls this function.
 *
 * refund_percent still returns NULL. The tier-to-refund_percent calculation is Phase 9; this
 * function reads and records the basis (free_cancel_hours, cancellation_tiers,
 * settings_version_id, hours_before) on the booking_events row so Phase 9 has it to compute
 * from, but does not compute the percentage itself.
 */
create or replace function public.manage_booking_cancel(p_token_hash bytea,
                                                        p_leg_seq smallint default null)
returns table (booking_id uuid, refund_percent numeric)
language plpgsql security definer set search_path = '' as $$
declare
  v public.bookings%rowtype;
  v_live integer;
  v_done integer;
  v_cut integer;
  v_free_cancel_hours numeric;
  v_tiers jsonb;
  v_settings_version bigint;
  v_hours_before numeric;
  v_leg_id uuid;
begin
  select b.* into v
    from public.bookings b
    join public.booking_access_tokens t on t.booking_id = b.id
   where t.token_hash = p_token_hash
     and t.revoked_at is null
     and t.expires_at > now()
   for update of b;

  if v.id is null then
    raise exception 'not_found' using errcode = 'P0002';   -- same generic error for every failure
  end if;
  if v.status not in ('pending','paid','confirmed','assigned','partially_completed',
                      'partially_cancelled') then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;

  -- F-09 (a): refuse a cancellation whose target leg's pickup has already passed. Checked
  -- before any write, against every live leg the request targets.
  if exists (
    select 1 from public.booking_legs l
     where l.booking_id = v.id
       and (p_leg_seq is null or l.leg_seq = p_leg_seq)
       and l.scheduled_at <= now()
  ) then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;

  -- DEVIATION (Rule 1, bug fix, found while writing Plan 02-07's manage_booking_mutation.test.sql
  -- -- this function's first end-to-end invocation): both statements below qualify `booking_id`
  -- with the `bl` table alias. Unqualified, `booking_id` raised `42702 column reference
  -- "booking_id" is ambiguous` -- not against another table (both statements are single-table),
  -- but against this FUNCTION'S OWN OUT parameter (`returns table (booking_id uuid, ...)`),
  -- which PL/pgSQL also makes visible as a bare name inside the function body. The draft's
  -- unqualified form only ever compiled successfully because nothing had called this function
  -- yet in this migration set; qualifying the column reference resolves the ambiguity in favour
  -- of the table column, which is what every surrounding comment already assumes it means.
  update public.booking_legs bl set status = 'cancelled'
   where bl.booking_id = v.id
     and bl.status not in ('completed','no_show','cancelled')
     and (p_leg_seq is null or bl.leg_seq = p_leg_seq);
  get diagnostics v_cut = row_count;
  if v_cut = 0 then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;

  -- Roll the booking status up from its legs (the vocabulary/rule in ...003_types.sql, U21).
  -- Never a blanket 'cancelled'.
  select count(*) filter (where bl.status not in ('cancelled','completed','no_show')),
         count(*) filter (where bl.status in ('completed','no_show'))
    into v_live, v_done
    from public.booking_legs bl where bl.booking_id = v.id;

  -- DEVIATION (Rule 1, bug fix, found while writing Plan 02-07's manage_booking_mutation.test.sql
  -- -- this function's first end-to-end invocation): a bare CASE expression whose branches are
  -- all string literals resolves to `text` with no further context, and Postgres does not
  -- implicitly cast a computed `text` expression to an enum-typed column on UPDATE (only a
  -- direct, unparenthesised literal gets that treatment) -- raising `42804 column "status" is of
  -- type public.booking_status but expression is of type text`. The cast itself then needs the
  -- schema qualifier (binding note 2): this function runs `set search_path = ''`, and unlike the
  -- always-searched `pg_catalog` built-ins (`numeric`, `text`, `uuid`, ...), a project-defined
  -- enum type is only found via `public.booking_status` -- bare `booking_status` raised
  -- `42704 type "booking_status" does not exist` even after the cast itself was added.
  update public.bookings set status = (case
      when v_live = 0 and v_done = 0 then 'cancelled'
      when v_live = 0 and v_done > 0 then 'partially_completed'
      else 'partially_cancelled' end)::public.booking_status
   where id = v.id;

  update public.booking_access_tokens
     set last_used_at = now(), use_count = use_count + 1 where token_hash = p_token_hash;

  -- F-09 (b): the LIFE-03 basis, read from the booking's own pinned snapshot policy -- never a
  -- live settings_versions read. price_snapshots does not exist yet in this migration set
  -- (ships in ...013); the SELECT below resolves at first execution, not at CREATE time (see
  -- the docstring above).
  select (s.policy ->> 'free_cancel_hours')::numeric, s.policy -> 'cancellation_tiers',
         s.settings_version_id
    into v_free_cancel_hours, v_tiers, v_settings_version
    from public.price_snapshots s where s.id = v.price_snapshot_id;

  select extract(epoch from (min(l.scheduled_at) - now())) / 3600
    into v_hours_before
    from public.booking_legs l
   where l.booking_id = v.id and (p_leg_seq is null or l.leg_seq = p_leg_seq);

  -- DEVIATION (Rule 1, bug fix, found while writing Plan 02-07's manage_booking_mutation.test.sql
  -- -- the first place this function is actually invoked end-to-end): the schema draft's own
  -- `booking_leg_id uuid ... -- null = whole booking` comment (...013_price_snapshots.sql's
  -- sibling table carries the identical convention) makes NULL mean "this event is about the
  -- whole booking" -- but a p_leg_seq-scoped cancel is about ONE leg, and hard-coding the
  -- inserted booking_leg_id to NULL regardless of p_leg_seq recorded every single-leg
  -- cancellation as if it were a whole-booking event, discarding exactly the fact
  -- booking_events.booking_leg_id exists to carry. Resolved to the cancelled leg's id when one
  -- was targeted, and left NULL only for a whole-booking cancel.
  if p_leg_seq is not null then
    select l.id into v_leg_id from public.booking_legs l
     where l.booking_id = v.id and l.leg_seq = p_leg_seq;
  end if;

  insert into public.booking_events (booking_id, booking_leg_id, kind, actor_kind, actor_label,
                                      from_status, to_status, payload)
  values (v.id, v_leg_id, 'booking.status_changed', 'guest', 'manage link',
          v.status, (select status from public.bookings where id = v.id),
          jsonb_build_object('via', 'manage_link', 'leg_seq', p_leg_seq,
                              'free_cancel_hours', v_free_cancel_hours,
                              'cancellation_tiers', v_tiers,
                              'settings_version_id', v_settings_version,
                              'hours_before', v_hours_before));

  return query select v.id, null::numeric;   -- Phase 9 fills the tier-to-percent calculation
end $$;

revoke all on function public.manage_booking_cancel(bytea, smallint) from public;
grant execute on function public.manage_booking_cancel(bytea, smallint) to vamos_guest;

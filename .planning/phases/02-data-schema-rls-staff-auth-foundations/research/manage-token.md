# Research Brief — Guest Manage-Booking Token (DATA-03)

Scope: token shape, storage, expiry/revocation/rate-limiting, RLS enforcement mechanism, guest permission boundary, leak surfaces, and forward-compatibility with AUTH-06 (Phase 8 claim-into-account). This lane only — not schema for `booking_legs` contents, staff auth, or Hyperdrive pooling mechanics beyond what this token's design must not violate.

## Architectural fact that changes the answer

This stack does **not** put PostgREST between the app and Postgres. Per `.claude/CLAUDE.md`: "Application queries reach Postgres through Hyperdrive on the direct connection string... SQL driver: postgres.js... direct SQL, prepared statements, pooling at the edge." That means the usual Supabase-RLS-via-PostgREST-JWT playbook (`auth.jwt()`, `request.jwt.claims`, `anon`/`authenticated` roles set per-request by PostgREST) does not automatically apply here — the Next.js Worker itself owns the Postgres session, over a pooled Hyperdrive connection. Any RLS design that depends on a **session-scoped** GUC (`SET`/`SET LOCAL`) is only as safe as the transaction discipline of every call site that touches that table, forever. This directly matters because Phase 3's DATA-06 ("request-scoped auth context cannot leak between requests sharing a pooled connection") is explicitly flagged as the next phase's hard problem — the manage-token path is the single highest-consequence place that bug class could land (an anonymous stranger reading someone else's name, phone, pickup address). Design this lane so it **cannot** be broken by that bug class, rather than relying on Phase 3 getting session-variable hygiene perfect everywhere, forever.

## RECOMMENDATION

**Token:** opaque, high-entropy random bearer token (32 bytes / 256 bits, base64url), not JWT, not HMAC-signed. Reusable, not single-use. **Stored hashed (SHA-256) at rest**, hashed on the Worker before the value ever reaches Postgres. **Access is granted exclusively through a small set of `SECURITY DEFINER` RPC functions** that take the hash and return exactly one booking (or perform exactly one guarded mutation) — not through an RLS policy that reads a per-request GUC. RLS stays **ON** on every table per DATA-02 (letter and spirit), but the anonymous/guest Postgres role gets **zero direct grants** on `bookings`/`booking_legs`/`booking_access_tokens`; the `SECURITY DEFINER` functions are the only door, and their body *is* the access-control check. This is the one decision in this brief, not a menu — reasons follow.

---

## 1. Token shape

| Option | Verdict |
|---|---|
| JWT | Reject. A JWT's payload is base64, not encrypted — putting booking identifiers/claims in it just relocates the leak surface into the URL/email itself. Its main selling point, stateless verification, buys nothing here: we still need a DB row to check revocation and to fetch the booking, so we pay the DB round-trip regardless. Revocation-without-a-blocklist is JWT's whole value proposition and we can't have that anyway (ADR-006/DATA-03 require revoke-on-cancel/claim). |
| HMAC-signed opaque token (`random.signature`) | Reject, marginal benefit. Buys "reject garbage before hitting the DB" — irrelevant at this traffic volume (one link per booking, not a public API), and adds a secret-rotation story for no real gain since a DB hit is unavoidable anyway. |
| Plain high-entropy random bearer token | **Accept.** Same shape as a Stripe customer-portal link, a Dropbox share link, or a password-reset token — this is the established pattern for "capability URL emailed to someone with no account." |

Generate with `crypto.getRandomValues` (Web Crypto, available in the Workers runtime — [Cloudflare Workers docs, Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)), 32 bytes, base64url-encoded (~43 chars, URL-safe, no padding). Not a UUID: UUIDv4 only carries ~122 bits of actual randomness (6 bits are fixed version/variant bits) and, more importantly, using UUID shape for both `bookings.id` and the bearer token invites a class of bug where the two get confused in logs, joins, or accidental lookups-by-id. Keep them visually and structurally distinct.

```ts
// apps/web (Worker) — token issuance, Web Crypto only, no Node crypto import needed
function generateManageToken(): { raw: string; hash: Buffer } {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const raw = base64url(bytes); // what goes in the email link
  return { raw, hash: sha256(bytes) }; // hash of the raw *bytes*, not of the base64url string, to avoid encoding-variant mismatches
}
```

## 2. Storage: raw vs hashed at rest

**Hash at rest. Hash app-side before the value ever reaches SQL.** Argued out, because the brief asks for the argument, not just the conclusion:

This is a bearer credential mailed in plaintext to an inbox you do not control (forwarding, shared/family inboxes, corporate archiving, breach of the recipient's mail provider — none of which is Vamos's fault, but all of which are real). The question is what a *second, independent* failure — a leaked DB backup, a `SELECT *` in a support script, an over-broad read grant to an analyst, a misconfigured logging sink that captures full rows — costs on top of that. With raw storage, that second failure is instantly equivalent to handing out live bearer credentials for every currently-open booking: no further work required by whoever has the leak. With **hashed** storage (SHA-256, 32 bytes, stored as `bytea`), that same leak yields only preimages of a 256-bit random value — computationally worthless to reverse, full stop, regardless of hash speed. This is exactly the reasoning [OWASP applies to password-reset tokens](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html): treat it as a credential, hash it, compare hashes.

Unlike a password, this token already has 256 bits of attacker-unknown entropy at issuance, so there is **no** case for a slow, memory-hard hash (bcrypt/argon2/scrypt) the way there is for user passwords — that would just add latency and a trivially cheap DoS lever (an attacker can force N slow hashes per request by hitting the manage-booking endpoint with junk tokens) for zero security benefit, since offline brute force of the token itself is already infeasible at 256 bits regardless of hash speed. Plain `sha256` is correct and fast; index the hash column for O(1) lookup (`UNIQUE` btree on `token_hash`).

Hash **before** the SQL call, not inside Postgres via `pgcrypto`'s `digest()`, for one more reason beyond defense-in-depth: it keeps the raw token out of the SQL statement text entirely, so it never appears in `pg_stat_statements`, Postgres logs, or any Hyperdrive/Cloudflare query-log surface — an extra leak surface a DB-side hash wouldn't close (the raw value would still transit as a literal bind parameter into the query, and depending on log verbosity settings, bind parameters can be logged too).

## 3. Table shape

Separate `booking_access_tokens` table rather than a column on `bookings` (this also matches the instinct already recorded in `docs/build/SPEC-manage-booking.md` §3). Reasons: supports rotation/revoke-and-reissue on suspected compromise without destroying the audit trail; keeps `bookings` lean; and because ADR-006 makes `bookings` the one-per-purchase commercial record, a 1:N `booking_id → tokens` relationship is the natural shape for "this booking has had two links issued to it over its life" (e.g., resend link support-flow) without overloading a single column.

```sql
-- 020_booking_access_tokens.sql

create table booking_access_tokens (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references bookings(id) on delete cascade,
  purpose       text not null default 'manage'
                  check (purpose in ('manage')), -- forward-compatible enum, one value today
  token_hash    bytea not null,          -- sha256(raw token bytes), 32 bytes
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,    -- see §4, computed at issuance, not "forever"
  revoked_at    timestamptz,             -- explicit revoke: claim-into-account, fraud, resend/rotate
  last_used_at  timestamptz,             -- observability only, never part of the access check
  use_count     integer not null default 0,

  constraint booking_access_tokens_hash_unique unique (token_hash)
);

-- RLS: on, and deliberately policy-free for every ordinary role.
-- The only door is the SECURITY DEFINER functions below (owned by a role
-- with implicit owner-bypass — see §5). No GRANT of SELECT/UPDATE on this
-- table exists for the low-privileged application role at all.
alter table booking_access_tokens enable row level security;

-- Staff/ops read access for support tooling (resend link, view issuance
-- history) is its own policy, keyed off the staff JWT role claim — out of
-- scope for this lane, but noted so the table isn't accidentally left with
-- zero policies at all once ops needs it in Phase 8.
```

`bookings.customer_id` stays nullable per PAY-03 (guest checkout); a guest booking has `customer_id = null` and at least one live row in `booking_access_tokens`.

## 4. Expiry, single-use vs reusable, revocation, rate limiting

**Reusable, not single-use.** This is a "manage my booking" link a customer returns to from the same email multiple times (check status, view refund preview before cancelling, come back the day of travel). A single-use/burn-on-first-read token produces a broken UX the first time a customer re-clicks the email — and worse, it is actively unsafe against a real, common failure mode: corporate email-security gateways (Microsoft Defender for Office 365 Safe Links, Google Workspace link-scanning, various MTAs) **prefetch links inside HTML email automatically**, before a human ever clicks. A single-use token gets silently burned by the scanner and the real customer hits "invalid link." Reusability is not a UX nicety here, it's the correct response to a known leak/availability surface (§6.3).

**Expiry — tie to trip lifecycle, not a fixed wall-clock TTL from creation.** `docs/build/SPEC-manage-booking.md` §5 leaves this explicitly open ("does it expire only after the trip, or on a fixed duration regardless of pickup date?") — this brief settles it: **`expires_at = pickup_at + 30 days`** at issuance, computed against the *latest* leg's `scheduled_at` for a return trip (so the return-leg pickup, not the outbound, sets the floor). This covers: booking made far in advance (link must survive until the trip, however far out that is — a fixed 14-day-from-creation TTL would expire the link before a booking made 2 months ahead ever gets used); and a 30-day post-trip window for receipt viewing, a late dispute, or claiming the booking into a new account (AUTH-06) before the link goes cold. Store the exact day-count as a named constant the owner can revisit — do **not** hardcode `30` invisibly in application logic; put it next to the other policy numbers this project already treats as settings-driven (ADR-005 precedent). **UNCERTAIN — flagging, not guessing:** the exact day-count (30) is my default, not an owner-confirmed number; settle it the same way ADR-002/ADR-005 settle policy numbers — ask the owner, and until answered, treat it as a `data-tok`-class gap in the settings table (`settings.manage_link_validity_days`), not a silently-chosen constant.

**Revocation:**
- **On claim into an account (AUTH-06, Phase 8):** revoke immediately — `revoked_at = now()` on every live token for that `booking_id`, in the same transaction as setting `bookings.customer_id`. Reasoning stated plainly: once a booking has an owning account, the mailed bearer link is a strictly worse, non-revocable-per-session, non-MFA-eligible way in that has no reason to keep working — continuing to honor it is pure residual attack surface (the email could be sitting in a shared/forwarded inbox indefinitely). This does **not** block AUTH-06 — the token only needs to be valid *up to and including* the moment the claim action executes (it authenticates the claim itself), and correctly stops working the instant the claim succeeds. It positively **helps** AUTH-06 by giving "claim" an unambiguous, auditable trigger to revoke against.
- **On terminal booking status** (`completed`, `cancelled`, `refunded`, `no-show`): do **not** revoke the token. The guest should still be able to open the link to see a receipt or their refund status after the trip is over — that is a real, expected use of the same link. Instead, gate **mutating** actions (cancel, modify) inside the mutation functions themselves with a state-machine check (`raise exception 'booking is already <status>'` if not in an actionable status) — expiry of *capability to act* falls naturally out of booking state, not out of token lifecycle. This keeps "can I look" and "can I still change this" as two independently-correct checks instead of overloading one expiry timestamp to mean both.
- **Manual revoke (support/fraud path):** `revoked_at = now()` settable by staff through ops — same column, different trigger, no schema change needed. Also the mechanism for "resend my link" support flow: issue a new `booking_access_tokens` row, revoke the old one, so an old, possibly-compromised link in a forwarded email stops working the moment a fresh one is issued.

**Rate limiting.** Guessing a 256-bit token is not a practical risk at any request volume WAF could plausibly need to stop — the entropy already makes brute force infeasible. Cloudflare WAF/Turnstile's job here is different: (a) blunt automated scraping/DoS cost against the `/manage-booking` route and its API, and (b) generate a signal for anomaly detection (a spike of failed lookups from one IP is either a misconfigured scanner or a probe, either way worth seeing). Apply a Cloudflare rate-limiting rule on `POST /api/manage-booking*` keyed by IP (e.g., N attempts / 10 min), and require Turnstile on the manage-booking *mutation* endpoints (cancel/modify), not on the read — a scanner prefetch (§6.3) must be able to load the read view without solving a CAPTCHA, or every emailed link breaks for anyone behind an aggressive corporate link-scanner. Every failure response — wrong token, expired token, revoked token, booking not found — must return the **same generic message and status** (avoid an oracle that lets an attacker distinguish "this booking exists but token's wrong" from "no such booking").

## 5. How RLS enforces this with no authenticated user — comparison and pick

**Option A — `anon` role + RLS policy reading a per-request GUC set via `SET LOCAL`.**
Worker runs, inside `sql.begin(...)`: `SET LOCAL app.manage_token_hash = $1;` then a normal `SELECT ... FROM bookings WHERE id IN (SELECT booking_id FROM booking_access_tokens WHERE token_hash = current_setting('app.manage_token_hash', true)::bytea AND revoked_at IS NULL AND expires_at > now())`, with a matching RLS policy `USING (...)` on `bookings`. `SET LOCAL` is transaction-scoped in Postgres itself — it resets at `COMMIT`/`ROLLBACK` regardless of connection pooling — and postgres.js's `sql.begin` wraps `BEGIN`/`COMMIT`/`ROLLBACK` correctly around the callback ([porsager/postgres, Transactions](https://github.com/porsager/postgres#transactions); [PostgreSQL, `SET` docs](https://www.postgresql.org/docs/current/sql-set.html) confirm `LOCAL` scoping). If the GUC is unset for any reason, `current_setting(..., true)` returns `NULL`, and `NULL = token_hash` evaluates to `NULL` (falsy) — so a missing/mis-set context **fails closed** (no rows), not open. That's reassuring, but it is still true that this design's correctness depends on *every single call site* that ever touches `bookings` remembering to open a transaction and set the GUC correctly — a discipline requirement that has to hold forever, across every future engineer and every future refactor, on a pooled connection. That is precisely the class of mistake DATA-06 exists to catch in Phase 3, and this option keeps that failure mode alive for this specific table indefinitely.

**Option B — `SECURITY DEFINER` function that takes the token hash and returns exactly one booking.**
```sql
create or replace function manage_booking_get(p_token_hash bytea)
returns table (
  booking_id   uuid,
  reference    text,
  status       text,
  pickup_at    timestamptz,
  price_chf    numeric,
  -- ...remaining public-safe columns only
  customer_id  uuid
)
language sql
security definer
set search_path = ''
stable
as $$
  select b.id, b.reference, b.status, b.pickup_at, b.price_chf, b.customer_id
  from public.bookings b
  join public.booking_access_tokens t on t.booking_id = b.id
  where t.token_hash = p_token_hash
    and t.revoked_at is null
    and t.expires_at > now()
  limit 1;
$$;

revoke all on function manage_booking_get(bytea) from public;
grant execute on function manage_booking_get(bytea) to app_guest; -- narrow role the Worker connects as for this route
```
Because the function is owned by the table owner (or a role with `BYPASSRLS`) and `bookings`/`booking_access_tokens` are **not** given `FORCE ROW LEVEL SECURITY`, the owner — and therefore this function — bypasses RLS by default; that is standard, documented Postgres behavior, not a workaround: *"Table owners normally bypass row security... a table owner can choose to be subject to row security with `ALTER TABLE ... FORCE ROW LEVEL SECURITY`."* ([PostgreSQL 18 docs, §5.9 Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)). RLS is still `ENABLE`d on both tables (satisfying DATA-02's letter — every table has RLS on), it simply has **no policy granting the low-privileged `app_guest` role any direct access** — the function's `WHERE` clause *is* the entire access-control boundary, self-contained, re-checked on every single call, independent of transaction/session state. `set search_path = ''` with fully schema-qualified names is required so a caller can't shadow `bookings`/`booking_access_tokens` via search-path manipulation — this is Supabase's own stated hardening requirement for definer functions ([Supabase docs, Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)).

Mutating actions get the same shape, each independently re-validating the token and the booking's current state inside one atomic function body — no separate "check then act" round-trip from application code that could race:

```sql
create or replace function manage_booking_cancel(p_token_hash bytea, p_actor_ip inet)
returns table (booking_id uuid, refund_share numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking record;
begin
  select b.id, b.status, b.pickup_at into v_booking
  from public.bookings b
  join public.booking_access_tokens t on t.booking_id = b.id
  where t.token_hash = p_token_hash
    and t.revoked_at is null
    and t.expires_at > now()
  for update of b;  -- lock the row for the duration of this state check

  if v_booking.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_booking.status not in ('pending','paid','confirmed','assigned') then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;

  update public.bookings set status = 'cancelled' where id = v_booking.id;
  update public.booking_access_tokens set last_used_at = now(), use_count = use_count + 1
    where token_hash = p_token_hash;

  -- append-only audit row, per booking_events design (DATA-01)
  insert into public.booking_events (booking_id, event, actor, meta)
  values (v_booking.id, 'cancelled', 'guest', jsonb_build_object('ip', p_actor_ip));

  return query select v_booking.id, /* refund share computed here or by caller from policy table */ null::numeric;
end;
$$;

revoke all on function manage_booking_cancel(bytea, inet) from public;
grant execute on function manage_booking_cancel(bytea, inet) to app_guest;
```

**Pick: Option B**, precisely because of the DATA-06 forward-linkage stated in the task: this is the highest-consequence surface for a pooled-connection session-leak bug (stranger reads a stranger's name/phone/pickup address), so it should not depend on session-scoped GUC discipline holding forever across every future call site. This is not "throw out RLS" — RLS stays on for DATA-02's authenticated paths (customer's own `/account/bookings`, staff/ops), which legitimately use Supabase Auth's JWT (`auth.uid()`, role claims) the standard way; it's "don't gate a mailed bearer-capability link behind a mechanism whose safety depends on connection-pool transaction hygiene when a self-contained function removes that dependency for the price of one extra stored function per guest action." Document this explicitly in the migration comments and in whatever reviews DATA-02's "RLS on for every table" claim, so a future reviewer doesn't mistake "RLS enabled, no guest policy" for an oversight — it's the deliberate design, with the `SECURITY DEFINER` functions as the documented, narrow bypass.

The Worker connects to Hyperdrive as a low-privileged role (call it `app_guest` for this route, or reuse whatever the general low-priv app role is named) that has **no** table grants on `bookings`/`booking_access_tokens`/`customers` at all — only `EXECUTE` on this specific, narrow set of functions. That statically bounds what a bug in this route can ever reach, independent of RLS policy correctness elsewhere.

## 6. What the guest sees vs. an account holder — expressed in the function, not app code

The boundary is the function's own `select` list and `where` clause, not a conditional in TypeScript:

- `manage_booking_get` returns only booking-level and leg-level fields needed to view/manage a trip (route, time, vehicle class, status, price, flight number) — it does **not** join `customers` for PII beyond what's on the booking itself, and does not expose `booking_access_tokens.token_hash` or any other guest's data (the `where` clause structurally can only ever match one `booking_id`, by construction of the unique-hash lookup — there is no path to a list of bookings).
- A signed-in account holder instead reaches the same underlying tables through the **customer RLS path** (Option A's ordinary pattern, driven by `auth.uid() = bookings.customer_id`, via Supabase Auth's JWT — not this token machinery at all) and gets the fuller `/account/bookings` view with history across all their bookings. The guest function is deliberately narrower than the customer RLS policy — it can only ever resolve to the single booking the token maps to, never a list, never another customer's row, never staff-only fields (`assigned_chauffeur_id`, internal notes) which simply aren't in the `select` list at all.
- Expressing the limit in the function's column list and single-row `limit 1`/`for update of b` targeting, rather than in application code, means a bug in the Next.js route (e.g., forgetting to filter a response field before sending it to the client) cannot leak more than the function already decided to return — the function is the whole contract.

## 7. Leak surfaces and mitigations

**Referer header.** If the manage-booking page ever loads a third-party resource (analytics pixel, external image CDN, a social "share" link) while the token is still in `location.search`, browsers may send the full URL — token included — in the `Referer` header to that third-party origin. Mitigate with `Referrer-Policy: strict-origin-when-cross-origin` (or `same-origin`) set as a response header on the `/manage-booking*` route specifically, and avoid third-party embeds on that route entirely. This is the standard, documented fix ([MDN, Referrer-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy)).

**Browser history / shared devices.** The token is unavoidably in the URL the first time (that's the entire point of a no-password emailed link) — but the client app should call `history.replaceState(...)` to strip the token from the visible/bookmarkable URL immediately after the first successful load, keep it only in memory (or `sessionStorage`, not `localStorage`, so it doesn't persist past the tab), and send it as an `Authorization: Bearer <token>` header (or POST body) on every subsequent call rather than re-reading it from the URL. This reduces *ongoing* exposure; it does not erase an already-written history entry — that residual risk is accepted and bounded by the expiry/revocation design in §4, not eliminated at the transport layer.

**Email-scanner / link-prefetch logs.** Corporate mail security gateways (Microsoft Defender for Office 365 Safe Links, Google Workspace link scanning, various MTAs/AV) automatically fetch links inside HTML email before a human clicks, sometimes with follow redirects. This has two consequences already priced into this design: (1) it is a hard requirement that the token be **reusable**, not single-use (§4) — a prefetch must not burn it; (2) the **read** path must be side-effect-free and safe to prefetch (no state mutation, satisfied by `manage_booking_get` being a plain `stable select`); (3) **no mutating action may ever be reachable via a bare `GET`** — cancel/modify are always a page load followed by an explicit in-app `POST` the user triggers with a click inside the app (a scanner following the mailed `GET` link cannot submit a form), which is standard OWASP CSRF/GET-safety guidance and is already the natural shape of a React confirm-dialog flow.

## Open items to settle before implementation, stated as checks, not left implicit

1. **`settings.manage_link_validity_days` (default 30 in this brief) is unconfirmed by the owner** — treat as a Law-04-class gap (seed `NULL`, TBC pill on ops settings) exactly like `airport_waiting_minutes`/`cancelWindow` per ADR-002, rather than silently shipping `30` as if chosen. Check that settles it: owner confirms a number, or explicitly defers it the way ADR-002 deferred waiting minutes.
2. **Exact `app_guest`/low-privilege Postgres role name and its Hyperdrive credential** is a Phase 3 wiring concern, not decided here — this brief only requires that role to have zero table grants on the tables in §3 and `EXECUTE`-only on the two functions in §5. Check: Phase 3's Hyperdrive/role plan names this role and confirms no broader grant sneaks in via a default `GRANT ALL ON SCHEMA` statement in a later migration.
3. **Turnstile placement (mutation-only, not read)** assumes corporate link-scanners only issue `GET`; if a support ticket later shows a scanner following the `POST` cancel action (it shouldn't, by design, since that link is never emailed as a bare URL), that's a signal the client accidentally exposed a mutating link as `GET` somewhere — re-audit rather than loosen Turnstile.
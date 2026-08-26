# Phase 2 Research — Data Schema, RLS & Staff Auth Foundations

## What Phase 2 must produce

1. Versioned SQL migrations in `packages/db/supabase/migrations/` covering every table in the `VamosOps` contract (DATA-01), authored by hand, never diffed out of Studio.
2. Four Postgres login/application roles (`vamos_edge`, `vamos_public`, `vamos_guest`, `vamos_staff`) plus `app.*` identity helpers, so RLS is enforced by *grants first, policies second*.
3. RLS enabled on every table, with per-actor policies proving DATA-02 (customer reads own bookings), DATA-03 (guest reads via manage token only), DATA-04 (staff reach ops data by role claim; customers cannot).
4. Staff invitation-only account creation via `auth.admin.inviteUserByEmail`, a `staff` role table, a Custom Access Token Hook writing `app_metadata.vamos_role`, and TOTP MFA enforced in SQL as `aal = 'aal2'` (AUTH-05).
5. The forward-designed price/policy snapshot: `rate_versions` (one `live` row = `pricing_live`), `settings_versions`, `price_snapshots` + `price_snapshot_legs`, and a DB-level charge gate. Phase 4 and Phase 9 depend on this shape.
6. The forward-designed dispatch exclusion: `btree_gist` plus two partial `EXCLUDE USING gist` constraints on `booking_legs` (chauffeur, vehicle). Phase 8 depends on this.
7. `booking_events` (append-only, service-role-written) and a generic trigger-written `audit_log`, satisfying DATA-08's foundation.
8. `consent_log`, append-only, anonymous-subject-first, matching the four cookie-banner categories.
9. A generated, idempotent `seed.sql` loading vehicle classes, settings, content strings (en/de/fr/ar) and the existing reviews (DATA-07).
10. pgTAP tests under `packages/db/supabase/tests/` — one file per DATA-0x claim — run by `supabase test db` in CI, plus `supabase db reset` from zero on every PR.
11. `booking_notifications`, the send ledger PAY-05's "double-send an email" clause and LIFE-05's reminder cron both need; and Realtime authorization for the ops board decided here (Broadcast on a private channel, not Postgres Changes) because it determines which policies exist.

### Review pass — the corrections that changed the shape

Three adversarial passes over the schema draft (security, forward-compatibility, correctness)
produced 36 findings; all were accepted and folded into `02-SCHEMA-DRAFT.md` revision 2. The six
that changed something structural, rather than tightening a policy:

- **`citext` was never installed.** Migration 0006 would have aborted at `type "citext" does not
  exist`, so *no* environment could be built and the "`supabase db reset` from zero" PR gate — the
  actual DATA-07 proof — failed on its first run. `consent_log` was also created one file *after*
  the migration that attaches its append-only trigger. Both ordering facts are now fixed and called
  out in the migration table.
- **The Custom Access Token Hook could not read `staff`.** It runs as `supabase_auth_admin`, which
  has no BYPASSRLS; with RLS on and no policy for that role, every staff JWT would have been minted
  with no `vamos_role`, `app.is_staff()` false for everyone, and the ops console reading zero rows
  on day one. AUTH-05 and DATA-04 failed *closed against the people they exist to admit*.
- **Staff held INSERT on the evidence tables.** The convenience loop granted
  `select, insert, update, delete` on `booking_events`, `price_snapshots`, `booking_payments`,
  `booking_refunds` and `stripe_events` — flatly contradicting the same document's claim that no
  client-facing role can forge a timeline entry. Ledger tables are now SELECT-only for
  `vamos_staff`, with writes through the service role or a definer function.
- **Publishing a rate version was reachable by a dispatcher.** The admin restriction was
  `FOR INSERT` only while `UPDATE` was covered by a permissive `using (true)` policy, so the single
  statement that opens the charge gate on the whole platform was available to the lowest ops role.
  Now `FOR ALL`, plus a transition trigger that permits only `draft→live` and `live→retired` and
  refuses to publish a half-priced matrix.
- **A quote required a `bookings` row.** `price_snapshots.booking_id` was NOT NULL, but the funnel
  collects the name and email *after* pricing — so Phase 4 would have had to fabricate contact
  details, and every anonymous price check would have burned a `VT-YY-####` reference from a
  9 999/year space. `booking_id` is now nullable and pre-purchase snapshots are anchored on
  `quote_id`.
- **The dispatch exclusion range could be empty.** With a NULL duration (a phone booking, or a
  Mapbox outage) the range collapsed to the turnaround buffer — or, with a zero buffer, to the
  empty range, which `&&` never matches, making OPS-03's constraint a silent no-op on exactly the
  rows most likely to be hand-entered. Assignment now requires a duration, the range carries a
  30-minute floor, and the buffer trigger fires on the vehicle column too.

---

## Lane 1 — RLS over Hyperdrive

**Verdict:** RLS is enforceable on this stack *structurally*, not by discipline — but only if the security boundary is the login role's grants, not "remember to set the claim".

### Roles

Hyperdrive logs in as `vamos_edge`: `NOINHERIT`, owns nothing, granted nothing on any table, and holds every application role `WITH INHERIT FALSE, SET TRUE`. A query issued without the transaction wrapper therefore raises SQLSTATE `42501 insufficient_privilege` — it does **not** return the previous request's rows. That is what converts DATA-06 from "we test for leaks" into "a leak cannot occur".

A second login role `vamos_public` holds direct `SELECT` on four public-content tables only, no role memberships, and is used through a **separate, cache-enabled** Hyperdrive configuration.

Do **not** follow Cloudflare's Supabase example that suggests `GRANT postgres TO hyperdrive_user` — `postgres` owns these tables and would bypass every policy.

### Binding identity to the SQL session

Chosen: transaction-scoped `set_config(..., is_local => true)` for **both** the Postgres role and the JWT claims, inside one explicit `BEGIN`/`COMMIT`.

- Postgres itself reverts it: *"the effects of `SET LOCAL` last only till the end of the current transaction, whether committed or not"* ([PG SET](https://www.postgresql.org/docs/current/sql-set.html)).
- Hyperdrive supports it: *"if you manually create a transaction with `BEGIN`/`COMMIT`, `SET` statements within the transaction will take effect"* ([How Hyperdrive works](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/)).
- If the `BEGIN` is ever lost, `SET LOCAL` *"emits a warning and otherwise has no effect"* — it fails to set the identity rather than leaking it, which then trips the grant check.

Rejected: plain session-level `SET` (makes a Cloudflare implementation detail the tenant boundary, and leaks *forward* inside one invocation because postgres.js may reuse a connection for several queries); multi-statement simple-query (no bind parameters — the attacker-influenced claims JSON would be string-concatenated into SQL); passing claims as function args only (policies can no longer read identity); abandoning RLS (violates DATA-02/03/04).

`set_config('role', $1, true)` is used rather than `SET LOCAL ROLE <name>` because `role` is a GUC, so it takes a **bound parameter** and keeps the extended protocol and prepared statements. The value is chosen from a closed TypeScript allowlist keyed by our own discriminant, never by a string from the token.

### The single door

```ts
// apps/web/lib/db/identity.ts  (Phase 3 lands the file; Phase 2 fixes the contract)
const PG_ROLE = {
  anon: "anon", customer: "authenticated", staff: "vamos_staff", guest: "vamos_guest",
} as const satisfies Record<DbIdentity["kind"], string>;

/** Claims we are willing to expose to SQL. user_metadata is user-writable and must
 *  never reach a policy, so it is stripped here rather than trusted not to be referenced. */
function claimsForSql(c: VamosClaims): string {
  return JSON.stringify({
    sub: c.sub, role: c.role, aal: c.aal ?? "aal1",
    email: c.email, session_id: c.session_id, app_metadata: c.app_metadata ?? {},
  });
}

export async function withIdentity<T>(env: Env, identity: DbIdentity,
                                      run: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  const sql = postgres(env.HYPERDRIVE_NOCACHE.connectionString, {
    max: 1, fetch_types: false, prepare: true, connect_timeout: 10,
  });
  return sql.begin(async (tx) => {
    await tx`select set_config('role', ${PG_ROLE[identity.kind]}, true)`;
    if (identity.kind === "customer" || identity.kind === "staff") {
      await tx`select set_config('request.jwt.claims', ${claimsForSql(identity.claims)}, true)`;
    } else if (identity.kind === "guest") {
      await tx`select set_config('request.vamos.manage_token_hash', ${identity.manageTokenHashHex}, true)`;
    }
    return run(tx);
  });
}
```

Do **not** call `sql.end()`: *"Workers-to-Hyperdrive connections are automatically cleaned up when the request or invocation ends"* ([Connection lifecycle](https://developers.cloudflare.com/hyperdrive/concepts/connection-lifecycle/)). This **corrects** `.planning/research/STACK.md:138`, which still recommends `ctx.waitUntil(client.end())`.

### Token verification at the edge

Verify Supabase access tokens with `jose` + a KV-backed JWKS cache rather than dragging `@supabase/supabase-js` into the hot path. Asymmetric signing (ES256/RS256) is the default for new projects; **refuse HS256** so a leaked legacy shared secret cannot mint a token. JWKS endpoint `GET {SUPABASE_URL}/auth/v1/.well-known/jwks.json`, cached 10 minutes to match Supabase's own edge cache ([JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys)). A `kid` miss mid-rotation must clear the cache and retry the verify exactly once, then fail — otherwise a key rotation is a 10-minute outage.

### Prepared statements are safe

Hyperdrive keeps a per-connection map of named `Parse` messages and re-prepends `Parse` on a connection missing the statement, so the *same* prepared statement can execute on a connection previously used by another identity ([Cloudflare blog](https://blog.cloudflare.com/postgres-named-prepared-statements-supported-hyperdrive/)). This is safe because `plancache.c` invalidates on role/RLS change:

```c
if (plansource->is_valid && plansource->dependsOnRLS &&
    (plansource->rewriteRoleId != GetUserId() ||
     plansource->rewriteRowSecurity != row_security))
    plansource->is_valid = false;
```

Keep `prepare: true` — `prepare: false` also makes queries uncacheable, silently costing the public-content cache.

### Operating constraints

| Item | Value | Source |
|---|---|---|
| Pooler mode | transaction mode; `RESET` on return to pool | [Connection pooling](https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/) |
| One invocation | may obtain **multiple** connections — bind identity per request, not per invocation | same |
| Long transactions | discouraged: connection cannot be reused by other isolates for its duration | same |
| Max origin connections | ~20 Free / ~100 Paid, min 5, soft | [Limits](https://developers.cloudflare.com/hyperdrive/platform/limits/) |
| Max query duration | 60 s | Limits |
| Client in module scope | hard error: `Cannot perform I/O on behalf of a different request` | [Troubleshooting](https://developers.cloudflare.com/hyperdrive/observability/troubleshooting/) |
| Supabase string | **Direct** connection, never pooled Supavisor `:6543` | [Hyperdrive → Supabase](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/) |

Rule that follows: **one transaction per request handler, one logical unit of work.** A status transition plus its `booking_events` row is one transaction; a Stripe webhook fan-out is not.

`withIdentity` is 5 sequential round trips. Cloudflare: *"Each query adds round-trip latency: 20-30ms from a distant region, or 1-3ms when placed nearby."* **Placement near Frankfurt is a hard requirement of this design, not an optimisation** (`"placement": { "region": "aws:eu-central-1" }`) — an independent, non-legal reason to do what ADR-007 proposes.

Two Hyperdrive configs, both on the direct string: `vamos-rls-*` created `--caching-disabled` (bound as `HYPERDRIVE_NOCACHE`) and `vamos-public-*` (bound as `HYPERDRIVE`). Sum both `--origin-connection-limit` values against the instance's `max_connections`.

### The DATA-06 proof (Phase 3 executes; Phase 2 must make it possible)

1. 200 interleaved requests alternating customer A/B tokens against the **deployed** Worker.
2. **Fail-closed proof:** a test-only route running `select count(*) from public.bookings` with no transaction and no `SET ROLE` must throw `42501`. If it ever returns a number, the design is void.
3. Residue probe: 200 concurrent transactions whose first statement reads `current_setting('request.jwt.claims', true)` — must be empty every time.
4. Hyperdrive GraphQL `cacheStatus` for the RLS config ∈ {`disabled`,`transaction`}, never `hit`.
5. pgTAP suite per table, `set local role` + `set local request.jwt.claims`, `throws_ok` for `42501`, zero rows for `using`-clause denials.

---

## Lane 2 — Price / policy snapshot

**Verdict: snapshot the whole rule set, not the amount.** Three objects, not one.

### Why the amount alone is not enough

- LIFE-03 literally: *"A refund is calculated from the policy stored on the booking, not from whatever the policy says today."* The policy is tiers plus a boundary hour. An amount column knows the fare; it does not know the tier that governed it.
- A support agent in month 7 must answer *"why 75 % of CHF 000?"* without a git-blame dig.
- The modification path (`app/pages/manage-booking.dc.html:404`) needs line-level comparability to render `this.diffList()`.
- Stripe dispute evidence expects the itemised rationale.

### The trap in the mock

`app/vamos-ops-data.js:295-303` stores `label:'Airport pickup'` and `rule:'22:00 – 06:00'` as **English prose on the pricing row**. Porting that literally bakes an English price line into every German confirmation email, permanently — a Law 03 breach frozen into immutable rows. The snapshot stores **i18n keys plus numeric params**, never rendered label text; the words resolve through `content_strings` at render time.

### Rejected options

| Option | Why rejected |
|---|---|
| `bookings.price_json jsonb` | The booking row is mutated by every dispatch action; nothing at the DB level stops a careless `UPDATE` clobbering the price history. No place for the second snapshot a modification creates. |
| Normalised lines with FKs to `surcharges.id` | The FK *is* the bug — ops edits that row (OPS-06), so the join resolves to today's label and today's amount and the snapshot silently lies. |
| SCD-2 `valid_from`/`valid_to` + recompute "as of" | Reproduces the *inputs*, never the *decision*. Reproducing the decision means re-running the Phase 4 engine as it existed then — a code version, not a data version. |
| `numeric` money in jsonb only | Ops-board sort, day revenue, charged-vs-snapshot comparison all become jsonb casts. |

### Money storage

`create domain rappen as integer` — CHF minor units. Reasons: Stripe's `amount` is already an integer minor unit for CHF, so the stored number *is* the number sent to Stripe; postgres.js returns `numeric` as a **string** and `int8` as a string, while `int4` arrives as a plain JS number; ceiling CHF 21'474'836.47. This is a considered departure from PG's "use numeric for money" (whose target is binary floating point, an objection integer minor units also satisfy). **Rounding rule binding on Phase 4:** each line rounds half-up to the whole rappen when computed; the total is the sum of already-rounded lines, never the rounding of an unrounded sum.

The mock's `'000'` / `'00'` / `'0.00'` strings do **not** port to a `text` column — they are a rendering convention produced by `money(null)`. The column is `rappen NULL`; NULL is what makes the surface print `CHF 000`.

### `pricing_live` is not a boolean

`pricing_live` means *exactly one row in `rate_versions` has `status='live'`*, enforced by `create unique index rate_versions_one_live on public.rate_versions ((true)) where status = 'live'`. There is **no `settings.pricing_live` column** — a mutable boolean is what an ops screen flips by accident, and it cannot answer "which version was live when this booking was quoted".

Four layers, one of which has no off switch:

1. **Data** — no version live ⇒ every snapshot's `rate_version_is_live` is false ⇒ `is_chargeable` false.
2. **Database** — a `BEFORE INSERT` trigger on `booking_payments` refuses any charge whose snapshot is not chargeable, is expired, or whose amount ≠ the snapshot total. Holds against a stale Worker deploy, an ops SQL session, or a replayed webhook.
3. **Serialisation** — the quote API returns `total: null` when not chargeable, so `CHF 000` renders by data. One env var, `PRICING_PREVIEW`, true on **staging only**, lets staging show the draft matrix's real numbers. It changes what is shown, never what can be charged.
4. **Launch trigger** — `UPDATE rate_versions SET status='live'`, a dated and attributed row.

### `lines` shape (binding on Phase 4)

```json
[
  { "seq": 1, "leg_seq": 1, "kind": "fare", "code": "distance_fare",
    "i18n_key": "price.line.transfer", "params": { "vehicle_class": "business" },
    "basis": { "rule": "per_km", "distance_km": 18.40, "per_km_rappen": 385,
               "base_fare_rappen": 1500, "min_fare_rappen": 6000, "min_fare_applied": false },
    "source_row": { "table": "distance_rates", "id": 42, "rate_version_id": 7 },
    "amount_rappen": 8584 },
  { "seq": 2, "leg_seq": 1, "kind": "surcharge", "code": "night",
    "i18n_key": "price.surcharge.night.label",
    "basis": { "rule": "percent", "percent": 15.00, "of_rappen": 8584,
               "why": { "pickup_local": "2026-09-04T23:10:00", "tz": "Europe/Zurich",
                        "window": "22:00-06:00" } },
    "source_row": { "table": "surcharges", "id": 11, "rate_version_id": 7 },
    "amount_rappen": 1288 },
  { "seq": 3, "leg_seq": 1, "kind": "included", "code": "waiting_airport",
    "i18n_key": "price.surcharge.waiting_airport.label",
    "basis": { "included_minutes": null }, "amount_rappen": null },
  { "seq": 4, "leg_seq": null, "kind": "discount", "code": "coupon",
    "i18n_key": "price.line.coupon", "params": { "code": "ZRH20" },
    "basis": { "rule": "percent", "percent": 20.00, "of_rappen": 9872 },
    "source_row": { "table": "coupons", "id": 3 },
    "allocation": "pro_rata", "amount_rappen": -1974 }
]
```

Four load-bearing rules: `i18n_key` + `params` never rendered text (a coupon `code` is the one literal, `.vt-dir-keep` in Arabic); `basis` records the *why* including **local wall-clock time plus tz** (recomputing "was this 23:10?" from a UTC instant months later is a DST bug waiting to happen); `leg_seq` on every line with `null` for booking-level lines plus a recorded `allocation` rule; `amount_rappen: null` for `included` and for any unlanded matrix value → renders `CHF 000` by data.

Maps onto what the mock already renders (`checkout.dc.html:246`): `kind:"included"` → `muted:true`; `kind:"discount"` → `credit:true`. No UI change needed.

### `policy` shape

```json
{ "settings_version_id": 4, "free_cancel_hours": 24, "modification_deadline_hours": 24,
  "min_advance_minutes": 180,
  "airport_waiting_minutes": null, "city_waiting_minutes": null,
  "cancellation_tiers": [ { "from_hours_before": 24, "refund_percent": 100 },
                          { "from_hours_before": 0,  "refund_percent": 75  },
                          { "no_show": true,         "refund_percent": 0   } ],
  "policy_doc": { "slug": "cancellation", "version": "2026-08-01" } }
```

The two `null`s are ADR-002 working as designed: TBC pills render, and when the owner answers only *new* bookings get the number — old bookings correctly keep the promise they were sold. An unversioned `settings` lookup destroys that property.

### Return trips

**Legs share one snapshot.** The customer bought one thing at one price under one reference and Stripe charges once; two snapshots would leave the round-trip discount homeless. `price_snapshot_legs.leg_subtotal_rappen` carries the per-leg refund basis; booking-level lines apportion by the `allocation` rule *recorded in the snapshot*, not one invented at refund time. A leg does not get its own rate version, coupon, policy or expiry. **No round-trip discount percentage is named** — ADR-006 defers it to the CHF matrix (Q11). Do not seed one, not even in a fixture.

### Append-only enforcement — four layers, three of them bypassable

Triggers (`BEFORE UPDATE OR DELETE` raising `restrict_violation`), `REVOKE UPDATE, DELETE`, RLS enabled with no UPDATE/DELETE policy (default deny), and `FORCE ROW LEVEL SECURITY`. Layers 2–4 are bypassed by `service_role` (`BYPASSRLS`) and superusers; **only the trigger catches a migration or a `psql` session running as `postgres`**. That is why all four ship together.

`booking_payments` is the exception — Stripe legitimately moves a PaymentIntent through statuses; it gets an UPDATE-column whitelist (`status`, `captured_at`) instead.

### Conflict to record

`docs/build/GSD-LAUNCH.md` §Phase 2 line 66 specifies `bookings.price_chf numeric nullable until matrix lands`. **This design replaces it** with `price_snapshot_id` + a denormalised `price_total_rappen` ops-board cache. A bare `price_chf numeric` on a mutable booking row is the rejected option A and cannot satisfy QUOTE-05 or LIFE-03. The migration must not carry both.

---

## Lane 3 — Staff invitation + TOTP MFA (AUTH-05)

**One Supabase project.** A second project would mean two databases, two Hyperdrive bindings, duplicated migrations, and no FK from `chauffeurs`/`bookings` to a shared `auth.users`. Separation is the role claim, not the project.

**Do not use the project-wide "Allow new users to sign up" toggle to gate staff** — it would block customer self-signup and violate AUTH-01. Staff and customers are separated by *how the account is created*: customers via `signUp()`; staff **exclusively** via `supabase.auth.admin.inviteUserByEmail()` from a server route holding the service-role key ([reference](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail)).

```ts
// app/(ops)/ops/api/staff/invite/route.ts — service-role only, never reaches the browser
const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
  redirectTo: 'https://vamostaxi.eu/ops/accept-invite',
  data: { invited_role: role },   // user_metadata — DISPLAY ONLY, never authorization
});
await supabaseAdmin.from('staff').insert({ user_id: data.user.id, role, mfa_enrolled: false });
```

### The role claim

`user_metadata` is writable by the end user via `updateUser({ data })` — **a customer could set `user_metadata.role = 'admin'` themselves.** Never read it in any authorization check, policy, or middleware gate. The claim is derived on every token mint by a Custom Access Token Hook reading the app-owned `staff` table, so revoking a staff member takes effect on their next token mint with no stale claim:

```sql
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable as $$
declare claims jsonb; staff_role text;
begin
  select role into staff_role from public.staff where user_id = (event->>'user_id')::uuid;
  claims := event->'claims';
  if staff_role is not null then
    claims := jsonb_set(claims, '{app_metadata,vamos_role}', to_jsonb(staff_role));
  end if;
  return jsonb_set(event, '{claims}', claims);
end; $$;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
grant select on table public.staff to supabase_auth_admin;
```

**Never write the top-level `role` claim** — its JSON Schema constrains it to `enum: ["anon","authenticated"]`; it is the *Postgres* role, not the app role ([Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook)).

### TOTP

```ts
const { data: enroll } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
const { data: challenge } = await supabase.auth.mfa.challenge({ factorId: enroll.id });
const { data: verify } = await supabase.auth.mfa.verify({
  factorId: enroll.id, challengeId: challenge.id, code: userEnteredCode });
// success ⇒ new session whose JWT carries aal:"aal2"
```

At every later sign-in: `getAuthenticatorAssuranceLevel()` → if `nextLevel === 'aal2' && currentLevel !== 'aal2'`, `listFactors()` → `challenge()` → `verify()`. *JWTs without an `aal` claim are at `aal1`* ([MFA](https://supabase.com/docs/guides/auth/auth-mfa)).

Distinguish aal1 from aal2 by reading the `aal` claim — **never** by "does this user have a factor enrolled", because having a factor and having verified it *this session* are different facts. Nothing in Supabase blocks an invited user from skipping enrolment; the accept-invite flow must redirect straight into enrol → verify and only then set `staff.mfa_enrolled = true`. The flag is UX; the `aal2` check in SQL is the security.

### Three independent layers

1. **SQL** — `app.is_staff()` requires the staff app-metadata role **and** `aal = 'aal2'` **and** an active `staff` row (a JWT lives up to an hour; the row check makes revocation immediate). Ops policies are `AS RESTRICTIVE` so a permissive policy added later cannot OR its way past them.
2. **Middleware** — `/ops/:path*` matcher, always `getUser()` (never `getSession()`, which does not re-validate against the Auth server), redirect to `/ops/sign-in` or `/ops/mfa-challenge`. This is UX, not the boundary.
3. **Invite/claim flow** — no active staff row until enrolment completes.

### Cloudflare + `@supabase/ssr` hazards (design around now, bite in Phase 3)

- Use the **Node.js runtime**; never `export const runtime = 'edge'` under `@opennextjs/cloudflare`.
- Standard `middleware.ts` only — Next 15.2's Node Middleware is not supported by the adapter.
- **Open bug** [opennextjs-cloudflare#501](https://github.com/opennextjs/opennextjs-cloudflare/issues/501): multiple `Set-Cookie` headers get folded into one on Cloudflare when middleware constructs a fresh `NextResponse` with a body. Supabase's session cookie **chunks** above ~3180 bytes into `name.0`, `name.1`… and a staff JWT carrying `vamos_role`, `aal` and `amr` is larger than a customer's — so **staff sessions are more likely to hit this than customer sessions.** Mitigation is Supabase's own documented pattern: build the response with `NextResponse.next({ request })` and never `new NextResponse(body, …)`.
- Use `request.cookies` / `response.cookies` in middleware, not `next/headers`' `cookies()`.

---

## Lane 4 — Guest manage token (DATA-03)

**Token:** opaque 32-byte (`crypto.getRandomValues`) base64url bearer token. Not a JWT (payload is base64, not encrypted; stateless verification buys nothing because revocation needs a DB row anyway). Not a UUID (only ~122 bits, and sharing UUID shape with `bookings.id` invites confusion in logs and joins).

**Storage:** SHA-256 of the raw **bytes**, stored as `bytea`, hashed **in the Worker** before the value reaches SQL — so the raw token never appears in `pg_stat_statements`, Postgres logs, or any query-log surface. Plain `sha256`, not bcrypt/argon2: the token already has 256 bits of attacker-unknown entropy, so a slow hash adds latency and a free DoS lever (N slow hashes per junk request) for zero benefit.

```ts
export async function manageTokenHashHex(token: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

**Reusable, not single-use.** Corporate mail gateways (Microsoft Defender Safe Links, Google Workspace scanning) **prefetch links inside HTML email before a human clicks** — a burn-on-read token is silently consumed by the scanner and the real customer hits "invalid link". Consequences that follow: the read path must be side-effect-free and safe to prefetch, and **no mutating action may ever be reachable via a bare `GET`**.

**Separate table, not a column on `bookings`** — supports rotate-and-reissue on suspected compromise without destroying the audit trail, and gives the resend-link support flow somewhere to live. This is also what `docs/build/SPEC-manage-booking.md` §3 already reaches for. It supersedes GSD-LAUNCH's `bookings.manage_token uuid` sketch.

**Expiry:** `expires_at = latest leg's scheduled_at + N days` at issuance (not a fixed TTL from creation — a booking made two months ahead would expire before use). Covers the trip plus a post-trip window for receipts, disputes and AUTH-06 claim. `N` is **not** an owner-confirmed number — see UNCERTAIN.

**Revocation:**
- On claim into an account (AUTH-06): revoke every live token for that booking **in the same transaction** as setting `bookings.customer_id`. The token only needs to be valid up to and including the claim action; it correctly stops working the instant the claim succeeds. This helps AUTH-06 by giving "claim" an auditable revoke trigger.
- On terminal booking status: **do not revoke** — the guest should still see a receipt or refund status. Gate *mutating* actions on booking state instead, so "can I look" and "can I still change this" stay two independently-correct checks.
- Manual revoke for support/fraud, and as the mechanism behind resend-link.

**Rate limiting:** guessing 256 bits is not the risk. Cloudflare rate-limiting on `POST /api/manage-booking*` keyed by IP blunts scraping and surfaces anomalies; Turnstile on **mutation** endpoints only — a scanner prefetch must be able to load the read view without solving a CAPTCHA. Every failure — wrong, expired, revoked, not found — returns the **same generic message and status**, so there is no oracle distinguishing "booking exists, token wrong" from "no such booking".

**Leak surfaces:** set `Referrer-Policy: strict-origin-when-cross-origin` (or `same-origin`) on `/manage-booking*` and embed no third-party resources there; `history.replaceState` to strip the token from the visible URL after first load, keep it in memory or `sessionStorage` (never `localStorage`), and send it as a header on subsequent calls.

### Conflict between Lane 1 and Lane 4 — stated, and resolved

Lane 1 wants a `vamos_guest` role plus an RLS policy reading `request.vamos.manage_token_hash`. Lane 4 wants `SECURITY DEFINER` RPC functions with the guest role holding zero table grants, arguing that a GUC-based policy makes DATA-03 depend on transaction discipline holding forever across every future call site.

**We follow Lane 1 for reads and Lane 4 for mutations.**

- Lane 4's core objection is answered by Lane 1's grant design: `vamos_edge` holds nothing, so a wrapper-less query is `42501`; and if the wrapper runs but the GUC is unset, `app.manage_token_hash()` is NULL and `NULL = token_hash` is falsy — zero rows. Both failure modes are closed.
- Keeping reads in RLS keeps DATA-02/03/04 provable by one uniform, pgTAP-testable mechanism instead of splitting the proof across policies and function bodies.
- Mutations (cancel, modify) genuinely want Lane 4's shape: token validation, the booking state-machine check, the write and the `booking_events` row must be one atomic server-side unit with `FOR UPDATE`, not a check-then-act round trip from the Worker. Those ship as `SECURITY DEFINER` functions with `set search_path = ''` and fully schema-qualified names, `EXECUTE` granted only to `vamos_guest`.

Document this split in the migration comments so a future reviewer does not mistake "RLS enabled, narrow guest policy, definer functions for writes" for an oversight.

---

## Lane 5 — Driver/vehicle double-booking exclusion (forward-designed for Phase 8)

`btree_gist` adds B-tree equality operator classes to GiST, which is what lets one index mix an equality column with a range-overlap column. It ships with core Postgres and Supabase demonstrates it on managed Postgres ([Supabase blog: Range Columns](https://supabase.com/blog/range-columns)). Install into the `extensions` schema, per Supabase convention.

**The constraint belongs on `booking_legs`, not `bookings`** — ADR-006 puts assignment, `scheduled_at` and `status` on the leg. GSD-LAUNCH's earlier `bookings.assigned_chauffeur_id` sketch is superseded; flag it so Phase 8 does not resurrect the pre-ADR shape.

The range is `tstzrange(scheduled_at, scheduled_at + (duration + buffer) minutes, '[)')` as a **`STORED` generated column**. A generated column can only reference columns on the same row — it cannot subquery `settings` — so both numbers must be materialised locally. That is also the right design independently: it matches QUOTE-05's rule that later changes must not alter a historical booking. If the turnaround buffer changes next month, a leg assigned last month must not silently recompute its exclusion range.

`estimated_duration_minutes` comes from the Mapbox Directions estimate Phase 4 already computes for pricing. `turnaround_buffer_minutes` is snapshotted from `settings.chauffeur_turnaround_minutes` by a `BEFORE INSERT OR UPDATE OF assigned_chauffeur_id` trigger.

**Two independent partial constraints, never one combined** — a combined `(chauffeur_id, vehicle_id) WITH =` would only block the exact *pair* recurring, not either resource double-booked with a different partner.

`WHERE (… is not null and status not in ('cancelled','no_show'))` releases cancelled and no-show legs. NULL is already never-equal in an exclusion constraint, so the null check is index-size hygiene rather than correctness.

**Error surface:** SQLSTATE `23P01` (`exclusion_violation`). With postgres.js, test `err instanceof postgres.PostgresError && err.code === '23P01'`, never message text; use `err.constraint_name` to tell the chauffeur constraint from the vehicle one without a second query. Return 409 with a plain-language message, not a 500.

**RLS interaction:** exclusion checks run against the full underlying index regardless of row visibility, so in principle a narrower-visibility session could infer a hidden row. Not a real leak here — only `dispatcher`/`admin` write to `booking_legs`, and that role already reads all ops rows. Stated so Phase 8 does not have to rediscover it.

**Audit interaction:** write the `booking_events` row in the **same transaction** as the assignment `UPDATE`, so a constraint violation atomically prevents both the bad assignment and a false audit entry. Rejected assignment *attempts* go to Logpush, not `booking_events` — that table records state changes, not attempts.

---

## Lane 6 — Migrations and seed mechanics

**Tool:** Supabase CLI, plain timestamped SQL migrations, installed as a **pinned exact devDependency** at the workspace root (`pnpm add -D -w supabase`), mirrored in CI by `supabase/setup-cli@v1` so a CLI bump is one PR.

Rejected: declarative schemas (`supabase/schemas/` + `db diff`) — a newer alpha-flavoured indirection that fights "versioned migrations in order", which `packages/db/README.md` already decided; and a hand-rolled Node runner — it would reinvent ordered apply, remote history, `db diff` and the pgTAP runner.

Always `supabase migration new <name>` — never hand-type a timestamp, so two commits on the same day cannot collide. `db diff` is only for capturing an ad-hoc Studio change; the primary path is hand-written SQL, because RLS, grants and roles must be authored deliberately, not inferred from a GUI click.

**Real gap this phase must close:** no workflow in `.github/workflows/` runs any Supabase command today. `deploy-staging.yml` and `deploy-production.yml` each need `supabase link --project-ref … && supabase db push --include-seed` **before** the existing Worker deploy step, plus three new per-env secrets (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`) that do not exist in the repo — a fourth secrets family alongside the Cloudflare pair in `docs/build/GSD-LAUNCH.md` §Secrets.

`pr.yml` gains a job needing no secrets: `supabase start` → `supabase db reset` (proves every migration applies clean from zero, **the actual DATA-07 proof**) → `supabase test db` (pgTAP) → `supabase gen types typescript --local` + `git diff --exit-code`.

**No custom Postgres roles file is needed for staff/customer** — that distinction is a JWT claim. But this phase *does* create `vamos_edge`/`vamos_public`/`vamos_guest`/`vamos_staff`, which are real roles; they go in the first migration with `IF NOT EXISTS`-style guards and their passwords injected as psql variables, never literals in a committed file.

**Seed:** `packages/db/seed/generate-seed.mjs` is a build-time generator writing a committed, reviewable `packages/db/supabase/seed.sql`. Sources:

- Content strings: **not** `app/vamos-i18n-dict.js` (the mock's flat dictionary is superseded). The production source is `apps/web/i18n/messages/{en,de,fr,ar}.json` — confirmed present, identical shape across all four locales. Strip the reserved `$meta` object (as `apps/web/i18n/request.ts`'s `stripMeta()` already does) — but **carry all three of its lists into columns**, because they are three different facts and collapsing them loses the most important one:
  - `$meta.pendingValueKeys` (20 keys) → `content_strings.pending_value`. `scripts/check-i18n-coverage.mjs:230` is explicit that this is the ADR-011 / Law 04 data-tok set — "pending-value pill, English-only on purpose". Without the column, when Phase 6 renders from the DB instead of the JSON, `cookies.analytics-provider` comes back as an ordinary translated string with no way for the renderer to know it must wear a TBC pill, and a pending value silently becomes a stated fact on the live cookie page.
  - `$meta.nonTranslatableKeys` (8 keys) → `content_strings.non_translatable`. The ADR-012 product-name set (brand name, class names, payment marks).
  - `$meta.noParamKeys` (54 keys, each with a reason) → `content_strings.no_param_reason`. The reasoned I18N-06 opt-outs, or the coverage check cannot be run against the DB mirror at all.
- Reviews: `app/vamos-reviews.js`'s `SEED` array, seeded on a new `reviews.external_ref` natural key (`'rv-1'`…`'rv-5'`). Seed **each review's own `source`** — `rv-1`/`rv-4` `google`, `rv-2` `tripadvisor`, `rv-3` `trustpilot`, `rv-5` `manual`; forcing them all to `'manual'` flips the generated `locked` column false on four rows and strips the platform provenance the home cards render. `locked` is *derived* from `isImported(source)` — never seeded as input, or it drifts from the derivation rule.
- Vehicle classes and settings: no JS/JSON source exists; hard-code in the generator. Per **ADR-002**, waiting-minutes fields seed **NULL**, never 60/15 — the generator must not "help" with plausible defaults.

Every generated `INSERT` uses `ON CONFLICT … DO UPDATE` on a stable natural key: `db reset` truncates locally, but staging and production only ever push forward, so `ON CONFLICT` is the only thing making a second `--include-seed` push safe. Add a CI check next to the existing `pnpm i18n:check` that fails when `seed.sql` differs from what the generator would now produce — the JSON files remain the only thing the app renders from until Phase 6, so the DB mirror goes stale silently otherwise.

**Rollback:** forward-only. There is no `supabase migration down`; a bad migration is corrected by a new forward migration, and a *destructive* one by Point-in-Time Recovery (Pro plan, 7-day window, project inaccessible during restore). `supabase migration list` / `migration repair --status applied|reverted <ts>` fixes history bookkeeping only, never re-runs SQL. **Do not build a `down.sql` convention** — it matches neither the CLI nor Supabase's guidance and would be unmaintained by Phase 5.

**Types:** `supabase gen types typescript --local > packages/db/database.types.ts`, committed and drift-checked in CI. Consumed by hand in the Phase-3-owned postgres.js helper (`type Booking = Database['public']['Tables']['bookings']['Row']`). Add no query-typing library — the stack is direct SQL.

**Flag for Phase 3:** `apps/web/wrangler.jsonc`'s `env.production.hyperdrive.localConnectionString` points at port `5432`, but `supabase start`'s local Postgres listens on **54322**.

---

## Lane 7 — Residency, consent and audit

### `consent_log`

Server-side, provable, and it must survive an account that does not exist yet. Anchored on a `consent_subject_id` set in a first-party functional cookie **before** any account exists — that cookie is itself exempt from consent-gating because it exists to *prove* consent. When the guest later signs up, insert a **new** row with `customer_id` set; never rewrite history. Withdrawal is a new row. Four booleans matching the live `CookieBanner.dc.html` categories (necessary / functional / analytics / marketing), plus `policy_version`, `method`, `locale`, and a **truncated** IP. On account deletion, `customer_id → NULL`; the row stays as the anonymous proof trail.

No UPDATE or DELETE policy exists for any role — RLS defaults to deny, so omitting them makes the table append-only even for a role holding table-level UPDATE.

### Audit — two tables, not one, not N

- `booking_events` for the booking/price/payment/assignment aggregate DATA-08 names. **Application-written inside the state-change transaction using the service-role key, never by a trigger** — a trigger sees an old/new diff but cannot express *why* ("customer cancelled" vs "no-show sweep cancelled" both just flip `status`), and cannot see an actor for a Stripe webhook or a cron job running without a JWT. It survives tampering by having **no INSERT/UPDATE/DELETE policy at all** for any client-facing role: a compromised `admin` JWT cannot forge or delete an event. Corrections are compensating events.
- `audit_log`, generic and **trigger-written**, for settings, coupons, chauffeurs, vehicles, rates, routes, surcharges, content strings and review moderation. Trigger is right *here* precisely because these are plain CRUD with no semantic "why" beyond the diff, and a trigger fires even if a future ops screen forgets to call an audit helper.

`booking_events` and `price_snapshots` are **not** the same object: the snapshot answers *what was true* (contains money, authoritative, ~1–2 rows/booking); the event answers *what happened, who, when* (contains no money, **references** a snapshot, ~10–30 rows/booking). Recomputing a refund by replaying the event log would be slow, fragile, and break the moment an event kind is renamed.

### Personal data, erasure, and the 10-year record

Swiss CO Art. 958f requires accounting records to be kept **10 years** from the end of the financial year. GDPR Art. 17(3)(b)/(e) exempts erasure needed for a legal obligation or to defend claims. Reconciled by **redact-in-place, never row deletion**: `customers.name → 'Redacted customer'`, `email → 'redacted+' || id || '@deleted.vamostaxi.eu'` (keeps the unique constraint satisfiable), `phone`/`company → NULL`, `erased_at = now()`. The accounting-relevant booking fields (reference, date, price, route, class) stay intact because those are the Art. 958f record. Guest bookings follow the same pattern at the `bookings` row.

**Special category (Art. 9): none designed in — with one live risk.** `about.dc.html`/`terms.dc.html` copy invites a customer to declare a **collapsible wheelchair** so the right class is assigned (`app/vamos-i18n-dict.js:453,1316`). A free-text mobility-equipment declaration is health-*adjacent* when the purpose of collecting it is accommodating a disability. Until counsel answers: treat it as ordinary personal data with the same access scope as the rest of the booking row; build no speculative restricted-field mechanism; but do **not** leave it out of the privacy policy's "when you book" list, which ADR-010 already found incomplete once.

### Residency — and where ADR-007's proposed mechanism does not do what it implies

Storage is straightforward and already decided: Supabase pinned `eu-central-1`. Two adjacent decisions are **not** automatic and one is irreversible:

- **R2 buckets must be created with `jurisdiction: "eu"` on the very first creation call** — that is a hard guarantee and **cannot be changed afterward**. The alternative "location hint" is documented as *"best effort and not a guarantee"* ([R2 data location](https://developers.cloudflare.com/r2/reference/data-location/)).
- **KV jurisdictional restriction is private beta**, not GA. Mitigation is architectural: keys are place-id pairs and flight numbers, never `customer_id`/`booking_id`/email, so the cache never holds personal data regardless of which PoP replicates it. Write this as a rule into Phase 4's quote cache.

**Correction to feed back into ADR-007:** Smart Placement / placement hints — the mechanism ADR-007 proposes — is a latency optimiser with **no residency guarantee**. Workers *"run on Cloudflare's global network, not inside cloud provider regions"*, placement considers only *"locations where the Worker has previously run"*, and *"at high traffic volumes, Cloudflare may run instances across a more distributed area"* ([Placement](https://developers.cloudflare.com/workers/configuration/placement/)). The mechanism that actually restricts execution is **Regional Services (Data Localization Suite), an Enterprise add-on**, which also does not cover Queues or Cron Triggers and does not restrict outgoing subrequests ([Regional Services](https://developers.cloudflare.com/data-localization/regional-services/)) — and this project uses Queues for Stripe fan-out and Cron for quote expiry and no-show sweeps.

So for a solo non-Enterprise project there is currently no purchasable control guaranteeing EU-only Worker execution. What the design *can* guarantee, and should state to counsel: personal data comes to rest only in Supabase (Frankfurt) and EU-jurisdiction R2; Workers hold it transiently in memory for one request; nothing is written to KV, Durable Objects, or logs keyed by customer identity; Logpush excludes bodies carrying personal data or targets an EU sink.

---

## Decisions taken here

| # | Decision | Chosen | Rejected | Why | Depended on by |
|---|---|---|---|---|---|
| D1 | How identity reaches SQL | `set_config(role)` + `set_config(claims)`, both `is_local => true`, in one explicit transaction | session `SET`; multi-statement simple query; claims-as-function-args; no RLS | Postgres reverts it at COMMIT/ROLLBACK; keeps bound parameters and prepared statements; a lost `BEGIN` fails to set rather than leaking | Phase 3 (DATA-06), every later query |
| D2 | The security boundary | Grants on a privilege-less `vamos_edge` login role (`NOINHERIT`, `INHERIT FALSE, SET TRUE`) | trusting the claim to be set | A forgotten wrapper raises `42501`, not a stale-identity read | Phase 3, DATA-02/03/04 |
| D3 | Hyperdrive topology | Two configs: `HYPERDRIVE_NOCACHE` (cache-disabled, identity, transactions) and `HYPERDRIVE` (`vamos_public`, content, cacheable) | one config for everything | Cloudflare's own guidance: auth/session/permission/billing reads must be cache-disabled; also keeps the `pricing_live` flip out of a 60 s cache | Phase 3, Phase 4 |
| D4 | Staff role claim | `app_metadata.vamos_role` written by a Custom Access Token Hook reading the `staff` table | `user_metadata`; a static `app_metadata` write; the top-level `role` claim | `user_metadata` is user-writable; deriving per mint makes revocation immediate; `role` is schema-constrained to anon/authenticated | AUTH-05, Phase 6 ops |
| D5 | Second factor | `aal = 'aal2'` checked in SQL **and** in middleware **and** gated at invite-claim | middleware only; "has a factor enrolled" | Enrolled ≠ verified this session; a forgotten route guard must not be a bypass | AUTH-05, Phase 6 |
| D6 | Money storage | `create domain rappen as integer` (CHF minor units), one CHF amount everywhere | `numeric`; `bigint`; per-currency columns | The stored number *is* Stripe's `amount`; postgres.js returns numeric/int8 as strings; ADR-004 forbids per-currency columns | Phase 4, Phase 7, Phase 9 |
| D7 | Price durability | Versioned `rate_versions` batches + insert-only booking-level `price_snapshots` (typed totals + jsonb `lines`/`policy`) | `bookings.price_json`; normalised lines FK'd to live `surcharges`; SCD-2 recompute | The booking row is mutated by every dispatch action; a live FK resolves to today's label; SCD-2 reproduces inputs, not the decision | QUOTE-05, LIFE-03, Phase 4/7/9 |
| D8 | Snapshot line labels | i18n key + numeric params | the mock's English `label`/`rule` prose | Otherwise every German confirmation carries an English price line, frozen in an immutable row (Law 03) | Phase 4, `packages/emails` |
| D9 | `pricing_live` | Exactly one `rate_versions` row with `status='live'`, partial unique index, plus a `BEFORE INSERT` charge-gate trigger on `booking_payments` | `settings.pricing_live boolean` | A boolean is flipped by accident and records nothing; the trigger has no off switch | QUOTE-10, Phase 7, Phase 11 |
| D10 | Policy durability | `settings_versions` (immutable, policy fields) split from a mutable `settings` singleton (contacts, toggles) | one mutable settings row | LIFE-03 needs the *booked* policy; a live lookup gives month-7 answers to a month-2 booking | LIFE-03, Phase 9 |
| D11 | Return trips | One `bookings` row + `booking_legs`; **one** shared snapshot with `price_snapshot_legs` per-leg subtotals | two snapshots; `return_at` column; two bookings | ADR-006; one purchase, one price, one Stripe charge; the round-trip discount is booking-level | Phase 4, 8, 9 |
| D12 | Booking reference | `VT-YY-####` from a per-year sequence table, uniqueness enforced by index | random 4-digit (the mock's `cleanBooking`) | ADR-003 — the mock's generator is collision-prone by construction | Phase 4, emails, ops search |
| D13 | Enum convention | Native Postgres `ENUM` types for closed, stable, cross-table domains; `CHECK (x in …)` for churn-prone taxonomies (event kinds, actor kinds, consent method) | all-enum; all-CHECK | Enums become TS union types in `gen types`; `ADD VALUE` is cheap but rename/remove is painful, so what churns most stays CHECK | Phase 3 types, every later phase |
| D14 | Manage token | 32-byte opaque random, SHA-256 hashed in the Worker, stored `bytea` in a **separate** `booking_access_tokens` table, reusable | JWT; HMAC-signed; UUID; `bookings.manage_token uuid` column; single-use | A DB hit is unavoidable so statelessness buys nothing; mail scanners prefetch and would burn a single-use token; a separate table supports rotate/resend/revoke-on-claim without losing history | DATA-03, AUTH-06 (Phase 8) |
| D15 | Guest enforcement | RLS policy under `vamos_guest` for **reads**; `SECURITY DEFINER` RPC for **mutations** | pure RLS; pure definer-RPC | Both fail closed under D2; RLS keeps DATA-03 in one pgTAP-testable mechanism, definer functions give mutations one atomic check-and-act with `FOR UPDATE` | DATA-03, Phase 9 |
| D16 | Double-booking | Two partial `EXCLUDE USING gist` constraints on `booking_legs` (chauffeur, vehicle) over a `STORED` generated `tstzrange` | one combined constraint; app-level checking; a live `settings` join | A combined constraint only blocks the exact pair; generated columns cannot subquery; snapshotting matches QUOTE-05 | OPS-03 (Phase 8) |
| D17 | Turnaround buffer | `settings.chauffeur_turnaround_minutes` seeded **30**, snapshotted onto the leg at assignment | seed NULL per ADR-002 | ADR-002 governs *customer-facing* promises; this is an internal dispatch parameter that never renders publicly, and NULL would coalesce to zero buffer, under-blocking — the dangerous direction | Phase 8 |
| D18 | Audit split | `booking_events` (app-written, service role, no client write policy) + `audit_log` (trigger-written) | one universal table; N per-domain tables | The booking log needs semantic "why" and an actor a trigger cannot see; admin CRUD needs a trigger that cannot be forgotten | DATA-08, Phase 8 |
| D19 | Append-only | Trigger + `REVOKE UPDATE,DELETE` + RLS-with-no-policy + `FORCE ROW LEVEL SECURITY`, all four | grants alone; RLS alone | `service_role` carries `BYPASSRLS`; only the trigger catches a migration running as `postgres` | DATA-08, Phase 7 |
| D20 | Erasure | Redact-in-place + `erased_at`, row never deleted | `ON DELETE CASCADE` | CO Art. 958f 10-year duty; deleting would cascade-null a decade of financial history | Phase 10 |
| D21 | Migration tooling | Supabase CLI, hand-written timestamped SQL, pinned devDependency | declarative schemas + `db diff`; hand-rolled runner | RLS/grants/roles must be authored deliberately; the CLI already has ordered apply, remote history and the pgTAP runner | all later phases |
| D22 | Seed | Generated, committed, idempotent `seed.sql` from `apps/web/i18n/messages/*.json` + `app/vamos-reviews.js` | hand-typed INSERTs; a separate runtime seeding script | Hand-typing drifts on the next translation edit; a runtime script needs connection plumbing Phase 3 has not wired | DATA-07 |
| D23 | Types | `supabase gen types typescript --local`, committed, CI drift-checked | hand-written types; pgtyped/safeql | Free, always in sync with the migrations that are the source of truth | Phase 3 |
| D24 | R2 buckets | Create with `jurisdiction: "eu"` on the **first** creation call | location hint; default | The hint is "best effort and not a guarantee"; jurisdiction is irreversible after creation | Phase 6, Phase 10 |

---

## UNCERTAIN — must be settled before or during execution

| # | Item | Why uncertain | The check that settles it | Blocks |
|---|---|---|---|---|
| U1 | Can managed Supabase's `postgres` role run `grant authenticated to vamos_edge with inherit false, set true`? | PG16+ grant options exist and Supabase is on PG17, but the managed role's own privileges are not documented | Run exactly that statement in the staging SQL editor as the first migration step. If refused, fall back to `create role vamos_customer nologin` mirroring `authenticated`'s grants and use `TO vamos_customer` in policies — no other change | The roles migration (first file) |
| U2 | `set_config('role', $1, true)` ≡ `SET LOCAL ROLE $1` | `role` is a GUC so this is near-certain, but it is not stated in PG's parameter table | `begin; select set_config('role','authenticated',true); select current_user; commit; select current_user;` — expect `authenticated` then `vamos_edge`. Fallback: `tx.unsafe('set local role ' + PG_ROLE[kind])`, injection-free because `PG_ROLE` is a closed map | Phase 3 `withIdentity` |
| U3 | Does `supabase db push --include-seed` re-run the seed on every push or only once? | The CLI reference documents the flag but not the re-run semantics; a June 2026 community note says remote projects do not pick up seed files without it | `supabase db push --include-seed --dry-run` against a scratch project, then a real second push and diff row counts | The `deploy-staging.yml` migration step; makes `ON CONFLICT` load-bearing rather than optional |
| U4 | Postgres major version on the actual Supabase project | PG18 makes generated columns virtual by default; PG17 is STORED-only | `select version();` on staging. Writing `stored` explicitly is correct on both, so this is a confirmation, not a blocker | Nothing hard; confirm before the snapshot migration |
| U5 | Manage-link validity window (`N` days after the last leg) | 30 is the researcher's default, not an owner decision | Ask the owner. Until answered, `settings.manage_link_validity_days` seeds NULL and the issuance code must refuse to issue rather than pick a number — treat as an ADR-002-class labelled gap | Token issuance (Phase 4/7), the manage-booking plan |
| U6 | One snapshot row per **eligible class** per quote, or only the chosen class? | GSD-LAUNCH §4.1 is ambiguous: *"Returns all classes + a `quote_id`"* | Settle when the Phase 4 `/api/quote` response contract is written. Recommendation: one row per class — cheap at Zurich volume, and the unchosen rows are dispute evidence | Phase 4 |
| U7 | Is a coupon use consumed at quote time or payment time? | Decides whether `coupon_redemptions` FKs a snapshot or a payment | Owner answer to "should an abandoned quote burn a coupon use?" — check `docs/build/OWNER-ANSWERS.md`. Recommendation pending: consume at payment, with a soft KV reservation for the 30-minute window | The `coupon_redemptions` migration |
| U8 | Sub-rappen per-km rates | If the matrix quotes e.g. CHF 3.855/km, `per_km_rappen integer` truncates | Read the CHF matrix when it lands. Fix if needed: `per_km_millirappen integer`. The line **amount** stays integer rappen either way | `distance_rates` column type; safe to defer |
| U9 | `display_currency` on the snapshot — does the customer literally see `EUR 000` for a CHF 000 charge? | ADR-004 flags "the charge currency must be stated in words" as an unwritten requirement | Read `VamosLocale.money()` in `app/vamos-locale.js`, then get one line of checkout copy approved. If the answer is "only ever CHF", drop the column | Checkout copy (Phase 7); column is harmless meanwhile |
| U10 | Does `consent_log` need `ip_truncated` at all, and what is the retention ceiling for consent rows not tied to a booking? | nFADP/GDPR minimisation | Counsel. Ship the column nullable now; decide collection policy before Phase 10 turns the banner live | Phase 10 |
| U11 | Is a wheelchair declaration Art. 9 health data? | Purpose-dependent; genuinely unsettled | Counsel: does `bookings.note` (or a future `accessibility_requirements`) need an Art. 9 explicit-consent basis and restricted-access RLS? Until then, ordinary personal data at booking-row scope | Privacy-policy wording (Phase 6); not the migration |
| U12 | GDPR Art. 17(3)(b) vs (e) as the retention basis for a Swiss statutory duty | Art. 17(3)(b) says "Union or Member State law"; Swiss federal statute is arguably neither | Counsel. The redact-not-delete pattern is correct under either basis — only the citation in the privacy policy depends on it | Privacy-policy wording only |
| U13 | Is Regional Services available/affordable on this plan, and what does it cover? | ADR-007 currently proposes Smart Placement as if it were a compliance control; it is not | Cloudflare account team: (a) can DLS/Regional Services be added and at what cost, (b) coverage against booking POST, account reads, the ops route group, **plus Queues consumers and Cron handlers** (which it does not cover). If unavailable, ADR-007 needs rewriting around what is achievable | ADR-007 revision; Phase 10 release |
| U14 | Is opennextjs-cloudflare#501 (cookie folding) fixed in the pinned adapter version? | Open against v0.5.12 at research time | Read the changelog of the version pinned in `apps/web/package.json`. Use `NextResponse.next({ request })` regardless — it is Supabase's own recommended pattern | Phase 6 ops middleware |
| U15 | Production dashboard path for enabling the Custom Access Token Hook | Documented as "Authentication → Hooks (Beta)"; Beta labelling implies drift | Confirm against the live dashboard when wiring; pin the CLI/config version used | AUTH-05 execution |
| U16 | Round-trip discount percentage | ADR-006 explicitly defers it to the CHF matrix (Q11) | Owner, with the matrix. **Do not seed a number, not even in a fixture** | Phase 4 |
| U17 | What a deferred exclusion-constraint violation looks like to a dispatcher | The constraints ship `DEFERRABLE INITIALLY IMMEDIATE` so a driver swap and LIFE-06's flight-delay shift can complete as one transaction, but a violation surfaced at COMMIT arrives with no row context | **Phase 9** (flight-delay shift) with **Phase 8** (dispatch swap): decide whether the handler pre-checks with a `scheduled_range && …` query before deferring, or catches `23P01` at COMMIT and re-runs the check to name the conflicting leg | The delay handler and the ops swap action; nothing in Phase 2 |
| U18 | `booking_notifications` template vocabulary and locale fallback | Phase 2 ships the table and the `dedupe_key` contract (`booking_id:kind:leg_id`); what a `template_version` string looks like, and what happens when a template is missing in one of the four languages, is Resend/Phase 7 work | **Phase 7**: write the claim-then-send discipline against this table and fix the version string format before the first live send | LIFE-05 reminders, PAY-05's "double-send an email" clause |
| U19 | Stripe out-of-order and stuck-event handling | Phase 2 ships `stripe_created`, `object_id`, `processed_at`, `attempts`, `last_error` and the two indexes; the sweep interval, the retry ceiling and the "canceled after succeeded" resolution rule are handler decisions | **Phase 5/7**: define the cron sweep over `processed_at is null` and the per-object ordering rule on `(object_id, stripe_created)` | PAY-05 |
| U20 | Who generates `bookings.idempotency_key`, and its lifetime | The unique partial index ships now; whether the key is minted in the browser per checkout attempt or per quote, and how it maps onto Stripe's `Idempotency-Key`, is checkout work | **Phase 7**: fix the key's scope when the checkout POST contract is written | Double-charge protection on a retried checkout POST |
| U21 | The `booking_status` roll-up trigger | Phase 2 ships the vocabulary (`partially_cancelled`, `partially_completed`), the rule in the enum's comment, and the inline roll-up inside `manage_booking_cancel`; every *other* path that terminates a leg (ops cancel, no-show sweep, completion) must honour the same rule | **Phase 9**: land the trigger that maintains the roll-up for all paths, and re-point every ops/account query that reads `bookings.status` | LIFE-01, ADR-006 single-leg cancellation |
| U22 | Where the ops assign dialog gets `estimated_duration_minutes` for a phone booking | `booking_legs_assignable` now refuses an assignment without a duration, which is correct but makes the ops UI responsible for supplying one when Mapbox has not run (OPS-04) | **Phase 8**: the assign dialog carries the field, pre-filled from Mapbox where available and required otherwise; decide whether ops may enter a rough figure or must trigger a route lookup | OPS-03/OPS-04 |

### Where lanes disagreed

- **Guest-token enforcement (Lane 1 vs Lane 4):** resolved as D15 — RLS for reads, `SECURITY DEFINER` for mutations. Reasoning above.
- **`bookings.price_chf numeric` (GSD-LAUNCH §Phase 2:66) vs `price_snapshot_id` (Lane 2):** we follow Lane 2. The two documents must not both be implemented; the phase plan should record that GSD-LAUNCH line as superseded.
- **`bookings.manage_token uuid` (GSD-LAUNCH §Phase 2:68) vs `booking_access_tokens` (Lane 4):** we follow Lane 4.
- **`bookings.assigned_chauffeur_id` (GSD-LAUNCH §Phase 2) vs assignment on `booking_legs` (ADR-006, Lane 5):** we follow ADR-006.
- **Turnaround buffer seeding (Lane 5's "30" vs ADR-002's seed-NULL discipline):** we follow Lane 5, because ADR-002 governs customer-facing promises and this value never renders publicly; NULL would coalesce to a zero buffer and under-block.
- **`settings` as one singleton (Lanes 6/7) vs split into `settings` + `settings_versions` (Lane 2):** we follow Lane 2's split. The seed generator must be told about both tables.

---

## Owner blockers that touch this schema

### 1. The CHF price matrix — open

**Forces these column nullabilities, and they are not negotiable until it lands:**

- `distance_rates.base_fare_rappen`, `.per_km_rappen`, `.min_fare_rappen` — **nullable**, seeded NULL.
- `fixed_routes.price_rappen` — **nullable**, seeded NULL, `live` default `false`.
- `surcharges.amount_rappen`, `.percent` — **nullable**, seeded NULL; only `kind` and `code` are seeded.
- `price_snapshots.subtotal_rappen`, `.surcharges_rappen`, `.discount_rappen`, `.total_rappen` — **nullable**, with an all-or-nothing CHECK so there are no half-priced rows.
- `bookings.price_total_rappen` (the ops-board cache) — **nullable**.

**Forces this `pricing_live` behaviour:** the seed inserts **no** `rate_versions` row with `status='live'`. Therefore `price_snapshots.rate_version_is_live` is false on every row, the `STORED` generated `is_chargeable` is false, and `tg_payment_matches_snapshot` refuses every `booking_payments` insert. A fresh environment **cannot** charge, and every amount reads `CHF 000` by data rather than by a UI conditional. Staging may show draft numbers under `PRICING_PREVIEW=true`, which changes display only. The launch trigger is one attributed `UPDATE rate_versions SET status='live'`, guarded by the partial unique index.

**Never invent a CHF price** — not in a migration, not in the seed, not in a fixture, not in a screenshot.

### 2. The policy numbers — partially open

- `free_cancel_hours`: the owner has confirmed 24 h and the 100 % / 75 % / 0 % tiers as a decision, but ADR-005 keeps the value settings-driven so no surface can disagree. Seed `settings_versions.free_cancel_hours = 24` and `cancellation_tiers` as the three-element array, in **one dated row**, so LIFE-03 can quote the booked policy.
- `airport_waiting_minutes`, `city_waiting_minutes`: **seed NULL**, never 60/15 (ADR-002). NULL is what renders the Law 04 TBC pill on the ops settings screen and in the snapshot's `policy` object, so an unchosen number cannot quietly start being read as chosen.
- `min_advance_minutes`: not owner-confirmed. Seed NULL and let the quote engine refuse rather than pick a number.
- `manage_link_validity_days`: not owner-confirmed (U5). Seed NULL.
- `chauffeur_turnaround_minutes`: **seed 30** — internal, never rendered, and NULL would under-block the exclusion constraint (D17).

### 3. Vehicle and destination photography — open

`vehicles.photo_path`, `chauffeurs.photo_path`, `reviews.avatar` are nullable text. Does not block Phase 2; blocks Phase 6 rendering without placeholder fallbacks.

### 4. Data residency / Worker pinning — open with counsel (ADR-007)

No schema impact. Two irreversible-or-early decisions this phase must still take correctly: R2 buckets created `jurisdiction: "eu"` (D24), and KV keys kept non-personal by design. The correction in Lane 7 — that Smart Placement is not a residency control — should go back into ADR-007 before counsel signs off on the option as currently written.

---

## Proposed Phase 2 plan split

Seven plans. The sequencing rule is that **P1 is a hard gate** (nothing compiles without roles,
extensions and types) and **P6 is a hard gate in the other direction** (grants and policies must be
authored in one pass, over the finished table set, or the "revoke everything first" line in `0020`
silently un-grants a table a later plan added). Between those two, P2/P3/P4 touch disjoint
migration files and can run in parallel; P5 depends only on P4's tables existing.

| # | Plan | Goal (one line) | File scope | Depends on | Parallel with |
|---|---|---|---|---|---|
| **P1** | **Foundation: extensions, roles, helpers, types** | A database that a migration can be written against at all: `citext`/`pgcrypto`/`btree_gist`/`pgtap`, the four roles, the `app.*` identity helpers, every enum and the `rappen` domain | `0001_extensions`, `0002_roles_and_helpers`, `0003_types`, `tests/extensions.test.sql`, `packages/db/supabase/config.toml` | — | nothing (hard gate) |
| **P2** | **Reference data: settings, fleet, people, staff auth** | The tables ops curates plus the AUTH-05 identity surface: `settings`/`settings_versions`, `vehicle_classes`/`vehicles`/`chauffeurs`, `customers`, `staff`, the Custom Access Token Hook **and its `supabase_auth_admin` policy** | `0004_settings`, `0005_fleet`, `0006_customers_and_staff`, `tests/staff_hook_claim.test.sql` | P1 | P3, P4 |
| **P3** | **Pricing: versioned batches and the publish gate** | A matrix that cannot go live half-priced or be edited once published: `rate_versions` (+`slug`), `service_zones`, `distance_rates`, `fixed_routes`, `surcharges`, `coupons`, the freeze trigger with its availability carve-out, and the transition/validation trigger | `0007_rate_versions`, `0008_coupons`, `tests/rate_version_publish.test.sql` | P1 (needs `vehicle_classes` from P2 for its FK — take the FK in P3, the table in P2, and merge on the same branch, or run P3 after P2's `0005`) | P4 (file-disjoint) |
| **P4** | **Booking core: bookings, legs, manage token, dispatch exclusion** | The commercial record and the dispatchable unit, with OPS-03's exclusion constraints correct on day one: reference generator, `bookings` (+`idempotency_key`), `booking_legs` (+assignability CHECKs, deferrable exclusions, buffer trigger), `booking_access_tokens`, `app.booking_has_manage_token`, `manage_booking_*` | `0009_bookings`, `0010_booking_legs`, `0011_booking_access_tokens`, `0011a_coupon_redemptions`, `tests/exclusion.test.sql`, `tests/reference_format.test.sql` | P1, P2 (`customers`), P3 (`coupons`) | P3 late-stage |
| **P5** | **Money and evidence: snapshots, payments, ledgers, consent** | The forward-designed shapes Phase 4/7/9 bind to: `price_snapshots` (+`price_snapshot_legs`, rate-version-flag trigger), `booking_payments` (charge gate + update whitelist), `booking_refunds`, `stripe_events`, `booking_notifications`, `booking_events`, `audit_log`, `consent_log` + `record_consent()`, and the four append-only layers | `0012`–`0016`, `0015a_consent_log`, `tests/charge_gate.test.sql`, `tests/append_only.test.sql`, `tests/consent_write.test.sql` | P4 | P6 authoring can start, but not land |
| **P6** | **RLS: enable everywhere, then policies per actor** | DATA-02/03/04 proved by grants first and policies second, in one pass over the finished table set, plus §14f Realtime authorization | `0018_content_and_reviews`, `0019_rls_enable`, `0020_rls_customer`, `0021_rls_guest`, `0022_rls_staff`, `0023_rls_public`, `tests/{bookings_customer_rls,bookings_manage_token_rls,ops_role_rls,ops_write_denied,customer_columns,settings_public,fail_closed}.test.sql` | P2, P3, P4, P5 (**every** table must exist first) | nothing (hard gate) |
| **P7** | **Seed, types and the CI gate** | DATA-07: a fresh environment loads vehicle classes, settings, content strings and reviews, twice, with the same row counts — and CI proves the whole stack applies from zero | `packages/db/seed/generate-seed.mjs`, `supabase/seed.sql`, `packages/db/database.types.ts`, `.github/workflows/pr.yml` + `deploy-staging.yml` + `deploy-production.yml`, `tests/seed_idempotent.test.sql` | P6 (seeding runs as owner, but the CI job runs the whole reset including policies) | — |

### Sequencing, plainly

```
P1 ──┬── P2 ──┬── P4 ── P5 ──┬── P6 ── P7
     └── P3 ──┘              │
                             └── (P6 authored in parallel, landed after P5)
```

Wave 1: **P1** alone.
Wave 2: **P2** and **P3** in parallel (P3's only cross-dependency is the `vehicle_classes` FK).
Wave 3: **P4**, then **P5**.
Wave 4: **P6** alone — deliberately not parallelised, because `0020` opens with
`revoke all on all tables in schema public` and two agents adding grants in different files at the
same time is exactly how a table ends up ungranted or over-granted.
Wave 5: **P7**.

### What cannot be fully verified until Phase 3 (Hyperdrive)

Everything in Phase 2 is provable locally with `supabase db reset` + `supabase test db` — pgTAP can
`set local role` and `set local request.jwt.claims` itself, so DATA-02, DATA-03, DATA-04 and
AUTH-05's SQL half are all verifiable now, on a laptop, without a Worker.

Three things are not:

- **DATA-06 (no identity leak across a pooled connection)** — needs the `HYPERDRIVE_NOCACHE`
  binding and a deployed Worker. Phase 2's job is to make the proof *possible*: the privilege-less
  `vamos_edge` login role and the `revoke all` baseline are what turn "a forgotten wrapper leaks
  the previous request's rows" into "a forgotten wrapper raises `42501`". **P1** and **P6** carry
  that obligation; the test itself is Phase 3's.
- **U1 — whether managed Supabase's `postgres` can run `grant authenticated to vamos_edge with
  inherit false, set true`** — this is the first statement of the first migration and it either
  works on the real project or the fallback role (`vamos_customer`) changes every `TO authenticated`
  in **P6**. Run it in the staging SQL editor *before* P1 is written, not after.
- **U3 — whether `db push --include-seed` re-runs the seed** — decides whether **P7**'s
  `ON CONFLICT` discipline is load-bearing or merely tidy, and it can only be answered against a
  real Supabase project. P7 assumes it is load-bearing and CI-checks it either way.

The `supabase_auth_admin` hook policy (**P2**) is a fourth, softer case: pgTAP can call the hook
function directly and assert the claim comes back, but that the *auth server* actually invokes it
is a dashboard setting (U15) confirmed on staging, not in the local suite.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pgTAP, run via `supabase test db` (Supabase CLI — pinned in Wave 0 as `pnpm add -D -w supabase`, exact version, no `^`; mirrored in CI by `supabase/setup-cli@v1`) |
| Config file | `packages/db/supabase/config.toml` — does not exist yet, created in Wave 0 by `supabase init` |
| Quick run command | No confirmed per-file flag for `supabase test db` in the research (only the CLI reference for the whole-suite behaviour was checked). Treat the quick command as the same full run: `supabase test db` |
| Full suite command | `supabase db reset && supabase test db` |
| Estimated runtime | ~30–60s (local Postgres reset + migration replay + pgTAP pass) — no measured baseline; small schema, no seed-scale data yet |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-01 | The schema mirrors the `VamosOps` contract: bookings, booking events, customers, chauffeurs, vehicles, vehicle classes, coupons, fixed routes, distance rates, surcharges, reviews, content strings and settings | CI job | `supabase db reset` (apply-from-zero, PR gate) | ❌ Wave 0 |
| DATA-02 | Row-level security is on for every customer and operational table, and a customer can read only their own bookings | pgTAP | `supabase test db` → `tests/bookings_customer_rls.test.sql` | ❌ Wave 0 |
| DATA-03 | A guest can open their booking with a valid manage token and nothing else | pgTAP | `supabase test db` → `tests/bookings_manage_token_rls.test.sql` | ❌ Wave 0 |
| DATA-04 | Staff reach ops data through a role claim; customers never can | pgTAP | `supabase test db` → `tests/ops_role_rls.test.sql`, `tests/ops_write_denied.test.sql` | ❌ Wave 0 |
| DATA-07 | Seed data loads vehicle classes, settings, content strings and the existing reviews into a fresh environment | pgTAP + CI job | `supabase db reset` then `supabase test db` → `tests/seed_idempotent.test.sql` | ❌ Wave 0 |
| AUTH-05 | Staff sign in by invitation only and must pass a second factor | pgTAP (SQL half only) | `supabase test db` → `tests/staff_hook_claim.test.sql` — `aal2` gate is SQL-provable; hook enablement itself is manual/staging (U15) | ❌ Wave 0 |
| OPS-03 *(forward-designed, Phase 8)* | A dispatcher assigns a chauffeur and a vehicle, and the same driver cannot be double-booked for overlapping trips | pgTAP | `supabase test db` → `tests/exclusion.test.sql` | ❌ Wave 0 |
| QUOTE-10 *(forward-designed, Phase 4)* | Until the CHF matrix is loaded and approved, the engine runs behind `pricing_live=false` and no charge can post against a non-live rate version | pgTAP | `supabase test db` → `tests/charge_gate.test.sql`, `tests/rate_version_publish.test.sql` | ❌ Wave 0 |
| DATA-08 *(forward-designed foundation, Phase 8)* | Every booking, price, payment and assignment change writes an append-only event that ops can read as a timeline | pgTAP | `supabase test db` → `tests/append_only.test.sql` | ❌ Wave 0 |
| Seed idempotency (twice, same counts) | A second `supabase db reset` (or `--include-seed` push) produces identical row counts, never duplicates | pgTAP | `supabase db reset` run twice, diff counts → `tests/seed_idempotent.test.sql` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `supabase test db` (full pgTAP pass — no narrower command confirmed)
- **Per wave merge:** `supabase db reset && supabase test db`
- **Phase gate:** Full suite green before `/gsd:verify-work`, plus the `pr.yml` CI job (`db reset` → `test db` → `gen types` + `git diff --exit-code`) green on the phase's final PR

### Wave 0 Gaps
- [ ] Framework install: `pnpm add -D -w supabase` (pinned exact) + `supabase/setup-cli@v1` in CI — `packages/db/supabase/` does not exist yet
- [ ] `packages/db/supabase/config.toml` — created by `supabase init`
- [ ] `tests/extensions.test.sql` — P1, `citext`/`pgcrypto`/`btree_gist`/`pgtap` bootstrap
- [ ] `tests/staff_hook_claim.test.sql` — P2, AUTH-05
- [ ] `tests/rate_version_publish.test.sql` — P3, QUOTE-10 publish gate
- [ ] `tests/exclusion.test.sql` — P4, OPS-03
- [ ] `tests/reference_format.test.sql` — P4, `VT-YY-####` reference generator
- [ ] `tests/charge_gate.test.sql` — P5, QUOTE-10 charge-gate trigger
- [ ] `tests/append_only.test.sql` — P5, DATA-08 foundation
- [ ] `tests/consent_write.test.sql` — P5, `consent_log` append-only write
- [ ] `tests/bookings_customer_rls.test.sql` — P6, DATA-02
- [ ] `tests/bookings_manage_token_rls.test.sql` — P6, DATA-03
- [ ] `tests/ops_role_rls.test.sql` — P6, DATA-04
- [ ] `tests/ops_write_denied.test.sql` — P6, DATA-04
- [ ] `tests/customer_columns.test.sql` — P6, DATA-02 column-level exposure
- [ ] `tests/settings_public.test.sql` — P6, DATA-04 public settings read
- [ ] `tests/fail_closed.test.sql` — P6, D2 fail-closed grants
- [ ] `tests/seed_idempotent.test.sql` — P7, DATA-07
- [ ] Manual/staging only, no local test: **U1** (`grant authenticated to vamos_edge …` probe in the staging SQL editor before P1 is written), **U3** (`supabase db push --include-seed --dry-run` re-run semantics against a real project), **U15** (Custom Access Token Hook dashboard enablement, confirmed on staging)

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Supabase Auth, invite-only (`auth.admin.inviteUserByEmail`), no public staff sign-up |
| V3 Session Management | yes | `aal = 'aal2'` checked in SQL and in middleware, and gated at invite-claim (D5) |
| V4 Access Control | yes | RLS enabled on every table, privilege-less `vamos_edge` login role, `revoke all` fail-closed baseline (D2/D15) |
| V5 Input Validation | yes | Native enums / `CHECK` / `create domain rappen as integer` at the schema layer (D13, D6); zod at the Worker layer is Phase 3's job |
| V6 Cryptography | yes | `pgcrypto` for `gen_random_bytes`, SHA-256 manage-token hashing done in the Worker before storage (D14); never hand-rolled |

### Known Threat Patterns for Postgres + Supabase + Hyperdrive pooling + Stripe

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Identity leak across a pooled Hyperdrive connection | Information Disclosure | `set_config('role'/'request.jwt.claims', …, is_local => true)` inside one explicit transaction (D1) |
| Forgotten RLS wrapper on a query path | Elevation of Privilege | Privilege-less `vamos_edge` role + fail-closed `revoke all` baseline, so a miss raises `42501` (D2) |
| User-writable role claim via `user_metadata` | Spoofing | `app_metadata.vamos_role` written server-side by the Custom Access Token Hook, never client-settable (D4) |
| Enrolled-but-unverified MFA factor treated as authenticated | Spoofing | `aal2` gate checked in SQL and middleware, not "has a factor enrolled" (D5) |
| Single-use manage token burned by a mail client's link-prefetch | Denial of Service | Reusable, SHA-256-hashed opaque token in a separate `booking_access_tokens` table (D14) |
| Double-charge on a retried checkout submission | Tampering | Partial unique index on `bookings.idempotency_key` |
| Charging against a non-live or since-edited rate version | Tampering | `tg_payment_matches_snapshot` charge-gate trigger over the frozen `rate_versions` snapshot (D9) |
| Audit rows mutated or deleted by `service_role` (carries BYPASSRLS) | Repudiation | Trigger-written table + `revoke update, delete` + RLS-with-no-policy + `force row level security` (D19) |
| Driver or vehicle double-booked for overlapping trips | Tampering | GiST `EXCLUDE USING gist` partial constraints on `booking_legs` (D16) |
| Erasure request cascading away the 10-year statutory financial record | Repudiation | Redact-in-place, `erased_at` set, row never deleted (D20) |

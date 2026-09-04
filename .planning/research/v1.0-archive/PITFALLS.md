# Pitfalls Research

**Domain:** Swiss pre-booked transfer platform — Next.js on Cloudflare Workers (OpenNext) + Supabase/Hyperdrive + Stripe, ported from finished `.dc.html` mocks
**Researched:** 2026-08-17
**Confidence:** MEDIUM-HIGH (Cloudflare/Stripe/Supabase official docs and engineering blogs cross-checked against community bug reports; booking-domain and porting pitfalls are derived from the project's own constraints in `PROJECT.md`/`CLAUDE.md`/`CONCERNS.md`, not third-party sources)

This file assumes `.planning/codebase/CONCERNS.md` — mock auth, missing screens, 173 `data-tok` placeholders, the five owner blockers, the compiled-only design system bundle — and does not restate it. Everything below is what breaks *after* those known gaps are closed, during the actual production port.

## Critical Pitfalls

### Pitfall 1: The i18n runtime pattern (DOM-text-walking) does not survive the move to Next.js SSR/RSC

**What goes wrong:**
`VamosLocale`/`vamos-i18n-dict.js` works today by rendering English markup and then walking the DOM to relabel every text node, attribute and pattern in place, re-running "on every React re-render." That is a client-side, post-paint mutation pass. Ported naively into Next.js App Router, three things break at once: (1) Server Components render on the server with no DOM to walk, so anything in a Server Component stays English forever unless the walker is replaced with real server-side translation; (2) pages that *are* client components will server-render English, then flash-relabel after hydration — a visible English flash on every load, and a Lighthouse/SEO hit because crawlers and the initial paint see English; (3) if the walker runs as a raw DOM mutation outside React's render cycle, React's reconciler can silently revert it on the next re-render, causing flicker or reverted-to-English regressions that only show up under load or fast navigation.

**Why it happens:**
The mock's translation model was built for a static-HTML delivery model (`.dc.html` + client JS), which has no SSR concept. Porting "the same class names carry over verbatim" naturally becomes "the same runtime carries over verbatim," but the runtime's core trick (mutate the DOM after render) is exactly what SSR frameworks make unsafe.

**How to avoid:**
Decide once, in Phase 1, which of two shapes the runtime takes — do not let it drift page by page:
- **Option A (recommended):** Convert `vamos-i18n-dict.js` into a lookup consumed by a `t()`/`useT()` call at render time (server *and* client), so strings are translated as part of the React tree, never after it. This keeps the same dictionary file and the same `de`/`fr`/`ar` + `patterns` structure CLAUDE.md mandates — it changes *how* a component reads it, not the dictionary itself.
- **Option B:** Keep the DOM-walking runtime, but scope it to a `'use client'` boundary only, run it inside a `useLayoutEffect` (not a bare script), and accept the SSR flash by rendering the *user's stored locale* server-side (read the cookie/header in the RSC, not always English) so the flash only occurs on a genuine first-visit default.
Either way, RTL (`dir="rtl"`) must be set by the root `<html>` on the server render, not applied client-side after hydration — an RTL page that boots LTR and flips is a worse experience than a translation flash.

**Warning signs:** Any page where German/French/Arabic strings are visibly English for a frame on load; `view-source` on a deployed staging URL shows English where the browser shows German; Arabic pages that render LTR then snap to RTL.

**Phase to address:** Phase 1 (design system → React port), as an explicit architecture decision before any page is ported — this determines the shape of every component built after it.

---

### Pitfall 2: Hyperdrive pointed at Supabase's already-pooled connection string (double pooling)

**What goes wrong:**
Hyperdrive is itself a connection pooler sitting in front of Postgres. Supabase also ships its own pooler (Supavisor/PgBouncer) on port 6543 in transaction mode. Configuring the Hyperdrive binding with Supabase's *pooled* connection string stacks two transaction-mode poolers. Symptoms show up late, under real concurrency, not in early testing: prepared-statement errors (`prepared statement "..." already exists` / `does not exist`), session-scoped `SET`/`SET LOCAL` calls silently not applying to the statement that follows, and connections that appear to "forget" state mid-request.

**Why it happens:** Supabase's project dashboard surfaces the pooled (6543) string as the default "just works everywhere" connection string, and it is the one usually copied into any generic "connect an app" flow. Hyperdrive's own docs and Supabase's own docs each assume you talk to the *other's* pooling layer, not both.

**How to avoid:** Point the Hyperdrive binding at Supabase's **direct/session connection string** (port 5432, or the IPv4 direct connection Supabase provides for external poolers), and let Hyperdrive be the only pooling layer between the Worker and Postgres. Confirm this explicitly in the Hyperdrive config review, not just once at setup — a rotated Supabase connection string is an easy place to silently regress back to the pooled URL.

**Warning signs:** Intermittent `prepared statement already exists` errors under load; RLS-dependent queries that behave differently under concurrent load than in a single manual test; connection count in Supabase's dashboard behaving unpredictably relative to Worker traffic.

**Phase to address:** Phase 3 (Hyperdrive data access wiring) — verify with a load test (not just a smoke test) before Phase 4 builds pricing logic on top of it.

---

### Pitfall 3: RLS session context (`SET LOCAL` / `auth.uid()`) leaking or failing across pooled connections

**What goes wrong:** `PROJECT.md` requires "RLS on every customer or operational table," and the Worker talks to Postgres directly via Hyperdrive (not through Supabase's Data API/PostgREST, which is what normally carries a JWT into `auth.uid()` for you). That means the Worker itself is responsible for establishing the RLS identity per request — typically `SET LOCAL request.jwt.claims = '...'` or an equivalent `set_config(..., true)` call inside the same transaction as the query. Under transaction-mode pooling, a plain `SET` (not `SET LOCAL`) persists on the physical connection after it's returned to the pool and can leak into the *next, unrelated* request that reuses that connection — a customer could theoretically see another customer's row if the identity-setting call and the data query are not atomically scoped to one transaction.

**Why it happens:** RLS setup guides are almost universally written for the Supabase Data API path, where auth context is handled per-request by PostgREST automatically. This project's direct-Postgres path (chosen for query latency, per `PROJECT.md`'s "p50 query under 30 ms") means that safety net doesn't exist and has to be re-implemented by hand.

**How to avoid:**
- Every authenticated query wraps identity-setting and the data query in a single explicit transaction, using `SET LOCAL` (transaction-scoped, auto-resets on commit/rollback) — never plain `SET`.
- Treat "does a leaked/stale session variable ever survive a request" as a specific test case in Phase 2/3, not an assumption: write an integration test that runs two concurrent requests as two different customers against a small connection pool and asserts row isolation.
- Where a query doesn't need per-user RLS context (server-authoritative pricing reads, ops-role queries), use a distinct Postgres role with its own grants instead of RLS+session-claim gymnastics, so the sensitive path (customer-scoped RLS) stays small and auditable.

**Warning signs:** RLS policies that only get manually tested one request at a time; no automated test asserting cross-tenant row isolation under concurrency; any code path using `SET` instead of `SET LOCAL`.

**Phase to address:** Phase 2 (schema + RLS design) for the policy shape, Phase 3 (Hyperdrive wiring) for the transaction-scoping implementation — this is a security-critical seam between those two phases and should have an explicit verification step at the Phase 3 boundary.

---

### Pitfall 4: Hyperdrive's query result caching serves stale prices, availability or the synthetic price matrix past its `pricing_live` flag

**What goes wrong:** Hyperdrive caches results of identical read queries for a configurable TTL (default on the order of a minute) to cut round trips to Postgres. Applied to a quote/availability/pricing read, this means two customers hitting the same route within the cache window can get an identical cached quote even though the underlying rate, surcharge or coupon table changed in between — or, worse, a `pricing_live=false → true` flip doesn't take visible effect until every cached query key expires, so the site can keep serving `CHF 000` synthetic pricing for up to the cache TTL after the real matrix goes live.

**Why it happens:** Hyperdrive's caching is opt-in-by-default at the binding level for read queries and is easy to leave at its default because it measurably helps the "p50 query under 30 ms" target the project is chasing — the tradeoff (staleness) doesn't show up until a price actually changes.

**How to avoid:** Disable or tightly scope Hyperdrive query caching (`caching: { disabled: true }` or a very short `max_age`/`stale_while_revalidate`) specifically for the pricing engine's read path and for any query gated by `pricing_live`. Keep caching on for genuinely static reads (vehicle class metadata, published legal copy) where staleness of a minute is harmless. Treat the cache TTL as a deliberate per-query decision, not a global default left untouched.

**Warning signs:** A price or rate change made in ops doesn't reflect on the public quote widget for up to a minute in staging; QA reports "the fix works but only sometimes" for pricing bugs.

**Phase to address:** Phase 4 (pricing engine) — decide the caching policy per query when the engine is built, and re-verify at Phase 9 (production cutover) when `pricing_live` actually flips.

---

### Pitfall 5: Stripe webhook signature verification breaks silently on Workers if the SDK isn't configured for the Workers runtime

**What goes wrong:** Stripe's Node SDK's default `stripe.webhooks.constructEvent()` depends on synchronous Node `crypto`, which is not available (or not reliable) under `nodejs_compat` on Workers. The failure mode is not a clean crash in every case — depending on SDK version and polyfill coverage it can throw at deploy time, throw only on the first real webhook, or (worse) silently fail signature verification in a way that's caught by a broad `catch` and swallowed, so bookings quietly stop confirming with no obvious error in logs until someone reconciles against the Stripe dashboard.

**Why it happens:** Almost all Stripe integration guides target Node.js servers or Vercel/Next.js API routes running the Node runtime, where `constructEvent` just works. Nothing in the standard Stripe quickstart flags that the Workers runtime needs the async, Web-Crypto-based path.

**How to avoid:**
- Initialize Stripe with `httpClient: Stripe.createFetchHttpClient()` and use `stripe.webhooks.constructEventAsync()` (not `constructEvent`) everywhere on Workers.
- Read the webhook body with `await request.text()` **before** any JSON parsing and before any other code touches the request stream — Workers Request bodies can only be consumed once, and OpenNext's request handling makes it easy to accidentally read the body twice across a middleware/route boundary.
- Add an integration test that POSTs a real Stripe CLI-forwarded webhook against the deployed staging Worker (not just `wrangler dev`), because signature verification is one of the classic "works locally, fails deployed" traps for this exact reason (see Pitfall 12).

**Warning signs:** Webhook signature errors that only appear in the Stripe Dashboard's webhook delivery log, not in Worker logs; bookings stuck in a "payment pending" state despite a successful charge in Stripe.

**Phase to address:** Phase 5 (checkout/payments) — build and test the webhook handler against a real deployed Worker before wiring any booking-confirmation logic to it.

---

### Pitfall 6: Booking confirmation trusts the browser return-redirect instead of the webhook, and races TWINT's async redirect flow

**What goes wrong:** Card payments via Stripe Elements can *feel* synchronous (the browser gets a result immediately), which tempts a design where the booking is confirmed on the client-side "success" callback or the `return_url` handler. TWINT is a redirect-based, asynchronous payment method by design — Stripe doesn't authorize it inline, the customer leaves for the TWINT app/page and comes back, and the definitive "it succeeded" signal is the webhook, not the redirect. A confirmation flow built around the redirect will: intermittently confirm bookings that later fail (customer closes the TWINT app before completing, browser redirect still fires), fail to confirm bookings that did succeed (customer's connection drops on the way back, webhook still arrives), or double-confirm (redirect handler and webhook both try to finalize the same booking).

**Why it happens:** Building and testing against cards first (the common path) makes the redirect-driven design look correct, because for the immediate-auth methods it mostly is. The gap only appears once TWINT (or a failed/abandoned card 3DS challenge) is tested end to end.

**How to avoid:** The webhook (`payment_intent.succeeded`, and for redirect methods specifically `checkout.session.completed`/`payment_intent.processing → succeeded`) is the only source of truth for "this booking is paid." The return-URL page is UI only — it shows a "confirming your payment…" state and polls or subscribes (Supabase Realtime is already in the stack) for the booking's status to flip, rather than flipping it itself. Make the webhook handler idempotent (keyed on Stripe event id, `INSERT ... ON CONFLICT DO NOTHING` against a processed-events table, not a check-then-act) so a retried or duplicate delivery — Stripe retries for up to three days — never double-charges state changes. Explicitly test the full TWINT sandbox flow (not just cards) before calling checkout done, including an abandoned/expired TWINT session.

**Warning signs:** Any code path where a booking's `status` is set to `confirmed` from a client-side event handler or a `return_url` route rather than from the webhook handler; no idempotency/dedup table for processed Stripe event ids; TWINT never actually exercised in Stripe's test mode before launch sign-off.

**Phase to address:** Phase 5 (checkout/payments) for the architecture; explicit TWINT sandbox test pass before Phase 9 (cutover).

---

### Pitfall 7: Refund and cancellation amounts computed against the *current* policy instead of the policy in force when the booking was made

**What goes wrong:** The cancellation tiers (100%/75%/0%, owner decision 2) or the waiting-time/no-show fees (still behind `data-tok` per `CONCERNS.md`) will change over the product's life — a fee gets adjusted, a tier boundary moves. If a cancellation or no-show refund is computed by reading the *live* policy/settings table at the moment of cancellation, every historical booking's refund silently follows the new policy retroactively, which is both a customer-trust problem (a booking made under one promise gets refunded under another) and a potential legal/consumer-protection problem in Switzerland, where the confirmation email is the contract.

**Why it happens:** It's the natural, simplest implementation — read the current settings row — and it works correctly for every manual test done close to when the policy was set, because there's been no policy change yet to expose the bug.

**How to avoid:** Apply the same "price snapshot" discipline the roadmap already needs for fares (see Pitfall 8) to policy: at booking-confirmation time, write an immutable snapshot of the cancellation tiers, waiting-time allowance, and no-show fee that applied to *that* booking — either as a denormalized JSON column on the booking row or a foreign key to a versioned policy table (`policy_version_id`), never a live read of "current settings" at cancellation time. Refund/no-show calculations always read the snapshot, never the settings table directly.

**Warning signs:** A refund calculation function that takes only a `booking_id` and internally does `SELECT * FROM settings` rather than reading from the booking row itself; no `policy_version` concept in the schema.

**Phase to address:** Phase 2 (schema design) — the versioned-policy pattern needs to exist before Phase 4/5 write any pricing or cancellation logic against it.

---

### Pitfall 8: Live-rate joins instead of price snapshotting rewrite booking history when a rate or surcharge changes

**What goes wrong:** Same failure shape as Pitfall 7, applied to the fare itself. If a booking's displayed/reported price is computed by joining to the current rate/surcharge/coupon tables rather than storing the computed total at quote-lock or payment time, then editing a rate for tomorrow's bookings silently changes the displayed price of a booking made and paid for last week — breaking reconciliation against what Stripe actually charged, and breaking any customer-facing "your receipt" view.

**Why it happens:** The pricing engine (per-km, fixed-route override, surcharges, coupons) is naturally built as a function of current rate tables, because that's exactly what it needs to be for a *new* quote. It takes a deliberate extra step to also persist the computed result immutably against the booking, and that step is easy to skip when the engine is first built and tested against fresh data only.

**How to avoid:** The pricing engine has two distinct outputs that must not be conflated: (1) `computeQuote(...)` — a pure function of current rate state, used for new quotes; (2) the booking row's `price_snapshot` — the frozen output of that function at the moment the quote locked (see Pitfall 9), written once and never recomputed. Every downstream read (checkout summary, confirmation email, ops booking detail, refund calculation, financial reporting) reads the snapshot, never re-runs the pricing function. Add a test that changes a rate after a booking exists and asserts the existing booking's displayed price is unchanged.

**Warning signs:** A booking detail page or confirmation email that computes price by re-running the pricing function against the booking's route/date rather than reading a stored total; no `price_snapshot` or equivalent column in the schema design.

**Phase to address:** Phase 4 (pricing engine) — design the snapshot boundary as part of the engine's contract, not as an afterthought once checkout is built.

---

### Pitfall 9: Quote-lock expiry race lets a stale, cheaper quote get paid after prices moved on

**What goes wrong:** `PROJECT.md` requires the quote to "lock for 30 minutes and survive into checkout." If expiry is enforced only in the UI (a countdown timer, a disabled button) rather than server-side at the moment of payment, a customer can complete payment on an expired quote — via a stale open tab, a replayed request, or simply a slow checkout — and pay (or be charged) the old, potentially wrong price. The inverse race also matters: two rapid requests around the expiry boundary (one arriving at 29:59, a retry at 30:01) must not both succeed or both silently fail.

**Why it happens:** The 30-minute lock is easy to implement as "store an `expires_at` and check it when rendering the checkout page," which correctly blocks the common case (a customer who waited too long) but doesn't defend the payment-creation step itself, which is where money actually moves.

**How to avoid:** Re-validate `expires_at` (and re-verify the quote hasn't been superseded) inside the same server-side transaction that creates the Stripe PaymentIntent/Checkout Session — not just when rendering the page. Treat quote-lock validation as a payment-creation precondition, not a page-load precondition. Use the database as the arbiter of "is this quote still valid" (a `WHERE expires_at > now()` on the creation query, not an application-layer `Date.now()` comparison that can be skewed) so there's one consistent clock.

**Warning signs:** Quote expiry enforced only in a React countdown/disabled-button; the PaymentIntent-creation endpoint doesn't independently check `expires_at` against the database.

**Phase to address:** Phase 4/5 boundary (pricing engine → checkout) — the quote-lock validation must live in the payment-creation code path, and that seam should be called out explicitly in that phase's plan.

---

### Pitfall 10: Driver double-assignment from a manual ops action without a database-level exclusion constraint

**What goes wrong:** The ops console assigns drivers manually (no automated dispatch, per `PROJECT.md`'s explicit out-of-scope). Two dispatchers (or one dispatcher clicking twice, or a slow UI retried) assigning the same driver to two overlapping pickup windows is a real, likely failure mode precisely *because* it's manual and human-paced rather than algorithmic — humans make exactly this kind of double-booking mistake, especially under load on a busy morning. If uniqueness is only enforced in application code (a `SELECT` to check for conflicts, then an `INSERT`), a race between two concurrent requests can still let both through.

**How to avoid:** Enforce non-overlap at the database level with a Postgres `EXCLUDE` constraint using `tstzrange` on `(driver_id, pickup_window)` (via the `btree_gist` extension), so a conflicting assignment fails atomically at the database regardless of how many concurrent requests attempt it — no check-then-act race is possible. Surface that constraint violation in the ops UI as a clear "this driver is already assigned to another pickup in this window" error, rather than a generic 500.

**Warning signs:** Driver assignment implemented as `SELECT` for conflicts followed by a separate `INSERT`/`UPDATE`; no exclusion or unique constraint in the schema covering `(driver_id, time_range)`.

**Phase to address:** Phase 2 (schema design, the constraint itself) and Phase 8 (ops console assignment UI, the error handling around it).

---

### Pitfall 11: Europe/Zurich DST transitions corrupt pickup times, waiting-time windows and the flight-delay shift logic

**What goes wrong:** Two days a year, Europe/Zurich has either a nonexistent local hour (spring-forward, last Sunday in March, 02:00→03:00 doesn't exist) or an ambiguous local hour that occurs twice (fall-back, last Sunday in October, 02:00–03:00 happens twice). A booking flow that stores pickup time as a naive local string ("2026-10-25 02:30") rather than an absolute instant (UTC + the IANA zone used to produce it) cannot correctly represent — or worse, silently mis-shifts by an hour — any booking near those boundaries, and any duration math (waiting-time window, "delay shifts the pickup by N minutes" from the flight-tracking feature) computed via naive local-time arithmetic across a DST boundary will be off by exactly one hour.

**Why it happens:** Almost all booking-time UI naturally works in local wall-clock time (a picker showing "14:30" makes sense to the user), and it's a small, easy-to-miss step to make sure the *storage and arithmetic* layer never does math in that local representation — the bug is invisible 363 days a year.

**How to avoid:** Store every timestamp as an absolute instant (`timestamptz` in Postgres, ISO 8601 with offset or UTC everywhere in the API) and always carry `Europe/Zurich` as an explicit IANA identifier alongside it for display — never derive "is this CET or CEST" from a fixed UTC offset. Do all duration/shift arithmetic (flight delay → new pickup time, waiting-time-window expiry) on the absolute instant, then format to local time only at the last step, for display. Add DST-boundary bookings as an explicit test fixture (a booking pickup at 02:15 on the spring-forward date, and one at each occurrence of the ambiguous fall-back hour) run through quote, confirmation email, and the flight-delay shift logic.

**Warning signs:** Any `Date` arithmetic done by adding/subtracting minutes from a local-time string rather than from a `timestamptz`/epoch value; a booking picker that stores `"14:30"` without a paired date+zone; no test fixture within a week of the two DST transition dates.

**Phase to address:** Phase 2 (schema — timestamp columns as `timestamptz`) and Phase 4/5 (booking funnel logic) — this is cheap to get right from the start and expensive to retrofit once bookings exist with ambiguous stored times.

---

### Pitfall 12: OpenNext deploys that work in `wrangler dev` but fail once actually deployed

**What goes wrong:** Several classes of failure are specific to the gap between local dev and the deployed Worker: (1) Vitest's Workers pool auto-injects `nodejs_compat` regardless of what's in `wrangler.jsonc`, so a missing compat flag or stale compatibility date passes tests and local dev but fails deployed; (2) the Workers free/paid plan bundle-size ceiling (3 MiB / 10 MiB compressed) is invisible in dev, which doesn't enforce it, and only surfaces as a deploy-time rejection once dependencies (Sentry, Mapbox SDK, an AeroDataBox client, the i18n dictionary, the compiled design-system bundle) accumulate; (3) `nodejs_compat`/`nodejs_compat_v2` polyfills for things like `Buffer`, `crypto`, and `fs` are close-but-not-exact matches for Node, so a library that works in `wrangler dev` (which is closer to a real Node process in some respects) can throw at runtime in the actual Workers isolate; (4) I/O objects created in one request's context (a stream, a request/response body) cannot cross into a different request's handler — a pattern that's easy to introduce accidentally with a module-level cache or a badly-scoped async operation, and that dev mode may not reproduce identically to the production isolate lifecycle.

**Why it happens:** `wrangler dev` intentionally approximates the Workers runtime closely enough to be productive locally, but it is not byte-for-byte the deployed isolate, and the two biggest project-specific risks — bundle size and Sentry's server-side SDK footprint — only bite once real dependencies are wired in during Phase 6, well after Phase 1's scaffold "works."

**How to avoid:** Set `compatibility_date` to 2024-09-23 or later and `nodejs_compat` explicitly in `wrangler.jsonc` from Phase 1 (don't rely on Vitest's auto-injection to mask a missing flag). Add bundle-size to CI as a hard gate from Phase 1 onward (`wrangler deploy --dry-run` or the `handler.mjs.meta.json` bundle analyzer), not just at final cutover — catching a 4 MiB Sentry-driven overshoot in Phase 6 is far more expensive to unpick than catching it incrementally. Every phase that adds a new external SDK (Stripe, Mapbox, AeroDataBox, Resend, Sentry) does a real `wrangler deploy` to a preview/staging environment as part of that phase's definition of done — not just local `wrangler dev` — specifically because this class of bug is deploy-only.
Note: `export const runtime = 'edge'` must not appear anywhere in route files — `@opennextjs/cloudflare` manages the runtime itself and this directive actively conflicts with the adapter.

**Warning signs:** CI that only runs `wrangler dev`/Vitest and never a real `wrangler deploy` to a preview environment; bundle size not tracked as a metric until launch week; any dependency pulled in without checking its Workers/Edge compatibility first.

**Phase to address:** Phase 1 (scaffold — CI gate setup) with re-verification at every phase that adds a new external SDK, especially Phase 6 (hardening, where Sentry lands).

---

### Pitfall 13: Data residency and consent logging get treated as a checkbox instead of an architecture decision

**What goes wrong:** `PROJECT.md` already flags this as open ("whether booking routes need pinning near Frankfurt is still open with counsel") and flags Sentry as "commonly treated as consent-requiring" with a ⚠️ Revisit tag — this pitfall is about not letting those stay open past the phase where they're cheap to decide. Two distinct risks compound: (1) Cloudflare Workers execute at whichever edge location is closest to the request by default; Supabase is pinned to Frankfurt. For nFADP/GDPR, the *processing* location matters, not just the *storage* location — if any Worker code path processes personal data (not just proxies it to Supabase) outside the EU/Switzerland, that's a transfer question counsel needs to answer before launch, not after. (2) The `consent_log` table (already a Key Decision — "consent logged server-side, not cookie-only") needs to exist and be written to *before* any analytics/error-monitoring SDK that sends IP/URL data (Sentry, named explicitly as a concern) goes live, not after — shipping Sentry always-on in Phase 6 ahead of a working consent log inverts the compliance order.

**Why it happens:** Data residency and consent are typically treated as legal/policy work that "wraps around" the technical build, so it's easy for the technical phases (Sentry integration, edge deployment config) to ship ahead of the legal decision they depend on, simply because the code is ready first.

**How to avoid:** Resolve the Workers-region-pinning question (Cloudflare supports restricting Worker execution to specific jurisdictions/regions via Regional Services / the Data Localization Suite) with counsel before Phase 6, not during it — this is infrastructure config, not a code change, so it's cheap to decide early and expensive to retrofit after traffic exists. Sequence Phase 6 so the `consent_log` table and consent-gating logic ship *before* Sentry (or any IP/URL-capturing tool) is turned on, and keep Sentry gated by the `settings` toggle `PROJECT.md` already calls for, defaulting off until consent logging is verified working. Treat this as a launch blocker checklist item, not a "nice to have documented."

**Warning signs:** Sentry (or any monitoring SDK) initialized in code before `consent_log` exists and is being written to; no explicit Worker `regions`/placement configuration reviewed against where personal data is actually processed; the "still open with counsel" note in `PROJECT.md` still open at Phase 6 kickoff.

**Phase to address:** Phase 6 (hardening/legal) — but the region-pinning decision should be forced earlier (Phase 0/1 infra setup) since it's cheaper to bake into the initial Worker config than to migrate later.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Reading Supabase's pooled (6543) connection string directly instead of via Hyperdrive's direct-connection setup | Faster initial wiring, one less thing to configure | Prepared-statement errors and RLS session leaks under real concurrency (Pitfall 2/3) | Never |
| Confirming bookings from the checkout return-page instead of the webhook | Feels "done" faster in manual testing with cards | TWINT and any interrupted flow leaves orphaned unpaid-but-shown-confirmed or paid-but-unconfirmed bookings (Pitfall 6) | Never, even for an MVP — this is the money path `PROJECT.md` calls the one thing that must work |
| Computing refunds/prices by re-reading current settings/rate tables | Simpler code, one function instead of a function plus a snapshot write | Silent retroactive rewriting of historical bookings when policy or rates change (Pitfall 7/8) | Never — the snapshot column costs one write at booking time |
| Leaving Hyperdrive's default query cache on for pricing reads during early development | One less config decision while the pricing engine is still unstable | Stale-price bugs that look intermittent and are hard to reproduce (Pitfall 4) | Acceptable only while `pricing_live=false` and the whole matrix is synthetic `CHF 000` anyway; must be revisited before real numbers land |
| Skipping a real `wrangler deploy` to staging per phase, relying on `wrangler dev`/Vitest only | Faster local iteration loop | Bundle-size and Node-compat failures discovered all at once near launch (Pitfall 12) | Acceptable for pure-UI phases with no new dependency; not acceptable once a phase adds an SDK |
| Building the ops driver-assignment check as app-level SELECT-then-INSERT | Faster to ship the first cut of the ops screen | Double-assignment race under real dispatcher usage (Pitfall 10) | Only as a placeholder behind a feature flag before the ops console is used for a real day of dispatch |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|------------------|-------------------|
| Stripe on Workers | Using the default `stripe.webhooks.constructEvent` (sync, Node-crypto) | Use `constructEventAsync` with `httpClient: Stripe.createFetchHttpClient()` (Pitfall 5) |
| Stripe amounts | Computing CHF amounts as JS floats and rounding to integer Rappen only at the last step | Do all price arithmetic in integer minor units (Rappen) throughout the pricing engine; convert to/from CHF display units only at the UI boundary. CHF is a standard 2-decimal ISO currency for Stripe (not zero-decimal), so `CHF 42.50` is `4250` |
| Stripe + TWINT | Treating TWINT like an inline-authorized card charge | Build the flow around redirect + webhook confirmation from day one (Pitfall 6); the Stripe account must be set to a supported country and currency fixed to CHF for TWINT to appear at all |
| Hyperdrive + Supabase | Pointing Hyperdrive at the Supabase transaction-mode pooler string | Use the direct/session connection string behind Hyperdrive (Pitfall 2) |
| Supabase RLS + direct Postgres access | Assuming RLS "just works" the way it does through the Supabase Data API | Explicitly set `SET LOCAL` auth context per transaction from the Worker (Pitfall 3) |
| Lucide icons + RTL | Directional icons (chevrons, "back"/"next" arrows) rendered identically in Arabic as in LTR languages | Explicitly flip directional icons with `transform: scaleX(-1)` under `[dir="rtl"]`; non-directional icons (a car, a clock) must not be flipped |
| Lenis + Next.js client-side navigation | Re-instantiating Lenis per page/route (a `useEffect` in each page component) | Mount the single Lenis instance once at the root layout, per `CLAUDE.md`'s "never construct a second Lenis" — App Router's persistent root layout makes this natural, but only if the instance lives there and not in a page-level component that remounts on navigation |
| next/font vs vendored `@font-face` | Letting Next.js's font optimizer manage Qurova/Poppins instead of the vendored files the design system ships | Load the design system's own `fonts.css` as a global stylesheet so metrics, `font-display`, and licensing terms match what was actually vendored — `next/font` reprocesses and re-hosts fonts, which risks the Qurova licence question in `CONCERNS.md` in a new way if it re-serves the font differently than the vendored terms allow |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Hyperdrive query caching left on for pricing/availability reads | Prices don't update immediately after a rate change | Explicit per-query cache config, disabled for pricing reads (Pitfall 4) | Any real rate/coupon change post-launch |
| Middleware doing heavy work (locale detection, auth checks) on every request | Elevated p50/p95 latency across the whole site, not just booking | Keep Workers middleware minimal; push heavier auth/session logic into route handlers that only run where needed | Noticeable once traffic is above trivial levels — the "10k concurrent browsers" target in `PROJECT.md` makes this a launch-week risk, not a someday one |
| Bundle size creeping toward the 3/10 MiB Workers ceiling as SDKs accumulate | Deploys start failing (not degrading) once the ceiling is crossed | CI bundle-size gate from Phase 1 (Pitfall 12) | Sudden, not gradual — a deploy either fits or is rejected |
| RLS session-context setup (`SET LOCAL`) run on every single query rather than batched per request | Extra round-trip latency per query, working against the Hyperdrive p50 target | Structure request handlers to set auth context once per transaction/request, not per individual query within it | Shows up as elevated Hyperdrive p50s under Phase 3's own load test, before it's a user-facing problem |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| RLS session context leaking across pooled connections | One customer's data visible to another's request | Transaction-scoped `SET LOCAL` only, tested under concurrency (Pitfall 3) |
| Trusting a client-submitted price at payment-creation time | Customer pays a stale/manipulated amount | Server re-validates quote + `expires_at` inside the payment-creation transaction (Pitfall 9) |
| Webhook handler not idempotent | Duplicate Stripe event delivery double-processes a booking state change | Dedup on Stripe event id with an atomic insert, not check-then-act (Pitfall 6) |
| Sentry/monitoring enabled before consent logging exists | IP/URL data captured without a provable consent record under nFADP/GDPR | Sequence consent logging ahead of any IP-capturing SDK (Pitfall 13) |
| Driver assignment race allowing overlap | Two bookings assigned the same driver at the same time — an operational and safety failure, not just a UX one | Database-level exclusion constraint (Pitfall 10) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Confirmation page shown from a client-side "success" state before the webhook has actually confirmed payment | Customer sees "booked!" for a payment that later fails (esp. TWINT) or never sees confirmation for one that succeeds | Confirmation page polls/subscribes to booking status flipped by the webhook, shows an honest "confirming your payment" interim state (Pitfall 6) |
| RTL Arabic pages that boot LTR and flip after hydration | Visible layout snap, disorienting for the one audience the layout change is meant to serve | Set `dir="rtl"` server-side from the stored locale, not after a client-side detection (Pitfall 1) |
| German UI strings ~30% longer than English overflowing a pill/badge component sized to English text | Truncated or wrapped labels in the language most likely to be tested by the owner | Build every text-bearing component with German-length placeholder text during the states-gallery review, not just English (per `CLAUDE.md`'s own 30% growth rule) |
| Quote-lock countdown shown but not actually enforced server-side at payment time | Customer completes a "successful" checkout on a price that's silently stale | Server-side revalidation at payment creation, not just a UI timer (Pitfall 9) |

## "Looks Done But Isn't" Checklist

- [ ] **Booking confirmation flow:** Often "done" against cards only — verify against Stripe's TWINT test flow end to end, including an abandoned/expired TWINT session, before calling checkout complete.
- [ ] **Refund calculation:** Often reads current settings — verify it reads a booking-level policy snapshot, and verify by changing a live policy value and confirming an existing booking's refund amount is unaffected.
- [ ] **Price display everywhere (checkout, confirmation email, ops detail, reporting):** Often computed live in at least one of these surfaces even when the others were fixed to read a snapshot — grep every price-rendering surface for a call into the live pricing function versus a read of `price_snapshot`.
- [ ] **RLS policies:** Often verified with one request at a time in isolation — verify with a concurrent, two-customer integration test against the actual Hyperdrive-pooled path, not just a single manual query in the SQL editor.
- [ ] **i18n coverage on a new component:** Often "done" for the four language dictionaries but not verified for the *rendering path* — check that a Server Component or a string built at request time (not just build time) actually gets translated, and check RTL layout at 390px, not just desktop.
- [ ] **Deploy pipeline:** Often verified via `wrangler dev` only — verify with a real `wrangler deploy` to a preview environment as part of the phase's definition of done, especially any phase adding a new SDK (Pitfall 12).
- [ ] **DST-boundary bookings:** Often untested because the two relevant calendar dates aren't in anyone's manual QA pass — add them as explicit fixtures (Pitfall 11).
- [ ] **Consent logging vs. monitoring SDKs:** Often built in the "wrong" order because the SDK integration is a smaller, faster PR than the consent table — verify `consent_log` is live and gating before Sentry/analytics ship (Pitfall 13).

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|-----------------|------------------|
| Double-pooling Hyperdrive → Supavisor (Pitfall 2) | LOW | Swap the Hyperdrive binding to the direct connection string; no data migration needed, but re-run the concurrency test before trusting it fixed |
| RLS session leak already shipped (Pitfall 3) | HIGH | Requires an audit of every query path for `SET` vs `SET LOCAL`, plus incident review of whether any cross-tenant read actually occurred in production logs — treat as a security incident, not a bug fix, if discovered post-launch |
| Missing price/policy snapshots on already-created bookings (Pitfall 7/8) | MEDIUM | Backfill a `price_snapshot`/`policy_version_id` for existing bookings using the rate/policy tables *as they were* if audit history exists (e.g. from an append-only rates table or git history of settings changes); if no historical record exists, this data is unrecoverable and existing bookings must be flagged as "priced under legacy computation, not guaranteed reproducible" |
| Booking confirmation built around the redirect instead of the webhook (Pitfall 6) | MEDIUM | Rework the confirmation page to read booking status rather than set it; reconcile any bookings in an inconsistent state against the Stripe Dashboard's payment records before the fix ships |
| DST-mismatched stored timestamps (Pitfall 11) | HIGH | Every affected booking near a transition must be manually reconciled against the customer-facing confirmation (what time did the customer actually agree to) — cannot be blindly re-derived from a naive local-time string after the fact |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| i18n runtime doesn't survive SSR/RSC (1) | Phase 1 | Deployed staging URL, view-source shows translated text in non-English locales on first paint |
| Hyperdrive double-pooling (2) | Phase 3 | Load test against staging DB confirms no prepared-statement errors under concurrency |
| RLS session-context leak (3) | Phase 2 (design) / Phase 3 (implementation) | Concurrent two-customer isolation integration test passes |
| Hyperdrive caching stale prices (4) | Phase 4 | Manual rate change in staging reflects on the quote widget within the expected window, not the cache TTL |
| Stripe webhook verification on Workers (5) | Phase 5 | Real Stripe CLI-forwarded webhook succeeds against a deployed (not local-dev) staging Worker |
| Webhook-vs-redirect race, TWINT async flow (6) | Phase 5 | Full TWINT sandbox flow exercised end to end, including an abandoned session |
| Policy snapshot on refunds (7) | Phase 2 (schema) | Changing a live policy value doesn't change an existing booking's stored refund terms |
| Price snapshot on bookings (8) | Phase 4 | Changing a live rate doesn't change an existing booking's displayed/reported price |
| Quote-lock expiry race (9) | Phase 4/5 boundary | Payment-creation endpoint rejects an expired quote even when the UI countdown is bypassed |
| Driver double-assignment (10) | Phase 2 (constraint) / Phase 8 (UI) | Attempting an overlapping assignment via the API directly (bypassing the UI) still fails |
| DST handling for Europe/Zurich (11) | Phase 2 (schema) / Phase 4-5 (logic) | DST-boundary date fixtures pass through quote, confirmation, and flight-delay-shift logic correctly |
| Dev-vs-deployed Workers gap (12) | Phase 1 (CI gate), every phase adding an SDK | Every phase's definition of done includes a real `wrangler deploy` to staging |
| Data residency / consent-before-monitoring ordering (13) | Phase 0/1 (region decision), Phase 6 (consent log vs. Sentry ordering) | Counsel sign-off on Worker region config before Phase 6; `consent_log` verified live and gating before Sentry is enabled |

## Sources

- [Troubleshooting - OpenNext Cloudflare](https://opennext.js.org/cloudflare/troubleshooting) — bundle size limits, `cookies()` Node-only limitation, `edge` runtime directive conflict, I/O object cross-request restriction
- [Deploy your Next.js app to Cloudflare Workers with the Cloudflare adapter for OpenNext (Cloudflare Blog)](https://blog.cloudflare.com/deploying-nextjs-apps-to-cloudflare-workers-with-the-opennext-adapter/) — `nodejs_compat` requirements, compatibility date
- [2025-08-15 nodejs fs changelog (Cloudflare)](https://developers.cloudflare.com/changelog/2025-08-15-nodejs-fs/) — nodejs_compat polyfill scope
- [Still having issues deploying worker via wrangler (workers-sdk #10441)](https://github.com/cloudflare/workers-sdk/issues/10441) and [`nodejs_compat_v2` misleading error (workers-sdk #6288)](https://github.com/cloudflare/workers-sdk/issues/6288) — dev-vs-deploy compat gaps
- [How Hyperdrive works (Cloudflare Docs)](https://developers.cloudflare.com/hyperdrive/configuration/how-hyperdrive-works/) — transaction-mode pooling behavior
- [Supporting Postgres Named Prepared Statements in Hyperdrive (Cloudflare Blog)](https://blog.cloudflare.com/postgres-named-prepared-statements-supported-hyperdrive/) — prepared-statement handling under pooling
- [Python asyncpg fails with burst requests on both Supabase poolers (supabase/supabase #39227)](https://github.com/supabase/supabase/issues/39227) — real-world double-pooling/prepared-statement failure reports
- [Supabase Docs — Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres) — direct vs. pooled connection string distinction
- [Supabase — Supavisor FAQ](https://supabase.com/docs/guides/troubleshooting/supavisor-faq-YyP5tI) — pooler connection limits
- [Webhook Idempotency and Deduplication (Hooklistener)](https://www.hooklistener.com/learn/webhook-idempotency-and-deduplication) and [Stripe Webhook Idempotency Guide (SendPromptly)](https://sendpromptly.com/blog/stripe-webhook-idempotency-guide/) — idempotency key scoping, atomic dedup pattern, event-ordering caveats
- [Accept TWINT Payments (Stripe)](https://stripe.com/payment-method/twint) and [How to accept payments in Switzerland (Stripe)](https://stripe.com/resources/more/payments-in-switzerland) — TWINT redirect-based flow, CHF currency requirement, account-country requirement
- [Integrating Swiss Payment Providers (Twint, PostFinance, Stripe)](https://tiagobasilio.com/articles/swiss-payment-providers/) — TWINT integration specifics
- [What is FADP? Swiss Data Protection Act Overview (usercentrics)](https://usercentrics.com/knowledge-hub/switzerland-federal-data-protection-act-fadp/) and [GDPR vs FADP (usercentrics)](https://usercentrics.com/knowledge-hub/understanding-the-differences-between-gdpr-and-fadp/) — nFADP/GDPR relationship, EU adequacy
- [Cloudflare GDPR FAQs / Data Localization Suite](https://www.cloudflare.com/trust-hub/gdpr/) — regional data processing controls for Workers
- Domain-specific pitfalls (DST/Europe-Zurich, price/policy snapshotting, quote-lock races, driver double-assignment, i18n-runtime/SSR interaction, RLS-over-direct-Postgres session scoping) are derived directly from this project's own architecture as described in `PROJECT.md`, `CLAUDE.md`, and `.planning/codebase/CONCERNS.md`, not from third-party sources — flagged accordingly as MEDIUM confidence pending validation once each relevant phase is actually built.

---
*Pitfalls research for: Swiss transfer-booking platform (Cloudflare Workers + OpenNext + Supabase/Hyperdrive + Stripe, ported from finished HTML mocks)*
*Researched: 2026-08-17*

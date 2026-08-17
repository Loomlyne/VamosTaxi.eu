# Project Research Summary

**Project:** Vamos Taxi V1
**Domain:** Swiss pre-booked airport-transfer booking platform (Zurich-first) + dispatch/ops console
**Researched:** 2026-08-17
**Confidence:** HIGH overall

## Executive Summary

This is a fixed-price, pre-booked airport-transfer platform — not ride-hailing — built as a single Next.js 15 application deployed as **one Cloudflare Worker** (via `@opennextjs/cloudflare`), backed by Supabase Postgres accessed exclusively through Hyperdrive, with Stripe (cards + Apple/Google Pay + TWINT) as the only payment path. The design phase is fully complete: 30+ pixel-final `.dc.html` mocks, a bound design system, 23 per-screen specs, and a written build plan (`docs/build/GSD-LAUNCH.md`). This is a production port, not a green-field design exercise — the roadmap's job is sequencing the backend/data layer underneath an already-finished frontend, not inventing new UI.

The recommended approach follows a strict early dependency chain — scaffold to Supabase schema/RLS to Hyperdrive wiring to pricing engine to checkout/payment — because every subsequent surface (confirmation, account, ops board) reads live booking state that only exists once checkout is real. After Hyperdrive lands, the roadmap should split into two genuinely parallel tracks (pricing engine vs. non-money surface porting + email templates + CRUD ops screens), which reconverge at checkout. Checkout/payment must therefore be sequenced deliberately before every surface that depends on it, not appended after "the surfaces are done" — because confirmation pages, account bookings, and the ops board are all downstream consumers of the payment state machine, not independent features that can be built ahead of it.

The single largest risk this research surfaces that is invisible from the finished mocks is that `VamosLocale`'s DOM-text-walking i18n runtime — the mechanism that currently makes the mocks work in four languages — does not survive Next.js SSR/RSC. This must become an explicit architecture decision in Phase 1 (convert the dictionary into a `t()`/`useT()` render-time lookup, recommended), or every subsequent phase risks silently shipping English-only Server Components or a visible translation flash. Money-correctness risk is the second major theme: price and cancellation-policy must be snapshotted immutably onto the booking row at quote/confirmation time (never re-joined to live rate/settings tables), Stripe webhook verification requires the Workers-specific async/WebCrypto code path, and Hyperdrive must point at Supabase's direct connection string, never the pooled one — three structurally cheap decisions if made in Phase 1-4, expensive to retrofit once real bookings exist.

## Key Findings

### Recommended Stack

Next.js 15.5.x on Cloudflare Workers via `@opennextjs/cloudflare` 1.20.x (Node.js-runtime-only inside the Worker, not Edge runtime) is the only supported non-Vercel SSR path and is GA. Supabase Postgres (Frankfurt) is accessed for all row-level app queries through Hyperdrive with `postgres.js` or `pg` (pick one) using Supabase's direct connection string — supabase-js is scoped strictly to Auth/Storage/Realtime, never app data, to avoid a second inconsistent read path. Stripe (`stripe` npm, standard CH account, CHF) requires `Stripe.createFetchHttpClient()` + `constructEventAsync()` + `Stripe.createSubtleCryptoProvider()` because Workers has no synchronous Node crypto. ISR/on-demand revalidation needs R2 (incremental cache) + D1 (tag cache) + a Durable-Object queue, and reliable on-demand purge only works on a real custom domain, not `*.workers.dev`. Cron Triggers + a Queues consumer must live in the same deployed Worker via a custom entry file re-exporting `fetch`/`scheduled`/`queue`, since the default OpenNext build only exports `fetch`.

**Core technologies:**
- Next.js 15.5.x + `@opennextjs/cloudflare` 1.20.x — the fixed, only supported Workers SSR path (no Vercel, per owner decision)
- Supabase Postgres via Hyperdrive (`postgres.js`/`pg`, direct connection string) — system of record for all app data; supabase-js reserved for Auth/Storage/Realtime only
- Stripe standard (CHF, cards + Apple/Google Pay + TWINT) — Workers-specific async webhook verification required
- Resend + `react-email`, Mapbox (geocoding/directions, KV-cached), AeroDataBox (flight status, KV-cached, graceful degrade) — supporting integrations, all fetch-based and Workers-compatible
- Cloudflare Queues + Cron Triggers in one custom-entry Worker — decouples Stripe webhook ACK from booking-state mutation, and runs scheduled sweeps (quote expiry, reminders/no-show)

### Expected Features

This is not a green-field feature survey — the existing mocks and `MISSING-FEATURES.md` already define scope. Research confirms the scope matches category table stakes and flags what's genuinely absent.

**Must have (table stakes):** fixed price shown before payment; three-class vehicle selection with real capacity; flight-number autofill + delay-aware pickup with both-sides notification; free waiting time with a stated cutoff; meet-and-greet; tiered cancellation/refund policy; self-serve cancel/manage-by-token; guest checkout; coupons; card/Apple/Google Pay/TWINT via Stripe; confirmation with ICS calendar invite; ops manual/phone booking entry (highest-risk missing screen — no mock exists yet); ops assignment with conflict checking; live bookings board; no-show handling with fee; fleet management with document-expiry alerts; versioned publishable pricing table; four-language coverage everywhere.

**Should have (differentiators):** Vamos as the actual carrier (not a broker/marketplace, unlike GetTransfer/Transfeero); named alpine/cross-border route coverage; WhatsApp deep-link contact instead of a chat widget; real driver/founder photography; deliberately small three-class lineup; minimal corporate/invoice billing (open scope decision, not yet committed).

**Defer / do not build:** live GPS tracking, automatic nearest-driver dispatch, surge pricing, reverse-auction marketplace bidding, a driver-facing app, hourly/charter booking mode, loyalty points, a full self-service B2B corporate portal, true FX-converted pricing display, third-party review import. Two genuine open gaps worth a roadmap decision: (1) corporate/invoice billing has no committed scope despite being a named customer segment — needs an explicit build-or-defer call; (2) no post-trip review-solicitation flow exists anywhere in scope.

### Architecture Approach

One Cloudflare Worker serves public RSC routes, the pricing engine (`/api/quote`), checkout (`/api/checkout`), the Stripe webhook, the role-gated ops console, and — via a custom entry file — Cron Triggers and a Queues consumer, all sharing one Supabase Postgres database accessed through Hyperdrive. The repo structure is `apps/web` (the only deployable) plus `packages/db` (pure SQL/types, zero runtime deps) and `packages/emails` (pure render functions, zero I/O) — both packages must stay side-effect-free or `@opennextjs/cloudflare`'s bundler drags Node-only transitive dependencies into the Worker and risks the bundle-size ceiling.

**Major components:**
1. Pricing engine (`/api/quote`) — pure function over rate/surcharge/coupon tables; writes an immutable price snapshot onto a `bookings` row (`status='quote'`), never recomputed downstream
2. Checkout (`/api/checkout`) — re-validates quote-lock expiry server-side inside the same transaction that creates the Stripe PaymentIntent (idempotency key = booking id); the actual convergence point every money-touching surface depends on
3. Stripe webhook + Queues consumer — webhook handler only verifies signature, dedupes (`stripe_events` insert-on-conflict), enqueues, and ACKs fast; all booking mutation + email happens in the separate, idempotent queue consumer
4. Ops console (`/(ops)/ops/*`) — role-gated route group in the same app/deploy; Supabase Realtime (private, RLS-authorized channel) powers only the live board, nowhere else

### Critical Pitfalls

1. **`VamosLocale`'s DOM-text-walking i18n does not survive SSR/RSC** — decide in Phase 1 whether to convert to a render-time `t()`/`useT()` lookup (recommended) or scope the DOM-walker to client boundaries with server-rendered locale from a cookie; RTL must be set server-side, never flipped after hydration.
2. **Hyperdrive pointed at Supabase's pooled (Supavisor) connection string double-pools** — always use the direct/session connection string; symptoms (prepared-statement errors, RLS session leaks) only appear under real concurrency, not in early smoke tests.
3. **RLS session context (`SET LOCAL`) must be scoped per-transaction**, not per plain `SET` — because the Worker talks to Postgres directly via Hyperdrive rather than through Supabase's Data API, there is no automatic per-request auth-context injection; a leaked session variable on a pooled connection is a cross-tenant data exposure, not just a bug.
4. **Price and cancellation-policy must be immutable snapshots on the booking row**, never live joins to current rate/settings tables — otherwise a later rate or policy edit silently rewrites historical bookings' displayed price or refund terms.
5. **Stripe webhook confirmation must never trust the client-side redirect**, especially for TWINT's async redirect flow — the webhook (idempotent, keyed on Stripe event id) is the only source of truth for "this booking is paid"; the return-URL page is UI-only, polling/subscribing to booking status.

## Implications for Roadmap

Based on combined research, the roadmap has a hard strict-dependency spine with two parallel tracks after Hyperdrive lands, converging at checkout.

### Phase 1: Foundation & scaffold
**Rationale:** Everything else depends on the Worker actually deploying correctly, on a real custom domain, with CI gates in place from day one — retrofitting bundle-size/deploy-gap checks later (Pitfall 12) is far more expensive than catching them incrementally.
**Delivers:** Next.js 15 on Cloudflare Workers via OpenNext, CI with a real `wrangler deploy` to staging (not just `wrangler dev`) as a hard gate, `staging.vamostaxi.eu` bound to a real Cloudflare zone (required for ISR revalidation and ISR cache purge to work at all — cannot be `*.workers.dev`), design system ported to React with identical class names, and the i18n runtime architecture decision made explicitly (Pitfall 1) — this determines the shape of every component built after it.
**Addresses:** N/A (infrastructure)
**Avoids:** Pitfall 1 (i18n/SSR), Pitfall 12 (dev-vs-deployed gap), the custom-domain requirement for ISR from STACK.md.

### Phase 2: Supabase schema, RLS, and staff auth
**Rationale:** Blocks everything that reads or writes data; the versioned-policy and exclusion-constraint patterns needed later must exist in the schema from the start, not retrofitted once bookings exist.
**Delivers:** Full schema mirroring `VamosOps`, RLS on every table, `timestamptz` everywhere (never naive local-time strings — Pitfall 11), a `policy_version`/snapshot concept for cancellation tiers, a `driver_id` x `tstzrange` exclusion constraint (`btree_gist`) preventing double-assignment at the database level, staff TOTP MFA, custom JWT role claim via a Postgres Access Token Hook.
**Uses:** Supabase schema/RLS patterns from STACK.md and ARCHITECTURE.md.
**Implements:** RLS design (session-context implementation deferred to Phase 3), policy-snapshot schema shape.

### Phase 3: Hyperdrive data access wiring
**Rationale:** Blocks any real query; must be load-tested (not just smoke-tested) before Phase 4 builds pricing logic on top of it, since double-pooling and RLS-session-leak bugs only surface under concurrency.
**Delivers:** `apps/web/lib/db` Hyperdrive client (direct connection string, per-request client creation, `max: 5`), transaction-scoped `SET LOCAL` RLS identity per request, a concurrent two-customer isolation integration test, per-query Hyperdrive caching policy decisions (disabled for anything pricing-related).
**Uses:** Hyperdrive + postgres.js/pg pattern from STACK.md.
**Implements:** The data-access layer boundary from ARCHITECTURE.md; verifies Pitfalls 2, 3, 4.

### Phase 4 / Phase 6 (parallel track A + B, after Phase 3): Pricing engine + surface porting
**Rationale:** These two tracks touch almost disjoint code (pricing owns `lib/pricing` + money tables; page-porting owns `app/(public)/*` reading content/reviews/settings) and can run concurrently once schema + Hyperdrive exist — only the home booking widget and checkout actually depend on the pricing engine being finished.
**Delivers (Track A - pricing engine):** `/api/quote` as a pure function with fixed-route/per-km/surcharge/coupon logic, an immutable price snapshot written once onto `bookings` (never recomputed downstream — Pitfall 8), the 30-minute quote lock enforced server-side inside the payment-creation transaction (not just page-load — Pitfall 9), `pricing_live=false` synthetic staging matrix.
**Delivers (Track B - surface porting, parallel):** every public mock as a route in all four languages/widths, `packages/emails` templates (zero dependency on the queue consumer — can start immediately post-Phase-1), and non-money ops CRUD screens (fleet, chauffeurs, content editor, pricing-table admin, reviews admin) — everything except OpsBoard and OpsDetail's assignment flow, which are gated on Phase 5.
**Addresses:** Table-stakes pricing/quote features from FEATURES.md; the pricing-engine anti-pattern (Pitfall 4, 7, 8) is the load-bearing risk in this phase.
**Avoids:** Pitfall 4 (stale cached prices), Pitfall 7/8 (live-rate/policy joins instead of snapshots), Pitfall 9 (quote-lock race).

### Phase 5: Checkout, payment, webhook/queue lifecycle — the convergence point
**Rationale:** This is the one phase every downstream money-touching surface (confirmation, account bookings, ops board, ops detail assignment) is gated on — it must be sequenced before those surfaces are considered done, not treated as parallel or appended-after work. Getting this wrong (recomputing price at checkout, mutating booking state directly in the webhook handler, trusting the client-side redirect for TWINT) is the single most expensive class of bug to recover from post-launch.
**Delivers:** Stripe PaymentIntent creation (CHF, `automatic_payment_methods`, idempotency key = booking id), webhook handler that only verifies + dedupes + enqueues + ACKs (never mutates state inline), a separate idempotent queue consumer doing the actual `pending->paid->confirmed` transition + `booking_events` write + Resend email, full TWINT sandbox flow exercised end to end including an abandoned session, confirmation page that polls/subscribes rather than self-confirms.
**Uses:** Stripe-on-Workers pattern (`constructEventAsync` + `createSubtleCryptoProvider`) from STACK.md.
**Implements:** The webhook/queue-consumer boundary and idempotent-money-movement pattern from ARCHITECTURE.md.

### Phase 7: OpsBoard, OpsDetail assignment, and money-dependent account surfaces
**Rationale:** These specifically need live `bookings` state + Realtime and the full booking lifecycle from Phase 5 — they cannot be meaningfully finished before checkout exists, even though other ops screens (fleet, pricing admin, content) were already built in the parallel track.
**Delivers:** Live ops board (Realtime-backed), booking detail + manual assignment (with the DB exclusion constraint's error surfaced cleanly in the UI), ops manual/phone booking entry using the exact same pricing engine as the public quote (never a hand-typed price), account bookings view, self-serve cancel/refund reading the policy snapshot.
**Addresses:** Ops table-stakes features from FEATURES.md (assignment, live board, no-show handling, manual booking).
**Avoids:** Pitfall 10 (driver double-assignment race), Pitfall 7 (refund-policy snapshot).

### Phase 8: Hardening — cache rules, rate limits, Turnstile, WAF, consent, observability
**Rationale:** Largely orthogonal to feature build-out and can be started incrementally per-route as soon as each surface it targets exists, rather than waiting for every phase to finish — but the data-residency/consent-vs-Sentry sequencing must be forced earlier than this phase's kickoff, since it's a legal decision the code should not outrun.
**Delivers:** ISR/Cache Rules on read-mostly public pages, rate limits + Turnstile on `/api/quote` and public forms, `consent_log` table live and gating before Sentry or any IP-capturing SDK is enabled, Worker region-pinning decision resolved with counsel, DST-boundary test fixtures (Pitfall 11) run through quote/confirmation/flight-delay logic, load test against the 10k-concurrent-browser target confirming public routes barely touch Postgres.
**Avoids:** Pitfall 13 (consent-before-monitoring ordering), Pitfall 11 (DST corruption).

### Phase 9: Launch cutover
**Rationale:** Final gate — DNS cutover, `pricing_live=true` flip, old site parked, 301 map from Freshpage CMS.
**Delivers:** Production go-live. Re-verify Hyperdrive caching policy and Sentry/consent ordering one final time at this boundary, since `pricing_live` flipping to true is exactly the moment Pitfall 4 (stale cached prices) becomes customer-visible.

### Phase Ordering Rationale

- The dependency chain (scaffold to schema/RLS to Hyperdrive to pricing engine to checkout) is strict and non-negotiable because each phase's output is a hard input to the next — this is confirmed independently by STACK.md, ARCHITECTURE.md, and PITFALLS.md, not just one research angle.
- Checkout/payment (Phase 5) is deliberately positioned as a convergence point, not a parallel track — confirmation, account bookings, and the ops board are all consumers of the payment state machine, so building them before Phase 5 completes risks building against a moving/incorrect contract.
- Pricing engine and surface porting (Phases 4/6) are the one place real parallelism exists — both research files (ARCHITECTURE.md's "Build Order & Parallelization" section and PITFALLS.md's phase mapping) agree independently that these tracks touch disjoint code and can run concurrently once Phase 3 lands.
- Hardening (Phase 8) is intentionally incremental rather than a single late phase, because rate limits/cache rules/Turnstile can be applied per-route as each route ships — but the consent-log-before-Sentry ordering must be forced earlier than the phase itself to avoid shipping a compliance-inverted sequence.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** the i18n-runtime architecture decision (DOM-walker vs. render-time `t()`) has no external documented pattern for this specific migration — needs a focused technical spike before committing.
- **Phase 3:** Hyperdrive + RLS-over-direct-Postgres session-context scoping is a thin-documentation area (most RLS guides assume the Supabase Data API path, not direct Postgres) — needs its own research pass plus the concurrent-isolation test as verification.
- **Phase 5:** Stripe TWINT redirect-flow + Workers webhook interaction, and the exact queue/webhook idempotency wiring, benefit from re-checking current Stripe/Cloudflare docs at build time (these move fast; STACK.md already flags Sentry-on-Workers as MEDIUM confidence for a related reason).
- **Phase 8:** data-residency/Worker-region-pinning is explicitly an open legal question in PROJECT.md, not a resolved technical pattern — needs counsel input, not just engineering research.

Phases with standard patterns (skip research-phase):
- **Phase 2:** Supabase schema/RLS/migrations is a well-documented, standard Supabase CLI workflow.
- **Phase 4/6 (surface porting, email templates, non-money ops CRUD):** these are standard Next.js/React port work against an already-finished design spec — no novel integration risk.
- **Phase 7 (ops assignment, board):** Realtime + exclusion-constraint patterns are documented Postgres/Supabase patterns, already fully specified in ARCHITECTURE.md and PITFALLS.md.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All core claims verified against live official Cloudflare/Supabase/Stripe/OpenNext docs; only the Sentry-on-Workers integration path is flagged MEDIUM (newer, some open GitHub issues) |
| Features | MEDIUM-HIGH | Internal scope claims (PROJECT.md, MISSING-FEATURES.md, OWNER-ANSWERS.md) are HIGH/authoritative; competitor-pattern cross-checks (Blacklane, Transfeero, Suntransfers, GetTransfer) are MEDIUM (web search, not primary booking-flow access) |
| Architecture | HIGH | Cloudflare Queues semantics, Stripe idempotency, OpenNext monorepo behavior, and Supabase Realtime authorization are all current-docs-verified; the exact quote-lock/pricing-snapshot table shape is this document's own design decision (MEDIUM, not an externally documented pattern) |
| Pitfalls | MEDIUM-HIGH | Cloudflare/Stripe/Supabase-sourced pitfalls (webhook verification, Hyperdrive pooling, bundle size) are HIGH; booking-domain-specific pitfalls (DST, price/policy snapshotting, i18n/SSR, RLS-over-direct-Postgres) are derived from this project's own constraints, not third-party sources — flagged MEDIUM pending in-build validation |

**Overall confidence:** HIGH

### Gaps to Address

- **i18n runtime SSR migration approach** — no external precedent for converting `VamosLocale`'s exact DOM-walking model; must be decided and spiked in Phase 1, not assumed.
- **Corporate/invoice billing scope** — named as a customer segment in PROJECT.md but absent from both Active scope and Out of Scope; needs an explicit roadmap decision (build minimal version or formally defer) before requirements lock, not left open into execution.
- **Booking add-ons (child seat, extra stop, oversized luggage)** — fee policy exists in owner answers but no confirmed UI mechanism in the audited screens; flagged for confirmation against the 23 per-screen SPECs before requirements lock, not asserted as a confirmed gap.
- **Data residency / Worker region-pinning and Sentry consent question** — explicitly still open with counsel per PROJECT.md; must be resolved before Phase 6/8 rather than treated as a documentation formality.
- **Post-trip review-solicitation flow** — absent from all three source documents; worth a deliberate decision (rely on imported reviews only, or add a lightweight request email) rather than defaulting to silence.

## Sources

### Primary (HIGH confidence)
- `developers.cloudflare.com/hyperdrive/*` — connection string guidance, limits, transaction-mode pooling behavior
- `opennext.js.org/cloudflare/*` — wrangler.jsonc shape, ISR/cache backends, custom-worker cron/queue pattern, image optimization
- `developers.cloudflare.com/queues/*`, `developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/` — Queues producer/consumer config, Cron Trigger UTC scheduling
- `supabase.com/docs/guides/auth/server-side/nextjs`, `.../auth-hooks/custom-access-token-hook` — middleware cookie pattern, `getClaims()` vs `getSession()`, custom JWT claims
- `docs.stripe.com/payment-method/twint`, Stripe's `stripe-node-cloudflare-worker-template` (GitHub), Cloudflare's Stripe-on-Workers blog post — webhook verification and TWINT patterns
- `.planning/PROJECT.md`, `docs/build/MISSING-FEATURES.md`, `docs/build/OWNER-ANSWERS.md` — authoritative internal project scope and decisions
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONCERNS.md`, `docs/build/GSD-LAUNCH.md` — existing codebase map and fixed phase plan this research extends

### Secondary (MEDIUM confidence)
- `docs.sentry.io/platforms/javascript/guides/cloudflare/frameworks/nextjs/` — Sentry-on-OpenNext integration, flagged as newer with open historical GitHub issues
- Blacklane, Transfeero, Suntransfers, GetTransfer (public marketing/help-center pages) — competitor feature-pattern cross-checks
- `github.com/cloudflare/workers-sdk` issues #10441, #6288; `github.com/supabase/supabase` issue #39227 — real-world dev-vs-deployed gaps and double-pooling failure reports

### Tertiary (LOW confidence)
- WebSearch aggregation across Cloudflare community threads / dev.to write-ups for exact custom-worker code shapes where official docs were thin

---
*Research completed: 2026-08-17*
*Ready for roadmap: yes*

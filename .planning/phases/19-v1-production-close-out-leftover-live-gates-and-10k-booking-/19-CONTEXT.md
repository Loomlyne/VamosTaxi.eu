# Phase 19: V1 close-out and the 10,000-booking surge proof — Context

**Rewritten:** 2026-09-29 for the checkout that shipped in 26.3 (af93fc8e). Replaces the
2026-09-18 context, which was written for the old checkout (trip → details → card form of ours).
**Discuss:** owner answers through the question form, 2026-09-29 (recorded below as D-xx).
**Plan signature:** see `## Signatures` at the bottom.
**Order:** runs after 26.0 → 26.2 → 20 (owner, 2026-09-29). Not before.

<domain>
## Phase Boundary

Prove that 10,000 people pressing PAY at the same moment all end on "Booked", on the flow that
is live since 26.3:

home box (From, flight, To, When, Travellers, SEE PRICES) → one `/checkout` page (class, who is
travelling, extras by the owner's names, voucher, one PAY) → Stripe's hosted page → "Confirming
your booking" → "Booked", plus the webhook, the settle queue, the confirmation e-mail, the hourly
delete of unpaid bookings and the hourly resend.

The proof runs on a **copy** of the database behind a **hidden test Worker**. vamostaxi.site,
Worker `vamos` and Supabase `yaumjzvylngfjhtuffqs` are not touched by the load.

"Close-out" part of the old phase is gone: Phase 16 is complete and Phase 17 is closed and
removed (`.planning/PHASE-CLOSURE-2026-09-29.md`). Nothing of 16/17 is done here.

Not in this phase: `vamostaxi.eu`, live Stripe keys, the pricing Publish click, GSC, JSON-LD, a
driver app, auto-dispatch, a public load-test address, any change to what a customer sees
except the busy-and-retry state on PAY (D-09).
</domain>

<decisions>
## Implementation Decisions

### What "10,000 at once" means
- **D-01:** 10,000 concurrent checkouts: each is one person going home quote → `/checkout` →
  PAY → payment → "Booked". Not 10,000 browsers, not 10,000 a day.
- **D-02 (owner):** Two parts. **Burst:** all 10,000 at once through our side — quote,
  `/checkout`, booking save, Stripe session creation, webhook, settle, confirmation — with
  Stripe replaced by a fake. **Real sample:** about 200 real Stripe sandbox payments with card
  4242 4242 4242 4242 through Stripe's hosted page, paced under Stripe's sandbox limit of
  25 requests per second per account.
- **D-03 (owner):** Pass bar: every one of the 10,000 ends "Booked" within 5 minutes (retries
  allowed); zero lost bookings, zero double charges, zero wrong totals; a normal visitor can
  still get a price and reach Stripe's page during the burst. The 200 real payments: all
  captured, all "Booked", each `booking_payments` total equal to the Stripe charge.

### Where it runs
- **D-04 (owner):** A copy of the database, restored from a backup of
  `yaumjzvylngfjhtuffqs` into a separate Supabase project. Live Zurich is never loaded,
  never restored onto, never wiped.
- **D-05 (owner):** A hidden test Worker `vamos-surge`: same code as `main` at the time,
  bound to the copy through its own Hyperdrive config, its own KV, queue and Stripe sandbox
  webhook; no custom domain, `X-Robots-Tag: noindex`, linked from nowhere; deleted after the
  test. Worker `vamos` is not redeployed for this phase except by the normal Ship.
- **D-06:** Direct Postgres through Hyperdrive only, never Supavisor `:6543`.

### The two test-only switches
- **D-07 (owner):** A fake-Stripe switch (`STRIPE_FAKE`) that exists only on `vamos-surge`.
  The Worker refuses to serve if the switch is on and the Worker is `vamos` (or `DEPLOY_ENV`
  is not `surge`). A unit test proves the refusal.
- **D-08 (owner):** A secret header that skips the per-visitor quote limit (8/60 verified,
  4/60 bare) for the load machines, only on `vamos-surge`, same refusal rule as D-07. The
  secret lives in `wrangler secret` on `vamos-surge` only and in the owner's terminal, never
  in the repo. One extra run keeps the limit on to show a single machine is stopped.
  The limits on `vamos` are never raised or removed.

### When it is full
- **D-09 (owner):** When too many press PAY at once, `/checkout` keeps everything typed,
  shows a busy state ("Busy — trying again") and retries by itself. No booking is lost, no
  second unpaid booking is made, nothing is charged twice. Strings in en/de/fr/ar in the same
  pass. If retries run out, the page shows a next step (try again, or write to
  info@vamostaxi.site). Never a fake "Booked", never an invented CHF amount.

### Paid steps only the owner takes
- **D-10 (owner):** The Cloudflare account is on the **Workers Free** plan today. The owner
  subscribes to **Workers Paid** (this is what "paid Hyperdrive" means: unlimited queries and
  up to ~100 database connections per Hyperdrive config instead of ~20), then sets the
  connection count on the test Hyperdrive config. The agent never opens billing.
- **D-11:** The owner creates the copy project in Supabase (restore a backup to a new
  project) and picks its compute size. Its cost is his decision. The agent never buys.
- **D-12:** After the test the owner deletes the copy project; the agent deletes the test
  Worker, its Hyperdrive config, KV and queue only after the owner says so in chat.

### Must-nots (unchanged)
- **D-13:** No `vamostaxi.eu`. No `sk_live_`. Stripe stays sandbox. No pricing Publish click.
  No `supabase db push`. No restore onto `yaumjzvylngfjhtuffqs`. No public load-test address.
  Public amounts follow the live price book (row 18) as the owner has set them; never an
  invented rate or CHF figure in copy, tests or reports.
- **D-14:** Home still starts a brand-new booking; extras default off; `/checkout/trip` and
  `/checkout/details` still redirect to `/checkout`.

### E-mail from the copy
- **D-15 (owner):** The test Worker sends no e-mail. The copy holds real customers'
  addresses. The test counts one confirmation notification row per booking instead.

### Claude's Discretion
Load tool (k6 or similar, run from the owner's Mac or a machine he names), ramp shape, the set
of test addresses (kept small so Mapbox answers come from the GEO_CACHE KV), how the fake Stripe
answers (session create, webhook events signed with the test Worker's own secret), retry
back-off timings within the 5-minute bar.
</decisions>

<canonical_refs>
## Canonical References

- `.planning/PHASE-CLOSURE-2026-09-29.md` — 19 parked until rewritten; order of phases
- `.planning/phases/26.3-booking-flow-simplification/26.3-HANDOVER.md` — the flow under test
- `.planning/phases/26.3-booking-flow-simplification/26.3-CONTEXT.md` — D-01…D-48
- `apps/web/wrangler.jsonc` — env `staging` = Worker `vamos`; the new `surge` env goes next to it
- `apps/web/lib/abuse/rate-limit.ts` — quote limits 8/60, 4/60
- `apps/web/lib/checkout/stripe.ts` — `stripeFromEnv`, `createCheckoutSession`
- `apps/web/app/api/checkout/intent/route.ts` — PAY
- `apps/web/app/api/stripe/webhook/route.ts`, `apps/web/worker.ts` (`queue`, `scheduled`)
- `docs/runbook/restore-database.md` — restore onto a copy only
- `CLAUDE.local.md` — live facts, one job one branch one ship
</canonical_refs>

## Signatures

| Gate | State |
|---|---|
| Discuss (D-01…D-14) | Owner answers, question form, 2026-09-29 |
| Plan (19-01…19-05) | **Signed by the owner, question form, 2026-09-29** |
| UAT / Ship | Not started |

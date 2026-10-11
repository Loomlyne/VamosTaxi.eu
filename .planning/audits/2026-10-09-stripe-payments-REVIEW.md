# Stripe and payment processing: A to Z review (2026-10-09)

Status: findings delivered, awaiting owner signature per finding. Nothing was changed in code, database or Stripe.
Plan: `2026-10-09-stripe-payments-review-PLAN.md`. Detail, evidence and "checked and clean" lists: `2026-10-09-stripe-W1.md` to `-W6.md` (same folder).

## Counts

| Wave | Critical | High | Medium | Low | Info | Total |
|---|---|---|---|---|---|---|
| W1 config, mode | 1 (conditional) | 3 | 6 | 8 | 2 | 20 |
| W2 price to intent | 0 | 0 | 11 | 11 | 5 | 27 |
| W3 browser, return | 0 | 1 | 8 | 6 | 3 | 18 |
| W4 webhook, queue, settle | 0 | 4 | 7 | 6 | 0 | 17 |
| W5 database | 0 | 1 | 11 | 7 | 4 | 23 |
| W6 refunds, disputes, staff | 0 | 1 | 8 | 11 | 2 | 22 |
| **Total** | **1** | **10** | **51** | **49** | **16** | **127** |

No path lets the browser change the charged amount (strict schema, HMAC-signed lock, CHF constant). Every security definer function pins `search_path`; no money RPC is executable by anon, authenticated or public after all migrations (the held `…320000` covers the remaining REST gap). Pay-link tokens, refund idempotency, app-vs-webhook refund reconciliation, no off-session charging, purge refusing paid or disputed bookings: all clean.

## What matters most (Critical and High, plain words)

| # | Finding | Why it matters | Checked by me |
|---|---|---|---|
| W1-01 | The live site carries a `pk_live_` key; the commit text says a live secret key is already on the Worker. No recorded owner word for live mode. | If the secret is live and pricing is live, real cards are accepted with the open findings below. | Commit text read. Which secret is bound: cannot be read; needs one step from you (below). |
| W1-02/03 | Only 5 staff paths refuse live keys, and only `sk_live_`. `rk_live_` passes (U3). Customer checkout and settle's automatic refunds have no guard. With a live key, staff cannot refund or change bookings in the app. | Split behaviour: customers can pay, staff cannot refund. | Reported with file:line. |
| W1-04 | Nothing compares secret key, webhook secret and publishable key modes. The webhook never checks `event.livemode`. | A mode or account mix silently drops real payments. | Confirmed: no `livemode` check in the webhook path. |
| W4-01 | No sweep re-enqueues unprocessed `stripe_events`, although the index and RPC comments promise one. | An event that never settles (queue outage, 8 retries used up) stays stuck: customer paid, booking pending. | Confirmed: `worker.ts` never reads `stripe_events`. |
| W4-02 | The dead-letter alert swallows its own failure and the message is acked. One email is the only signal. | A stuck captured payment can go unseen. | Reported with file:line. |
| W4-03 | Duplicate-charge and paid-after-cancel refunds run after the event is stamped processed. If the Stripe refund call fails, no redelivery can retry it. | A customer is charged twice and not refunded, silently. | Reported with file:line; matches the SQL order I read. |
| W4-04 (unverified) | Refund and dispute re-read is gated on `ch_` / `du_` ids; Twint charge ids start `py_`. A prefix miss acks the event as processed and writes nothing. | Dashboard refunds or disputes on non-card payments never reach the database. Twint is off on live today, on in the production block. | Confirmed in code (`settle.ts:291,298`). Prefix behaviour on Stripe's side not verified. |
| W5-01 | A payment after the 30-minute quote lock (including normal pay-link payments within their 24 h hold) goes through the "revive" branch: pending jumps to confirmed, legs stay pending, no `paid` step or events. The hold time is ignored. | Wrong booking state and event trail on a common path; no test covers it. | Confirmed: `hold_until` is not referenced in the settle migration. |
| W3-01 | If the return route cannot read Stripe, a customer who just paid lands on an empty trip editor (`pay=unknown` renders nothing). | Looks like payment failed; customer may pay twice. | Reported with file:line. |
| W6-01 | The refund window is the literal 24 hours in SQL; Settings lets you publish another `free_cancel_hours`, and customer pages print that value. | Customer promised one window, refunded under another. | Reported with file:line. |

Also material (Medium, money or customer impact): W4-07 / W5-02 no check that the amount Stripe collected equals `charged_rappen` or that currency and booking id match (I grepped settle and the charge gate: no such comparison); W2-03 (U19) any total under 50 rappen or coupon at or above the fare goes to Stripe and returns a bare 500; W2-01 a customer can pay for a pickup already in the past after a 24 h lock; W2-02 anyone with quote and lock can expire another device's unpaid booking; W6-05 failed refunds (`refund.failed`) are never mirrored, so the booking stays "refunded"; W6-02 DST error in the 24 h refund window on 2026-10-25; W5-09 duplicate payments leave a phantom refund owed; W5-05 refund cap is in SQL on the ops paths only; W2-10 Stripe adaptive pricing may charge in EUR/USD/AED against the rule "charge always CHF"; W6-04 an unparseable body to the refund route means "refund everything left".

## Proposed fix jobs (each one worktree, one branch, fresh reviewer before ship, migration numbers via the controller)

| Job | Findings | Needs owner decision |
|---|---|---|
| J1 Mode and key guard | W1-02..07, W1-15, W4-15, W6-08 | Is live mode intended now? One central guard that accepts `sk_test_` only until you say live. |
| J2 Settle never gets stuck | W4-01, 02, 03, 04, 06, 09, 10, 14, 17, W5-04, W5-12 | Alert channel for stuck payments. |
| J3 Amount and state verification | W4-07, W4-08, W5-02, W5-03, W5-10, W5-09 | None expected. |
| J4 Late payment and pay-link settle | W5-01, W5-11, W4-05 | Should a pay-link payment inside its hold confirm normally? (expected yes) |
| J5 Return page and confirmation | W3-01..06, W3-15, W3-02 | None. |
| J6 Intent abuse and ownership | W2-01..08, W2-12, W2-14, W2-15 | Minimum charge rule and coupon at 100% (U19). Re-check pickup time at Pay: yes or no. |
| J7 Refund policy and mirroring | W6-01..06, W6-19, W5-05, 06, 15 | Should the refund window follow `free_cancel_hours`? (expected yes) |
| J8 Customer money copy | W3-07..09, W6-17, W2-10 | Adaptive pricing on or off; Twint copy while Twint is off. |
| J9 Database privilege hardening | W5-07, W5-08, W2-11 (held `…320000`), W5-22 | Apply `…320000` after your 4242 payment. |
| Low and Info items | the rest | Batch into the nearest job or leave. |

## Not done (be exact)

- Live read-only checks did not run. The reviewers and I have no Supabase or Stripe connector in this session. W5 wrote 18 ready SELECTs (L1 to L18 in `-W5.md`) and W4 lists what to read in the Stripe webhook endpoint (subscribed event list, failed deliveries, API version). To run them, open this repo in a session with the Supabase and Stripe connectors, or give me a numbered step.
- pgTAP and the checkout unit tests were not run in this pass (no local stack started, per the no-Docker rule). W5 notes the pgTAP file asserts the post-`…320000` grants, so a green lab run does not describe live.
- Four items are unverified and need live facts: W1-01 (which secret key is bound), W4-04 (Twint id prefix), W4-12 (events subscribed in Stripe), W3-12 (Arabic on Stripe's page).

## One step for you (W1-01)

1. Open the Stripe dashboard, switch to the account that issued the key on the Worker, and read the top-left mode label and the account id (`acct_1UIZmq…` is the sandbox; the live key's id differs per W1-17).
2. Tell me: test or live, and whether the Worker's secret key and the webhook endpoint secret are from that same mode.

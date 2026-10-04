# Hand-over: record the Stripe fee (quick 261004-stripe-fee-record)

Branch `fix/stripe-fee-record`, cut from `origin/main` 86803493; `origin/main` f0be1bbe, 2f08d689 (dashboard
numbers) and 8ca4881d merged in, no conflicts.
Work session, 2026-10-04 21:56 to 22:38 +04. Owner decision: `.planning/decisions/2026-10-04-dashboard-numbers.md`,
answer 3. Controller decision, 2026-10-04 evening: no one reads Stripe by hand and no key is touched; the Worker's
hourly sweep also fills in the past payments (30-day window, 20 a run, 404 skipped).
Money change: a fresh reviewer reads it before it ships (owner's condition).

## Stops and questions

None open.

- 1a: nothing changes a refund amount, a customer page or an e-mail.
- 1b (fee currency) is still **not verified**: Stripe was not readable from this session (the `stripe` connector
  is `needs_auth`; the only Stripe CLI on the Mac is logged in to Payme, not used). Under the controller's
  decision it is not read by hand: the first sweep after the ship answers it. The code records a fee only when
  the balance transaction is in CHF and never converts. If the first run's log shows `notChf` > 0 and
  `recorded` = 0, the account does not settle in CHF; that is then a question for the owner (the dashboard would
  never show a fee).

## Findings

### 1a. Every reader of `booking_payments.stripe_fee_rappen` (live bodies read 2026-10-04 ~22:00, read-only)

| Reader | What it does with the fee | Effect once filled |
|---|---|---|
| `tg_payment_update_whitelist` (live md5 `a771ed5ced38216b10d119b075dd043c`) | allows one write on a succeeded row (and on any non-succeeded row), refuses a change once set | none; the new writer goes through it |
| `ops_refund_intent_sent` (live md5 `dd9e9a3203a3b4e4a33d8c1470ba4fe3`) | writes `p_stripe_fee_rappen` only when the column is NULL | none on amounts: refund amounts come from `charged_rappen` minus refunds. Once the charge fee is in, this write stops happening (guarded by `is null`) |
| `ops_refund_record` (live md5 `8e047ff1c529a8974e408fa28eb14d6e`) | same guarded write | no TS caller any more; none on amounts |
| `loadDashboardMoney` `apps/web/lib/ops/bookings.ts:403` (after `2f08d689`, merged in) | sums it over every captured payment (any status with `captured_at`, so a refunded duplicate too) | Expenses and Net now include it (the owner's intent) |
| `mapBoardBooking` `apps/web/lib/ops/bookings-map.ts:355` → `app/vamos-ops-data.js:757` | maps `row.stripe_fee_rappen` | the board SQL never selects the column, and no screen reads `stripeFeeRappen`: nothing changes |
| `manage_money_for` (customer manage page), confirmation and other mails, `packages/emails` | do not read it (`manage_money_for` builds its object from named columns) | none |

No view, policy or other function on live reads it; customer roles have no column grant (only `vamos_staff`
SELECT, `service_role`, `postgres`).

Side note, not changed: the refund path passes `stripeFeeRappen(accepted)` (`apps/web/lib/ops/refund.ts:476`),
a refund's own fee from an unexpanded refund, so it is always null in practice. If it were ever non-null it would
land in the charge-fee column while that is still NULL. Once the charge fee is recorded, that write is blocked by
its own `is null` guard.

### 1b. Currency of the fee: not verified (see Stops)

Charges are created in CHF; with Adaptive Pricing the customer sees AED (VT-26-0753: `charged_rappen` 10039,
presentment AED 46260 minor). The fee and its currency live on the balance transaction, in the account's
settlement currency.

### 1c. When the fee is available; what the webhook receives

- Events received on live (`stripe_events`, all time): `checkout.session.expired` 51, `checkout.session.completed`
  28, `charge.refunded` 1. No `charge.updated`, `charge.succeeded` or `payment_intent.*`: the endpoint is not
  subscribed to `charge.updated`, and the consumer (`settle.ts` `outcomeFor`) would ignore it anyway.
- So the fee is not read at settlement (the balance transaction may not exist yet, and settlement must not
  wait): the hourly sweep reads it after the fact. No Stripe dashboard change is needed.
- Optional later (not built): subscribe the endpoint to `charge.updated` and handle it, to record within seconds
  instead of within the hour. Needs a Stripe dashboard change by the owner.

### 4. Separate finding, not fixed: `booking_payments.charged_currency` reads AED on CHF amounts

Live (read-only): of the 16 succeeded payments, 8 have `charged_currency` `CHF` and no FX; 8 have `AED` with
`fx_rate` set, and 7 of those 8 have `presentment_currency` `AED` (the eighth, payment 52, the VT-26-0750
difference paid through `checkout_extra_payment_settle`, has `presentment_currency` NULL because that function
takes no presentment currency). On all 16, `charged_rappen` is the CHF amount.

This is how the column is written on purpose, not a stray value: `fxFromSession`
(`apps/web/lib/checkout/stripe.ts:386-445`) sets `chargedCurrency` to the presentment currency when Stripe
Adaptive Pricing converted the price into EUR, USD or AED ("charged_currency is the currency the customer paid
in ... charged_rappen stays the CHF figure"), and the table checks `booking_payments_fx_currency_pair` (CHF
exactly when `fx_rate` is NULL) and `booking_payments_currency_allowed` (CHF, EUR, USD, AED) enforce it. The name
is what misleads: a reader taking `charged_currency` as the currency of `charged_rappen` would read AED on a CHF
amount.

Every reader and writer of `charged_currency` (repo `git grep` excluding tests, and live function bodies, views
and policies):

| Where | Reads or writes | Used for a figure? |
|---|---|---|
| `fxFromSession` `apps/web/lib/checkout/stripe.ts:394-443` | computes the value | writer |
| `settle.ts:613,630,644` | passes it to `checkout_payment_settle` / `checkout_extra_payment_settle` | writer |
| `checkout_payment_settle`, `checkout_extra_payment_settle` (live) | `charged_currency = coalesce(p_charged_currency, charged_currency)` | writer |
| `checkout_create_booking`, `checkout_attach_payment` (live) | insert the row (default CHF) | writer |
| `tg_payment_update_whitelist` (live) | allows a change only while the value is CHF (write-once after FX) | guard, no figure |
| table checks `booking_payments_fx_currency_pair`, `booking_payments_currency_allowed` | as above | guard, no figure |

No reader computes or shows anything from it: no refund function (refunds use `charged_rappen`; the
`charge.refunded` handler `money-events.ts:134` checks the currency on Stripe's own refund objects, not this
column), no e-mail (`confirmation_payload` and `checkout_booking_for_email` use `presentment_*`), no customer page
(`manage_money_for` returns `charged_rappen`, `presentment_*`, `payment_method_type`), no dashboard figure
(`loadDashboardMoney` sums `charged_rappen` and `stripe_fee_rappen` only), no view or policy. Column grants: SELECT
for `authenticated`, `vamos_guest`, `vamos_staff`, `service_role`, `postgres`; no TS query of a customer or guest
role selects it. Nothing to fix for a figure today; a rename or a comment on the column is the owner's call.

Open point next to it, not checked here: `money-events.ts:134` refuses (`non_chf_refund`) a `charge.refunded`
whose refunds are not in `chf`. If Stripe reports refunds of an Adaptive Pricing charge in the presentment
currency (AED), a refund made in the Stripe dashboard on one of those 8 payments would not be recorded. The one
`charge.refunded` on live (2026-10-02) was processed without error; which payment it was is not in the stored
payload.

## What I built

1. Migration `packages/db/supabase/migrations/20261007290000_stripe_fee_record.sql` (one transaction):
   - `public.checkout_payment_fee_pending(p_limit int4 default 20)`: the Stripe id stored on each captured payment
     (`succeeded` or `duplicate`, `captured_at` set) whose fee is NULL, captured in the last **30 days**, newest
     first, at most `p_limit` (never more than 100). The id is a PaymentIntent (`pi_`) or, on a payment settled
     before the write-back, its Checkout Session (`cs_`). `stable`, definer.
   - `public.checkout_payment_fee_record(p_payment_intent_id text, p_fee_rappen int4) returns bool`: one UPDATE
     of the one payment row storing that `pi_` or `cs_` id, only while the fee is NULL and `0 < fee < charged_rappen`;
     refused values return false and never raise. Touches no booking row, so it is outside the payment → booking
     lock order of `20261007280000`.
   - Both: `security definer`, `search_path ''`, `lock_timeout 2s`, `statement_timeout 5s`; revoked from public,
     anon, authenticated; EXECUTE to `vamos_system` only. Column comment restated.
   - Bodies as written (md5 of `prosrc`, read back from the lab after `db reset`):
     - `checkout_payment_fee_pending(integer)` `172af2ba56a0ef4e1c7abebf5ecf331d`
     - `checkout_payment_fee_record(text,integer)` `3874642c9663c4b27bfeb3afabdaf4f3`
     - column comment `73c0da203b5975d8dc70af7c24638b2b`
   - Live has neither function (checked 22:0x); not applied anywhere but the lab.
2. `apps/web/lib/checkout/stripe-fee.ts`:
   - `stripeFeeOfCharge`: fee only for a succeeded charge whose balance transaction is in CHF, a whole number
     above 0 and below the transaction amount; `pending` when the balance transaction is not attached or the
     charge is still processing; otherwise skip (`not_chf`, `no_fee`, `not_captured`, `unexpected`).
   - `readStripeFee`: `pi_` → `paymentIntents.retrieve(id, { expand: ["latest_charge.balance_transaction"] })`;
     `cs_` → `checkout.sessions.retrieve(id, { expand: ["payment_intent.latest_charge.balance_transaction"] })`;
     any other id never reaches Stripe; a Stripe error is thrown to the sweep.
   - `stripeReadErrorKind`: `missing` (404 / `resource_missing`), `transient` (no answer, `StripeConnectionError`,
     `StripeAPIError`, 5xx, 429), `other` (400, 401, 403, ...).
   - `sweepStripeFeesWithDeps`: 20 a run. Missing → counted `missing`, skipped, never stops the run (and, as a
     Stripe answer, ends a run of transient failures). Transient → `failed`, three in a row stop the run.
     Other → `failed`, never stops the run. Database refusal or error → `skipped` / `failed`, never throws.
   - `stripeFeeDbDeps` (asSystem → the two functions), `sweepStripeFees` (production wiring).
3. `apps/web/worker.ts`: hourly cron, own try/catch after the notification sweep, logs `stripe_fee_sweep`
   with counts only: `checked, recorded, waiting, notChf, missing, skipped, failed, stopped`.
   `settle.ts` is unchanged: settlement never waits on the fee.
4. `packages/db/database.types.ts`: the two functions added by hand in the pinned 2.115 format (signatures did
   not change with the controller's revision).

Not touched: `app/ops/OpsDash.dc.html`, `apps/web/lib/ops/bookings.ts`.

## Tests (each new one fails before its change)

| Test | Result | Before the change |
|---|---|---|
| `packages/db/supabase/tests/stripe_fee_record.test.sql` (36) | 36/36 on the lab; full suite `lab.sh pgtap stripefee`: see Checks | first version: both functions missing. Revision: with the first bodies loaded, `not ok` 4 (default 20), 8 (order with 80 h and `cs_` rows), 9 (80 h listed), 11 (`cs_` listed), 20 (`cs_` recorded) |
| `apps/web/lib/checkout/stripe-fee.test.ts` (23) | pass | first version: module missing. Revision: against the first module, 8 fail (session read, three `stripeReadErrorKind`, result shape with `missing`, 404 never stops, `other` never stops, 404 breaks a transient run) |
| `apps/web/lib/checkout/stripe-fee.local.test.ts` (2, real Worker client `vamos_edge` → `vamos_system`, `fetch_types: false`; runs with `VAMOS_LOCAL_DB_PORT`) | pass on the lab | first version: functions missing. Revision: first bodies → `expected [ 'pi_sfl_…' ] to include 'cs_test_sfl_…'` |

## Backfill: the sweep fills it in

No `backfill.sql`; nothing is written by hand. After the migration and the Worker ship, the first hourly run
lists every captured payment of the last 30 days without a fee (16 today, under the limit of 20) and records what
Stripe reports in CHF. The 16 payments on live (read-only, 2026-10-04 ~22:05 +04), all `stripe_fee_rappen` NULL:

| Payment id | Reference | Stripe id stored | Charged (rappen) | Captured (UTC) | Expected after the first run |
|---|---|---|---|---|---|
| 13 | VT-26-0716 | `cs_test_a1nqROn4…dktE` (session) | 10000 | 2026-09-09 16:42 | stays empty: `missing` |
| 16 | VT-26-0719 | `cs_test_a1AphzOD…tSgYO` (session) | 12000 | 2026-09-09 21:03 | stays empty: `missing` |
| 17 | VT-26-0720 | `cs_test_a1w26ZO6…13e1a` (session) | 12000 | 2026-09-09 21:45 | stays empty: `missing` |
| 22 | VT-26-0723 | `cs_test_a1GAvFzl…uQmQ` (session) | 10810 | 2026-09-10 19:53 | stays empty: `missing` |
| 37 | VT-26-0736 | `pi_3UKk98HcNp9GZYjz1fgh1S6W` | 8776 | 2026-09-28 19:23 | fee recorded if in CHF |
| 38 | VT-26-0737 | `pi_3UKkRbHcNp9GZYjz0wqFV4IF` | 8658 | 2026-09-28 19:42 | fee recorded if in CHF |
| 39 | VT-26-0738 | `pi_3UKyOeHcNp9GZYjz0xRsvTYM` | 6190 | 2026-09-29 10:36 | fee recorded if in CHF |
| 40 | VT-26-0739 | `pi_3UKzmiHcNp9GZYjz1RnVk41a` | 12837 | 2026-09-29 12:10 | fee recorded if in CHF |
| 43 | VT-26-0742 | `pi_3UL02xHcNp9GZYjz0NWdzUWW` | 2554 | 2026-09-29 12:22 | fee recorded if in CHF |
| 44 | VT-26-0743 | `pi_3UL0spHcNp9GZYjz1Mg9Qw2C` | 9294 | 2026-09-29 13:15 | fee recorded if in CHF |
| 47 | VT-26-0746 | `pi_3ULKglHcNp9GZYjz0Ilm5RxY` | 3556 | 2026-09-30 10:24 | fee recorded if in CHF |
| 48 | VT-26-0747 | `pi_3ULMdbHcNp9GZYjz0w3ZJv6I` | 3408 | 2026-09-30 12:29 | fee recorded if in CHF |
| 51 | VT-26-0750 | `pi_3ULt6iHcNp9GZYjz1IwHjpxs` | 9447 | 2026-10-01 23:09 | fee recorded if in CHF |
| 52 | VT-26-0750 (difference) | `pi_3UM1ynHcNp9GZYjz1KNZQ7ls` | 1184 | 2026-10-02 08:38 | fee recorded if in CHF |
| 54 | VT-26-0752 | `pi_3UMWb4HcNp9GZYjz0Sw2jUDE` | 9979 | 2026-10-03 17:19 | fee recorded if in CHF |
| 55 | VT-26-0753 | `pi_3UMsMhHcNp9GZYjz1pGBTcBV` | 10039 | 2026-10-04 16:34 | fee recorded if in CHF |

Why 13, 16, 17 and 22 stay empty: they were paid on 9 and 10 September, while the Worker still carried the old
UAE test account's key (`pk_test_51U65pW…`, in `apps/web/wrangler.jsonc` from 51cc47f6, 2026-09-09, until
b2af7ce8, 2026-09-24 switched to `pk_test_51UIZmq…`, the current sandbox `acct_1UIZmqHcNp9GZYjz`). The Worker now
reads the current account, which does not know those sessions: Stripe answers 404, the run counts them as
`missing`, and they leave the 30-day window on 9 and 10 October. Inferred from the repo history, not seen in
Stripe. The `pi_` ids of the other 12 carry `HcNp9GZYjz`, the current account's suffix.

Any of the 12 can also stay empty if Stripe reports the fee in another currency (`notChf`) or reports 0
(`skipped`); 1b decides that. A payment still `waiting` is read again the next hour.

Proof after the ship (controller): the first `stripe_fee_sweep` log line (expected `checked` 16, `missing` 4), then

```sql
select bp.id, b.reference, bp.stripe_payment_intent_id, bp.charged_rappen, bp.stripe_fee_rappen
  from public.booking_payments bp join public.bookings b on b.id = bp.booking_id
 where bp.status = 'succeeded'
 order by bp.captured_at;
```

## Checks

Revision, 2026-10-04 22:35 +04:

| Check | Result |
|---|---|
| `lab.sh pgtap stripefee` (native, after `db reset`) | PASS, Files=105, Tests=2931; `stripe_fee_record.test.sql` ok |
| `stripe-fee.test.ts` + `stripe-fee.local.test.ts` (lab DB) | 25 pass |
| `pnpm typecheck` | pass |
| `pnpm lint` | 0 errors; 6 warnings, all in files this job did not touch |
| `pnpm check:db-fences` | 8/8 pass |
| `pnpm check:numbers` | ok |
| `pnpm i18n:check` | pass |

Full `test:unit` not run (shared Mac).

## Not verified

- 1b, the fee currency (see Stops), and the sweep against real Stripe: only stand-ins (unit tests and the local
  Worker-client test). The 404 shape (`type` `StripeInvalidRequestError`, `statusCode` 404, `code`
  `resource_missing`) is stripe-node's documented error shape, not seen live here.
- `pnpm db:types:check`: the pinned CLI 2.115 needs Docker (off by owner rule). The native CLI 2.119 on the lab
  gives the same signatures (`p_limit?: number` → `{ stripe_payment_intent_id: string }[]`;
  `p_fee_rappen: number, p_payment_intent_id: string` → `boolean`); its file format differs, so the two entries
  were added by hand in the 2.115 format.
- Cloudflare cron wall time with Stripe slow: bounded by 20 reads a run and the stop after 3 transient failures
  in a row (each read up to 10 s with 2 retries). A run of `other` refusals (for example a revoked key, 401) does
  not stop early: at most 20 quick refusals an hour.
- For about 30 days the 4 old-account payments cost 4 Stripe reads an hour (404 each), until they leave the window.

## For the controller

1. Apply `20261007290000_stripe_fee_record.sql` verbatim; read back md5 of both `prosrc` against the values above.
2. Deploy the Worker (`--env staging`).
3. After the next full hour: read the `stripe_fee_sweep` log line and run the read-back above.

Lab `stripefee` destroyed after the checks; no `apps/web/.next-*` was created; this job's `.next`, `.open-next`
and `.wrangler` build output removed.

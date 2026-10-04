# Hand-over: record the Stripe fee (quick 261004-stripe-fee-record)

Branch `fix/stripe-fee-record`, cut from `origin/main` 86803493; `origin/main` f0be1bbe and then 2f08d689
(dashboard numbers) merged in, no conflicts.
Work session, 2026-10-04 21:56 to 22:25 +04. Owner decision: `.planning/decisions/2026-10-04-dashboard-numbers.md`, answer 3.
Money change: a fresh reviewer reads it before it ships (owner's condition).

## Stops and questions

1. **Stripe could not be read from this session.** The `stripe` connector is `needs_auth` here, and the only
   Stripe CLI on the Mac is logged in to Payme (`acct_1UKNil…`), which was not used. So 1b (the currency of the
   fee) is **not verified**, and the backfill numbers were **not read**: `backfill.sql` is not written (no
   number is guessed). Next step for the controller: read the 16 balance transactions with a signed-in Stripe
   connector (list below), then write the 16 updates in the form given under "Backfill".
2. **Question for the owner only if 1b comes back "not CHF".** The code already handles it safely (the fee then
   stays empty and the run counts it as `notChf`), but the dashboard would then never show a fee. No question is
   needed while the balance transactions are in CHF.

Nothing found in 1a changes a refund amount, a customer page or an e-mail, so there is no stop there.

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
land in the charge-fee column while that is still NULL. Now that the charge fee is recorded first, that write is
blocked by its own `is null` guard.

### 1b. Currency of the fee: not verified

Stripe could not be read (see Stops). Facts in hand: charges are created in CHF; with Adaptive Pricing the
customer sees AED (VT-26-0753: `charged_rappen` 10039, presentment AED 46260 minor). The fee and its currency
live on the balance transaction, in the account's settlement currency. The code records it only when that
currency is `chf` and never converts.

`booking_payments.charged_currency` is `AED` on the 8 Adaptive Pricing rows although `charged_rappen` is the CHF
amount; a reader should not take `charged_currency` as the fee currency.

### 1c. When the fee is available; what the webhook receives

- Events received on live (`stripe_events`, all time): `checkout.session.expired` 51, `checkout.session.completed`
  28, `charge.refunded` 1. No `charge.updated`, `charge.succeeded` or `payment_intent.*`: the endpoint is not
  subscribed to `charge.updated`, and the consumer (`settle.ts` `outcomeFor`) would ignore it anyway.
- So the fee is not read at settlement (the balance transaction may not exist yet, and settlement must not
  wait): an hourly sweep reads it after the fact. No Stripe dashboard change is needed.
- Optional later (not built): subscribe the endpoint to `charge.updated` and handle it, to record within seconds
  instead of within the hour. Needs a Stripe dashboard change by the owner.

## What I built

1. Migration `packages/db/supabase/migrations/20261007290000_stripe_fee_record.sql` (one transaction):
   - `public.checkout_payment_fee_pending(p_limit int4 default 25)` line 34: PaymentIntent ids of captured payments
     (`succeeded` or `duplicate`, `captured_at` set) with fee NULL, `pi_` ids only, captured in the last 72 h,
     newest first, at most 100. `stable`, definer.
   - `public.checkout_payment_fee_record(p_payment_intent_id text, p_fee_rappen int4) returns bool` line 62: one
     UPDATE of one payment row, only while the fee is NULL and `0 < fee < charged_rappen`; refused values return
     false and never raise. Touches no booking row, so it is outside the payment → booking lock order of
     `20261007280000`.
   - Both: `security definer`, `search_path ''`, `lock_timeout 2s`, `statement_timeout 5s`; revoked from public,
     anon, authenticated; EXECUTE to `vamos_system` only. Column comment restated (line 98).
   - Bodies as written (md5 of `prosrc`, read back from the lab after `db reset`):
     - `checkout_payment_fee_pending(integer)` `acc4a555e036b2be1ebb8a556e325ef9`
     - `checkout_payment_fee_record(text,integer)` `bf5e1ee10591b5df3436ae9c13f7729f`
     - column comment `73c0da203b5975d8dc70af7c24638b2b`
   - Live has neither function (checked); last live migration version `20261004135322`.
2. `apps/web/lib/checkout/stripe-fee.ts`:
   - `stripeFeeOfCharge` line 43: fee only for a succeeded charge whose balance transaction is in CHF, a whole
     number above 0 and below the transaction amount; `pending` when the balance transaction is not attached or
     the charge is still processing; otherwise skip (`not_chf`, `no_fee`, `not_captured`, `unexpected`).
   - `readStripeFee` line 68: `paymentIntents.retrieve(pi, { expand: ["latest_charge.balance_transaction"] })`;
     a non-`pi_` id never reaches Stripe; a Stripe error is thrown to the sweep.
   - `sweepStripeFeesWithDeps` line 97: up to 25 payments a run; a Stripe or database failure counts and the run
     goes on; three Stripe failures in a row stop the run; returns counts only.
   - `stripeFeeDbDeps` line 144 (asSystem → the two functions), `sweepStripeFees` line 166 (production wiring).
3. `apps/web/worker.ts:175`: hourly cron, own try/catch after the notification sweep, logs
   `stripe_fee_sweep` with counts (`checked, recorded, waiting, notChf, skipped, failed, stopped`).
   `settle.ts` is unchanged: settlement never waits on the fee.
4. `packages/db/database.types.ts`: the two functions added by hand in the pinned 2.115 format (see "Not verified").

Not touched: `app/ops/OpsDash.dc.html`, `apps/web/lib/ops/bookings.ts`.

## Tests (each fails before the change)

| Test | Result | Before the change |
|---|---|---|
| `packages/db/supabase/tests/stripe_fee_record.test.sql` (30) | pass; full suite in the lab `lab.sh pgtap stripefee`: PASS, Files=105, Tests=2925 | fails: `function public.checkout_payment_fee_pending(integer) does not exist` (run with both functions dropped) |
| `apps/web/lib/checkout/stripe-fee.test.ts` (15) | pass | fails: `Cannot find module './stripe-fee'` |
| `apps/web/lib/checkout/stripe-fee.local.test.ts` (2, real Worker client `vamos_edge` → `vamos_system`, `fetch_types: false`; runs with `VAMOS_LOCAL_DB_PORT`) | pass on the lab DB 45222 | fails: both functions `does not exist` |
| Neighbours that read `worker.ts` or the fee: `settle`, `no-show-sweep`, `return-settle`, `marketing-cache`, `booking-lifecycle`, `ops-live-data`, `refund` | 8 files, 173 pass | n/a |

Gates: `pnpm typecheck` pass; `pnpm lint` 0 errors (6 warnings, all in files this job did not touch);
`pnpm check:db-fences` 8/8 pass; `pnpm check:numbers` ok; `pnpm i18n:check` pass. Full `test:unit` not run (shared Mac).

## Backfill (not written: Stripe not readable here)

The 16 captured payments on live (read-only, 2026-10-04 ~22:05 +04), all `stripe_fee_rappen` NULL:

| Payment id | Reference | Stripe id stored | Charged CHF (rappen) | Captured (UTC) | Fee | Fee currency |
|---|---|---|---|---|---|---|
| 13 | VT-26-0716 | `cs_test_a1nqROn4…dktE` (session) | 10000 | 2026-09-09 16:42 | not read | not read |
| 16 | VT-26-0719 | `cs_test_a1AphzOD…tSgYO` (session) | 12000 | 2026-09-09 21:03 | not read | not read |
| 17 | VT-26-0720 | `cs_test_a1w26ZO6…13e1a` (session) | 12000 | 2026-09-09 21:45 | not read | not read |
| 22 | VT-26-0723 | `cs_test_a1GAvFzl…uQmQ` (session) | 10810 | 2026-09-10 19:53 | not read | not read |
| 37 | VT-26-0736 | `pi_3UKk98HcNp9GZYjz1fgh1S6W` | 8776 | 2026-09-28 19:23 | not read | not read |
| 38 | VT-26-0737 | `pi_3UKkRbHcNp9GZYjz0wqFV4IF` | 8658 | 2026-09-28 19:42 | not read | not read |
| 39 | VT-26-0738 | `pi_3UKyOeHcNp9GZYjz0xRsvTYM` | 6190 | 2026-09-29 10:36 | not read | not read |
| 40 | VT-26-0739 | `pi_3UKzmiHcNp9GZYjz1RnVk41a` | 12837 | 2026-09-29 12:10 | not read | not read |
| 43 | VT-26-0742 | `pi_3UL02xHcNp9GZYjz0NWdzUWW` | 2554 | 2026-09-29 12:22 | not read | not read |
| 44 | VT-26-0743 | `pi_3UL0spHcNp9GZYjz1Mg9Qw2C` | 9294 | 2026-09-29 13:15 | not read | not read |
| 47 | VT-26-0746 | `pi_3ULKglHcNp9GZYjz0Ilm5RxY` | 3556 | 2026-09-30 10:24 | not read | not read |
| 48 | VT-26-0747 | `pi_3ULMdbHcNp9GZYjz0w3ZJv6I` | 3408 | 2026-09-30 12:29 | not read | not read |
| 51 | VT-26-0750 | `pi_3ULt6iHcNp9GZYjz1IwHjpxs` | 9447 | 2026-10-01 23:09 | not read | not read |
| 52 | VT-26-0750 (difference) | `pi_3UM1ynHcNp9GZYjz1KNZQ7ls` | 1184 | 2026-10-02 08:38 | not read | not read |
| 54 | VT-26-0752 | `pi_3UMWb4HcNp9GZYjz0Sw2jUDE` | 9979 | 2026-10-03 17:19 | not read | not read |
| 55 | VT-26-0753 | `pi_3UMsMhHcNp9GZYjz1pGBTcBV` | 10039 | 2026-10-04 16:34 | not read | not read |

Full session ids for 13/16/17/22 are in `booking_payments.stripe_payment_intent_id` on live.

Notes for the reads:
- Rows 13, 16, 17, 22 were paid on 9–10 September, before the switch to the sandbox `acct_1UIZmqHcNp9GZYjz`
  (26.1-01, 2026-09-28; the old account was the UAE test account `pk_test_51U65pW…`). Inferred, not checked:
  they are probably not readable on the current account, and a UAE account would report the fee in AED, which
  stays NULL. Leaving them NULL is the expected outcome.
- For a `pi_` row: `GET /v1/payment_intents/<pi>?expand[]=latest_charge.balance_transaction`, take
  `latest_charge.balance_transaction.fee` and `.currency`. Record only when currency is `chf`.
- Rows 54 and 55 are inside the sweep's 72 h window until 2026-10-06 17:19 / 2026-10-07 16:34 UTC: if the Worker
  ships before then, the sweep fills them itself, and the backfill's `is null` guard skips them.

Form of each update, once the numbers are read (one per payment, keyed by id and Stripe id):

```sql
update public.booking_payments
   set stripe_fee_rappen = <fee from Stripe>
 where id = <payment id>
   and stripe_payment_intent_id = '<pi_…>'
   and status = 'succeeded'
   and stripe_fee_rappen is null;
```

Read-back:

```sql
select bp.id, b.reference, bp.stripe_payment_intent_id, bp.charged_rappen, bp.stripe_fee_rappen
  from public.booking_payments bp join public.bookings b on b.id = bp.booking_id
 where bp.status = 'succeeded'
 order by bp.captured_at;
```

## Not verified

- 1b, the fee currency, and every backfill number (Stripe not readable from this session).
- The sweep against real Stripe: only stand-ins (unit tests and the local Worker-client test). First proof after
  the ship: the next hourly `stripe_fee_sweep` log line and a read of `stripe_fee_rappen` on the newest payment.
- `pnpm db:types:check`: the pinned CLI 2.115 needs Docker (off by owner rule). The native CLI 2.119 on the lab
  gives the same signatures (`p_limit?: number` → `{ stripe_payment_intent_id: string }[]`;
  `p_fee_rappen: number, p_payment_intent_id: string` → `boolean`); its file format differs, so the two entries
  were added by hand in the 2.115 format.
- Cloudflare cron wall time with Stripe slow: bounded by 25 reads a run and the stop after 3 failures in a row
  (each read up to 10 s with 2 retries).

## For the controller

1. Apply `20261007290000_stripe_fee_record.sql` verbatim; read back md5 of both `prosrc` against the values above.
2. Deploy the Worker (`--env staging`).
3. Read the 16 fees from Stripe and run the updates above, then the read-back.

Lab `stripefee` destroyed after the checks; no `apps/web/.next-*` was created.

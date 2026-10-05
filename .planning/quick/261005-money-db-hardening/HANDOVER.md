# Hand-over: money and database hardening (U4, U15, S6, U26, M18, U27)

Job session (work session, not control), 2026-10-05, finished 16:00 +04. Source: `.planning/audits/2026-10-05-repo-investigation.md`, owner's choice "Money and database" in `.planning/decisions/2026-10-05-repo-investigation-answers.md`.

- Branch `fix/money-db-hardening`, cut from `origin/main` `328b133c`. `origin/main` `9d0c8bf7` (purge fix, migration 20261007300000) merged in as `8aed389a`, no conflict.
- Commits: `f076a74b` U4, `c9a15f99` U15 + U26, `727c6ada` M18, `5b48fd87` U27, `f5ff159a` S6, `8aed389a` merge, then this hand-over.
- Migrations: `20261007310000_settle_processed_checkout_grants.sql` (file md5 `201cae049c98819c19adda2d2faa9b73`) and `20261007320000_rest_function_revoke.sql` (file md5 `a635da06e0309f6e22dee13c7591dd6c`). Neither restates `tg_append_only` or `purge_unpaid_booking`; on the lab after both files those two still hash `ea538068a904dc7b5b974ce19ae67245` and `a4f2035fc00051ef13719d321872d1f6`.
- No live write, no deploy, no Stripe/Cloudflare/GitHub settings touched. Live reads were read-only SELECTs through the Supabase MCP.
- `database.types.ts` unchanged: no signature changed.

## Ship order (S6 needs three steps)

1. Apply `20261007310000` on live (expand: grants `vamos_checkout`, settle fix, comments, coupon codes staff-only). The Worker live today keeps working: it calls the eight functions as `anon`, which still holds EXECUTE.
2. Deploy this branch's Worker (calls them as `vamos_checkout`).
3. Then apply `20261007320000` (contract: revokes PUBLIC, `anon`, `authenticated`). Applied before step 2 it breaks quotes, vouchers, extras names and consent on the live Worker.

Proved on the lab before the app restart: with only 310000, the old Worker code (asQuote/asAnon) and the new code (asCheckout) both pass; with both files, the new code passes and anon/authenticated get 42501.

## Functions restated (md5 of `prosrc`)

| Function | Restated from | Old (live, read 2026-10-05) | New | Change |
|---|---|---|---|---|
| `public.checkout_payment_settle(text,text,text,text,text,numeric,text,timestamptz,bigint,text)` | `20261005130000_pay_link_erased_booking.sql`, live body identical to the file | `f1d7d186d3daa26167fcba8c48ace644` | `c778ed74c3eb1722e84f5065990d18b2` | already-settled branch also sets `stripe_events.processed_at` for `p_event_id`; nothing else written |
| `public.quote_rate_book(boolean)` | `20260914190000`, live body identical to the file | `7295d6c3fcea67258eaf5f735e7e0083` | `2aa084d8af0fa0401e8136958d86f158` | coupons: `code` and `note` only when `app.is_staff()`; everything else byte for byte |

New bodies read back from the lab after a full reset: same hashes. House style kept: definer, `search_path = ''`, explicit revoke/grant, one transaction, payment row locked before booking row (unchanged order in the settle function).

## U4 — refund and dispute events: database hiccups were filed as permanent

- Root cause: `apps/web/lib/checkout/money-events.ts:100-112` (`settleWithError` stamps and acks), called from the refund catch (`:176`, `charge_refund_failed`) and the dispute catch (`:225`, `dispute_upsert_failed`) for every error, so a deadlock, serialization failure, lock timeout, statement timeout or dropped connection closed the event for good.
- Fix: new `retryMoneyError` in the same file. Transient (`settleErrorKind` from `settle-errors.ts`: no SQLSTATE, class 08/53/58, 40001, 40P01, 55P03, 57014, 57P01-03) → retry, 5 s for contention, 60 s otherwise, no stamp. Real refusal → stamp the SQLSTATE (best effort) and retry every 300 s (`PAID_ERROR_RETRY_SECONDS`), so after 8 tries it lands in the DLQ mail, like the settle rule. Never acked as success. `settleWithError` is kept only for the app's own non-CHF refund refusal.
- Test: `apps/web/lib/checkout/money-events.test.ts`, 15 cases fail on the old code, pass now.
- Verified: unit tests. Not verified: a real Stripe refund/dispute event through the queue.

## U15 — paid checkout settled twice; second delivery never marked processed

- Root cause: the webhook (`evt_…`) and the return page (`return_<cs>`) both settle the same session. The second one reaches the already-settled branch (`20261005130000_pay_link_erased_booking.sql:293-302`), which returns `already_settled = true` and writes nothing, and the Worker acks without `stripe_event_settle`. So its `stripe_events` row stays unprocessed.
- Fix: `20261007310000` section 1, already-settled branch updates `stripe_events.processed_at` for the second event.
- Test: `packages/db/supabase/tests/settle_second_delivery_processed.test.sql` (16): both arrival orders, both rows processed, no extra `booking_events`, grants. 4 failed before, all pass.
- Correction (2026-10-05, review follow-up `fix/review-followups`): "both arrival orders" above is only true of the SQL test, where both events carry the same `stripe_created`. In the Worker, webhook first then return route stopped before the settle function: the return event is stamped with `session.created`, older than the processed webhook event, so `stripe_event_begin` answered `superseded` and `settle.ts` acked without stamping it. Fixed app-side in `settle.ts` (a superseded event is stamped processed, then acked); proof through the real `begin()` in `apps/web/lib/checkout/return-settle-superseded.local.test.ts`. See `.planning/quick/261005-review-followups/HANDOVER.md`.
- Live (read-only): 9 pairs with the second row unprocessed (7 webhook after return, 2 return after webhook), 1 pair fully processed. Not rewritten.

### The 26 expired-session rows (brief said 22P02)

Only one is a 22P02: `evt_1UD9z3AJS2YBf21SYDBh6yDV` (2026-09-07), a one-element array bound as a scalar; fixed on 2026-09-09 in `51cc47f6` (`pgTextArrayLiteral`). The rest:

- 22 rows, 2026-09-07..12, attempts 9, no `last_error`: the expired session has no `booking_payments` row (7 have no booking on live; 15 belong to bookings whose payment row holds another session: VT-26-0708, 0711-0718, 0721 ×3, 0724 ×3). The settle function raises P0002, `apps/web/lib/checkout/settle.ts:358` had no case for an unpaid expired page, so it retried 9 times into a stuck-payment mail for a page nobody paid.
- Fix: `settle.ts` P0002 branch, an expired session that is not paid → `eventSettle(id, "no_payment")` and ack, same pattern as the existing `no_request` case. The row keeps `processed_at` null with `last_error = 'no_payment'` (that is what `stripe_event_settle` does with an error); no mail.
- Test: `apps/web/lib/checkout/settle.test.ts` "261005 U15" (4); the first fails on the old code.
- 3 rows with attempts 0 (VT-26-0726, 0727, 0728, 2026-09-24, payment `requires_payment`, bookings cancelled) never reached the settle function. Hypothesis, not verified: `retrieveSession` failed after the Stripe test-account switch. Not fixed.

### Report only

- 75 `stripe_events` payloads are double-encoded (a JSON string, not an object), all written before `a42809ee` (2026-10-02); 5 object rows since. No rewrite.
- VT-26-0725 (attempts 9, paid session, cancelled booking, payment `requires_payment`) and VT-26-0730 (`last_error 'cancelled'`, capture-gate era): test mode, historical, left alone.

## S6 — functions callable through Supabase REST

- Root cause: eight definer functions granted to `anon` (some also `authenticated`/PUBLIC), so anyone could call them through REST past the Worker's rate limits and Turnstile: `quote_rate_book` returned every coupon `code` and `note`, `evaluate_coupon` allowed unlimited code guessing, `record_consent` unthrottled writes. Live ACLs before the fix, read 2026-10-05, are in the 320000 header.
- Callers traced: `apps/web/lib/db/quote.ts` (5 calls, asQuote = anon), `apps/web/lib/checkout/checkout-catalog.ts` (`extra_labels_read`, asQuote), `apps/web/app/api/consent/route.ts` and `state/route.ts` (`record_consent`, `consent_choice`, asAnon), `apps/web/app/api/checkout/intent/route.ts` (`consent_choice`, asAnon), `lib/checkout/account-notice.ts` (`checkout_account_settings`, already asCheckout). Staff callers (`lib/ops/rate-book.ts`, rate-book route) stay vamos_staff. No `supabase.rpc`, DC page, e-mail, cron or gateway caller for any of the eight.
- Fix: those callers use `asCheckout(env, null, …)` (role `vamos_checkout`, which REST can never become). 310000 grants `vamos_checkout` and strips coupon `code`/`note` for non-staff; the engine matches a voucher by `coupon_id` from `evaluate_coupon` (`lib/quote/engine.ts` `couponOnBook`), so no public path needs the code. 320000 revokes PUBLIC, `anon`, `authenticated`.
- Kept for `authenticated` on purpose (the Worker calls them as asCustomer; each scopes to the session's customer): `checkout_cancel_unpaid`, `customer_booking_extras`, `customer_claim_guest_bookings`, `customer_confirmation_read` (fixed in `20261005110000` F5), and `staff_claim_invite` (supabase.rpc by design). See questions.
- Tests: new `packages/db/supabase/tests/rest_function_grants.test.sql` (51; fails before on grants and the code strip); 8 pgTAP suites moved to `vamos_checkout`; new `apps/web/lib/db/rest-grants.local.test.ts` (real Worker DB client and the real consent route handlers against the lab: quotes, vouchers, extra names, account switch as vamos_checkout with no coupon code; anon/authenticated refused 42501; consent POST and GET; staff still see codes); unit tests for quote/consent callers updated.
- Verified: pgTAP full suite, local Worker-client test 4/4 (16:00, after the merge). Not verified: the built Worker over HTTP (no build in this job), live advisors after apply.

## U26 — `vat_rate_bps` comments

- Root cause: `20260913000001_launch_public_chf_vat.sql:18` and `20260913180000_ops_pricing_source.sql:185` say "hundredths of a percent"; the value is tenths (81 = 8.1 %).
- Fix: `comment on column` for `settings.vat_rate_bps` and `rate_versions.vat_rate_bps` in 310000 section 2. Data unchanged.
- Test: in `settle_second_delivery_processed.test.sql` (comment text). Verified on the lab.

## M18 — `settings_versions.label` grows " draft" per publish

- Root cause: `apps/web/lib/ops/rate-book.ts:710` clones a book with `${source.label} draft`, and the Publish route (`apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts:153`) copies `row.label` into `settings_versions` as is. Each clone of a clone added one more. Live: book 18 has 11 " draft", book 19 has 12, settings version 15 has 11.
- Fix: new `apps/web/lib/ops/rate-version-label.ts` (`draftLabelFrom` keeps exactly one " draft", `baseRateVersionLabel` strips all trailing ones); clone uses the first, Publish the second. Existing labels on live not changed.
- Test: `apps/web/lib/ops/rate-version-label.test.ts` (5) plus the local test's `forkLiveRateVersion` check.
- Operator-visible: after this ships, a newly published version's label shows without " draft". Old rows keep theirs.
- Report only: every `settings_versions` row has `cancellation_tiers` [100 % at ≥ 24 h, 75 % at ≥ 0 h, no-show 0 %]. Refunds do not read them: `compute_cancellation_refund` is hard-coded (> 24 h full, 6-24 h `pending_ops` 100 %, < 6 h none); the tiers are only copied into snapshot policy and event payloads. The 75 % rung is therefore never paid. Data not changed.

## U27 — refund lock order hand-over

- `.planning/quick/261004-refund-lock-order/HANDOVER.md:41` said unpriced trip changes skip the payment lock. Wrong: every trip change, priced or not, locks the first captured payment before the booking; an unpriced change is never refused with payment-changed. Corrected in place with a dated note.

## Checks (2026-10-05, after the merge unless noted)

| Check | Result |
|---|---|
| `lab.sh pgtap money` (native, full reset, 108 files incl. 300000's) | PASS, Files=108, Tests=3024 |
| `rest-grants.local.test.ts` on the lab | 4/4 |
| `packages/db/test/local/consent-reader.test.ts` on the lab | pass |
| `packages/db/test/local/checkout-account.test.ts` on the lab | 4 pass, 2 fail: the shared fixture `worker-arrays.sql` inserts a live rate version and hits `rate_versions_one_live` against the lab seed (23505). Those two tests are unchanged by this job; the test I changed passes |
| Touched unit tests (40 files, before the merge) | 585 pass, 4 skipped; `lib/quote/lock-secret.test.ts` (untouched) timed out at 5 s under load average 53, passes 9/9 with a 30 s timeout |
| `pnpm typecheck` | pass |
| `pnpm lint` | 0 errors, 6 warnings (files not in this job) |
| `pnpm check:db-fences` | 8/8 pass (`rest-grants.local.test.ts` added to the allowlist) |
| `pnpm check:numbers` | ok |
| `pnpm i18n:check` (before the merge; no strings changed) | 2709 keys, pass |

Not run (brief): full `test:unit`, the build. The lab was destroyed at the end.

## Questions for the controller / owner

1. S6 order: is 310000 → Worker deploy → 320000 acceptable as one ship, or should 320000 wait for a separate ship after a day of the new Worker live?
2. `authenticated` still executes five customer functions through REST (each scoped to the session's customer). Move them to a dedicated customer role too, as a later job?
3. Refund/dispute refusals now end in the DLQ mail after 8 tries instead of being acked silently; the non-CHF refund refusal is still acked (the app's own rule). Keep that one acked?
4. Expired unpaid pages with no payment row now close quietly (`no_payment`) instead of sending a stuck-payment mail. That removes mails the owner has been getting; confirm that is wanted.
5. The 3 never-started expired rows (VT-26-0726/0727/0728): investigate the Stripe account switch, or leave them as test-mode history?
6. The 75 % cancellation rung is stored but never paid. Remove it from the settings, or make `compute_cancellation_refund` read the tiers? Owner decision (money wording).
7. `checkout-account.test.ts` fixture vs lab seed: fix the fixture (checks job?) so it runs on a seeded lab.
8. The duplicate-charge branch of `checkout_payment_settle` (unchanged) still writes a second `payment.duplicate` booking event on a replay. Not in this brief; flag for a later job.

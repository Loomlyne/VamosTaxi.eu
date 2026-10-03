# 261003 fare lines: hand-over to the controller

Branch `feat/fare-lines-build`, cut from origin/main b25d90eb, plan commit e69e90b8 merged, `origin/main` (7c01f962) merged in again at the end (clean, no conflict).
Worktree: `/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-a6ce6d39e2579cbf7`. Nothing pushed, nothing deployed, live Supabase never touched, no migration applied outside my own scratch stack (`vamos-taxi-fl`, ports 655xx, now removed).

## What it does

One Fare line becomes up to three: Fare (`distance_fare`), Airport pickup fee (`airport_fee`), `{origin} – {destination} route` (`fixed_route`), all kind `fare`. Shown with plane and pin icons on /checkout, confirmation, voucher, pay link; no icons in the e-mail and on the dashboard. Old bookings keep one Fare line.

## Commits (oldest first)

| Commit | Task |
|---|---|
| 073c1062 | 1 `checkoutCharge` `fareParts` (split after the arithmetic), `price-route.ts`, `intent.ts`, `price-rows.ts` (`farePartsFromLines/Lock`, `peekLockPriceRows` deleted), `lock.ts` comment |
| 848e3683 | 2 ops `savedChargeFromSnapshot` (one `distance_fare`; the two new codes accepted and ignored; any other fare code refuses) and `chargeFor` passes the board lines as `fareParts` |
| 660939a2 | 3 migration `20261007230000_fare_line_reads.sql`, pgTAP `fare_line_reads.test.sql` (24), `snapshot_lines_reconcile.test.sql` (+2), types |
| 6e53a15c | 4 `SummaryRail`, `ConfirmationClient`, `BookingVoucher`, `PayClient`, `confirmation-receipt`, `pay-link-lines`, `manage-money`, `fare-line-label.tsx` |
| cee00bed | 5 and 7 `manage-booking.dc.html`, `booking-detail.dc.html`, `OpsDetail.dc.html`, `bookings-map.ts`, dict (`Route price`, route pattern, wording), `de/ar.json`, seed regenerated (1 row, counts unchanged) |
| 13688d00 | 6 `notify.ts` (list figures, voucher from `discount_rappen`), `ConfirmationEmail`, `types.ts`, four mail message files |
| 4377d0aa | fix found in the browser: route label is one inline span (the price row is a flex box and gapped the pieces) |
| fb9f786f | proof scripts and run logs under `evidence/` |

## Things that differ from the plan (read these)

1. **`manage_money_for` newest body is in `20261007150000_trip_change_reprice.sql`** (has the `last_change` key), not `20260930190000` as the plan says. The migration copies that body and only adds four keys. `checkout_pay_link_lines` is copied from `20261005130000`. Both readers add `list_rappen`, `discount_rappen`, and `origin`/`destination` (route line only, capped at 120 chars). `checkout_pay_link_lines` is `drop function` + `create` in one transaction with the same grants (read-only, security definer, `search_path = ''`). Apply it **before** the Worker deploy; the new Worker reads the new columns, the old Worker ignores them.
2. **`booking-detail.dc.html` keeps an old one-line price exactly as it was.** It shows the saved lines only when the price has an `airport_fee` or `fixed_route` line. Reason: plan §7.8 says "one Fare line, as before".
3. `price-route.ts` and `intent.ts` read `payload.price_rows` of the **verified** lock only. A part is used only if it is a whole non-negative number and the parts stay below the pre-coupon base; otherwise one Fare line, no throw. A zero part is "absent".
4. The e-mail voucher fix also keeps an extra whose voucher-reduced amount is 0 (its list figure counts), otherwise the rows would not add up.
5. Branch name is not `worktree-agent-*` (you named it); the per-commit HEAD guard was applied as "not main/master/…".

## Money identity

- `checkoutCharge`: the split sits after `payableRappen`, the coupon, VAT and `chargedRappen`; the lines-sum guard still runs. `checkout-charge.test.ts` pins net, VAT, charged, every non-fare line and the fare sum with and without parts: airport + route, none, fee only, fee + extra + percent coupon, fixed coupon larger than the distance part, old lock, parts ≥ base, negative / fractional / NaN parts.
- `lock-to-rpc-fare-lines.test.ts`: extras, VAT, `list_rappen`, coupon spill and the policy extras list identical with and without the split.
- `intent.test.ts`: Stripe amount and `total_rappen` equal the one-line run; price-route lines equal the saved lines; a body carrying `price_rows` changes nothing.
- Real local runs (below) read back `price_snapshots.total_rappen` = `booking_payments.charged_rappen` = Stripe stand-in `amount_total` in every run (en 23519, fr/de/ar the same; percent voucher 21167; fixed voucher 1899).

## Gates (merged tree, after `origin/main` merge)

| Gate | Result |
|---|---|
| typecheck | pass |
| lint | 0 errors, 6 warnings (all in files I did not touch) |
| lint:css, check:numbers, check:legal-claims, check:public-env, check:db-fences | pass |
| i18n:check | pass (2697 keys) |
| db:seed:check | no drift |
| `test:unit` once | apps/web 411 files / 4725 tests pass (31 skipped), emails 15 / 247, db 2 / 14 |
| `pnpm build` (`next build`) | pass; `opennextjs-cloudflare build` also built the Worker twice |
| pgTAP, whole suite on a freshly reset scratch stack | 101 files, 2730 tests, PASS (includes `fare_line_reads`, `snapshot_lines_reconcile`, `pay_link_lines`, `pay_link_erased_booking`, `manage_booking_money_driver`) |
| types | `supabase gen types --local --schema public --workdir <scratch>` (pinned CLI 2.115.0) equals `packages/db/database.types.ts`. `pnpm db:types:check` itself reads port 54322, so I ran its command against my own stack. |

## Browser proof (local Worker build, scratch stack, real Chromium)

Mapbox, Stripe, Turnstile, Resend are the repo's stand-ins (`tests/e2e-worker/fakes.mjs`); price book = the repo's e2e fixture figures in the scratch DB only (`evidence/seed-live.sql`). **The screenshots therefore show fixture figures such as CHF 190.57, not prices.** They are in `screens/build/` (131 files, 19 MB, **gitignored** by the repo's `build/` rule, so they stay in the worktree and are not in a commit). I looked at the checkout rail 1440 en, Section 3 390 ar, confirmation 390 ar, manage 1440 de, booking detail old 1440 en, dashboard 1440 ar, e-mail 390 ar.

Real path per language (en, de, fr, ar, 25 checks each, all PASS, logs `evidence/run-*.log`): home form (Zurich Airport + flight number → Zug station) → /checkout (Business) → PAY → saved lines read back → pay link page → settle with the real `checkout_payment_settle` (the Stripe stand-in never pays by itself) → confirmation → manage booking → booking detail after a real customer password sign-in. Pay link, confirmation, manage, detail at 1440 / 1024 / 768 / 390; /checkout rail (1440) and Section 3 (1024 / 768 / 390). Each asserts: airport fee label in that language, plane and pin icons (Next pages), `Kloten – Zug route`, and no sideways scroll at every width.

Saved lines of the real airport booking: `distance_fare 19057`, `airport_fee 1800`, `fixed_route 900 (Kloten > Zug)`, `vat 1762`, total 23519.

Also proven in the browser:
- Percent voucher (`FLTEN`, en 1440 and ar 390) and a fixed voucher larger than the distance part (`FLBIG`, en): saved `distance_fare 0 (list 19057)`, `airport_fee 857 (list 1800)`, `fixed_route 900`, coupon `amount null / discount 20000`, total 1899 = Stripe 1899. Rail, pay link, confirmation, manage all show list figures plus the voucher row, rows add up to the total. Before: the pay link / manage showed a reduced Fare and `Voucher −CHF 0`.
- Dashboard booking detail (real staff sign-in, aal1): Fare, Airport pickup fee, route (towns in LTR isolates) in en, de, ar.
- Dashboard Edit booking → class preview (`/change/preview`) for that booking: Economy 17355, Business 23519 (current, difference 0), Van luxury 28305. No "trip data" refusal.
- Confirmation e-mail rendered from the real saved lines (en, de, fr, ar; HTML screenshots and text in `screens/build/email-*`): Fare · Business, Airport pickup fee, route, VAT, Total paid; no icons.
- Old one-line booking (SQL fixture): confirmation and manage unchanged ("Fare · Business 90.00, VAT, total").

## Not proven

- **Booking detail of an old booking in My bookings shows no price card at all** on my fixture (the account list gave it no price). The code path for it is unchanged, but I did not compare against main, so I cannot say it showed a Fare line before. Plan §7.8 expected one.
- The DB-backed `trip-change.local.test.ts` with an airport booking was not written; the same case is a unit test in `booking-trip-change.test.ts` and was proven live through the dashboard preview.
- Dashboard only at 1440 (en, de, ar), not at the narrower widths. Arabic confirmation at 390: the contact button overlays the left edge of the price column (its own job's overlay, not this change).
- The real Resend send of the e-mail was not run; the e-mail was rendered from the real saved lines.
- Live data was not read (not allowed). Names: the airport's town on live is whatever Mapbox calls it at quote time; the stand-in said "Kloten".
- A pay-link click-through to a real Stripe page, a coupon + extras booking in the browser (the catalog was empty in the scratch stack; unit tests cover extras).

## Environment event (important, not caused by this job's code)

Docker Desktop was quit twice during the run and the second time its whole data was lost: afterwards `docker ps -a` and `docker volume ls` were empty, images included. Every other session's local stack on this Mac (vamos-lab-chk / vamos-lab-hdr, vamos-taxi-280, twenty-crm) is gone with it. I started Docker again and rebuilt only my own stack (`vamos-taxi-fl`). The proof above was re-run on the rebuilt stack.

## Rollback

Code: revert the merge or drop the branch; nothing else depends on it. Saved prices already written with three fare lines stay valid (readers of old code show them as three "Fare"/"Transfer" rows but never break; the reconcile trigger accepts them). Migration: `20261007230000` is read-only; to undo, re-create `checkout_pay_link_lines` from `20261005130000` (drop + create + grants) and `manage_money_for` from `20261007150000`. The new Worker must not run before the migration (it selects the new columns).

## Controller checks (plan §6)

1. Diff of `checkoutCharge` above the line split is empty. 2. Parts only from the verified lock or the ops board. 3. Bad part: one Fare line, no throw. 4. `savedChargeFromSnapshot` accepts only the two codes. 5. Coupon spill: tests above. 6. Migration: read-only, same grants, apply verbatim and read back. 7. Old bookings: see "Not proven" for My bookings.

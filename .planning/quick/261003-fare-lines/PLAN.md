# 261003 fare lines: build plan

Signed design: `.planning/decisions/2026-10-03-fare-lines-design.md`, `DESIGN.md` and `screens/` in
this folder. Plan written 2026-10-03 02:40 +04 on `feat/fare-lines` (cut from origin/main b3716917).
Builds **after** `feat/contact-overlay` has landed on main (see §4). Money path: a fresh reviewer
reads it before ship (§6).

Live, read-only check (02:35): all 44 saved prices have exactly one fare line (`distance_fare` 43,
`extra_fare` 1 on a customer-change record). No saved coupon line exists yet.

## 1. Data

**One builder.** Saved price lines come from one place on every write path:
`checkoutCharge` (`apps/web/lib/checkout/checkout-charge.ts`) → `snapshotLinesFromCharge`
(`lock-to-rpc.ts`). Callers:

| Write path | File | Where the two amounts come from |
|---|---|---|
| Booking creation (web /checkout, dashboard New trip, pay-link bookings) | `lib/checkout/intent.ts` → `snapshotFromLock` | verified lock `price_rows` for the chosen class |
| /checkout price shown (D-19, same function) | `lib/checkout/price-route.ts` | same verified lock `price_rows` |
| Dashboard class change, trip change | `lib/ops/booking-change-price.ts` `chargeFor` (used by `booking-change.ts`, `booking-trip-change.ts`) | the board entry's own kernel lines (`airport_fee`, `fixed_route`) |
| Extras | chosen only on /checkout; same `checkoutCharge` | — |
| Customer change request (SQL `extra_fare` / `distance_fare` record) | `20260910175309_booking_edit_requests.sql` | unchanged: stays one line |
| Ops test unpaid booking | `snapshotFareLines` in `test-unpaid/route.ts` | unchanged: no airport data |

**Change in `checkoutCharge`.** New optional input `fareParts: { airportFeeRappen, route: { amountRappen, origin, destination } | null }`.
Base = the figure the fare line uses today (`preCouponRappen` when a coupon applies, else
`classNetRappen`). Split only when every part is a positive whole number and the parts add up to
less than the base; otherwise one Fare line, as today (old locks, missing rows). Lines out:

| seq order | kind | code | i18n_key | params | amount |
|---|---|---|---|---|---|
| 1 | fare | `distance_fare` | `price.line.transfer` | `{ vehicleClass }` | base − fee − route |
| 2 | fare | `airport_fee` | `price.line.airport_fee` | `{}` | fee (only if > 0) |
| 3 | fare | `fixed_route` | `price.line.fixed_route` | `{ origin, destination }` (names only when both known) | route (only if > 0) |

Then extras, coupon, VAT as today. Kind `fare` keeps the two lines out of every "ticked extra"
reader (`snapshotFromLock` extras, `isSurchargeLine`, e-mail Extras, ops `savedChargeFromSnapshot`).
Parts are summed per code over legs (V1 is one way: one leg).

**Why the money cannot move.** The split happens after the arithmetic: `payableRappen`, the coupon,
VAT and `chargedRappen` are computed from the same base and extras exactly as now; only the one
`fare` line is cut into up to three pieces that add up to it. The existing sum guard
(`lines sum === chargedRappen`, throws) still runs. In `snapshotLinesFromCharge` the coupon
discount is taken from fare-kind lines in order and then from extras; since all fare pieces come
before the extras, the extras get exactly the same discount as today, so every extra line, the
VAT line, `total_rappen`, the Stripe `amount_total` and the reconcile trigger sum are byte-identical.
The lock comment in `lib/quote/lock.ts` changes from "never read by intent" to "read for the
breakdown only, never for an amount". `price_rows` is covered by the lock signature.

**No migration for the save.** The reconcile trigger requires only `seq/kind/code/i18n_key`, whole
non-negative amounts and the sum; it does not restrict kind or code.

**Old bookings.** Never rewritten. Every reader keeps today's path for a price with one
`distance_fare` (or `extra_fare`) line, and any fare line whose code is not `airport_fee` or
`fixed_route` keeps the Fare label. Tests pin a single-line booking rendering exactly as today.

## 2. Readers that change

| Surface | Files | Change |
|---|---|---|
| /checkout rail and phone Section 3 | `app/[locale]/checkout/sections/SummaryRail.tsx` | `fare` by code: plane-landing + `price.line.airport_fee`; map-pin + `checkout.routePair` / `routePairPlain`; Fare as now |
| Confirmation page | `lib/checkout/confirmation-receipt.ts` (`receiptRows`: own rows for the two codes, list figures), `app/[locale]/confirmation/[ref]/ConfirmationClient.tsx` (`moneyLines`, icons) | |
| Pay-link page | `lib/checkout/pay-link-lines.ts` (`hasPayLinkExtras` → also true for the two codes), `app/[locale]/checkout/pay/[token]/PayClient.tsx` | |
| Manage booking and My bookings | `lib/checkout/manage-money.ts`, `app/pages/manage-booking.dc.html` (label by code), `app/pages/booking-detail.dc.html` (today one "Fare = total" line; render `ticket.money.lines` like manage-booking) | |
| Dashboard booking detail | `lib/ops/bookings-map.ts` (`mapFareLines`: label by code, keep route names), `app/ops/OpsDetail.dc.html` (`fareBreakdown`: `lineAirportFee` exists; add `lineRoute` / `lineRoutePlain` in its four string tables) | |
| Confirmation e-mail | `lib/checkout/notify.ts` `moneyFromRow`, `packages/emails/src/lib/types.ts` (kinds `airport_fee`, `route`), `packages/emails/src/ConfirmationEmail.tsx` (HTML and text part; no icons, as signed) | |
| Helper | `lib/checkout/price-rows.ts`: keep `breakdownRows` for labels and icons, delete `peekLockPriceRows` (unverified read, now unused) | |

**Ops refusal fix** (`lib/ops/booking-change-price.ts`). `savedChargeFromSnapshot` refuses
`fares !== 1`. New rule: exactly one `distance_fare`; `airport_fee` and `fixed_route` fare lines
are accepted and ignored for the reproduction (they are inside the class net the kernel rebuilds);
any other fare code still refuses (`extra_fare` records already refuse on missing VAT). `chargeFor`
passes the board entry's `airport_fee` / `fixed_route` amounts and names as `fareParts`, so the new
price record of a class or trip change is split too. `reproduceCharge` compares `chargedRappen`
only, so it is unaffected.

**E-mail voucher fix** (`notify.ts`). Fare and extras use `params.list_rappen ?? amount_rappen`;
the coupon uses `params.discount_rappen` when `amount_rappen` is null; the rows then add up to the
charged total. `notify.test.ts` gets the real saved shape (`amount_rappen: null`).

**Pay-link page, Manage booking and My bookings read lines through SQL** (`checkout_pay_link_lines`,
latest in `20261005130000`; `manage_money_for`, `20260930190000`). Both drop `params` except names
and VAT rate. So without a change they cannot show the town names on the route line (they would
read "Route price"), and a coupon booking would show a reduced Fare and "Voucher −CHF 0". Fix =
one read-only migration (questions 1 and 2), number from the controller (20261007220000 is taken).
`checkout_pay_link_lines` returns a table, so it needs `drop function` + `create` + the same grants;
`manage_money_for` returns jsonb and only gains keys.

## 3. Strings

| Label | en | de | fr | ar | Lives in |
|---|---|---|---|---|---|
| Airport pickup fee | Airport pickup fee | Flughafen-Abholgebühr | Frais de prise en charge à l’aéroport | رسوم الاستقبال من المطار | Next `price.line.airport_fee` (exists); mail `money.airportFee` (new); dict `'Airport pickup fee'` (change de/ar); OpsDetail `lineAirportFee` (change de) |
| Route | {origin} – {destination} route | Strecke {origin} – {destination} | Trajet {origin} – {destination} | مسار {origin} – {destination} | Next `checkout.routePair` (exists); mail `money.routePair` (new); dict `patterns` regex (new); OpsDetail `lineRoute` (new) |
| Route, names unknown | Route price | Streckenpreis | Prix du trajet | سعر المسار | Next `checkout.routePairPlain` (exists); mail `money.routePairPlain` (new); dict entry (new); OpsDetail `lineRoutePlain` (new) |
| Fare, Voucher | as today | | | | unchanged |

Older wording replaced: `common.airport-pickup-fee` de "Flughafengebühr" → "Flughafen-Abholgebühr",
ar "رسم الاستقبال في المطار" → "رسوم الاستقبال من المطار" in `apps/web/i18n/messages/{de,ar}.json`;
the same in `app/vamos-i18n-dict.js`, `app/ops/OpsDetail.dc.html` (de), and the never-served
`app/pages/checkout.dc.html` / `confirmation.dc.html` (de `lineAirportFee`, so no old wording stays
in the repo). Then `pnpm db:seed:gen` (seed.sql row `common.airport-pickup-fee`) and
`db:seed:check`; no new Next key, so seed counts do not move. Live serves the JSON
(`CONTENT_SOURCE` unset), so no live data write. Place names stay as quoted (`vt-dir-keep`,
`data-vt-no-i18n` on the names). `VamosLocale.coverage()` empty on manage-booking and booking-detail.

## 4. Tasks, in order

0. After `feat/contact-overlay` lands: `git merge origin/main` into this branch.
1. Charge: `checkout-charge.ts` (`fareParts`), `price-route.ts`, `intent.ts`, `lock-to-rpc.ts`
   (types only), `lock.ts` (comment). Tests first (§5 a).
2. Ops: `booking-change-price.ts` (refusal rule, `chargeFor` parts). Tests (§5 b).
3. Migration (if questions 1–2 are yes): `packages/db/supabase/migrations/<number>_fare_line_reads.sql`,
   pgTAP `pay_link_lines.test.sql`, `pay_link_erased_booking.test.sql`,
   `manage_booking_money_driver.test.sql`; `pnpm exec supabase` types, `db:types:check`.
4. Next readers: `SummaryRail.tsx`, `confirmation-receipt.ts`, `ConfirmationClient.tsx`,
   `pay-link-lines.ts`, `PayClient.tsx`, `manage-money.ts`, `price-rows.ts`.
5. DC readers: `manage-booking.dc.html`, `booking-detail.dc.html`, `app/vamos-i18n-dict.js`,
   `OpsDetail.dc.html`, `bookings-map.ts`, plus the two wording-only DC files.
6. E-mail: `notify.ts`, `packages/emails/src/{lib/types.ts,ConfirmationEmail.tsx,messages/*.json}`.
7. Strings: `apps/web/i18n/messages/{de,ar}.json`, seed regen.
8. Chromium proof, hand-over file, stop.

**Shared files with feat/contact-overlay:** `app/vamos-i18n-dict.js`,
`apps/web/i18n/messages/{en,de,fr,ar}.json`, `packages/db/supabase/seed.sql` (+ seed tests),
`app/pages/manage-booking.dc.html` and `app/pages/booking-detail.dc.html` (its shell mount on every
page). Not shared: `SummaryRail.tsx` vs its `PayBar.tsx`. Different lines in each shared file;
main wins a conflict.

## 5. Tests

a. `checkout-charge.test.ts`: fixed internal rappen fixtures (never shown as a price) for case A
   (fee + route), B (none), C (fee, extra, percent coupon), fixed coupon larger than the distance
   part, old lock without `price_rows`, parts ≥ base → one line. Each pins `chargedRappen`,
   `vatRappen`, `netRappen` equal to the same input without parts, and line sum = charged.
   `lock-to-rpc.test.ts`: extras and VAT lines identical with and without split; coupon spill keeps
   `list_rappen`. `price-route.test.ts` and `intent.test.ts`: screen lines = saved lines; Stripe
   amount unchanged.
b. `booking-change-price.test.ts`: a saved price with `distance_fare + airport_fee + fixed_route`
   reproduces and re-prices (was "trip-data"); an unknown fare code still refuses; the new record is
   split. `booking-trip-change.test.ts` and `trip-change.local.test.ts` with an airport booking.
c. Readers: `confirmation-receipt`, `pay-link-lines`, `manage-money`, `bookings-map-extras`,
   `notify` (real coupon shape, voucher row present, rows sum to total), each with a one-line old
   booking pinned unchanged. `ConfirmationEmail.test.tsx` render in en/de/ar.
d. pgTAP: the three files in task 3, plus `snapshot_lines_reconcile.test.sql` accepting the
   three-fare-line shape.
e. Chromium on the local Worker (unusual free port, never kill another port; Mapbox, Stripe,
   Turnstile stand-ins as in quick 261001): home → Zurich Airport pickup → /checkout shows Fare,
   Airport pickup fee (plane), route line (pin), all `CHF 000` → PAY → stand-in success →
   confirmation page shows the same lines; read the local `price_snapshots.lines` and the rendered
   e-mail. Repeat in Arabic at 390 and German at 1440. Screenshots in `screens/build/`.

## 6. Fresh reviewer must check

1. `chargedRappen`, VAT, coupon arithmetic and the Stripe amount are untouched by `fareParts`
   (diff of `checkoutCharge` arithmetic is empty above the line split).
2. Parts are read only from the **verified** lock (or the ops board), never from the request body;
   the browser cannot send an amount or a part.
3. Fallback to one Fare line on any bad part; no path throws on an old lock.
4. `savedChargeFromSnapshot` accepts only the two new codes; no fare line is counted as an extra.
5. Coupon spill across fare pieces: extras' saved amounts identical to before.
6. Migration (if any): read-only, same grants, `security definer`, `search_path = ''`, no data
   written; applied verbatim on live and read back.
7. Old bookings render exactly as before on all six surfaces.

## 7. Owner UAT on vamostaxi.site (after deploy)

1. Home: type `Zurich Airport` in From, a Geneva address in To, a time, 1 traveller; click
   SEE PRICES, pick Business. Expected: /checkout lists Fare, Airport pickup fee (plane),
   "Zürich – Genève route" (pin, only if a route extra matches), VAT, Total.
2. Fill who is travelling, click PAY, pay with `4242 4242 4242 4242`, any future date, any CVC.
   Expected: confirmation page shows the same lines and the same total.
3. Controller reads `booking_payments` for that booking. Expected: status `succeeded`, amount equal
   to the shown total; `price_snapshots.lines` holds `distance_fare`, `airport_fee`, `fixed_route`.
4. Open the confirmation e-mail. Expected: Fare · Business, Airport pickup fee, route line, VAT,
   Total paid; no icons.
5. Switch to Deutsch on the confirmation page. Expected: "Flughafen-Abholgebühr".
6. Open Manage booking from the e-mail, then My bookings → that booking. Expected: the same lines.
7. Dashboard → that booking → Change class; read the offer, then close without confirming.
   Expected: a price per class is offered (no "trip data" refusal).
8. Open an older booking in My bookings. Expected: one Fare line, as before.

# 261003 fare lines: the airport pickup fee and the route extra as their own lines

Design job for owner answer U04-3, "Own lines, show me first"
(`.planning/decisions/2026-10-03-audit-owner-answers.md`). Pictures only. No code, no
migration, no deploy. Written 2026-10-03 02:13 +04 on branch `design/fare-lines`.

## 1. Problem

The fare rule is: distance start + per-km × full distance + one matching
city-to-city or canton-to-canton extra + extras − coupon. An airport pickup also adds
the airport pickup fee. If there is no match, nothing is added.

The pricing engine already builds these as three separate lines
(`apps/web/lib/pricing/lines.ts`: `distance_fare`, `airport_fee`, `fixed_route`). The
customer still sees one "Fare" line, because:

- `/checkout` (Next, not a DC mock; middleware line 32) prices through
  `checkoutCharge` (`apps/web/lib/checkout/checkout-charge.ts`). That function makes
  **one** fare line from the whole class net (`classNetRappen`). The class net already
  includes the airport fee and the route extra.
- The booking's saved price (`price_snapshots.lines`, written by
  `snapshotLinesFromCharge` in `lock-to-rpc.ts`) therefore has one `distance_fare`
  line. The confirmation page (`confirmation-receipt.ts` → `ConfirmationClient.tsx`)
  and the confirmation e-mail (`notify.ts` `moneyFromRow` → `ConfirmationEmail.tsx`)
  read that line, so they show one "Fare · Business" line too.

The total is correct. Only the breakdown is hidden.

The 26.1 design you signed (`26.1-UI-SPEC.md` §8, plan 26.1-11) already had these two
rows: "Airport pickup fee" with a plane icon and "{origin} – {destination} route" with a
pin icon. Plan 26.1-11 built them (`apps/web/lib/checkout/price-rows.ts`). The one-page
checkout in 26.3 replaced that screen, and nothing calls the builder any more.

## 2. Pictures

All amounts read `CHF 000` (Law 04). Each sheet shows before (live today) and after
for three cases:

- **A:** airport pickup with a matching route extra (Zurich Airport to Geneva).
- **B:** city pickup with no match. No extra line at all, and never a "CHF 0" line.
  Before and after are the same.
- **C:** airport pickup, no route match, one extra (Child seat), coupon WELCOME.

| Sheet | Surface | Language, width |
|---|---|---|
| `screens/1-checkout-1440-de.png` | /checkout price summary (desktop rail) | German, 1440 |
| `screens/1-checkout-390-en.png` | /checkout price summary (Section 3 on phone) | English, 390 |
| `screens/1-checkout-390-ar.png` | same | Arabic, 390 |
| `screens/2-confirmation-1440-de.png` | confirmation page price block | German, 1440 |
| `screens/2-confirmation-390-en.png` | same | English, 390 |
| `screens/2-confirmation-390-ar.png` | same | Arabic, 390 |
| `screens/3-email-1440-de.png` | confirmation e-mail price block | German, 560 mail on desktop |
| `screens/3-email-390-en.png` | same | English, 390 |
| `screens/3-email-390-ar.png` | same | Arabic, 390 |
| `screens/4-option-icons-or-plain-390.png` | question 1: icons or plain text | English and Arabic, 390 |

How the sheets were made: `render/render.mjs` uses the real token chain
(`apps/web/public/brand/tokens/*`, `laws.css` last), `PriceSummary.css` and `Card.css`,
the vendored Lucide icons, and the labels copied word for word from the message files.
It renders in the cached Playwright Chromium. Each block is drawn at the width it has on
the page: the 360 px rail card at 1440, the 350 px Section 3 card at 390, the
confirmation card in its 720 px column, and the e-mail in its 560 px sheet. These are
static pictures of the components, not screenshots of the running app.

Order of lines after the change: Fare → Airport pickup fee → route extra → ticked
extras → coupon → VAT → Total.

## 3. Labels (all four languages already exist except the e-mail)

| Line | Where the string lives | en | de | fr | ar |
|---|---|---|---|---|---|
| Fare (checkout) | Next `checkout.fareExVat` | Fare | Fahrtpreis | Course | الأجرة |
| Fare (receipt, mail) | Next `checkout.receiptFare`, mail `money.fare` | Fare · {class} | Fahrpreis · {class} | Course · {class} | الأجرة · {class} |
| Airport pickup fee | Next `price.line.airport_fee` | Airport pickup fee | Flughafen-Abholgebühr | Frais de prise en charge à l’aéroport | رسوم الاستقبال من المطار |
| Route extra | Next `checkout.routePair` | {origin} – {destination} route | Strecke {origin} – {destination} | Trajet {origin} – {destination} | مسار {origin} – {destination} |
| Route extra, names unknown | Next `checkout.routePairPlain` | Route price | Streckenpreis | Prix du trajet | سعر المسار |
| Voucher | Next `checkout.receiptVoucher`, mail `money.voucher` | Voucher {code} | Gutschein {code} | Bon {code} | قسيمة {code} |

- **Next message files** (`apps/web/i18n/messages/{en,de,fr,ar}.json`): every string
  exists. No new key is needed for /checkout or the confirmation page.
- **E-mail** (`packages/emails/src/messages/*.json`): no airport-fee or route string
  exists yet. The build adds `money.airportFee`, `money.routePair` and
  `money.routePairPlain` in all four languages, using the Next wording above word for
  word.
- **DC dictionary** (`app/vamos-i18n-dict.js`): "Airport pickup fee" exists, but its
  German and Arabic differ from the Next set (de "Flughafengebühr", ar "رسم الاستقبال
  في المطار"). "Fare" and "Voucher" exist. The route label needs a `patterns` entry
  for "{origin} – {destination} route". See question 5.
- The place names in the route label come from the map lookup when the price was
  quoted (`origin_city_name` / `dest_city_name` on the lock). They keep the language of
  that quote. I have not checked which town name an airport pickup resolves to (for
  example, whether Zurich Airport reads "Kloten").
- German has "Fahrtpreis" on /checkout but "Fahrpreis" on the receipt and in the mail.
  This is existing copy and outside this job. I note it only.

## 4. Does the data already exist?

| Layer | Fee and route extra kept separately? |
|---|---|
| Pricing engine (`lib/pricing/lines.ts`) | **Yes.** `airport_fee` (kind `surcharge`) and `fixed_route` (kind `extra`) are their own lines. |
| Signed quote lock (`lib/quote/lock.ts`) | **Yes.** `price_rows[]` holds, per class, the `airport_fee` and `fixed_route` amounts plus the route's two place names. The quote and the reprice both write it (`pipeline.ts` lines 758 and 869). It is covered by the lock signature. Locks minted before 26.1-11 do not have it. |
| /checkout price (`checkout-charge.ts`, `price-route.ts`) | **No.** One fare line for the whole class net. |
| Saved booking price (`price_snapshots.lines`) | **No.** One `distance_fare` line. Bookings already paid cannot be split afterwards. |
| Confirmation page, e-mail, pay link, manage booking, ops | **No.** They read the saved lines. |

**No migration is needed.** `price_snapshots.lines` is free-form JSON. The database
trigger (`20260825000003_snapshot_alternatives.sql`) only requires `seq`, `kind`,
`code` and `i18n_key` on each line, whole-number amounts, and a sum equal to the total.

**What the build needs:**

1. `checkoutCharge` takes the chosen class's `price_rows` from the **verified** lock
   (in `intent.ts` and `price-route.ts`; not the unverified `peekLockPriceRows`). It
   emits:
   - Fare = class net − airport fee − route extra. Any rounding stays in Fare, so the
     lines always add up to what is charged.
   - one line for the airport fee and one for the route extra, each only when its
     amount is above 0.
   - The charge itself does not change: same total, same coupon arithmetic, same VAT.

   The header of `lock.ts` says `price_rows` is "display only, never read by intent".
   That contract changes from read-never to read for the breakdown only, never for the
   amount charged.
2. The two new lines are saved with `kind: "fare"` and their own codes (`airport_fee`,
   `fixed_route`) and keys (`price.line.airport_fee`, `price.line.fixed_route`).
   - Kind `fare` keeps them out of everything that treats `surcharge` lines as ticked
     extras: the booking's `extras` list in `snapshotFromLock`, `isSurchargeLine`, the
     e-mail "Extras" row, and ops change pricing.
   - The coupon takes its discount from the fare lines first, as today
     (`snapshotLinesFromCharge`). Each line keeps `params.list_rappen`, so the receipt
     shows list figures.
3. Every reader of saved lines must split fare lines by `code`. Today they either merge
   all fare lines or print each one as "Fare":
   - `receiptRows` merges them.
   - `notify.ts` adds them up.
   - `PayClient` and the manage-booking DC page label each one "Fare" or the class.
   - `bookings-map.ts` labels each one "Transfer, {class}".
   - **`ops/booking-change-price.ts` refuses a snapshot that does not have exactly one
     fare line** (`fares !== 1`). Ops class or trip change pricing would stop working
     for every new airport booking. It must count only `distance_fare`. This is a money
     path, so a fresh reviewer must read it before it ships (rule 1).
4. Bookings paid before the build keep one Fare line. There is no backfill (question
   3).

**Separate finding (from code; not checked on a real mail or a live row):** the
confirmation e-mail never shows the voucher line. `moneyFromRow` reads the coupon from
`amount_rappen`. A real saved coupon line stores `amount_rappen: null` and keeps the
discount in `params.discount_rappen` (`snapshotLinesFromCharge`). The e-mail therefore
prints Fare already reduced, with no voucher row. The confirmation page uses
`list_rappen` and `discount_rappen` and is right. `notify.test.ts` feeds a coupon line
with `amount_rappen: -1000`, a shape the real checkout never saves, so the test does not
catch this. The "after" e-mail pictures show the fix (question 4).

## 5. Files the build would change

Pricing and saved price (money path, fresh reviewer required):
- `apps/web/lib/checkout/checkout-charge.ts`: optional fare parts in, split lines out.
- `apps/web/lib/checkout/price-route.ts`: pass the verified lock's `price_rows` for the class.
- `apps/web/lib/checkout/intent.ts`: same, so the screen and the charge stay one function (D-19).
- `apps/web/lib/checkout/lock-to-rpc.ts`: saved line shape for the two codes.
- `apps/web/lib/quote/lock.ts`: comment only (read for the breakdown, never for the amount).
- `apps/web/lib/ops/booking-change-price.ts`: count only `distance_fare`; carry the parts through a change.
- `apps/web/lib/checkout/price-rows.ts`: reuse `breakdownRows` for labels and icons, or delete it if unused.

Screens:
- `apps/web/app/[locale]/checkout/sections/SummaryRail.tsx`: render the two codes (icon and label).
- `apps/web/lib/checkout/confirmation-receipt.ts` and `apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx`.
- `apps/web/app/[locale]/checkout/pay/[token]/PayClient.tsx` and `apps/web/lib/checkout/pay-link-lines.ts` (question 2).
- `apps/web/lib/checkout/manage-money.ts`, `app/pages/manage-booking.dc.html`, `app/pages/booking-detail.dc.html`, `app/vamos-i18n-dict.js` (question 2).
- `apps/web/lib/ops/bookings-map.ts`: ops booking detail labels.

E-mail:
- `apps/web/lib/checkout/notify.ts`: split by code; voucher from `discount_rappen`, list figures from `list_rappen`.
- `packages/emails/src/ConfirmationEmail.tsx` and `packages/emails/src/lib/types.ts`: two new line kinds.
- `packages/emails/src/messages/{en,de,fr,ar}.json`: `money.airportFee`, `money.routePair`, `money.routePairPlain`.

Tests: `checkout-charge`, `lock-to-rpc`, `confirmation-receipt`, `notify` (with the real
saved coupon shape), `booking-change-price`, and the e-mail snapshot.

After deploy: one 4242 test payment for an airport pickup with a route match. Then read
that booking's `price_snapshots.lines` and its e-mail.

## 6. Questions for the owner (one decision each)

1. **Small icons on the two new lines?** See `screens/4-option-icons-or-plain-390.png`.
   - **With icons (recommended):** a plane on "Airport pickup fee" and a pin on
     "Zurich – Geneva route". This is the 26.1 design you signed.
   - **Plain text:** like Fare and the extras.
2. **Show the same separate lines on the pay-link page, Manage booking and My bookings?**
   - **Yes, everywhere (recommended):** for example, the pay link for VT-4821 lists
     "Airport pickup fee CHF 000" under Fare, the same as the receipt.
   - **No:** those pages fold the lines back into one Fare line.
3. **Bookings paid before the change keep one Fare line?**
   - **Yes (recommended):** their saved price never had the split, and we do not
     rewrite saved prices. Only new bookings show the separate lines.
   - **No.**
4. **Fix the missing voucher line in the confirmation e-mail in the same build?**
   - **Yes (recommended):** a booking with coupon WELCOME then shows "Voucher WELCOME
     −CHF 000" in the mail, as it already does on the confirmation page.
   - **No, leave it for later.**
5. **One wording for the airport fee in every place.** German and Arabic each have two
   versions today.
   - **"Flughafen-Abholgebühr" / "رسوم الاستقبال من المطار" (recommended):** the price
     line wording used in the pictures.
   - **"Flughafengebühr" / "رسم الاستقبال في المطار":** the shorter wording the DC pages use.

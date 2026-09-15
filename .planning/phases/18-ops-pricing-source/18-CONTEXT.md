# Phase 18: OPS Pricing source of truth - Context

**Gathered:** 2026-09-13
**Restarted:** 2026-09-14
**Status:** Complete 2026-09-15 (restart D-01…D-35; 18-UAT + 18-VERIFICATION passed)
**Does not steal Phase 11.** Do not bind `vamostaxi.eu`. Stripe stays test until the owner says live keys. Agent does not click Publish. Agent does not `supabase db push`.

This file **supersedes** the 2026-09-13 D-01…D-40 list wherever they conflict. 2026-09-13 plans live in `archive-2026-09-13/` as history — do not execute them.

## Phase Boundary

`https://dashboard.vamostaxi.site/pricing` is the **only** fare book. Every add, edit, delete, and Save on that page is a **draft** until **Publish**. After a successful Publish, the next home quote, checkout recap, confirmation, ops amounts, Stripe charge, and new booking mail all read that published book immediately, all-or-nothing.

Public Mapbox works like Google Maps: type, see places, not limited to Switzerland. Charge is always CHF. Return stays out of V1. No live Stripe keys. No `.eu`.

**2026-09-14 restart:** Owner UAT proved the public site still invented a four-class ladder after Publish. Phase 18 is not complete. Replan from wave 1. Keep shipping kernel (publish tx, D-11-style money, `/pricing` editor). Do not keep a hardcoded Economy / Business / First / Van public board.

## Implementation Decisions

### Draft / Publish

- **D-01:** Anything on `/pricing` (every tab, VAT rail, overlays) stays **draft** until Publish. No exceptions.
- **D-02:** Typing is not a draft. Leave without Save → those edits are gone. **Save** creates the draft. **Publish** puts that draft on the public site.
- **D-03:** After Publish, `/pricing` shows the **live book** (what customers see). The next Save starts a new draft.
- **D-04:** One draft for the **whole fare book**. One Publish flips every tab saved since the last Publish.
- **D-05:** A saved draft has a **clear Draft mark** — these numbers are not public until Publish.
- **D-06:** Discard: **confirm**, then draft gone, page shows live book. Public never moved.
- **D-07:** Publish opens a **confirm dialog with the change list** vs the last published book.
- **D-08:** Gaps and conflicts: dialog names the **exact** problem and a **button jumps to that section/overlay**. Failed Publish **keeps the draft**. Public unchanged. Fix and Publish again, or Discard and start from the live book.
- **D-09:** Publish is **all-or-nothing**. If quote, checkout, Stripe, ops, or new mail would disagree, nothing goes live.
- **D-10:** Publish stays blocked until every required class field is filled (see D-30). Dialog lists exact gaps.
- **D-11:** **No History tab.** No history list, no Re-Publish of an old book. Tabs: **Fixed routes · Distance rules · Surcharges & extras · Coupons**.
- **D-12:** **No Preview** on `/pricing`. No test unpaid from this page. VAT % stays on the sticky rail and still waits for Publish (D-01).
- **D-13:** Quote lock is **fixed 24 hours**, not a field. Unpaid keep the locked old amount until then, then the unpaid trip auto-cancels. They must quote again. Select on home cards with no Select yet + Publish → Select refused; quote again. Paid trips **keep the snapshot**; a later Publish does not change them.
- **D-14:** `/pricing` is **admin only**. One staff account type. Do not invent a second ops role on this page or in this phase’s copy.

### Money recipe (public after Publish)

Owner examples (illustration, not live fares):

- Start **100** + **14.6 km × 12** = 100 + 175.2 = **CHF 275.20**
- **12.3 km × 10** = **CHF 123** km money

- **D-15:** Distance class money is **start** (once per trip, not included km) **+ (all km × per-km) + bands on top**. A 1 km trip uses the same recipe. No minimum fare. No first-X-km floor.
- **D-16:** Per-km and start are typed on `/pricing`. Kilometres stay exact (14.6 stays 14.6). Cents are allowed (3.20, 275.20). Do **not** invent a separate “round to 0.01” product rule beyond keeping the real product of km × rate + start + bands.
- **D-17:** **No region %.** Delete it from the Distance tab, from calculation, and from recap.
- **D-18:** **Bands** are an optional table per class. Amount is **CHF per km in that slice, on top of class per-km**. No band rows → start + km only. From **inclusive**, To **exclusive**. Open last band (no To) allowed. **Overlap blocks Publish** until fixed.
- **D-19:** Price stack for a matching trip: always **able** to compute km. If a **fixed route matches** what they picked on the public booking flow, **that CHF dominates**. Else km + bands.
- **D-20:** Fixed routes live on the **Fixed routes** tab. Two kinds of row: (1) **Mapbox place → place** (exact From/To; airport terminal and saved airport pin count as the same airport; A→B and B→A are **separate** rows; Save requires both Mapbox places). (2) **Canton → canton**. Exact place match wins over canton→canton. If you add no matching fixed row, use Distance rules. Not adding canton rows does **not** block quotes.
- **D-21:** Extra stop: they add **one** Mapbox place (max extra stops **hardcoded 1**). Fare **re-runs** start + full new path km × per-km + bands. Not a fixed CHF per stop. Extra stop on a fixed-route trip **switches to the distance recipe**.
- **D-22:** Checkout extras (child seat, pet, ski, …): **amount × quantity**, after ride money, **before VAT**. Delete the extra and Publish → **gone** from checkout (not a CHF 0 chip).
- **D-23:** Meet & greet and free airport wait are **always on**; customer cannot turn them off. Meet & greet is **CHF 0 included** (recap may say included). Free wait hours is a field on `/pricing` (set to **1h** now). Extra wait **after** that is **per hour**, amount on `/pricing`. Extra wait is **not** in the Stripe pay-now amount. Ops marks arrival; then extra hours bill. Do not silent-debit the card from this phase.
- **D-24:** VAT % (rail) is percent of **(ride + extras − coupon)**. Coupon **before VAT**. One coupon per booking. Payable floors at **CHF 0.00**. Public VAT/coupon after Publish only. Coupon codes **case-insensitive**, trim spaces. Percent off or fixed CHF off, dates/cap, all classes.
- **D-25:** **No night extra. No weekend extra. No holiday extra.**
- **D-26:** Mapbox on the public flow shows **everything they type**, like Google Maps. **No canton tick-list fence.** No quote only when Mapbox cannot produce a real From and To. Canton is used for **fixed-route matching** (D-20), not to hide the map.
- **D-27:** After Publish this same math is used by: next home quote, checkout recap, confirmation, ops amounts, Stripe, new booking mail. Header EUR/USD is **display only**. Charge and receipts **CHF**.
- **D-28:** Checkout recap top to bottom: **start, km, bands, automatic wait if it applies, customer extras, VAT, total**. All CHF. No region. No night/weekend/holiday lines.

### Classes (public follows the live book)

- **D-29:** Admin **adds, edits, deletes** any class. No hardcoded four-class ladder on home, checkout, or quote. A new class (any name) appears after Publish with the name they typed.
- **D-30:** Required to Publish a class: **photo, name, start, per-km, max passengers, max bags**. Photo: upload / replace / delete on any class. Stored on **R2**, not local. No photo → cannot Publish. Public card shows name, photo, seats, bags, price from this book.
- **D-31:** Delete a class + Publish → **gone** from home and checkout. Not a grey card, not `CHF 000`.
- **D-32:** **Hide from public** still exists: listed, Select off, `CHF 000`. Board can still assign it.
- **D-33:** Quote pax over max passengers → class **not offered**.

### Surcharges & extras tab (rebuild from scratch)

- **D-34:** **One list.** Each row is a **type** + only that type’s configuration (+ amount if the type has money). Add/Edit dialog: pick type, fields for that type, a short “what this does”. Nothing extra in the dialog. Rules on this table are the source.
- **D-35:** Checkout extras are a **type in that same dialog** (name, CHF, icon). Ski is a checkout extra like pet. Extra wait / free-wait hours are configured here as that type’s fields (D-23). Quote lock is **not** a row (D-13). Night/weekend/holiday are **not** types (D-25).

### Claude's Discretion

- How Mapbox admin-area canton is read for canton→canton match when no exact place route exists.
- Band table UI on Distance rules (From / To / CHF per km).
- Draft mark visual: charcoal/yellow tokens only, no glow, no pale-yellow tint.
- Jump-to-gap button: switch tab + open the overlay for that row.
- Four-language copy same sitting; Arabic RTL.
- Dual DC: edit `app/` then `node scripts/sync-dc-mock-to-public.mjs`.
- First new wave: public home / checkout / quote are a **pure read of the live book**. Live UAT (owner Publishes): delete class → no card; change per-km → next quote matches the recipe; new class appears. Agent does not click Publish.
- `quote_rate_book` must not invent classes. SQL vs Worker filter is a plan choice; owner apply is a numbered gate if SQL changes.
- Extra-wait SCA / off-session Stripe: do not ship a silent debit.

## Canonical References

Downstream agents MUST read these before planning or implementing.

### This discussion
- `.planning/phases/18-ops-pricing-source/18-CONTEXT.md` — this file (wins on conflict)
- `.planning/phases/18-ops-pricing-source/18-DISCUSSION-LOG.md` — audit only
- `.planning/phases/18-ops-pricing-source/18-RESEARCH.md` — 2026-09-14 restart
- `.planning/phases/18-ops-pricing-source/18-PATTERNS.md` — 2026-09-14 restart analog map (dead: History / Preview / region / fork-after-Publish)
- `.planning/phases/18-ops-pricing-source/18-UI-SPEC.md` — 2026-09-14 restart, approved (four tabs, VAT-only rail, no History/Preview). CONTEXT still wins if a later discuss changes a D-number.

### Phase 11 (do not reopen; inherit)
- `.planning/phases/11-launch-cutover/11-CONTEXT.md` — this page is the only fare control; Publish = live book + `public_chf`; Stripe test; no `.eu`
- `docs/runbooks/quote-publish.md` — Hyperdrive nocache, snapshot at pay, paid trips never reprice

### Pricing engine / ops page
- `app/ops/OpsPricing.dc.html` — rebuild tabs/surcharges/draft UX per this CONTEXT
- `apps/web/lib/pricing/priceQuote.ts` — recipe must match D-15…D-28
- `apps/web/lib/pricing/eligibility.ts` — delete ≠ hide (D-31 / D-32)
- `apps/web/lib/checkout/vat.ts` — VAT from published `settings.vat_rate_bps`
- `apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts` — INSERT clone of `settings_versions`; never UPDATE append-only
- `packages/db/supabase/migrations/20260913180000_ops_pricing_source.sql` — already applied; do not re-apply; do not `db push`

### Public four-class ladder (must die)
- `app/home/home.dc.html` — `VEHICLE_CLASSES`
- `apps/web/components/home/BookingBoard.tsx`
- `apps/web/app/[locale]/checkout/CheckoutClassCards.tsx`
- `apps/web/app/[locale]/checkout/CheckoutClient.tsx`
- `apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts` — `KNOWN_CLASS_SLUGS`
- `app/vamos-ops-data.js`
- `apps/web/lib/quote/intent.ts`

### Design / i18n
- `CLAUDE.md` — `--vt-*` only, Lucide via `Icon`, amounts `CHF 000` / `CHF 00.00`, `--vt-shadow-accent:none`, `.vt-input--focus{box-shadow:none}`
- `app/vamos-i18n-dict.js` — en/de/fr/ar same sitting

### Must-not
- No `sk_live_`
- No `vamostaxi.eu`
- No restore onto `yaumjzvylngfjhtuffqs`
- No inventing CHF, legal copy, or mail wording
- No push `main`; Worker `vamos` staging only until owner says
- No History, no Preview on `/pricing`, no region %

## Existing Code Insights

### Reusable Assets
- Overlay Save → draft rate-book APIs; Publish → `POST /api/staff/rate-versions/:id/publish`
- `quote_rate_book` RPC + `asQuote` — keep nocache after Publish
- Mapbox suggest/retrieve on public quote — keep Google-Maps-like, do not shrink to CH-only
- Booking snapshot at pay
- R2 already used for chauffeur photos — class photos follow that pattern

### Established Patterns
- Dual DC: `app/ops/` is source; Worker serves `apps/web/public/app/ops/`
- Four locales same sitting

### Integration Points
- Home class cards + Select
- Checkout extras + extra-stop Mapbox + recap
- Stripe Checkout amount = published book + VAT at **lock** time
- Ops board amounts + assignment of hidden classes (D-32)

### Landmines
- Homepage painted four classes after Economy was deleted from the live book
- After Publish, do **not** immediately fork a draft that makes `/pricing` look unlike public (D-03)
- Dual DC: do not strip injected `<base href="/app/ops/">` on the public ops copy

## Specific Ideas

- Owner km example: start 100 + 14.6 × 12 = 275.20; 12.3 × 10 = 123 km line.
- Extra wait: 2h wait → 1h free + 1h billed; not in pay-now.
- Surcharges tab: owner pinned live `/pricing` — rules table is the source; add dialog is type + configuration only; show nothing extra in that dialog.
- Done = live UAT on `vamostaxi.site` / `dashboard.vamostaxi.site`. Owner clicks Publish.

## Deferred Ideas

- Redesign home / checkout / confirmation **layout** (numbers and which cards appear are this phase)
- Live Stripe keys
- `vamostaxi.eu`
- Search Console / JSON-LD
- Invented mail copy (price-changed / expired: skip-send until owner English)
- Extra-wait automatic card debit without customer confirmation
- Return trips

---

*Phase: 18-OPS Pricing source of truth*
*Context gathered: 2026-09-13*
*Restart context: 2026-09-14*

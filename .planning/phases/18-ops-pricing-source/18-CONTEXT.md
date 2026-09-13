# Phase 18: OPS Pricing source of truth - Context

**Gathered:** 2026-09-13
**Status:** Ready for planning
**Does not steal Phase 11.** First public CHF is still the owner Publish click on the live page. Do not reopen launch cutover. Do not bind `vamostaxi.eu`. Stripe stays test until the owner says live keys.

## Phase Boundary

Rebuild `https://dashboard.vamostaxi.site/pricing` as the **only** fare configuration. Every add, edit, delete, and Publish on this page is the source of the route calculation. After a successful Publish, the next home quote, checkout recap, confirmation, ops amounts, Stripe charge, and **new** booking mail all read this published book immediately, all-or-nothing.

Until Publish, public and ops board stay on the last published book, or `CHF 000` if there has never been a Publish. Charge is always CHF. Return stays out of V1. No driver app. No auto-dispatch. No live Stripe keys. No `.eu`.

Current `/pricing` stays the fare book until this editor ships. This phase does **not** block Phase 11 Publish.

## Implementation Decisions

### Go-live / Publish

- **D-01:** Save on a row overlay writes the **draft** immediately. Public, ops board, checkout, Stripe, and new mail do not change until Publish.
- **D-02:** Publish is the only flip. Next quote uses the new book with no wait. All-or-nothing — if quote, checkout, Stripe, ops, or new mail would disagree, nothing flips. Show the **exact** error and what was not configured. Confirm shows the change list plus errors; the admin fixes visible gaps, then confirms.
- **D-03:** VAT % waits for the same Publish click. Today’s instant `PATCH` stays until this phase ships.
- **D-04:** Route Live, deletes, coupon edits, class hide, max pax, night/weekend/holiday/waiting/lock/service area all wait for Publish.
- **D-05:** Ops board / internal booking totals = published book, or `CHF 000` until first Publish. **Exception:** the preview on this page may show **draft** CHF. That is the only place draft totals appear.
- **D-06:** No unpublish back to `CHF 000`. Only a later Publish replaces the book. After a successful Publish, a **new draft is cloned from live**. Public stays on the old book until the next Publish.
- **D-07:** This page is **admin-only**. Dispatcher / non-admin `/pricing` → not found / no access. Two admins: last successful Publish wins; the other sees the exact error.
- **D-08:** Publish stays blocked until every priced field is filled. Gaps = missing required class fields (**name, start, per-km, max pax**) plus any row the admin added that is still empty. Bands/surcharges may be empty if they never added a row.
- **D-09:** History is a fifth tab. Empty before first Publish. Cannot delete rows. Current live is marked. Row shows Zurich date/time, who published, gap-free, then details. Details = full change list vs the previous published book. Re-Publish an old book = same as a new Publish (confirm, mails, locks). Cannot edit a past book in place — clone to a new draft, then edit.
- **D-10:** Discard draft: confirm first. Last published stays live. History unchanged. Page shows a new draft cloned from live. If there has **never** been a Publish: draft gone, page empty, public still `CHF 000`.

### Money recipe

- **D-11:** Distance class money is **start** (base, not related to included km) **+ (all km × per-km) + bands on top**. Example the owner gave: Economy start 10 + 40 km × per-km. First-X-km floor is **not** extra — **remove that field** from this page.
- **D-12:** A 1 km trip uses the same recipe. No separate minimum.
- **D-13:** Exact km × rate (12.3 km stays 12.3), then **normal round to the rappen**. Not Swiss 5-rappen.
- **D-14:** Km bands are a **separate table per class**. A band amount is **CHF per km in that slice, on top of class per-km**. Open last band (no To) is allowed. From inclusive, To exclusive, except the open last band. No band rows → start + (km × per-km) only. Overlap: warn on confirm, still allow Publish, **higher CHF per km** wins.
- **D-15:** Region % is percent of **start + km + bands**, before extras/VAT. Two matching zones: highest percent wins (warn, still Publish). Match when the pin is **inside the Mapbox zone**.
- **D-16:** VAT is percent of fare + extras. **Coupon applies before VAT.** Payable floors at `CHF 0.00`. VAT still waits for Publish (D-03).
- **D-17:** If From and To match a fixed route **and** the km engine, **fixed route wins**. Match = same Mapbox place; **same airport counts** (terminal vs saved airport pin). A→B and B→A are **separate rows**. Save without Mapbox From and To is blocked. Empty class on a route = that class not offered; other classes still match. An extra stop on a fixed-route trip **switches to the distance recipe** for the new path.
- **D-18:** Charge always CHF. This page has **no EUR/USD columns**. Mails show CHF only. Header FX converts display on public quote numbers only — no second price book.
- **D-19:** Admin can **add and remove as many classes** as they want. A class can be **hidden from public** (listed, not selectable, `CHF 000` / Select off) while **ops still sees and can assign it**. If quote pax is over max pax, that class is not offered on the public quote.

### Unpaid quotes after Publish

- **D-20:** New quotes use the new book immediately. A **locked** checkout keeps the locked amount until it expires or they start over. Quote lock length is a field on this page, in **hours**.
- **D-21:** Home class cards on screen with **no Select yet** + Publish → Select is **refused**; they must quote again.
- **D-22:** Unpaid booking, emailed pay-link, and open Stripe session keep the old amount until the lock expires, then the **whole unpaid trip auto-cancels**. They rebook from home.
- **D-23:** Pay before expiry → charge the locked old amount; confirmation voucher is that **snapshot**, not the new book. Stripe webhook after expiry → **do not capture**.
- **D-24:** Each Publish sends a branded **price-changed** mail to the booking contact only, booking language (en/de/fr/ar), **old locked amount only** (no new book numbers), button to the existing unpaid / pay page. Skip that mail if they already paid. When the lock expires: second branded **expired** mail, button to the **home booking box**. Account holders see the trip as cancelled on account **and** get the expired mail. Guests get the same two mails. **Owner supplies English later. Do not invent copy.** Translate de/fr/ar in the same sitting when copy exists.
- **D-25:** Ops board / detail still show the unpaid trip at the old locked amount until expiry. Dispatcher **cannot** take it at a different CHF. Ops manual phone booking uses the **last published book**, or cannot book until first Publish. Never the draft.
- **D-26:** Any Stripe method (card / Apple Pay / Link) at the locked amount until expiry.

### This page UI

- **D-27:** **New layout from scratch**, still Vamos tokens (Qurova, `#FDC20B`, `--vt-*` only). UI-SPEC in this phase. **Desktop, tablet, and mobile** — responsiveness is required, not optional.
- **D-28:** Left tabs: **Fixed routes · Distance rules · Surcharges & extras · Coupons · History**. Old `#coupons` page is **gone**. Add / hide / remove class lives on **Distance rules**.
- **D-29:** VAT % stays on the **sticky rail**. Discard draft and Publish sit in the **header**. Preview sits in the sticky rail under VAT / Publish. Preview uses the **draft**, inputs = From/To Mapbox, when, class, pax, extras, coupon. Recap top to bottom: start, km, bands, region %, extras, VAT, total. Empty class = `CHF 000` and not selectable. Preview may **create a test unpaid** (see D-33). Preview never charges Stripe.
- **D-30:** Surcharges pane has **two tables**: (1) **rules** the admin adds (night window start/end, weekend days default Sat–Sun, holiday dates they add, waiting unit they choose — minute / hour / day / anything, quote-lock hours, free-wait hours, max extra stops, service area); (2) **surcharge rows** that pick one of those rules. Every From / To / zone / service-area field is **Mapbox**. Timezone for those windows stays **Europe/Zurich** as a product law, not a field.
- **D-31:** Drop the charcoal “every figure is a placeholder” note. New words: English first, translate de/fr/ar same sitting. **Arabic RTL**. Phone: same controls, rail scrolls, tables swipe.
- **D-32:** Publish confirm is a **dialog on this page**, not a separate route.

### Test unpaid from preview

- **D-33:** Admin on this page only. Unpaid only — **no Stripe session**. Contact email is typed on the preview. **No mails**. Appears on ops board **marked test**. Dispatch may assign; it is still **not** a paid customer trip. Public `/bookings` for that email may show Needs payment but **Pay is off**. Uses the **draft** even if not Published. Dies on the same lock expiry as real unpaid (auto-cancel).

### Coupons tab

- **D-34:** Percent off **or** fixed CHF off, plus dates / cap. Applies to **all classes**. One coupon per booking. **Coupon before VAT**. Public cannot use a new coupon until Publish. Preview can test a code and include it in recap. Code is **case-insensitive, trim spaces**. Existing unpaid lock **keeps** its coupon and old amount until expiry. If coupon would go below 0 → floor `CHF 0.00`.

### Extras / checkout

- **D-35:** After Publish, the checkout extras list is **built from this page’s surcharge rows**. Delete the row and Publish → that extra **disappears** from checkout (not a CHF 0 chip).
- **D-36:** Each rule is either **automatic** (night / weekend / holiday / waiting — never a chip; apply when the **scheduled pickup in Zurich** is in that window; night **may cross midnight**) or a **checkout extra chip**. New customer extras (pet, etc.) **must appear on checkout after Publish**. Name: owner types English here; translate de/fr/ar same sitting. Icon from the existing Icon set.
- **D-37:** Extra stop is **not** a fixed amount. Mapbox place on `/checkout/details`, live re-run of the distance recipe (start + km × per-km + bands + region). Max extra stops is a field on this page. Child seat / oversized / pet: amount on this page × quantity on checkout, recap live. Ski with an amount = paid extra, not request-only.
- **D-38:** Meet & greet and free airport wait are **two cards**, both auto-on, each can be turned off. Meet off → no meet line; waiting uses the paid rule only. Free wait is **airport pickup only** (and the owner’s “airport to pickup 1h included” is this free-wait field, not a hardcoded 1h forever). Extra waiting after free wait: **CHF 0 at pay**. Ops marks arrival, then extra uses this page’s unit/amount. Owner wants that extra **taken automatically from the saved payment without a confirmation**. Plan must treat SCA / off-session Stripe as a gate — do not invent legal copy.
- **D-39:** Service area Mapbox on this page. Vamos quotes only when **pickup and dropoff are both inside**. Otherwise no quote — classes not offered.

### vs Phase 11 / launch

- **D-40:** First public CHF is **when the owner clicks Publish on the live page now**. This editor does not block that. Until this editor is live, the **current** Pricing page is still the fare book (Save draft, Publish as today). After that first Publish, this phase’s editor still uses Publish as the only click that updates public / ops / Stripe / new quotes. `vamostaxi.eu` stays forgotten until the owner says so. Live Stripe keys stay owner-gated.

### Claude's Discretion

- Open last km band allowed.
- Band From inclusive, To exclusive except open last.
- Overlapping region %: highest wins, warn, still Publish.
- Meet & greet turned back on: free wait applies again, recap live.
- Arabic RTL (owner said you decide).
- Add / hide / remove class on Distance rules pane.
- History details = overlay/page with full change list.
- Extra wait clock starts when ops marks arrival.
- Preview recap line order as D-29.
- New class required fields after removing first-X-km: name, start, per-km, max pax.

## Canonical References

Downstream agents MUST read these before planning or implementing.

### This discussion
- `.planning/phases/18-ops-pricing-source/18-CONTEXT.md` — this file

### Phase 11 (do not reopen; inherit)
- `.planning/phases/11-launch-cutover/11-CONTEXT.md` — D-16 this page is the only fare control; D-18 Publish = live book + `public_chf`; D-19 `CHF 000` until that click; D-20 Stripe test until owner says; D-22 no `.eu`
- `docs/runbooks/quote-publish.md` — Hyperdrive nocache, snapshot at pay, paid trips never reprice

### Pricing engine / ops page
- `app/ops/OpsPricing.dc.html` — current DC (rebuild layout, keep product nouns unless CONTEXT overrides)
- `apps/web/lib/pricing/priceQuote.ts` — today’s quote recipe; this phase **replaces** first-20-km floor stacking with D-11
- `apps/web/lib/checkout/vat.ts` — `CH_VAT_RATE_BPS` fallback 81; VAT still from `settings.vat_rate_bps` after Publish
- `apps/web/app/[locale]/(ops)/api/staff/rate-versions/` — publish path must keep `public_chf` flip
- `apps/web/app/[locale]/(ops)/api/staff/settings/route.ts` — VAT; this phase must stop applying VAT without Publish
- `packages/db/supabase/migrations/20260913000001_launch_public_chf_vat.sql` — already applied on Zurich

### Design
- `CLAUDE.md` — `--vt-*` only, Lucide via `Icon`, amounts `CHF 000` / `CHF 00.00`
- `app/ops/OpsPricing.dc.html` T blocks en/de/fr/ar

### Must-not
- No `sk_live_`
- No `vamostaxi.eu` DNS / wrangler bind
- No restore onto `yaumjzvylngfjhtuffqs`
- No inventing CHF, legal copy, or mail wording
- No push `main`; Worker `vamos` staging only until owner says

## Existing Code Insights

### Reusable Assets
- `OpsPricing.dc.html` panes, `OpsTable`, overlay Save → `PUT` rate-book, Publish → `POST /api/staff/rate-versions/:id/publish`
- `quote_rate_book` RPC + `asQuote` — public quote flags; keep nocache after Publish
- Checkout extras GET + intent POST already carry `vat_rate_bps`
- Booking snapshot at pay (do not rewrite confirmation on later Publish)
- Mapbox retrieve/suggest used on public quote — reuse on this page and extra stop
- Coupons today live on a separate ops page — **move** into this tab and delete `#coupons`

### Established Patterns
- Dual DC: `app/ops/` is source; Worker serves `apps/web/public/app/ops/`
- Admin vs dispatcher hash; this page admin-only
- Guest unpaid + manage link; lock expiry already exists — reuse for D-22
- Four locales same sitting; no Language row on legal

### Integration Points
- `priceQuote` / class floors / bands / region / extras
- Home class cards + Select
- `/checkout/details` extras + extra-stop Mapbox + live recap
- Stripe Checkout amount = published book + VAT at **lock** time
- Resend confirmation = snapshot; new price-changed / expired mails (copy TBC)
- Ops board amounts + assignment (hidden classes still assignable)
- Settings `public_chf` / `vat_rate_bps`

## Specific Ideas

- Owner example (illustration only, not a live fare): Economy start 10 + 40 km × per-km.
- Extra wait: paid route first; free wait field; then extra per unit **automatically from the bank** without confirmation — SCA / off-session is a plan gate.
- Extra stop: they add **where** they want to stop; km and total update live on details.
- History tab under Coupons; click opens the change list.
- Rules table sits **below** add-surcharge; a surcharge picks a rule.
- Test unpaid from preview: typed email, board marked test, Pay off.
- Responsiveness: desktop, tablet, mobile — take it seriously.

## Deferred Ideas

- **Redesign home / checkout / confirmation layout** — owner asked; those pages only take **numbers** from this book in this phase. Layout redesign is its own phase.
- Live Stripe keys — owner gate, not this phase.
- `vamostaxi.eu` — forgotten until owner says.
- Google Search Console sitemap submit — after all V1 phases.
- JSON-LD — not this phase.
- Practice restore — parked; never restore onto `yaumjzvylngfjhtuffqs`.
- Mail English copy — owner will supply; do not invent.
- Extra-wait off-session charge without customer confirmation — may need a legal/Stripe sub-gate inside the plan; do not ship a silent debit without that gate.

---

*Phase: 18-OPS Pricing source of truth*
*Context gathered: 2026-09-13*

# Phase 11: Launch Cutover - Context

**Gathered:** 2026-09-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Make **`vamostaxi.site`** the public live customer site for this phase: drop
`noindex`, ship `sitemap.xml` (do not submit Search Console), public amounts
stay **`CHF 000` until OPS Pricing Publish** (that Publish is the public-CHF
switch), extract public copy from `vamostaxi.eu` (content only — not a live
host), add an editable VAT % on OPS Pricing, keep Stripe **test** until the
owner says live keys.

ROADMAP still names `vamostaxi.eu` for LAUNCH-05. **This discussion overrides
that for Phase 11.** Forget `.eu` as a live hostname until the owner says
otherwise. Do not treat `.site` as the forever domain either — a later domain
is decided then, not now.

**In scope:** LAUNCH-05 (as `.site` public live: index + sitemap file, no `.eu`
DNS, no Freshpage 301s) and LAUNCH-06 (public CHF only after owner says the
OPS Pricing page is right and Publish). VAT control on
`dashboard.vamostaxi.site/pricing`. Extract + translate public copy from `.eu`.

**Out of scope:** `vamostaxi.eu` DNS / zone / Worker bind / 301s. Live Stripe
keys. JSON-LD. Search Console submit. `vamostransfer.com`. become-a-partner.
Restore drill. Phase 13 Support APIs. Preview Workers
(`vamos-front-changes` / `vamos-ops-changes` / `env.production`). Invented CHF
or invented legal text.

</domain>

<decisions>
## Implementation Decisions

### Hostname (this phase)

- **D-01:** Forget `vamostaxi.eu` as a live host until the owner says otherwise. Do not bind it. Do not 301 it. Do not put it on Worker `vamos`.
- **D-02:** No forever-domain. This phase uses `vamostaxi.site`. A later connected domain is decided then — not 301'd, not dual-live, not this phase.
- **D-03:** Public live on `vamostaxi.site`: customers + Google use it. Drop `X-Robots-Tag: noindex` on the public host **now**, even if amounts are still `CHF 000`.
- **D-04:** Ops stays `dashboard.vamostaxi.site`, keep **noindex**.
- **D-05:** Canonical public URL is **`https://vamostaxi.site`**. `www` 301s to apex. Do not touch DNS unless that 301 is broken.
- **D-06:** Mail From / Reply-To stay `*@vamostaxi.site` until the owner changes them. Support stays `info@vamostaxi.site`.
- **D-07:** Public phone / WhatsApp stay `+41 79 626 70 82` / `wa.me/41796267082`.
- **D-08:** Only Worker **`vamos`**. Ignore `front-changes` / `ops-changes` / `env.production` this phase. Do not create `vamos-web-production`.

### Go-live order (numbered owner gates — wait)

- **D-09:** One numbered owner gate at a time, then wait. Never same-sitting live Stripe.
- **D-10:** Order: (1) drop public noindex now (2) OPS Pricing ready + owner says the page is right + **Publish = public CHF** (3) live Stripe keys **only when owner says** (4) sitemap file this phase; Search Console submit **after all V1 phases**.
- **D-11:** Stripe on Worker `vamos` stays **test** until the owner says live keys — even after public CHF is on. This overrides any earlier “live keys this phase” pick.
- **D-12:** After live keys are on `vamos` (later, when owner says): test keys gone from that Worker.
- **D-13:** If a live charge fails: stop taking pay, owner decides. Do not silently roll back to test.
- **D-14:** First real small charge: only when the owner says (after live keys). Not this sitting.
- **D-15:** Daily watch after go-live (public index / later live keys). No extra paid dashboard.

### OPS Pricing + public CHF (LAUNCH-06)

- **D-16:** **`https://dashboard.vamostaxi.site/pricing` is the only fare control.** Every calculation the quote/checkout already does must be controllable from this page so the owner can change it any time. Public quote/checkout must match the published book. Never invent CHF.
- **D-17:** Owner says the page is right, then Publish. Do **not** block the flip on an agent-made “every line has a control” audit. Do not invent missing CHF to fill gaps.
- **D-18:** **One switch:** OPS **Publish** publishes the live book **and** flips public CHF. Not a separate `pricing_live` owner command. `PRICING_PREVIEW` must not flip public CHF (existing `docs/runbooks/quote-publish.md`).
- **D-19:** Until that Publish-as-flip: public amounts are **`CHF 000` everywhere, including home floors** (80/100/130/150 must not show). Empty shell stays 000 mark-only.
- **D-20:** After Publish-as-flip: real CHF from that published book. Header currency converts **displayed** quote numbers only. **Charge is always CHF.** No second price book. No Stripe card presentment in another currency this phase.
- **D-21:** Night / extra-stop / child-seat: only what is already in the published OPS book. Synchronize with the booking page. Never invent extras.
- **D-22:** Add an **editable VAT %** on OPS Pricing. Do not invent a new rate — current code is `CH_VAT_RATE_BPS = 81` (8.1% on top of net) in `apps/web/lib/checkout/vat.ts`. Owner can change the % from the page.
- **D-23:** Hosted `rate_versions` id 5 is **not** automatically the public-CHF flip. A live row already exists; public must still show `CHF 000` until D-17/D-18.

### Old Freshpage / `.eu` URLs

- **D-24:** No `.eu` redirects at all this phase. Do not 301 `/book-transfer`, `/about-us`, become-a-partner, or any Freshpage path on `.site` either.

### Extracted copy (content only)

- **D-25:** Source = current `vamostaxi.eu` pages. Extract **whatever public copy we need** (legal + About + FAQ + contact as needed). Not a live-host cutover. Do not port become-a-partner.
- **D-26:** `.eu` wins for those fields over TBC pills. Still **no invented text** — if `.eu` has no value, leave TBC.
- **D-27:** Extract English from `.eu`, then **translate to de/fr/ar** in the same pass. Do not invent extra legal clauses in translation.
- **D-28:** Legal pages are indexed with **real extracted data**, not invented UID/address/hours. If `.eu` lacks a field, TBC remains.

### Sitemap / Google

- **D-29:** Ship `sitemap.xml` on `vamostaxi.site` this phase. **Do not submit** Google Search Console this phase. Remind the owner **after all V1 phases**.
- **D-30:** Sitemap includes **public marketing + legal only:** home, about, FAQ, contact, terms, privacy, imprint, cookies, cancellation.
- **D-31:** Never in sitemap: `/checkout`, `/confirmation`, `/bookings`, `/account`, `/sign-in`, `/sign-up`, `/manage-booking`, `/reset-password`, dashboard, `/ops`, `/dev`.
- **D-32:** JSON-LD / schema.org: **not this phase**.
- **D-33:** Cookies / analytics stay as Phase 10: Cloudflare Web Analytics cookieless, no fake toggles.

### Stripe (when owner later says live keys)

- **D-34:** Methods stay as test Checkout already gives (card, Apple Pay, Link/Google as Stripe gives, TWINT if Stripe has it). Not card-only.
- **D-35:** Webhook path stays `/api/stripe/webhook` on Worker `vamos`. WAF skip already on `.site` for that path.

### Claude's Discretion

- Exact www 301 mechanism; only number a Cloudflare DNS click if 301 is broken.
- How to implement D-18/D-19 given today `pricing_live = rateBook.rate_version !== null` in `apps/web/lib/pricing/priceQuote.ts` (id 5 already live). Researcher/planner pick the smallest change that keeps public `CHF 000` until Publish-as-flip. Do not invent CHF.
- VAT field placement on OPS Pricing — stay on `OpsPricing` / `--vt-*` / existing page; do not redesign.
- `robots.ts` extra disallows for checkout/account (sitemap is the lock; robots may match).
- Whether `/coming-soon` and HTML `/sitemap` stay in `PUBLIC_ROUTES` for hreflang but out of XML.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Launch
- `.planning/REQUIREMENTS.md` — LAUNCH-05, LAUNCH-06 (this CONTEXT overrides `.eu` hostname for Phase 11)
- `docs/build/GSD-LAUNCH.md` — paper cutover; do not follow `.eu` DNS or Freshpage 301s this phase
- `docs/brief/CURRENT-SITE-AUDIT.md` — old CMS URL list (do **not** 301 this phase)
- `docs/runbooks/quote-publish.md` — draft → live; `PRICING_PREVIEW` must not set public CHF
- `apps/web/wrangler.jsonc` — Worker `vamos`, `DEPLOY_ENV=staging` noindex today, `.eu` must not be bound
- `.planning/phases/10-hardening-performance-security-compliance/10-CONTEXT.md` — D-34 staging noindex until Phase 11; WAF/HSTS on `.site` only

### Pricing
- `apps/web/app/[locale]/(ops)/ops/pricing/` — OPS Pricing UI
- `apps/web/app/[locale]/(ops)/ops/pricing/actions.ts` — `publishRateVersion`
- `apps/web/lib/ops/pricing.ts` — completeness gaps
- `apps/web/lib/pricing/priceQuote.ts` — `pricing_live = rateBook.rate_version !== null` today
- `apps/web/lib/checkout/vat.ts` — `CH_VAT_RATE_BPS = 81`
- `apps/web/lib/currency.ts` — display FX / placeholder amounts
- `apps/web/public/app/ops/OpsPricing.dc.html` — DC; do not redesign

### Indexing
- `apps/web/middleware.ts` — `DEPLOY_ENV === "staging"` → `X-Robots-Tag: noindex`
- `apps/web/app/sitemap.ts` — walks `PUBLIC_ROUTES`
- `apps/web/app/robots.ts`
- `apps/web/lib/metadata.ts` — `SITE_URL = https://vamostaxi.site`, `PUBLIC_ROUTES` currently includes account/checkout/sign-in (must shrink sitemap per D-30/D-31)

### Product laws
- `CLAUDE.md` — design tokens, four languages, no invented CHF/legal
- `.planning/phases/09-booking-lifecycle-customer-self-service/09-CONTEXT.md` — booking lifecycle; do not reopen

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `publishRateVersion` already sets `rate_versions.status = 'live'` after completeness gaps are empty.
- `apps/web/app/sitemap.ts` + `PUBLIC_ROUTES` already emit XML; Phase 11 must **filter** to D-30, not invent a second sitemap stack.
- `formatAmount` / `apps/web/lib/currency.ts` already know `CHF 000` placeholder vs live quote numbers + header FX.
- Cookie banner + cookieless CF Web Analytics already shipped (Phase 10). Do not rebuild.

### Established Patterns
- Noindex is `DEPLOY_ENV === "staging"` in middleware (wrangler `env.staging` vars). Dropping public noindex means public `vamos` must not send that header; dashboard host stays noindex (D-04).
- Quote response must not grow a second rendering branch in `respond.ts` (existing comment). Public 000 is a display/flag concern, not a new error table.
- Hyperdrive quote reads are `HYPERDRIVE_NOCACHE` (`quote-publish.md`).
- Secrets: owner `wrangler secret put` in their terminal. Agent never sees live Stripe values.

### Integration Points
- Worker name printed must stay `vamos`. Staging hostnames already on this account.
- Stripe webhook `/api/stripe/webhook` + WAF skip already on `.site`.
- Extract pass: fetch `vamostaxi.eu` legal/about/FAQ/contact at execute time; write into existing legal/about/FAQ/contact routes + i18n messages (en/de/fr/ar). TBC pills stay TBC when `.eu` has nothing.

</code_context>

<specifics>
## Specific Ideas

- OPS Pricing is “the main thing that will control every single small detail.” Mention VAT there like price and route so the owner can change it.
- “en from .eu and translate to the rest of the languages.”
- “For now I need you to keep the test until I say so.”
- Search Console: “Later I will add the sitemap to Google but remind me of this after we finalize all the phases.”

</specifics>

<deferred>
## Deferred Ideas

- Live hostname `vamostaxi.eu` — only if owner says later.
- Later connected domain (incl. `vamostransfer.com`) — decide then.
- Live Stripe keys, real charges, test-key removal from `vamos` — when owner says.
- Google Search Console sitemap submit — after all V1 phases (remind).
- JSON-LD / schema.org LocalBusiness.
- Stripe adaptive/presentment in the customer’s card currency.
- Freshpage 301 map / old CMS stay-up window.
- Practice restore onto a Supabase **copy** — after remaining V1 phases. Never restore onto `yaumjzvylngfjhtuffqs`.
- Phase 13 Support APIs.
- Preview Workers / `env.production`.
- become-a-partner.

</deferred>

---

*Phase: 11-launch-cutover*
*Context gathered: 2026-09-13*

# Phase 11: Launch Cutover - Research

**Researched:** 2026-09-13
**Domain:** Public CHF display vs live rate book, host-split noindex on Worker `vamos`, sitemap allowlist vs hreflang, OPS VAT %, `.eu` copy extract
**Confidence:** HIGH on in-repo wiring; MEDIUM on hosted `rate_versions` id 5 contents (CONTEXT D-23, not queried this session); MEDIUM on whether `www.vamostaxi.site` already 301s to apex (not probed)

## User Constraints (from CONTEXT.md)

**CRITICAL:** CONTEXT.md D-01…D-35 are locked. CONTEXT overrides ROADMAP / LAUNCH-05 hostname: this phase uses `vamostaxi.site`. Forget `.eu` as a live host. Do not invent CHF, legal copy, or photos.

### Locked Decisions

#### Hostname (this phase)

- **D-01:** Forget `vamostaxi.eu` as a live host until the owner says otherwise. Do not bind it. Do not 301 it. Do not put it on Worker `vamos`.
- **D-02:** No forever-domain. This phase uses `vamostaxi.site`. A later connected domain is decided then — not 301'd, not dual-live, not this phase.
- **D-03:** Public live on `vamostaxi.site`: customers + Google use it. Drop `X-Robots-Tag: noindex` on the public host **now**, even if amounts are still `CHF 000`.
- **D-04:** Ops stays `dashboard.vamostaxi.site`, keep **noindex**.
- **D-05:** Canonical public URL is **`https://vamostaxi.site`**. `www` 301s to apex. Do not touch DNS unless that 301 is broken.
- **D-06:** Mail From / Reply-To stay `*@vamostaxi.site` until the owner changes them. Support stays `info@vamostaxi.site`.
- **D-07:** Public phone / WhatsApp stay `+41 79 626 70 82` / `wa.me/41796267082`.
- **D-08:** Only Worker **`vamos`**. Ignore `front-changes` / `ops-changes` / `env.production` this phase. Do not create `vamos-web-production`.

#### Go-live order (numbered owner gates — wait)

- **D-09:** One numbered owner gate at a time, then wait. Never same-sitting live Stripe.
- **D-10:** Order: (1) drop public noindex now (2) OPS Pricing ready + owner says the page is right + **Publish = public CHF** (3) live Stripe keys **only when owner says** (4) sitemap file this phase; Search Console submit **after all V1 phases**.
- **D-11:** Stripe on Worker `vamos` stays **test** until the owner says live keys — even after public CHF is on. This overrides any earlier “live keys this phase” pick.
- **D-12:** After live keys are on `vamos` (later, when owner says): test keys gone from that Worker.
- **D-13:** If a live charge fails: stop taking pay, owner decides. Do not silently roll back to test.
- **D-14:** First real small charge: only when the owner says (after live keys). Not this sitting.
- **D-15:** Daily watch after go-live (public index / later live keys). No extra paid dashboard.

#### OPS Pricing + public CHF (LAUNCH-06)

- **D-16:** **`https://dashboard.vamostaxi.site/pricing` is the only fare control.** Every calculation the quote/checkout already does must be controllable from this page so the owner can change it any time. Public quote/checkout must match the published book. Never invent CHF.
- **D-17:** Owner says the page is right, then Publish. Do **not** block the flip on an agent-made “every line has a control” audit. Do not invent missing CHF to fill gaps.
- **D-18:** **One switch:** OPS **Publish** publishes the live book **and** flips public CHF. Not a separate `pricing_live` owner command. `PRICING_PREVIEW` must not flip public CHF (existing `docs/runbooks/quote-publish.md`).
- **D-19:** Until that Publish-as-flip: public amounts are **`CHF 000` everywhere, including home floors** (80/100/130/150 must not show). Empty shell stays 000 mark-only.
- **D-20:** After Publish-as-flip: real CHF from that published book. Header currency converts **displayed** quote numbers only. **Charge is always CHF.** No second price book. No Stripe card presentment in another currency this phase.
- **D-21:** Night / extra-stop / child-seat: only what is already in the published OPS book. Synchronize with the booking page. Never invent extras.
- **D-22:** Add an **editable VAT %** on OPS Pricing. Do not invent a new rate — current code is `CH_VAT_RATE_BPS = 81` (8.1% on top of net) in `apps/web/lib/checkout/vat.ts`. Owner can change the % from the page.
- **D-23:** Hosted `rate_versions` id 5 is **not** automatically the public-CHF flip. A live row already exists; public must still show `CHF 000` until D-17/D-18.

#### Old Freshpage / `.eu` URLs

- **D-24:** No `.eu` redirects at all this phase. Do not 301 `/book-transfer`, `/about-us`, become-a-partner, or any Freshpage path on `.site` either.

#### Extracted copy (content only)

- **D-25:** Source = current `vamostaxi.eu` pages. Extract **whatever public copy we need** (legal + About + FAQ + contact as needed). Not a live-host cutover. Do not port become-a-partner.
- **D-26:** `.eu` wins for those fields over TBC pills. Still **no invented text** — if `.eu` has no value, leave TBC.
- **D-27:** Extract English from `.eu`, then **translate to de/fr/ar** in the same pass. Do not invent extra legal clauses in translation.
- **D-28:** Legal pages are indexed with **real extracted data**, not invented UID/address/hours. If `.eu` lacks a field, TBC remains.

#### Sitemap / Google

- **D-29:** Ship `sitemap.xml` on `vamostaxi.site` this phase. **Do not submit** Google Search Console this phase. Remind the owner **after all V1 phases**.
- **D-30:** Sitemap includes **public marketing + legal only:** home, about, FAQ, contact, terms, privacy, imprint, cookies, cancellation.
- **D-31:** Never in sitemap: `/checkout`, `/confirmation`, `/bookings`, `/account`, `/sign-in`, `/sign-up`, `/manage-booking`, `/reset-password`, dashboard, `/ops`, `/dev`.
- **D-32:** JSON-LD / schema.org: **not this phase**.
- **D-33:** Cookies / analytics stay as Phase 10: Cloudflare Web Analytics cookieless, no fake toggles.

#### Stripe (when owner later says live keys)

- **D-34:** Methods stay as test Checkout already gives (card, Apple Pay, Link/Google as Stripe gives, TWINT if Stripe has it). Not card-only.
- **D-35:** Webhook path stays `/api/stripe/webhook` on Worker `vamos`. WAF skip already on `.site` for that path.

### Claude's Discretion

- Exact www 301 mechanism; only number a Cloudflare DNS click if 301 is broken.
- How to implement D-18/D-19 given today `pricing_live = rateBook.rate_version !== null` in `apps/web/lib/pricing/priceQuote.ts` (id 5 already live). Researcher/planner pick the smallest change that keeps public `CHF 000` until Publish-as-flip. Do not invent CHF.
- VAT field placement on OPS Pricing — stay on `OpsPricing` / `--vt-*` / existing page; do not redesign.
- `robots.ts` extra disallows for checkout/account (sitemap is the lock; robots may match).
- Whether `/coming-soon` and HTML `/sitemap` stay in `PUBLIC_ROUTES` for hreflang but out of XML.

### Deferred Ideas (OUT OF SCOPE)

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

## Project Constraints (from CLAUDE.md / HERMES.md)

- Design tokens `--vt-*` only. Four languages same pass (en/de/fr/ar). No Vercel. No driver app.
- Never invent prices, legal copy, or photography. Pending legal values are `data-tok` / `PendingSlot` pills, never `{TOKEN}` or guessed UID.
- Amounts go through `formatAmount` — never a hardcoded CHF figure in logic. Placeholder figure is `000`.
- Charge currency is CHF. Header FX is display-only.
- `SiteHeader` / `SiteFooter` mandatory on public pages. Ops uses `OpsSidebar`.
- Stripe test-only until owner says. No live DNS for `.eu` this phase.
- Hyperdrive on the direct Postgres URL only. Project `yaumjzvylngfjhtuffqs`. Never restore onto it.
- Secrets: owner `wrangler secret put`. Agent never sees live Stripe values.
- Ship path: branch, PR, review, CI green, owner merge. Never push `main` directly.

## Requirements (CONTEXT overrides hostname)

| ID | ROADMAP text | Phase 11 meaning |
|----|--------------|------------------|
| LAUNCH-05 | `vamostaxi.eu` points at the Worker, every old CMS URL redirects, sitemap submitted (`.planning/REQUIREMENTS.md:129`) | Public live on **`vamostaxi.site`**: drop public noindex, ship `sitemap.xml` **file**, no `.eu` DNS, no Freshpage 301s, no Search Console submit |
| LAUNCH-06 | `pricing_live=true` flipped only after real CHF matrix loaded and approved on staging (`REQUIREMENTS.md:130`) | Public CHF only after owner says OPS Pricing is right **and Publish**. Publish = the public-CHF switch. Id 5 already live is **not** that switch (D-23) |

## Summary

Phase 11 is not a new stack. Worker `vamos` already serves `vamostaxi.site` + `www` + `dashboard.vamostaxi.site` with `DEPLOY_ENV=staging` and `PRICING_PREVIEW=true` (`apps/web/wrangler.jsonc` `env.staging`). That same Worker currently stamps `X-Robots-Tag: noindex` on **every** host, including the public site. `env.production` (`vamos-web-production`) is explicitly not deployed and must stay unused (D-08).

Public CHF is a **display + checkout-gate** problem, not a missing matrix. The engine already prices from a loaded book. `derivePricingLive` is `status === "live"`. Kernel `priceQuote` sets `pricing_live = rateBook.rate_version !== null`. The public booking board **ignores** `pricing_live` and renders `formatChfRappen(entry.total_rappen)`. Checkout already 409s when `pricing_live` is false or the chosen total is null. Because a live `rate_versions` row exists (CONTEXT D-23 id 5) and `PRICING_PREVIEW=true` loads drafts for display, public visitors can see real CHF **today**. D-18/D-19 need a Publish-owned flag that is currently false — `status='live'` cannot be that flag.

VAT is a code constant (`CH_VAT_RATE_BPS = 81`). No `vat_rate` column exists. OPS Pricing has routes / distance / surcharges panes and no VAT control. An editable % requires SQL + a field on the existing page, default **81 bps / 8.1%** from current code — not a new invented rate.

`.eu` is a **content source**, not a host. Fetched 2026-09-13: imprint/about/FAQ/contact/terms/privacy all 200. Extract into existing routes + i18n. Leave TBC where `.eu` is empty (UID, licence). Do not copy `info@vamostaxi.eu` (D-06). Skip become-a-partner.

**Primary recommendation:** (1) Host-split noindex on Worker `vamos` — do not deploy `env.production`. (2) Add `public.settings.public_chf boolean not null default false` and `vat_rate_bps integer not null default 81`; `publishRateVersion` sets `public_chf=true` in the same staff transaction as `status='live'`. (3) Public quote UI passes `null` into `formatAmount` until that flag; public `preferDraft` false. (4) Filter `sitemap.ts` to a D-30 allowlist; leave `PUBLIC_ROUTES` for hreflang. (5) Stop at owner apply on `yaumjzvylngfjhtuffqs`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Public vs dashboard noindex | Frontend Server (`middleware.ts`) | CDN/Static | Header is Worker-side today; host split cannot be a second Worker (D-08) |
| `sitemap.xml` allowlist | Frontend Server (`app/sitemap.ts`) | — | Next MetadataRoute; filter XML only |
| On-page hreflang | Frontend Server (`lib/metadata.ts` `buildAlternates`) | Browser | `PUBLIC_ROUTES` is the hreflang contract; do not shrink it to shrink XML |
| Public CHF 000 until Publish | API/Backend (quote `pricing_live` + settings flag) | Browser (`formatAmount` / `formatChfRappen`) | `respond.ts` forbids a second rendering branch; widget already null→000 |
| Publish-as-flip | API/Backend (`publishRateVersion`) | Database | One staff UPDATE path already exists; extend it, no second owner command |
| Draft preview | API/Backend (`PRICING_PREVIEW` + host) | — | Must not flip public CHF (`quote-publish.md`) |
| VAT % | Database (`settings.vat_rate_bps`) | API (`vat.ts`) + Ops UI | Checkout already adds VAT on top of net; page must edit the same bps |
| `.eu` copy extract | Frontend Server (pages + `i18n/messages`) | — | Content only; four languages same pass |
| Stripe keys | CDN/Static (`wrangler secret put` on `vamos`) | — | Stay test. Agent never sees live values |
| www → apex | CDN/Static (zone) | Frontend Server | Number a DNS click only if broken (D-05) |

## Findings (what the planner must use)

### 1) Public CHF 000 vs live floors vs D-18/D-19

**Today (file:line):**

| Layer | Behaviour | Evidence |
|-------|-----------|----------|
| Kernel flag | `pricing_live = rateBook.rate_version !== null` | `apps/web/lib/pricing/priceQuote.ts:316` |
| Engine flag (what quote HTTP uses) | `derivePricingLive(book.rate_version)` → `status === "live"` | `rateBook.ts:216-220`, `engine.ts:207` |
| Preview | `preferDraft = env.PRICING_PREVIEW === "true"` then `quote_rate_book(preferDraft)` | `engine.ts:159-161`, `lib/db/quote.ts:72-76` |
| Staging Worker | `DEPLOY_ENV=staging` **and** `PRICING_PREVIEW=true` on Worker `vamos` | `wrangler.jsonc` `env.staging` vars ~L107-108 |
| Preview must not set live | Runbook: checkout still 409s; `rate_version_is_live` is trigger-derived from `status` | `docs/runbooks/quote-publish.md:18-20` |
| HTTP body | Carries `pricing_live` + integer rappen or null. **No pricing_live render branch allowed here** | `respond.ts:12-14, 97` |
| Public board | `formatChfRappen(entry.total_rappen, …)` — **does not read `pricing_live`** | `BookingBoard.tsx:449-450, 476-491` |
| Null → 000 | `formatAmount(null)` → `"CHF 000"` | `currency.ts:54-63` |
| FX | Null rappen stays placeholder; non-null converts display only | `lib/fx/format.ts:21-46` |
| Why Vamos | Hardcoded `CHF 000` (idle mark, not a quote) | `WhyVamos.tsx:276-277` |
| Home mock idle | `fmt()` → `money('000')` until quote `status==='live'` | `app/home/home.dc.html:1259-1262, 1296` |
| Checkout gate | Refuse `pricing_not_live` if `!board.pricing_live` **or** chosen total null | `quote/intent.ts:47-50, 190-192` |
| Publish | Completeness gaps then `update rate_versions set status='live' where id=$id` | `ops/pricing/actions.ts:33-50` |
| Live uniqueness | Partial unique index: exactly one `status='live'` | `20260823000008_rate_versions.sql:35-40` |
| Class floors in tests | VAT tests name 80/100/130/150 CHF as “four live class floors” (`8000…15000` rappen) | `vat.test.ts:9-14, 29-37` |
| Public i18n | No `from CHF` / `CHF 80` strings in `en.json` | searched `apps/web/i18n/messages/en.json` |

**Gap vs D-18/D-19:** `status='live'` (id 5) is already true, so engine `pricing_live` is already true. Public UI shows whatever `total_rappen` is. `PRICING_PREVIEW=true` on the **public** Worker can also load a draft book for display. That is the opposite of D-19.

**Smallest change (discretion, do not invent CHF):**

1. **SQL** on operational singleton `public.settings` (already exists, `id=1`, `20260823000004_settings.sql:10-39`):
   - `public_chf boolean not null default false`
   - Do **not** put the flip on `rate_versions` — a live row is frozen; id 5 cannot be “unpublished” without `live→retired`, which is not D-18.
2. **`publishRateVersion`** (`actions.ts:33-41`): in the same `asStaff` transaction, `update public.settings set public_chf = true where id = 1` after/with `status='live'`. One switch. No second owner command.
3. **Public `pricing_live`:** engine/quote path ANDs `derivePricingLive(version) && settings.public_chf`. Checkout then stays refused until Publish-as-flip. Do not add a render branch in `respond.ts`.
4. **Display belt:** `BookingBoard` (and any other public amount) passes `null` into `formatChfRappen` / `formatAmount` when `!quote.pricing_live`. WhyVamos stays `CHF 000` until Publish (then it may stay 000 as a decorative idle — do not invent a floor there).
5. **Host-gate preview:** `preferDraft` only when `PRICING_PREVIEW==="true"` **and** dashboard host. Public `vamostaxi.site` always `preferDraft=false`. Preview still must not set `public_chf`.
6. **Do not** retire id 5 as the 000 mechanism. **Do not** deploy `env.production` to clear `PRICING_PREVIEW`. **Do not** hardcode 80/100/130/150 anywhere.

Until the owner Publish, empty shell and quoted classes both render the 000 mark. After Publish, real CHF come from that published book only (D-20). Header FX remains display-only.

**80/100/130/150:** not in public Next copy. They appear as VAT **test** floors (`vat.test.ts`) matching CONTEXT’s “home floors”. Idle UI is already 000. Planner must not add static floor copy.

### 2) Drop public noindex; keep dashboard noindex

**Today:**

- `applyStagingNoindex` sets `X-Robots-Tag: noindex` when `DEPLOY_ENV === "staging" || "ops-changes"` (`middleware.ts:334-338`).
- Final i18n response also sets noindex when `DEPLOY_ENV === "staging"` (`middleware.ts:551-562`).
- `isDashboardHost`: `dashboard.vamostaxi.site` / `dashboard.localhost` / ops-changes preview / localhost `/ops` (`middleware.ts:193-207`).
- Worker `vamos` = `env.staging`, `DEPLOY_ENV=staging`, routes: `vamostaxi.site`, `www.vamostaxi.site`, `dashboard.vamostaxi.site` (`wrangler.jsonc:86-107`).
- `env.production` name `vamos-web-production`, **not deployed**, no `DEPLOY_ENV` var (comment: absence keeps header off production) (`wrangler.jsonc:272-276`). Using it would violate D-08.
- Tests currently **expect** noindex on public pages (`tests/integration/dev-exclusion.spec.ts:133-174`).
- Layout metadata is title-only; no per-page `robots: noindex` (`app/[locale]/layout.tsx:33-35`). Dev gallery comments say the header is middleware, not layout (`app/[locale]/dev/layout.tsx`).

**Smallest change:** keep `DEPLOY_ENV=staging` on Worker `vamos`. Change both noindex sites in `middleware.ts` to:

- **Always noindex** if `isDashboardHost(request)` (D-04), including when `DEPLOY_ENV` later changes.
- **No noindex** on `vamostaxi.site` / `www.vamostaxi.site` (D-03), even while `DEPLOY_ENV=staging`.
- Keep noindex for `ops-changes` / `vamos-front-changes` if those Workers are hit (out of scope to deploy; still don’t leak index).

Do not bind `.eu`. Do not create `vamos-web-production`. Do not rely on “undefined under env.production” — that path is unused.

`robots.ts` today: `allow: "/"`, disallow `/api/`, `/app/`, `/dev`, `/ops` (`app/robots.ts:4-12`). Discretion: add disallows matching D-31 (`/checkout`, `/confirmation`, `/bookings`, `/account`, `/sign-in`, `/sign-up`, `/manage-booking`, `/reset-password`). Sitemap remains the lock (D-30). Recommend adding the extra disallows so crawlers that ignore sitemaps still skip account/checkout.

### 3) Shrink `sitemap.xml` without breaking hreflang

**Today:**

- `PUBLIC_ROUTES` (19 paths) includes marketing **and** account/checkout/sign-in/coming-soon (`lib/metadata.ts:40-63`).
- `buildAlternates` walks that list. Languages are the **on-page switcher**; `localizedUrl` voids locale and emits unprefixed `https://vamostaxi.site{path}` for every locale + `x-default` (`metadata.ts:67-90`).
- `sitemap.ts` maps **all** `PUBLIC_ROUTES` to `{ url }` only — “XML lists the unprefixed URL only. Never /de /fr /ar” (`app/sitemap.ts:3-16`).
- Integration test **asserts** `sitemap.xml` url count === `PUBLIC_ROUTES.length` and contains locale-prefixed `alternateHref` strings (`tests/integration/public-routes.spec.ts:139-153`, `alternateHref` at L45-48 uses `/de` prefixes). Auth test asserts sitemap includes `/sign-up` (`auth-flows.spec.ts:483-484`). **Those tests must change** with D-30.

**Smallest change:**

- Add `SITEMAP_ROUTES` (or filter) **in `sitemap.ts` only**:
  `/`, `/about`, `/faq`, `/contact`, `/terms`, `/privacy`, `/imprint`, `/cookies`, `/cancellation` (D-30).
- **Do not remove** account/checkout/sign-in/`/coming-soon`/`/sitemap` from `PUBLIC_ROUTES` — that would drop on-page hreflang for those pages.
- Discretion: `/coming-soon` and HTML `/sitemap` stay in `PUBLIC_ROUTES`, **out of XML** (yes — recommend).
- Never list dashboard, `/ops`, `/dev`, `/checkout`, `/confirmation`, `/bookings`, `/account`, `/sign-in`, `/sign-up`, `/manage-booking`, `/reset-password` (D-31).
- Do not invent a second sitemap stack. Do not submit Search Console (D-29).

### 4) VAT: where it lives; editable %; migration?

**Today:**

- `CH_VAT_RATE_BPS = 81`, `CH_VAT_GROSS_BPS = 1081` (`lib/checkout/vat.ts:4-20`). 8.1% **on top of net** (fare + extras).
- Used at checkout: `payableWithVatRappen` imported in `lib/checkout/intent.ts:19`; receipt `vatOnTopRappen` in `confirmation-receipt.ts`.
- Snapshots do **not** store `vat_rappen` (`booking-read.test.ts` asserts snap SQL has no `vat_rappen`). Charged rappen pins the payable.
- `public.settings` has `uid_number` (Swiss UID text), **no vat bps** (`20260823000004_settings.sql:19`).
- `settings_versions` has cancel/waiting/night/lock windows — **no vat** (`settings.sql:47+`, `mapSettingsSnapshot` `rateBook.ts:222-255`).
- `rate_versions` / priced children: no vat column (`20260823000008_rate_versions.sql`).
- OPS Pricing DC: panes `routes` / `distance` / `surcharges` only (`OpsPricing.dc.html:96-100`). No VAT field. Do not redesign (D-22 discretion).
- Completeness loader does not mention VAT (`lib/ops/pricing.ts:69-101`).

**Recommendation:**

- **Migration required.** Persist owner-editable bps. Do not leave VAT as a deploy-only constant if D-16/D-22 require page control.
- Column: `public.settings.vat_rate_bps integer not null default 81 check (vat_rate_bps >= 0)`. Default **81 from current code** — not an invented rate. Not `settings_versions` unless planner wants LIFE-03 pin; charged_rappen already pins the sale. Smallest is `settings`.
- `vat.ts`: keep `CH_VAT_RATE_BPS = 81` as fallback; checkout reads `settings.vat_rate_bps` when present.
- UI: one percent field on the existing OpsPricing **sticky rail** (next to Publish, `OpsPricing.dc.html:26-31`), labelled like fare/route, `--vt-*`, four languages. Show `8.1` not a guessed 7.7/8.1/8.0 debate. Owner can change it.
- **Execute must stop at owner apply** on project `yaumjzvylngfjhtuffqs`. Agent does not `apply_migration` / restore.

### 5) Extract copy from `vamostaxi.eu` (content only)

**Fetched 2026-09-13 (curl 200, www):**

| Source | Dest in this repo | `.eu` has | Leave TBC / do not copy |
|--------|-------------------|-----------|-------------------------|
| `/informations/imprint` | `/imprint` | GmbH, Bleicherstrasse 16, 8953 Dietikon, Ben Othman Houssein, Firmennummer CH-020.4.077.792-7, Kanton Zürich, phone 0796267082 | **No UID / CHE-MWST** on `.eu`. Live page already `PendingSlot` UID (`imprint/page.tsx:157-167`). Licence, dispute body, disclaimer slots stay TBC. Email on `.eu` is `info@vamostaxi.eu` — **do not copy** (D-06: `info@vamostaxi.site`, already `contact-channels.ts:15`) |
| `/about-us` | `/about` | CEO letter, marketing (“48,350+ Available Routes”, Europe-wide) | Do not invent extra claims. Product is Swiss airport transfer — do not expand into a Europe marketplace. Skip become-a-partner CTAs |
| `/informations/faq` | `/faq` | Booking/modify/cancel/pricing/confirmation FAQs; WhatsApp `+41796267082`; mentions PayPal, 24h full refund | Do not add PayPal if the product does not take PayPal. Do not invent lead times. Phone matches D-07. Email `contact@vamostaxi.eu` → keep `info@vamostaxi.site` |
| `/contact` | `/contact` | Form blurb only (“connect with us…”) | Channels already `PHONE_DISPLAY` / `WHATSAPP_HREF` / `SUPPORT_EMAIL` (`contact-channels.ts:6-18`) |
| `/company/terms-and-conditions` | `/terms` | Long English T&Cs (GmbH, same address, CH-020.4.077.792-7, phone, `vamostaxizurich@gmail.com`, site Vamostaxi.eu) | Audit (`CURRENT-SITE-AUDIT.md:86`) flags **Connecto white-label residue**. Do not invent replacement clauses. Do not port partner-driver / become-a-partner. Replace `.eu` / gmail contact with D-06/D-07 where the field is a contact fact, not a new legal rule |
| `/informations/data-protection` | `/privacy` | Long GDPR-style English; controller GmbH + address + `info@vamostaxi.eu` + `+41 79 626 70 82` | Same contact override. Do not invent UID. Cookies stay Phase 10 cookieless (D-33) — do not copy `.eu` cookie-list if we do not set those cookies |

**Also:** skip `/company/become-a-partner` (D-25). No Freshpage 301s (D-24). No photos from `.eu`.

**i18n:** D-27 = English from `.eu`, then de/fr/ar **same pass**, no extra legal clauses in translation.

**Conflict to resolve in plan (D-27 wins):** `LEGAL_LANGUAGES.imprint` is `["en","de"]` only, with an explicit I18N-08 comment that fr/ar of a binding imprint is an owner decision (`legal-languages.ts:19-23`). CONTEXT D-27 now orders fr/ar in the same extract pass. Planner: extract + translate imprint; then set `imprint: ["en","de","fr","ar"]`. German remains the binding imprint language if the extracted text says so — do not invent that sentence if `.eu` does not.

**Live imprint already has** address, register number, owner name (`imprint/page.tsx` + `imprint.dc.html:185-211`). `.eu` confirms those — keep. UID stays TBC.

### 6) What NOT to do

- No `.eu` DNS, zone, Worker bind, or 301s (D-01, D-24).
- No live Stripe keys, no `sk_live_`, no first real charge this sitting (D-11…D-14).
- No JSON-LD / schema.org (D-32).
- No Google Search Console submit (D-29). Remind after all V1 phases.
- No preview Workers (`vamos-front-changes` / `vamos-ops-changes` / `env.production` / `vamos-web-production`) (D-08).
- Never restore onto `yaumjzvylngfjhtuffqs`.
- Do not invent CHF, UID, licence, hours, or legal clauses.
- Do not treat `rate_versions` id 5 as the public-CHF flip (D-23).
- Do not add a `pricing_live` render branch in `respond.ts`.
- Do not let `PRICING_PREVIEW` set public CHF (`quote-publish.md`).
- Do not redesign `OpsPricing.dc.html`.
- Do not port become-a-partner.
- Do not cache `/api` quotes (`respond.ts` `no-store`).

### 7) Schema (SQL) — execute stops at owner apply

If VAT and/or public-CHF need SQL (they do):

```sql
-- packages/db/supabase/migrations/<new>_launch_public_chf_vat.sql
alter table public.settings
  add column if not exists public_chf boolean not null default false,
  add column if not exists vat_rate_bps integer not null default 81
    check (vat_rate_bps >= 0);

comment on column public.settings.public_chf is
  'D-18/D-19: public CHF display + checkout pricing_live AND. False until OPS Publish-as-flip. Independent of rate_versions.status (id 5 may already be live).';
comment on column public.settings.vat_rate_bps is
  'Swiss VAT on top of net, hundredths of a percent. Default 81 = existing CH_VAT_RATE_BPS. Not an invented rate.';
```

- Table: `public.settings` (singleton `id=1`).
- Columns: `public_chf`, `vat_rate_bps`.
- **No** `pricing_live` column on `rate_versions` (comment at `20260823000008_rate_versions.sql:35-36`: live = exactly one `status='live'`).
- **Execute / apply:** stop and hand the migration to the owner on project **`yaumjzvylngfjhtuffqs`**. Agent does not apply, restore, or reset that project.

### 8) www 301 (discretion)

`wrangler.jsonc:93-94` binds both `vamostaxi.site` and `www.vamostaxi.site` as custom domains. Middleware has **no** www→apex redirect (search `www` in `middleware.ts` = 0). D-05: only number a Cloudflare DNS/redirect click **if** `curl -I https://www.vamostaxi.site` is not already 301 to `https://vamostaxi.site`. Do not touch DNS speculatively.

## Standard Stack

No new runtime libraries.

### Core

| Piece | Pin / location | Purpose | Why Standard |
|-------|----------------|---------|--------------|
| Worker `vamos` | `wrangler.jsonc` `env.staging.name` | Only public+ops Worker | D-08 |
| `DEPLOY_ENV` | `vars` `"staging"` on `vamos` | Must **not** remain the public noindex key | Host split instead of `env.production` |
| `PRICING_PREVIEW` | `"true"` on `vamos` today | Draft display for ops | Host-gate; must not set `public_chf` |
| `publishRateVersion` | `ops/pricing/actions.ts` | draft→live + public CHF | Existing completeness + trigger |
| `formatAmount` | `lib/currency.ts` | `null` → `CHF 000` | Law 04 |
| `CH_VAT_RATE_BPS` | `lib/checkout/vat.ts` | Fallback 81 | D-22 seed |
| Next `sitemap.ts` / `robots.ts` | App Router MetadataRoute | XML + robots | Filter, don’t replace |
| `PUBLIC_ROUTES` / `buildAlternates` | `lib/metadata.ts` | hreflang | Do not shrink |

### Supporting

| Piece | When to use |
|-------|-------------|
| `isDashboardHost` | Every noindex / preview decision |
| `PendingSlot` | Fields `.eu` lacks (UID, licence) |
| `contact-channels.ts` | Phone / WhatsApp / `info@vamostaxi.site` |
| `HYPERDRIVE_NOCACHE` | Quote reads after Publish (`quote-publish.md`) |
| Vitest + Playwright | Unit (vat, derivePricingLive, formatAmount) + integration (robots, sitemap) |

### Alternatives considered

| Instead of | Rejected | Why |
|------------|----------|-----|
| Deploy `env.production` to drop noindex | D-08 | Unused Worker; would also drop `PRICING_PREVIEW` globally |
| `rate_versions.status` as public-CHF flag | D-23 | Id 5 already live |
| Worker var `PUBLIC_CHF` | D-18 | Publish click cannot flip a wrangler var |
| Null totals inside `respond.ts` | `respond.ts:12-14` | Forbidden second branch |
| Invented 7.7% VAT | D-22 | Code is 81 bps |
| Freshpage 301 map | D-24 | Out of scope |
| JSON-LD | D-32 | Out of scope |

**Installation:** none.

## Package Legitimacy Audit

No new packages. Phase configures existing Worker / Next / Postgres.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Customer → vamostaxi.site (Worker vamos)
             ├─ middleware: NO noindex (D-03)
             ├─ GET /sitemap.xml  → SITEMAP_ROUTES only (D-30)
             ├─ GET /robots.txt   → allow marketing; disallow account/checkout (discretion)
             ├─ GET marketing/legal HTML
             └─ POST /api/quote
                    ├─ preferDraft = false on public host
                    ├─ pricing_live = (status==='live') AND settings.public_chf
                    └─ widget: null totals → formatAmount → "CHF 000"
                         until Publish-as-flip

Staff → dashboard.vamostaxi.site (same Worker vamos)
             ├─ middleware: ALWAYS noindex (D-04)
             ├─ PRICING_PREVIEW may show draft numbers (not public_chf)
             └─ POST publishRateVersion
                    ├─ completeness gaps empty
                    ├─ rate_versions.status = 'live'   (trigger + one-live index)
                    └─ settings.public_chf = true      (D-18 same switch)

Owner apply (stop here):
  migration on yaumjzvylngfjhtuffqs → settings.public_chf + vat_rate_bps
```

### Pattern 1: Public 000 is null through `formatAmount`

**What:** Never invent a figure. `amount == null` → `000`.
**When:** Until `settings.public_chf` is true after owner Publish.
**Example:** `BookingBoard` already does this when `total_rappen` is null (`BookingBoard.tsx:5, 449-450`). Force null when `!pricing_live`.

### Pattern 2: Host-split, one Worker

**What:** Same `vamos` process. Branch on `isDashboardHost`, not on deploying a second env.
**When:** noindex, `preferDraft`.

### Pattern 3: Sitemap filter, not a second list for hreflang

**What:** `SITEMAP_ROUTES ⊂ PUBLIC_ROUTES`. `buildAlternates` unchanged.

### Anti-patterns

- **Using `env.production` as “real go-live”.** Forbidden (D-08).
- **Treating id 5 live as public CHF.** Forbidden (D-23).
- **Copying `info@vamostaxi.eu` or PayPal** into `.site` because `.eu` had them.
- **Filling UID `CHE-296.035.710` from the DC mock** — live page correctly uses `PendingSlot`; `.eu` imprint has no UID.
- **Redesigning OpsPricing** to add VAT.

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Public 000 | Custom “coming soon prices” UI | `formatAmount(null)` | Law 04 |
| Indexing split | Second Worker / Access app | `isDashboardHost` + header | One Worker |
| Sitemap | New crawler stack | Filter `sitemap.ts` | Already emits XML |
| VAT math | New gross/net engine | `vatOnTopRappen` with injected bps | Tests already lock 8.1% |
| Legal layout | New page templates | Existing `/imprint` `/terms` `/faq` `/about` `/contact` + i18n | Four languages, PendingSlot |
| Publish | SQL in a merge | `publishRateVersion` + owner click | Runbook |

## Runtime State Inventory

| Category | Items found | Action required |
|----------|-------------|-----------------|
| Stored data | `public.settings` singleton; `rate_versions` (CONTEXT: id 5 live); no `public_chf` / `vat_rate_bps` | Migration; **owner apply** on `yaumjzvylngfjhtuffqs` |
| Live service config | Worker `vamos` `DEPLOY_ENV=staging`, `PRICING_PREVIEW=true`, custom domains `.site` / `www` / `dashboard` | Code change on this Worker only. Do not deploy `env.production` |
| OS-registered state | None — verified N/A for this phase | — |
| Secrets/env vars | Stripe **test** publishable in `vars`; secrets via `wrangler secret put` | Leave test. Agent never `secret put` live keys |
| Build artifacts | OpenNext `.open-next/` | Normal `apps/web` deploy to `vamos` |

## Common Pitfalls

### Pitfall 1: `DEPLOY_ENV=staging` noindex on the live public host
**What goes wrong:** Google keeps seeing noindex after “go live”.
**Why:** Both `applyStagingNoindex` and the final middleware block key off `DEPLOY_ENV`, and `vamos` is `env.staging`.
**How to avoid:** Host split. Update **both** call sites. Flip the Playwright tests that require public noindex.
**Warning signs:** `curl -I https://vamostaxi.site` still has `X-Robots-Tag: noindex`.

### Pitfall 2: Id 5 live ⇒ public CHF
**What goes wrong:** Home/quote shows 80/100/130/150 (or other real totals) before owner Publish.
**Why:** Board renders `total_rappen`; engine `pricing_live` follows `status`.
**How to avoid:** `settings.public_chf` default false; AND into public `pricing_live`; null display.
**Warning signs:** Any public `CHF` figure other than `000` before the numbered Publish gate.

### Pitfall 3: `PRICING_PREVIEW=true` on public host
**What goes wrong:** Draft numbers appear on `vamostaxi.site` without Publish.
**How to avoid:** `preferDraft` only on dashboard host.
**Warning signs:** Public quote JSON `rate_version.status === "draft"` with non-null totals.

### Pitfall 4: Shrinking `PUBLIC_ROUTES` to fix sitemap
**What goes wrong:** hreflang disappears on checkout/account; tests and `buildAlternates` break.
**How to avoid:** Filter `sitemap.ts` only. Rewrite sitemap tests.

### Pitfall 5: Invented UID / VAT / floors
**What goes wrong:** Legal or CHF fiction.
**How to avoid:** UID TBC; VAT default 81 bps from `vat.ts`; no 80/100/130/150 in UI.

### Pitfall 6: Applying SQL on live Zurich without owner
**What goes wrong:** Unreviewed schema on `yaumjzvylngfjhtuffqs`.
**How to avoid:** Execute stops at owner apply. Never restore onto that project.

### Pitfall 7: `respond.ts` second branch
**What goes wrong:** Quote HTTP disagrees with the widget contract.
**How to avoid:** Flag + null rappen. Widget already knows 000.

## Code Examples

### Host-split noindex (planner shape)

```ts
// middleware.ts — both applyStagingNoindex and the final-response block
function applyIndexingHeaders(request: NextRequest, response: NextResponse): NextResponse {
  if (isDashboardHost(request) || process.env.DEPLOY_ENV === "ops-changes") {
    response.headers.set("X-Robots-Tag", "noindex");
  }
  return response;
}
```

Public `vamostaxi.site` must not enter that header even when `DEPLOY_ENV==="staging"`.

### Publish-as-flip (planner shape)

```ts
await asStaff(env, claims, async (tx) => {
  await tx`update public.rate_versions set status = 'live' where id = ${id}`;
  await tx`update public.settings set public_chf = true where id = 1`;
});
```

Completeness gaps still block (existing). Do not set `public_chf` from `PRICING_PREVIEW`.

### Sitemap allowlist

```ts
const SITEMAP_ROUTES = [
  "/", "/about", "/faq", "/contact", "/terms",
  "/privacy", "/imprint", "/cookies", "/cancellation",
] as const satisfies readonly PublicRoute[];
```

`PUBLIC_ROUTES` unchanged.

## State of the Art

| Old (ROADMAP / comments) | This phase | Impact |
|--------------------------|------------|--------|
| `vamostaxi.eu` live + Freshpage 301s + GSC submit | `.site` public, no `.eu`, sitemap file only | CONTEXT overrides LAUNCH-05 text |
| `env.production` undefined `DEPLOY_ENV` ⇒ indexable | Stay on `vamos` / `env.staging`; host-split noindex | D-08 |
| `pricing_live` ≡ live rate row | `pricing_live` ≡ live row **AND** `settings.public_chf` | D-18/D-19/D-23 |
| VAT constant 81 | Same number, owner-editable on OPS | D-22 |

**Deprecated/outdated:** ROADMAP hostname `vamostaxi.eu` for Phase 11; middleware comment that production is the only indexable env.

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | Hosted `rate_versions` id 5 is live with a real matrix (CONTEXT D-23; not SELECTed this session) | Finding 1 | If no live row, public 000 might already hold without `public_chf` — flag still required so a later publish cannot surprise |
| A2 | `www.vamostaxi.site` → apex 301 may already work at the zone | www 301 | Extra DNS click if broken; skip if `curl -I` is already 301 |
| A3 | `.eu` “48,350+ routes” / PayPal / gmail are not product facts for `.site` | Extract | Copying them would ship false claims |

## Open Questions

1. **Imprint fr/ar vs I18N-08**
   - What we know: `LEGAL_LANGUAGES.imprint` is en/de; D-27 orders four languages.
   - Recommendation: D-27 wins; translate in the same pass; do not invent clauses.
2. **VAT on `settings` vs `settings_versions`**
   - What we know: checkout computes VAT at intent; snapshots omit `vat_rappen`.
   - Recommendation: `settings.vat_rate_bps` (smallest). Charged rappen pins the sale.
3. **WhyVamos hardcoded `CHF 000` after Publish**
   - What we know: decorative idle, not a quote.
   - Recommendation: leave 000. Do not invent a floor for the animation.

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Worker `vamos` + `.site` routes | LAUNCH-05 | ✓ in wrangler | wrangler 4.124.0 | — |
| Supabase `yaumjzvylngfjhtuffqs` | VAT + `public_chf` migration | ✓ (owner apply) | — | Execute stops |
| `vamostaxi.eu` HTTP | Copy extract | ✓ 200 on 2026-09-13 | Freshpage | TBC if empty |
| Stripe live | Out of scope | test only | — | Stay test |
| Search Console | Out of scope | — | — | Remind after V1 |
| slopcheck / new npm | N/A | — | — | No installs |

**Missing dependencies with no fallback:** owner apply of SQL on `yaumjzvylngfjhtuffqs`; owner Publish click; owner later live Stripe (not this phase).

## Validation Architecture

`.planning/config.json` `workflow.nyquist_validation`: **true**.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.11 (unit) + Playwright 1.62.1 (integration) |
| Config | `apps/web/package.json` scripts `test`; Playwright specs under `apps/web/tests/integration/` |
| Quick run | `pnpm --filter web test` (vat, currency, rateBook, engine, intent) |
| Full suite | `pnpm --filter web test` + Playwright `public-routes`, `dev-exclusion`, `ssr-locale` sitemap/robots |

### Phase Requirements → Test Map

| Req ID | Behavior | Test type | Automated command / assertion | File exists? |
|--------|----------|-----------|-------------------------------|--------------|
| LAUNCH-06 / D-19 | Public amounts `CHF 000` until `public_chf` | unit | `formatAmount(null)==="CHF 000"`; board/engine: `!public_chf` ⇒ `pricing_live false` and null totals on public path | ⚠️ extend `currency` / `engine.test.ts` / BookingBoard path — Wave 0 |
| LAUNCH-06 / D-18 | Publish sets live **and** `public_chf` | unit | `publishRateVersion` updates both; `PRICING_PREVIEW` does not | ❌ Wave 0 (`actions.ts` untested for the new column) |
| LAUNCH-06 / D-23 | Id 5 live alone does not flip public CHF | unit | `derivePricingLive(live) && !public_chf` ⇒ public not live | ❌ Wave 0 |
| LAUNCH-06 / D-22 | VAT default 81 bps; owner % used | unit | Keep `vat.test.ts` 8.1% identities; add injected-bps case | ✅ `vat.test.ts` (extend) |
| LAUNCH-05 / D-03 | `vamostaxi.site` has **no** `X-Robots-Tag: noindex` | integration | Invert `dev-exclusion.spec.ts` public assertions; dashboard still noindex | ⚠️ must change existing tests |
| LAUNCH-05 / D-04 | `dashboard.vamostaxi.site` stays noindex | integration | Header present on dashboard host | ❌ Wave 0 (host-specific) |
| LAUNCH-05 / D-30 | `sitemap.xml` allowlist only | integration | Rewrite `public-routes.spec.ts` sitemap count; assert no `/checkout` `/sign-in` `/account` | ⚠️ must change |
| LAUNCH-05 / D-31 | Forbidden paths absent from XML | integration | Same spec | ⚠️ |
| Discretion | `/coming-soon` + HTML `/sitemap` in `PUBLIC_ROUTES`, out of XML | unit + integration | `PUBLIC_ROUTES` still contains them; sitemap does not | ⚠️ |
| D-25…D-28 | Extract no-invent: UID still TBC; no `.eu` mailbox; no become-a-partner | grep / page test | imprint contains `PendingSlot` / `data-tok`; no `info@vamostaxi.eu`; no partner route | ❌ Wave 0 |
| D-19 floors | No public 80/100/130/150 | grep | `apps/web/components` + i18n messages | manual + grep |
| D-11 | Stripe remains test | config | `wrangler.jsonc` `env.staging` still `pk_test_`; no `sk_live` | grep |

### Sampling Rate

- **Per task commit:** `pnpm --filter web test` (vat + quote + currency)
- **Per wave merge:** Playwright sitemap + robots/noindex specs
- **Phase gate:** Full suite green; live `curl -I` on `https://vamostaxi.site` (no noindex) and `https://dashboard.vamostaxi.site` (noindex); public quote shows `CHF 000` until owner Publish; **migration not applied by agent**

### Wave 0 Gaps

- [ ] Unit: public `pricing_live` AND `settings.public_chf`
- [ ] Unit: `publishRateVersion` sets `public_chf`
- [ ] Unit: `preferDraft` false on public host
- [ ] Rewrite `tests/integration/dev-exclusion.spec.ts` public noindex expectations
- [ ] Rewrite `tests/integration/public-routes.spec.ts` sitemap allowlist (stop equating XML to full `PUBLIC_ROUTES`)
- [ ] Rewrite `auth-flows.spec.ts` “sitemap includes /sign-up”
- [ ] Extract no-invent assertions (UID TBC, no `.eu` email, no partner)
- [ ] Optional: `robots.ts` extra disallows tests

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes (ops Publish) | Existing `requireAdminClaims` / `asStaff` on `publishRateVersion` |
| V3 Session Management | no new | Unchanged |
| V4 Access Control | yes | Only admin publishes; `public_chf` / `vat_rate_bps` writes via staff tx |
| V5 Input Validation | yes | `vat_rate_bps >= 0`; no invented CHF; completeness trigger unchanged |
| V6 Cryptography | no new | Stripe HMAC / quote HMAC unchanged |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Public indexing of dashboard | Information disclosure | Host noindex + existing staff gate (`middleware.ts:538-541`) |
| Preview env leaking public CHF | Information disclosure | Host-gate `preferDraft`; `public_chf` default false |
| Unauthorized Publish | Elevation of privilege | Existing admin claims; do not add a public flip API |
| Invented VAT / UID | Tampering / repudiation | Default 81 from code; UID stays TBC |
| Accidental live Stripe | Elevation / financial | D-11; no secret put this phase |
| Restore onto live Zurich | Destruction | Never `yaumjzvylngfjhtuffqs` |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/11-launch-cutover/11-CONTEXT.md` — locked D-01…D-35
- `.planning/REQUIREMENTS.md:129-130` — LAUNCH-05/06
- `apps/web/lib/pricing/priceQuote.ts:316`, `rateBook.ts:216-220`, `engine.ts:150-207`
- `apps/web/lib/currency.ts:54-63`, `lib/fx/format.ts:21-46`
- `apps/web/components/home/BookingBoard.tsx:449-491`, `WhyVamos.tsx:276-277`
- `apps/web/middleware.ts:193-207, 334-338, 551-562`
- `apps/web/wrangler.jsonc` `env.staging` / `env.production`
- `apps/web/lib/metadata.ts`, `app/sitemap.ts`, `app/robots.ts`
- `apps/web/lib/checkout/vat.ts`, `vat.test.ts`
- `apps/web/app/[locale]/(ops)/ops/pricing/actions.ts`, `lib/ops/pricing.ts`
- `packages/db/supabase/migrations/20260823000004_settings.sql`, `20260823000008_rate_versions.sql`
- `docs/runbooks/quote-publish.md`
- `apps/web/lib/contact-channels.ts`, `legal-languages.ts`, `imprint/page.tsx`
- Live fetch 2026-09-13: `https://www.vamostaxi.eu/{informations/imprint,about-us,informations/faq,contact,company/terms-and-conditions,informations/data-protection}` HTTP 200

### Secondary (MEDIUM confidence)

- `docs/brief/CURRENT-SITE-AUDIT.md` (2026-07-16) — identity table; Connecto residue; no UID listed
- CONTEXT D-23 hosted id 5 live — not re-queried against Postgres this session

### Tertiary (LOW confidence)

- www→apex 301 currently working — not `curl -I`’d this session

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — in-repo pins
- Architecture: HIGH — one Worker, host split, settings flag
- Pitfalls: HIGH — noindex + id 5 + sitemap tests are load-bearing
- Hosted id 5 matrix / www 301: MEDIUM

**Research date:** 2026-09-13
**Valid until:** 2026-10-13 (or next CONTEXT change)

## RESEARCH COMPLETE

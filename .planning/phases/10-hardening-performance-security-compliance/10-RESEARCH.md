# Phase 10: Hardening — Performance, Security & Compliance - Research

**Researched:** 2026-09-12
**Domain:** Cloudflare Workers edge cache / WAF / headers, Turnstile + rate-limit bindings, `consent_log` / `record_consent`, secret-header health, Supabase copy-restore
**Confidence:** HIGH on live-stack mapping; MEDIUM on zone WAF/backup-dashboard clicks (not readable from this repo)

<user_constraints>
## User Constraints (from CONTEXT.md)

**CRITICAL:** CONTEXT.md D-01…D-47 are locked. Do not reopen. Do not invent CHF, legal copy, or photos. Do not bind `vamostaxi.eu`. Do not use `sk_live_`. Hyperdrive never `:6543`. Project `yaumjzvylngfjhtuffqs` Zurich.

### Locked Decisions

#### Cookie banner + consent_log (SITE-08)

- **D-01:** Cloudflare Web Analytics stays cookieless. Do not invent a tracking cookie for it.
- **D-02:** Sentry stays off until `consent_log` is live and verified. Not this week if consent is not shipping first.
- **D-03:** Dismiss = necessary-only, same as Accept. Site works either way. Both write `consent_log`.
- **D-04:** Reuse existing `consent_log` + `record_consent()`. Do not create a second table. `policy_version` is a dated stamp already used in tests. Do not invent legal copy.
- **D-05:** No fake toggles and no fake cookies. Banner lists only cookies we really set: language, auth session, `consent_subject`. No analytics/marketing/functional toggles. Do not build marketing pixels or third-party analytics cookies to fill a grid.
- **D-06:** New production banner (`--vt-*` tokens, four languages). Real `policy_version`. Real Accept/Dismiss → `record_consent`. Not a DC gallery mock.
- **D-07:** Banner on public `vamostaxi.site` + `www` only. Dashboard has no banner.
- **D-08:** Returning visitor with a valid `consent_subject` cookie: no banner. `/cookies` can still write a new row (`settings_change`). Withdrawal is a new row, never an UPDATE.
- **D-09:** `consent_subject` cookie: 1 year, first-party, HttpOnly, Secure. Signup inserts a new `consent_log` row with `customer_id`.
- **D-10:** Store truncated IP now: Cloudflare connecting IP, last octet / IPv6 `/64` zeroed, then `ip_truncated`.
- **D-11:** `record_consent` abuse: Cloudflare rate limit per IP + per `consent_subject`, same family as quote limiter.
- **D-12:** Language + auth session + `consent_subject` are Necessary. Banner copy says that. No extra cookies.

#### Rate limits + Turnstile (LAUNCH-02)

- **D-13:** Rate-limit: quote + geo + contact + reviews/submit + `record_consent`. Checkout/pay and Stripe webhook stay as they are (intent + Stripe signature). Staff APIs stay `withStaff`, no public limiter.
- **D-14:** Turnstile: contact stays. Add on `/review` submit and cookie Accept. No Turnstile on checkout or manage-booking cancel.
- **D-15:** Stripe webhook signature verification is already done. Do not add Turnstile or a second verifier.
- **D-16:** Rate-limit miss: existing product error `429 rate_limited`, same family as quote. No invented copy.

#### Health + 10k (LAUNCH-01, LAUNCH-03)

- **D-17:** You watch errors/uptime in Cloudflare (Web Analytics + Workers metrics + logs). No new paid dashboard. No pager. No extra fail email.
- **D-18:** Health check is a secret-header Worker route. Missing/wrong header looks like 404. Never a public `/health`. Keep `/api/dev/db-smoke` as the leak 404.
- **D-19:** You put the secret in your terminal (`wrangler secret put`). Agent never sees the value.
- **D-20:** Caller = whoever has the secret header. Cloudflare cron may hit it. Browser never.
- **D-21:** Authorized body: `ok` true/false plus which of db / payments / maps failed. No connection strings, no Stripe ids.
- **D-22:** Pings: Hyperdrive `SELECT 1` + Stripe test retrieve (no charge) + Mapbox token check. Fail closed per dependency.
- **D-23:** 10k concurrent: cache public marketing HTML at the edge. Measure in Cloudflare after ship. No public load-test URL. Database barely touched on browse.

#### Edge cache (LAUNCH-01)

- **D-24:** Cache marketing only: home, about, FAQ, services, legal. Never cache `/api`, `/checkout`, `/confirmation`, `/bookings`, `/account`, dashboard.
- **D-25:** Logged-in / personal HTML: `no-store` (never CDN-cache tickets).
- **D-26:** After a visual ship: new Worker version + `?nocache=`. Do not tell customers to hard-refresh as the fix.
- **D-27:** `/photos/site/*.jpg` long cache (R2, not bookings). Legal pages cache like home. Hashed JS/CSS chunks cache. `/api/fx` short TTL. Geo suggest/retrieve uncached.

#### WAF + headers

- **D-28:** Cloudflare managed WAF on `vamostaxi.site` + www + dashboard. Skip `/api/stripe/webhook`. Do not touch `vamostaxi.eu`.
- **D-29:** If WAF blocks a real quote or pay: loosen that rule. Funnel wins. No checkout captcha wall.
- **D-30:** `workers.dev` is not a customer site. No extra WAF work there.
- **D-31:** Dashboard: same zone WAF only. No country block. Sign in from anywhere.
- **D-32:** HSTS on `vamostaxi.site` + www + dashboard. Not `vamostaxi.eu`.
- **D-33:** Tight CSP allowlisting Stripe, Turnstile, Mapbox. If checkout breaks, loosen that directive. Funnel wins.
- **D-34:** Staging stays `X-Robots-Tag: noindex` until Phase 11.
- **D-35:** Cookies: Secure + HttpOnly where the Worker can (session, `consent_subject`). Language may stay JS-readable. SameSite=Lax.
- **D-36:** Deny framing except Stripe’s own frames on `/checkout/payment`.
- **D-37:** Referrer-Policy `strict-origin-when-cross-origin`.
- **D-38:** Camera / mic / geo permissions off. Mapbox is JS, not the browser GPS prompt.

#### Backups + runbook (LAUNCH-04, LAUNCH-07)

- **D-39:** Practice restore on a Supabase **copy**. Live Zurich `yaumjzvylngfjhtuffqs` bookings stay. You click numbered steps. Agent never restores over live.
- **D-40:** Real bookings already exist. There is no “before real bookings.” Never wipe live.
- **D-41:** One practice restore is enough unless you ask again.
- **D-42:** Postgres only. Photos stay on live R2.
- **D-43:** Use whatever backup Supabase actually has. Do not buy PITR unless you say so that sitting. Do not dump the DB onto this Mac.
- **D-44:** Runbook in `docs/runbook/` (refunds, resend mail, assign, restore), linked from README. Agent writes, you review. English. Documents live Ops buttons only. No invented CHF. No fake chauffeur names. Do not rebuild those products.
- **D-45:** Restore steps = Supabase dashboard numbered clicks for a copy restore. Live Zurich never on the destructive path.
- **D-46:** No screenshots in the runbook. Numbered clicks + expected screen text.
- **D-47:** Support in the runbook: `info@vamostaxi.site` until you change it. Public phone `+41 79 626 70 82`.

### Claude's Discretion

- Exact health header name, cron expression, and CF rate-limit binding ids — as long as D-18…D-22 hold.
- CSP directive list — as long as Stripe/Turnstile/Mapbox work and D-33 holds.
- Banner layout within `--vt-*`, four languages, no fake toggles (D-05, D-06).

### Deferred Ideas (OUT OF SCOPE)

- Sentry: after `consent_log` is live and verified (D-02). Not Phase 11 DNS.
- Phase 11: `vamostaxi.eu` DNS, live Stripe keys, `pricing_live`, indexing.
- PITR purchase: only if you say so in the dashboard sitting.
- Phase 9 leftover: live Ops Complete click on `VT-26-0723` still needs dashboard login (browser session blocked). Product is on `main` (`a1d6c56`).
</user_constraints>

<architectural_responsibility_map>
## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cookie banner UI | Browser/Client | Frontend Server | HttpOnly `consent_subject` is set by the Worker; banner show/hide is SSR from that cookie (JS cannot read it). |
| `record_consent` write | API/Backend (Worker) | Database/Storage | Only `record_consent()` may INSERT. Subject comes from GUC, never the JSON body. |
| Rate limits | CDN/Static (Workers Rate Limiting binding) | API/Backend | Existing `QUOTE_RATE_LIMITER` family; per-colo, eventually consistent. |
| Turnstile on forms + Accept | Browser/Client widget | API/Backend siteverify | Fail-closed helper already in `lib/turnstile.ts`. Quote ladder stays fail-open. |
| Stripe webhook | API/Backend | — | Signature already verified. WAF skip is zone-level, not app code. |
| Marketing HTML cache | CDN/Static | Frontend Server | Edge cache so 10k browse barely touches Postgres. Worker still runs (`gatePublicRequest`). |
| Personal HTML `no-store` | Frontend Server | CDN/Static | Auth cookie present → never CDN-cache tickets. |
| Health probe | API/Backend | CDN/Static (cron may call) | Secret header; missing header is empty 404. |
| WAF / HSTS | CDN/Static (zone) | — | Dashboard/API on `vamostaxi.site` zone. Not wrangler.jsonc. Not `vamostaxi.eu`. |
| Security headers (CSP, framing, Referrer, Permissions-Policy) | Frontend Server (`next.config` / middleware) | CDN/Static | Defense in depth next to zone HSTS. |
| Backups / restore drill | Database/Storage (Supabase dashboard) | — | Copy restore. Agent never restores over live. |
| Runbook | Docs | — | `docs/runbook/` English, numbered clicks, live Ops buttons only. |
</architectural_responsibility_map>

<research_summary>
## Summary

Phase 10 is not a greenfield stack choice. The schema (`consent_log` + `record_consent`), quote rate-limit bindings, contact/review Turnstile helper, Stripe webhook verifier, leak gate (`/api/dev` → 404), staging noindex, and photo/FX cache headers already exist on `gsd/phase-10-hardening`. Research is how to wire the locked decisions onto that stack without a second table, a public `/health`, a load-test URL, PITR, Sentry, or `vamostaxi.eu`.

The standard approach on Workers is: zone managed WAF + Workers Rate Limiting bindings (period 10 or 60 only) + Turnstile siteverify in the existing handlers + Cache-Control / Cache Rules for marketing GET HTML (Worker still runs) + `no-store` when an auth cookie is present. Consent is a Worker-set HttpOnly cookie plus one SECURITY DEFINER call with `request.vamos.consent_subject` bound in the same transaction. That GUC is **not** set by `packages/db/src/identity.ts` today — without it every `record_consent` raises `P0001`.

**Primary recommendation:** Reuse the two existing rate-limit bindings with key prefixes; extend `lib/turnstile.ts` (fail-closed) for review + Accept; mint `consent_subject` then `set_config` inside `asAnon`/`asCustomer`; put health at `/api/internal/health` (not `/api/dev`); cache marketing HTML with a cache key that varies on locale + consent-cookie **presence** and bypasses on `sb-*-auth-token`; WAF skip only `/api/stripe/webhook`; restore is a Supabase **copy**.
</research_summary>

<standard_stack>
## Standard Stack

No new runtime libraries. Phase 10 configures and reuses what is already bound.

### Core

| Library / platform | Version / pin | Purpose | Why Standard |
|--------------------|---------------|---------|--------------|
| Cloudflare Workers Rate Limiting binding | wrangler `4.124.0`; schema `simple.period` ∈ {10, 60} | Per-key counters | In-process `env.QUOTE_RATE_LIMITER.limit({ key })`. Already 8/60 + 4/60. |
| Cloudflare Turnstile siteverify | `https://challenges.cloudflare.com/turnstile/v0/siteverify` | Bot check on writes | Contact already fail-closed in `lib/turnstile.ts`. |
| `public.record_consent(...)` | migration `20260823000018_consent_log.sql` | Only write path into `consent_log` | Append-only; subject/customer never arguments. Live Zurich: table exists, **0 rows**. |
| OpenNext custom Worker | `apps/web/worker.ts` | `gatePublicRequest` then OpenNext | Leak 404 for `/api/dev`; must keep running on cached HTML. |
| Stripe SDK | `stripeFromEnv` + `constructEventAsync` | Test retrieve + webhook HMAC | Webhook done (D-15). Health uses retrieve, never a charge. |
| Hyperdrive | `HYPERDRIVE` / `HYPERDRIVE_NOCACHE` | `SELECT 1` health; consent write on nocache | Direct Postgres URL only. Never `:6543`. |
| Supabase dashboard backups | project `yaumjzvylngfjhtuffqs`, region `eu-central-2`, Postgres 17, `ACTIVE_HEALTHY` | Daily backups as the plan already has | D-43: do not buy PITR; do not `pg_dump` onto the Mac. |

### Supporting

| Piece | Version / location | Purpose | When to Use |
|-------|--------------------|---------|-------------|
| `lib/abuse/rate-limit.ts` | quote 8/60 vs bare 4/60 | Bucket + fail-open on throw | Quote/geo (already). Writes should fail **closed**. |
| `lib/turnstile.ts` | actions `"contact" \| "checkout"` | Fail-closed siteverify | Contact, review, cookie Accept. |
| `lib/abuse/turnstile.ts` | quote ladder | Fail-open below threshold | Quote only. Not banner, not contact. |
| `crypto.subtle.timingSafeEqual` | Web Crypto | Secret header compare | Health (workers-best-practices). Isolation-probe already uses this. |
| `next.config.ts` `headers()` | Next  on Workers | CSP, HSTS, Referrer, Permissions-Policy, Cache-Control | Plus middleware for staging noindex (already). |
| Cloudflare zone WAF | dashboard / API | Managed rules + skip webhook | Not wrangler.jsonc. Not `workers.dev`. |
| `docs/runbook/` | new dir (D-44) | Refund / resend / assign / restore | Distinct from existing `docs/runbooks/` (stripe/quote). |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Reuse `QUOTE_RATE_LIMITER` + key prefixes | New bindings `namespace_id` 1003+ | wrangler `ratelimits` are **not inherited** — every named env (`front`, `staging`, `production`, `ops-changes`) must repeat them. Prefixes keep one family (D-11/D-13) without four-way copy-paste. |
| Zone Cache Rules that skip the Worker | Cache API inside `worker.ts` | Skipping the Worker skips `gatePublicRequest` (mock leaks, locale 308). Do not skip the Worker. |
| Public `/health` or `/api/dev/health` | Secret-header `/api/internal/health` | `/health` is D-18 forbidden. `/api/dev/*` is always empty 404 (`dc-mock-urls.ts`). |
| PITR / `pg_dump` to R2 or this Mac | Dashboard copy restore | Locked out by D-39…D-43. |
| Four-category DC mock banner | Two-button production banner | Mock has Functional/Analytics/Marketing switches. D-05 forbids that grid. |
| Quote Turnstile ladder on Accept | `verifyTurnstile` fail-closed | Fail-open would let bots fill append-only `consent_log`. |
| Sentry this phase | Cloudflare logs/metrics | D-02 / D-17. |

**Installation:** none. Do not add packages for WAF, CSP, or consent.
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### System Architecture Diagram

```
Browser ──GET marketing──► Worker fetch (always)
                              │
                              ├─ gatePublicRequest (/api/dev → 404, leftover mocks)
                              ├─ middleware: locale 308, staging noindex, auth cookies
                              ├─ if sb-*-auth-token: Cache-Control: no-store
                              ├─ else marketing: Cache-Control public, s-maxage + SWR
                              │     CDN may reuse prior GET (vary: NEXT_LOCALE + consent_subject presence)
                              └─ HTML: banner iff consent_subject cookie missing/invalid
                                        (HttpOnly → must be SSR)

Browser ──POST /api/consent──► rate limit (prefix consent:) ──► Turnstile if Accept
                              │
                              ├─ mint/read consent_subject cookie (HttpOnly, Secure, Lax, 1y)
                              ├─ asAnon/asCustomer: set_config('request.vamos.consent_subject', uuid, true)
                              ├─ truncate CF-Connecting-IP → ip_truncated
                              └─ record_consent(necessary=true, functional=false, analytics=false, marketing=false, method, locale, policy_version, …)

Browser ──POST /api/contact|/api/reviews/submit──► rate limit ──► verifyTurnstile (fail-closed)
Stripe  ──POST /api/stripe/webhook──► WAF skip ──► constructEventAsync (already)
Cron/ops ──GET /api/internal/health + secret header──► SELECT 1 + stripe retrieve + Mapbox token
                              missing/wrong header → empty 404 (same family as leak 404)
```

### Recommended Project Structure

```
apps/web/
├── components/consent/          # production banner (not DC gallery). Two buttons. Four locales.
├── app/api/consent/route.ts     # POST record_consent; rate-limit; Accept Turnstile
├── app/api/internal/health/route.ts  # secret header; never /api/dev
├── lib/consent/                 # cookie name, policy_version stamp, IP truncate, GUC bind helper
├── lib/turnstile.ts             # extend TurnstileAction; reuse for review + Accept
├── lib/abuse/rate-limit.ts      # reuse bindings; key prefixes for contact/review/consent
├── next.config.ts               # CSP, HSTS, Referrer, Permissions-Policy, marketing Cache-Control
└── wrangler.jsonc               # HEALTH secret is wrangler secret put, not vars

docs/runbook/                    # D-44 (do not dump into docs/runbooks/)
├── refunds.md
├── resend-email.md
├── manual-assignment.md
└── restore-database.md
```

### Pattern 1: Bind consent subject in the identity transaction

**What:** `record_consent` reads `current_setting('request.vamos.consent_subject')`. Identity wrappers today set role + JWT / manage-token only — **not** this GUC. Routes must `set_config(..., true)` inside `asAnon` / `asCustomer` before calling the function.

**When to use:** Every consent write (banner Accept/Dismiss, `/cookies` `settings_change`, signup row).

**Example:**

```typescript
// Do not import @vamos/db from routes (D-08). Stay on asAnon/asCustomer.
await asAnon(env, async (tx) => {
  await tx`select set_config('request.vamos.consent_subject', ${subject}, true)`;
  await tx`select public.record_consent(
    ${true}, ${false}, ${false}, ${false},
    ${method}, ${locale}, ${policyVersion},
    ${null}, ${userAgent}, ${ipTruncated}
  )`;
});
```

`method` CHECK is `accept_all | reject_all | save_choices | settings_change`. With D-05 there are no category toggles, so **do not use `save_choices`**. Map Accept → `accept_all`, Dismiss/Necessary-only → `reject_all`, `/cookies` + footer `vamos:cookie-prefs` → `settings_change`. Category columns are identical for all three: necessary true, others false (D-03, D-05).

Signup (D-09): after auth, `asCustomer` + same GUC + `record_consent`. `customer_id` is taken from `app.uid()`, never an argument (tests already prove `p_customer_id` is `42883`).

### Pattern 2: Same rate-limit family, distinct keys

**What:** wrangler 4.124 schema: each binding needs `name`, `namespace_id` (string), `simple.limit`, `simple.period` 10 or 60. Bindings are **not inherited** across named envs. Live values:

| env | binding | namespace_id | limit/period |
|-----|---------|--------------|--------------|
| front / staging (`vamos`) / production / ops-changes | `QUOTE_RATE_LIMITER` | `"1001"` | 8 / 60 |
| same | `QUOTE_RATE_LIMITER_BARE` | `"1002"` | 4 / 60 |

`limit({ key })` counters are per key. Prefixes (`consent:${ip}`, `consent:${ip}:${subject}`, `contact:${ip}`, `review:${ip}`) share the family without new namespace ids.

**When to use:** D-13 surfaces. Quote/geo already call `wireRateLimitGuard` (unprefixed keys — leave them). Contact and reviews have Turnstile but **no** rate-limit guard today. Flight already limited — leave it; D-13 does not ask to remove it.

**Fail policy:** Quote `checkRateLimit` **fails open** on throw (funnel; Layer 1 WAF remains). Consent/contact/review are disk/email amplifiers — **fail closed** (`429 rate_limited`) if the binding throws. Same product code `rate_limited` (D-16).

### Pattern 3: Two Turnstile helpers, do not mix

**What:**

| Helper | Path | Policy | Use |
|--------|------|--------|-----|
| Fail-closed forms | `apps/web/lib/turnstile.ts` | Missing secret / non-200 / hostname mismatch → deny | contact (live), review (live, `action: "contact"`), cookie Accept |
| Fail-open ladder | `apps/web/lib/abuse/turnstile.ts` | Unopened account must not 403 the funnel | quote only |

Contact and review POST `application/x-www-form-urlencoded` to siteverify with `action`, `idempotency_key`, `remoteip`. Tokens are single-use: reset the widget after each attempt (`turnstile.reset(widgetId)`).

**When to use:** D-14. Extend `TurnstileAction` with `"consent"` (and `"review"` if the review widget `data-action` is changed in the same change). Until the review widget action changes, keep server `action: "contact"` so live submit does not 403. No Turnstile on checkout or manage-booking cancel. No Turnstile on Dismiss (D-14 says Accept); D-11 rate limit still covers Dismiss.

### Pattern 4: Cache marketing HTML without skipping the Worker

**What:** `worker.ts` always runs `gatePublicRequest`. Cloudflare cache in front of a Worker may reuse a prior GET **response**; it must not skip the Worker. Set `Cache-Control` on marketing GET. Custom cache key: `NEXT_LOCALE` value + **presence** of `consent_subject` (not the UUID — that would shard the cache per visitor). Bypass cache when `sb-yaumjzvylngfjhtuffqs-auth-token*` (or chunked `sb-*-auth-token`) is present → `private, no-store` (D-25).

**When to use:** `/`, `/about`, `/faq`, legal (`/terms`, `/privacy`, `/cookies`, `/cancellation`, `/imprint`). D-24 names “services”: there is **no** public `/services` route (only `/dev/home/services`). Do not invent the page. Cache the home services **section** as part of `/`. `/contact` is a form page — cache the HTML GET; POST stays uncached.

Do not cache `/api`, `/checkout`, `/confirmation`, `/bookings`, `/account`, dashboard.

Hashed `/_next/static/*` already long-cacheable. `/photos/[key]` already sends `public, max-age=31536000, immutable` for every `PHOTO_PREFIXES` key including `site/` (D-27). `/api/fx` already `public, max-age=3600`. Geo suggest/retrieve stay `force-dynamic` + rate-limit, no Cache-Control.

D-26: after a visual ship, new Worker version + `?nocache=` query (Cache-Control bypass / Cache-Tag purge if added). Do not tell customers to hard-refresh.

### Pattern 5: Secret-header health, leak-shaped 404

**What:** Discretion: header `X-Vamos-Health-Key`, secret binding `HEALTH_PROBE_SECRET` via `wrangler secret put` (owner types; agent never sees it). Route `GET /api/internal/health` — fetch allowed by `gatePublicRequest` (not `/api/dev`). Document navigation of `/api/*` already 404s. Missing/wrong header: `new Response(null, { status: 404 })` (same as `empty404()`). Compare with `timingSafeEqual` on equal-length SHA-256 digests so length of the secret does not leak.

Authorized JSON only: `{ ok, db, payments, maps }` booleans. Fail closed per probe. No connection strings, no Stripe ids.

Probes:

1. **db:** `asSystem` or `asAnon` on `HYPERDRIVE_NOCACHE` (or cached `HYPERDRIVE` — `SELECT 1` is not identity-sensitive) `select 1`.
2. **payments:** `stripeFromEnv(env).balance.retrieve()` — test key, no charge. Any throw → `payments: false`.
3. **maps:** Mapbox token metadata `GET https://api.mapbox.com/tokens/v2?access_token=…` (or equivalent token-validity GET). Do not geocode a customer address.

Cron: existing `scheduled` already runs hourly + `0 3 * * *`. Discretion: call the same `probeHealth(env)` from `scheduled` (in-process, no HTTP) **or** a Cloudflare cron that GETs the route with the header. Do not add a browser-reachable URL. D-17: watch Cloudflare observability (`wrangler.jsonc` `"observability": { "enabled": true }`) + Web Analytics. No pager.

Keep `apps/web/app/api/dev/db-smoke/route.ts` as the leak 404. Do not put health under `/api/dev`.

### Anti-Patterns to Avoid

- **Second consent table or direct INSERT:** `record_consent` is the only write path. Anon INSERT is `42501`.
- **Passing `consent_subject_id` / `customer_id` as RPC args:** not in the signature; would be a new migration, forbidden by D-04.
- **JS-readable “banner dismissed” cookie:** D-09 HttpOnly + D-12 no extra cookies. Returning visitor hide = SSR on cookie presence.
- **Porting CookieBanner.dc.html Manage preferences / category switches:** D-05 / D-06. Visual tokens and `data-ck-sheet` layout are fine; the four-toggle grid is not.
- **Public `/health` or health under `/api/dev`:** D-18 + leak gate.
- **Skip Worker on Cache Rules:** breaks `gatePublicRequest`.
- **CDN-caching HTML that `Set-Cookie`s a new `consent_subject`:** first visit mints a cookie — that response must be `private` / uncached. Only returning-visitor / no-banner HTML is cacheable (presence=1 variant).
- **WAF or HSTS on `vamostaxi.eu` or extra WAF on `workers.dev`:** D-28 / D-30 / D-32.
- **Turnstile or second verifier on Stripe webhook:** D-15. Skip WAF on that path so the HMAC is the only gate.
- **Country block on dashboard:** D-31.
- **`sk_live_`, bind `vamostaxi.eu`, Hyperdrive `:6543`, invent CHF/legal/photos.**
- **Restore over `yaumjzvylngfjhtuffqs` or `pg_dump` to this Mac:** D-39…D-43.
- **Sentry this phase:** D-02.
- **String-compare the health secret:** use `timingSafeEqual`.
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bot check | Custom proof-of-work / math CAPTCHA | Existing Turnstile widgets + `verifyTurnstile` | Tokens, hostname allow-list, single-use already handled. |
| Rate limit store | KV counters / Durable Object | Workers Rate Limiting binding | Already bound; period enum is 10 or 60 only. |
| Consent ledger | New table / UPDATE withdrawal | `consent_log` append-only + new row | Trigger + REVOKE already in later migrations. |
| Uptime SaaS | Pingdom / Better Uptime / Sentry | Cloudflare observability + secret health | D-17 / D-02. |
| HTML cache layer in Node | In-memory Map of pages | `Cache-Control` + CF cache | Workers isolates; global memo is per-isolate only (`/api/fx` already memos — leave it). |
| Backup to R2 from the Worker | Nightly `pg_dump` in Cron | Supabase dashboard backups | D-43. GSD-LAUNCH’s R2 dump is superseded. |
| WAF in wrangler.jsonc | Custom Worker WAF clone | Zone managed rules + skip path | WAF is zone, not a Worker binding. |
| Framing / CSP in every route | Ad-hoc `headers.set` | `next.config.ts` `headers()` + checkout exception | One list, funnel-wins loosen (D-33). |
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: `record_consent` without the GUC

**What goes wrong:** `P0001` “no consent subject bound to this request”. Banner POST 500s. Zero rows stay on live (verified: `consent_log` count = 0).
**Why it happens:** `packages/db/src/identity.ts` binds JWT / manage-token only. SQL tests set the GUC themselves.
**How to avoid:** Helper that mints/reads the cookie, then `set_config` inside the identity callback in the same transaction.
**Warning signs:** First Accept returns 500; logs show `P0001`.

### Pitfall 2: Caching first-visit HTML that Set-Cookies `consent_subject`

**What goes wrong:** Every visitor inherits someone else’s subject id, or CDN stores `Set-Cookie` and bypasses cache anyway (CF will not cache responses with `Set-Cookie` by default).
**Why it happens:** D-09 wants the cookie before the row; D-23 wants cached marketing HTML.
**How to avoid:** Mint cookie only when missing; that response is `private, no-store`. Cache key variant `consent_present=1` is the no-banner HTML and must **not** `Set-Cookie`.
**Warning signs:** `cf-cache-status: DYNAMIC` on every home GET; or two browsers share one subject.

### Pitfall 3: Health on `/api/dev` or missing-header ≠ 404

**What goes wrong:** `gatePublicRequest` returns empty 404 for `/api/dev/*` before the route runs. A 401 on wrong header enumerates the probe.
**Why it happens:** D-18 leak gate vs “secure health” instinct to 401.
**How to avoid:** `/api/internal/health`; wrong/missing header → empty 404.
**Warning signs:** `curl /api/dev/...` never hits probe code; `curl` without header returns 401 JSON.

### Pitfall 4: Mixing Turnstile helpers

**What goes wrong:** Banner Accept fail-open → bot `accept_all` rows (append-only, unbounded). Review `action` mismatch → every submit `challenge_failed`.
**Why it happens:** Two modules both named turnstile. Review already calls `verifyTurnstile` with `action: "contact"`.
**How to avoid:** Forms + Accept use `lib/turnstile.ts`. Change `data-action` and server action in the same commit. Reset widget after each POST.
**Warning signs:** `timeout-or-duplicate` on retry; review 403 after “fixing” action on one side only.

### Pitfall 5: WAF on webhook or `vamostaxi.eu`

**What goes wrong:** Stripe retries fail; or we touch a zone we do not operate.
**Why it happens:** Managed rules inspect POSTs; webhook has no Turnstile by design.
**How to avoid:** Custom skip: `http.request.uri.path eq "/api/stripe/webhook"`. Zone is `vamostaxi.site` (wrangler comment: zone `f0119383…`). Do not bind or WAF `vamostaxi.eu`. Funnel wins if a rule blocks quote/pay (D-29).
**Warning signs:** Stripe dashboard delivery failures; 403 on `/api/quote` from a real phone.

### Pitfall 6: Rate-limit bindings missing on one named env

**What goes wrong:** `env.QUOTE_RATE_LIMITER` undefined on `front` or `ops-changes`; quote fail-open, consent fail-closed 429s everyone.
**Why it happens:** wrangler: ratelimits “not automatically inherited”.
**How to avoid:** If adding bindings, copy all four env blocks. Prefer prefixes on 1001/1002.
**Warning signs:** Staging OK, preview Worker 429s consent.

### Pitfall 7: Restore drill on live Zurich

**What goes wrong:** Real bookings deleted. D-40: they already exist.
**Why it happens:** LAUNCH-04 text still says “before real bookings exist”. CONTEXT overrides: copy only.
**How to avoid:** Runbook title “Restore onto a **copy** project”. Live `yaumjzvylngfjhtuffqs` never in the destructive click path. Agent does not click restore.
**Warning signs:** Any step whose URL contains the live ref as the restore *target*.

### Pitfall 8: DC mock copy vs D-05

**What goes wrong:** Banner promises analytics/marketing cookies we do not set (nFADP/GDPR lie).
**Why it happens:** `CookieBanner.dc.html` is the visual spec and includes Manage preferences + Functional/Analytics/Marketing switches. Footer already dispatches `vamos:cookie-prefs`.
**How to avoid:** Production banner: Accept + Necessary only. Copy lists language (`NEXT_LOCALE`), auth session (`sb-*-auth-token`), `consent_subject`. Listen for `vamos:cookie-prefs` → `settings_change` row, not a fake grid. Do not invent legal paragraphs; point at `/cookies`.
**Warning signs:** A Switch for “marketing” in `apps/web/components`.
</common_pitfalls>

<code_examples>
## Code Examples

Verified patterns from this repo and wrangler 4.124 schema.

### Rate-limit binding (already in wrangler.jsonc)

```jsonc
"ratelimits": [
  { "name": "QUOTE_RATE_LIMITER", "namespace_id": "1001", "simple": { "limit": 8, "period": 60 } },
  { "name": "QUOTE_RATE_LIMITER_BARE", "namespace_id": "1002", "simple": { "limit": 4, "period": 60 } }
]
```

`period` may only be `10` or `60` (config-schema.json). `checkRateLimit` calls `limiter.limit({ key })` and maps `success === false` to `{ ok: false, code: "rate_limited" }` (`apps/web/lib/abuse/rate-limit.ts`). Per-colo, eventually consistent — a distributed bot sees a multiple of 8/60. That is accepted for quote; WAF is Layer 1.

### Fail-closed form Turnstile (contact — reuse)

```typescript
// apps/web/app/api/contact/route.ts (live)
const challenge = await verifyTurnstile(
  env.TURNSTILE_SECRET_KEY ?? process.env.TURNSTILE_SECRET_KEY,
  token,
  {
    action: "contact",
    idempotencyKey,
    allowedHostnames: bindings.CONTACT_TURNSTILE_ALLOWED_HOSTNAMES ?? process.env.CONTACT_TURNSTILE_ALLOWED_HOSTNAMES,
    remoteip: request.headers.get("cf-connecting-ip") ?? undefined,
  },
);
if (!challenge.ok) return formFailure("challenge_failed", 403);
```

Review already copies this with `jsonErr("challenge_failed", 403)`. Cookie Accept should too (`action: "consent"` once the widget `data-action` matches). Hostnames: public `vamostaxi.site` / `www` only — not `localhost` on staging/prod (turnstile-spin rule).

### Leak gate — keep db-smoke 404

```typescript
// apps/web/lib/dc-mock-urls.ts (live)
if (path === "/api" || path.startsWith("/api/")) {
  const hiddenDev = path === "/api/dev" || path.startsWith("/api/dev/");
  if (hiddenDev) return isDocumentNav(request) ? "not-found" : empty404();
  if (isDocumentNav(request)) return "not-found";
  return null;
}
```

Health must not live under `/api/dev`. `/api/internal/health` fetch passes this gate; document nav still 404s.

### Staging noindex (keep until Phase 11)

```typescript
// apps/web/middleware.ts (live)
function applyStagingNoindex(response: NextResponse): NextResponse {
  if (process.env.DEPLOY_ENV === "staging" || process.env.DEPLOY_ENV === "ops-changes") {
    response.headers.set("X-Robots-Tag", "noindex");
  }
  return response;
}
```

`env.staging.name` is `vamos`. Do not bind `vamostaxi.eu`.

### IP truncate (D-10) — implement in Worker, pass `inet`

```typescript
function truncateClientIp(raw: string | null): string | null {
  if (!raw) return null;
  const ip = raw.split(",")[0]?.trim() ?? "";
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const p = ip.split(".");
    return `${p[0]}.${p[1]}.${p[2]}.0`;
  }
  if (ip.includes(":")) {
    const parts = ip.split(":");
    // zero the interface identifier: keep /64
    while (parts.length < 8) {
      const i = parts.indexOf("");
      if (i < 0) break;
      parts.splice(i, 1, ...Array(9 - parts.length).fill("0"));
    }
    return parts.slice(0, 4).concat(["0", "0", "0", "0"]).join(":");
  }
  return null;
}
```

Read `cf-connecting-ip` first. Never log the raw IP.

### Health header compare (isolation-probe already)

`apps/isolation-probe/src/index.ts` uses `crypto.subtle.timingSafeEqual`. Health should hash both sides to equal length, then compare. Wrong header → empty 404, not 401.

### Stripe webhook — do not touch (D-15)

`verifyStripeEvent` → `constructEventAsync` + `Stripe.createSubtleCryptoProvider()`. Middleware matcher skips body consumption. WAF skip path is exactly `/api/stripe/webhook`.

### Photos long cache — already (D-27)

`apps/web/app/photos/[key]/route.ts` sets `Cache-Control: public, max-age=31536000, immutable` after `PHOTO_PREFIXES` check (`site/` included). Do not cache `/bookings` HTML.

### Recommended header set (discretion, D-32…D-38)

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
  // vamostaxi.site covers www + dashboard. Not preload (not locked). Not on .eu.
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy:
  default-src 'self';
  script-src 'self' https://js.stripe.com https://challenges.cloudflare.com;
  frame-src https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com;
  connect-src 'self' https://api.stripe.com https://challenges.cloudflare.com https://api.mapbox.com https://events.mapbox.com;
  img-src 'self' data: blob: https://*.mapbox.com;
  worker-src 'self' blob:;
  style-src 'self' 'unsafe-inline';
  object-src 'none';
  base-uri 'self';
  frame-ancestors 'none';
```

If Payment Element breaks, loosen that directive only (D-33). Stripe frames **into** `/checkout/payment`; we still deny being framed (`frame-ancestors 'none'` / `X-Frame-Options: DENY`). Language cookie (`NEXT_LOCALE`) may stay JS-readable; add `Secure` on HTTPS (today locale 308 Set-Cookie is SameSite=Lax, no Secure). Auth + `consent_subject`: HttpOnly + Secure + SameSite=Lax.

### `policy_version` stamp (D-04)

Tests use `'2026-08'`. Production stamp is a dated constant (e.g. `2026-09-12`) in code, not legal prose. Changing copy on `/cookies` later is a new stamp + new row, never UPDATE.
</code_examples>

<sota_updates>
## State of the Art (2026)

| Old Approach (GSD-LAUNCH / DC mock) | Current Approach (this phase) | When Changed | Impact |
|-------------------------------------|-------------------------------|--------------|--------|
| Nightly `pg_dump` to R2 + PITR before bookings | Dashboard backups; copy restore; no PITR unless owner says | CONTEXT 2026-09-12 | Runbook is clicks, not a dump Cron |
| Four-category cookie grid | Necessary-only; cookieless CF analytics | D-01/D-05 | Do not ship CookieBanner.dc.html prefs modal |
| Public `/api/health` + Sentry + pager | Secret-header probe; CF metrics; Sentry deferred | D-02/D-17/D-18 | No public health URL |
| Zone Rate Limiting Rule 30/60 as “Layer 1” named in quote comments | Keep Worker bindings; add WAF managed rules; skip webhook | D-28 | Funnel wins if a rule bites quote/pay |
| Skip Worker to cache HTML | Cache response, Worker still gates | OpenNext custom worker | `gatePublicRequest` stays on the hot path |
| wrangler Rate Limiting `period` any int | Schema enum 10 \| 60 only | wrangler 4.124 | Do not invent 300s windows |
| Turnstile siteverify JSON (quote ladder) vs form-urlencoded (forms) | Keep both; forms stay urlencoded | live code | Do not “unify” onto the fail-open ladder |

**New tools/patterns to consider:**
- Workers Rate Limiting binding key prefixes instead of new `namespace_id`s (inheritance gap).
- Token-metadata GET for Mapbox health (no geocode unit).
- `timingSafeEqual` on hashed health secret (already in isolation-probe).

**Deprecated/outdated for this phase:**
- GSD-LAUNCH Phase 8 load-test URL / k6 10k VUs public: D-23 forbids a public load-test URL. Measure in Cloudflare after ship.
- GSD-LAUNCH “before real bookings” restore: D-40 overrides.
</sota_updates>

<open_questions>
## Open Questions

1. **Live zone WAF state**
   - What we know: wrangler comments name public hostname `vamostaxi.site` (zone `f0119383…`). D-28 wants managed WAF + skip webhook. This session could not read the zone (no Cloudflare WAF API call).
   - What's unclear: whether managed rules are already on, and the exact skip-rule UI labels.
   - Recommendation: planner writes owner-click steps (English, no screenshots) as a short ops note in the WAF plan, not in `docs/runbook/` (runbook is refund/resend/assign/restore only). Do not Terraform a new stack.

2. **Supabase backup product on this project**
   - What we know: `yaumjzvylngfjhtuffqs` is `ACTIVE_HEALTHY`, `eu-central-2`, Postgres 17. D-43: use whatever the dashboard already shows; no PITR purchase this sitting; no dump to Mac.
   - What's unclear: `get_project` did not return plan/PITR flags. Daily backups vs PITR toggle is a dashboard fact.
   - Recommendation: restore runbook starts with “Database → Backups → (whatever heading is on screen) → restore to a **new** project”. Live ref never the target. Owner clicks (D-39). One drill (D-41). Photos stay on live R2 (D-42).

3. **Review widget `data-action`**
   - What we know: `/api/reviews/submit` already siteverifies with `action: "contact"`.
   - What's unclear: whether the review page widget already sends `data-action="contact"`.
   - Recommendation: do not change the action on one side. Either leave both as `contact` (satisfies D-14 “reuse contact helper”) or switch both to `review` in one commit.

4. **First-visit cache vs cookie mint**
   - What we know: CF typically will not cache `Set-Cookie` responses. D-23 still wants marketing HTML cached.
   - What's unclear: exact Cache Rule UI for custom key on cookie *presence*.
   - Recommendation: implement `Cache-Control` in the app first (uncached first visit, cached returning no-banner + logged-out). Zone Cache Rules as a follow-up if CF metrics show Worker CPU still high. Never skip Worker.

These are execution details, not reopeners of D-01…D-47.
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)

- `.planning/phases/10-hardening-performance-security-compliance/10-CONTEXT.md` — D-01…D-47
- `.planning/ROADMAP.md` Phase 10 success criteria; `.planning/REQUIREMENTS.md` SITE-08, LAUNCH-01…04, LAUNCH-07
- `packages/db/supabase/migrations/20260823000018_consent_log.sql` + `packages/db/supabase/tests/consent_write.test.sql`
- `apps/web/lib/abuse/rate-limit.ts`, `guards.ts`, `turnstile.ts` (quote ladder)
- `apps/web/lib/turnstile.ts` (fail-closed forms)
- `apps/web/app/api/contact/route.ts`, `app/api/reviews/submit/route.ts`
- `apps/web/lib/dc-mock-urls.ts`, `apps/web/worker.ts`, `apps/web/app/api/dev/db-smoke/route.ts`
- `apps/web/wrangler.jsonc` — `env.staging.name` = `vamos`; ratelimits 1001/1002; observability enabled
- `apps/web/node_modules/wrangler/config-schema.json` — `ratelimits[].simple.period` enum `[10, 60]`, not inherited
- `apps/web/next.config.ts` headers (dev noindex only today)
- `apps/web/middleware.ts` `applyStagingNoindex`
- `apps/web/lib/checkout/webhook-verify.ts` — `constructEventAsync`
- `apps/web/app/photos/[key]/route.ts`, `apps/web/app/api/fx/route.ts`
- `packages/db/src/identity.ts` — no `request.vamos.consent_subject` bind
- MCP `get_project` / `execute_sql` on `yaumjzvylngfjhtuffqs` — region `eu-central-2`, table live, `consent_log` n=0
- wrangler 4.124.0 (`apps/web/package.json`)
- Context7 Cloudflare Workers llms.txt — Rate Limiting binding `limit({ key })` → `{ success }`; Cache-Control / Cache API; Set-Cookie bypasses cache
- `app/pages/CookieBanner.dc.html` — visual tokens + forbidden four-toggle prefs modal
- `apps/web/components/shell/SiteFooter.tsx` — `vamos:cookie-prefs` already dispatched

### Secondary (MEDIUM confidence)

- Cloudflare WAF managed-rules + Cache Rules — official URLs known; live zone config not read this sitting
- Supabase backups docs — copy/PITR restore to a **new** project (search_docs); dashboard labels need owner sitting
- Mapbox tokens v2 metadata GET as a no-geocode health ping
- Stripe `balance.retrieve()` as no-charge test retrieve

### Tertiary (LOW confidence — validate during implementation)

- Exact Cache Rule custom-key field names in the 2026 dashboard
- Whether managed WAF is already enabled on zone `f0119383…`
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: Cloudflare Workers (rate limit, cache, WAF, headers, Turnstile) + existing `consent_log`
- Ecosystem: wrangler 4.124, OpenNext custom worker, Supabase Zurich, Stripe test retrieve
- Patterns: GUC-bound RPC, fail-closed writes, secret-header 404, copy restore
- Pitfalls: GUC missing, cache vs Set-Cookie, `/api/dev` leak gate, WAF vs webhook, live restore

**Confidence breakdown:**
- Standard stack: HIGH — read from repo + wrangler schema + live SQL
- Architecture: HIGH — locked decisions map onto existing modules with one GUC gap
- Pitfalls: HIGH — several are already named in code comments
- Zone WAF / backup UI clicks: MEDIUM — dashboard not read
- Code examples: HIGH — copied from live files; IP truncate and CSP list are planner-discretion drafts

**Research date:** 2026-09-12
**Valid until:** 2026-10-12 (Workers/WAF UI moves; schema and D-01…D-47 do not)

### Requirement → implementation map

| ID | How (do not reopen the what) |
|----|------------------------------|
| SITE-08 | Production two-button banner on public hosts; `record_consent` + GUC; HttpOnly `consent_subject`; no fake toggles; CF analytics cookieless |
| LAUNCH-01 | Marketing Cache-Control + cache key; `no-store` if auth cookie; photos/FX already cached; measure in CF; no load-test URL |
| LAUNCH-02 | Prefix rate-limit contact/reviews/consent; Turnstile contact+review+Accept; webhook already signed; WAF skip webhook |
| LAUNCH-03 | `/api/internal/health` + `HEALTH_PROBE_SECRET`; CF observability; db/payments/maps booleans |
| LAUNCH-04 | Owner copy-restore once; live Zurich never the target |
| LAUNCH-07 | `docs/runbook/{refunds,resend-email,manual-assignment,restore-database}.md` + README link; `info@vamostaxi.site`; `+41 79 626 70 82` |
</metadata>

---

*Phase: 10-hardening-performance-security-compliance*
*Research completed: 2026-09-12*
*Ready for planning: yes*

# Phase 10: Hardening — Performance, Security & Compliance - Context

**Gathered:** 2026-09-12
**Status:** Ready for planning

<domain>
## Phase Boundary

The site survives a launch surge, keeps secrets and payments safe, and never
captures personal data ahead of a provable server-side consent record.
Consent log is live and verified before any IP-capturing monitoring (Sentry).

In scope: SITE-08, LAUNCH-01, LAUNCH-02, LAUNCH-03, LAUNCH-04, LAUNCH-07.

Out of scope: Phase 11 (`vamostaxi.eu` DNS, live Stripe keys, `pricing_live` flip).
Do not bind `vamostaxi.eu`. Do not invent CHF, legal copy, or photos.

</domain>

<decisions>
## Implementation Decisions

### Cookie banner + consent_log (SITE-08)

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

### Rate limits + Turnstile (LAUNCH-02)

- **D-13:** Rate-limit: quote + geo + contact + reviews/submit + `record_consent`. Checkout/pay and Stripe webhook stay as they are (intent + Stripe signature). Staff APIs stay `withStaff`, no public limiter.
- **D-14:** Turnstile: contact stays. Add on `/review` submit and cookie Accept. No Turnstile on checkout or manage-booking cancel.
- **D-15:** Stripe webhook signature verification is already done. Do not add Turnstile or a second verifier.
- **D-16:** Rate-limit miss: existing product error `429 rate_limited`, same family as quote. No invented copy.

### Health + 10k (LAUNCH-01, LAUNCH-03)

- **D-17:** You watch errors/uptime in Cloudflare (Web Analytics + Workers metrics + logs). No new paid dashboard. No pager. No extra fail email.
- **D-18:** Health check is a secret-header Worker route. Missing/wrong header looks like 404. Never a public `/health`. Keep `/api/dev/db-smoke` as the leak 404.
- **D-19:** You put the secret in your terminal (`wrangler secret put`). Agent never sees the value.
- **D-20:** Caller = whoever has the secret header. Cloudflare cron may hit it. Browser never.
- **D-21:** Authorized body: `ok` true/false plus which of db / payments / maps failed. No connection strings, no Stripe ids.
- **D-22:** Pings: Hyperdrive `SELECT 1` + Stripe test retrieve (no charge) + Mapbox token check. Fail closed per dependency.
- **D-23:** 10k concurrent: cache public marketing HTML at the edge. Measure in Cloudflare after ship. No public load-test URL. Database barely touched on browse.

### Edge cache (LAUNCH-01)

- **D-24:** Cache marketing only: home, about, FAQ, services, legal. Never cache `/api`, `/checkout`, `/confirmation`, `/bookings`, `/account`, dashboard.
- **D-25:** Logged-in / personal HTML: `no-store` (never CDN-cache tickets).
- **D-26:** After a visual ship: new Worker version + `?nocache=`. Do not tell customers to hard-refresh as the fix.
- **D-27:** `/photos/site/*.jpg` long cache (R2, not bookings). Legal pages cache like home. Hashed JS/CSS chunks cache. `/api/fx` short TTL. Geo suggest/retrieve uncached.

### WAF + headers

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

### Backups + runbook (LAUNCH-04, LAUNCH-07)

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product + GSD
- `.planning/ROADMAP.md` — Phase 10 goal and success criteria
- `.planning/REQUIREMENTS.md` — SITE-08, LAUNCH-01…04, LAUNCH-07
- `.planning/PROJECT.md` — core value quote → pay → confirmation

### Consent already in schema
- `packages/db/supabase/migrations/20260823000018_consent_log.sql` — `consent_log`, `record_consent()`
- `packages/db/supabase/tests/consent_write.test.sql`
- `docs/build/OWNER-ANSWERS.md` — server-side consent is required

### Abuse already in Worker
- `apps/web/lib/abuse/rate-limit.ts` — `QUOTE_RATE_LIMITER` / `QUOTE_RATE_LIMITER_BARE`
- `apps/web/lib/abuse/turnstile.ts`
- `apps/web/app/api/contact/route.ts` — existing Turnstile
- `apps/web/app/api/reviews/submit/route.ts` — reuse contact Turnstile helper
- `apps/web/lib/dc-mock-urls.ts` — `/api/dev` always 404 (leak gate)

### Staging / never live DNS
- `apps/web/wrangler.jsonc` — `env.staging.name` is `vamos`; never `vamostaxi.eu`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `record_consent()` — only write path into `consent_log`
- Quote rate limiter pattern — copy for consent/geo/contact/reviews
- Contact Turnstile verify helper — reuse for review + banner Accept
- Stripe webhook signature — already on `/api/stripe/webhook`

### Established Patterns
- D-08: apps/web imports only identity wrappers, never `@vamos/db` from routes
- Public APIs: 401 vs 404 for cookie-less GET
- Amounts `CHF 000` until owner flips live pricing
- Support is `#support`, never Staff

### Integration Points
- Banner POST → `record_consent` with Worker-bound `consent_subject`
- `/cookies` page → `settings_change` new row
- Health route → Hyperdrive + Stripe test + Mapbox, secret header
- WAF skip list → `/api/stripe/webhook`

</code_context>

<specifics>
## Specific Ideas

- “If there is a toggle on something we must have it” → no fake toggles; do not invent cookies to fill a four-category grid.
- “Always real-life bookings” → restore drill is a copy so live trips are never deleted.
- “You decide but I want it very secure” on health → secret header, 404 to strangers, no public `/health`.

</specifics>

<deferred>
## Deferred Ideas

- Sentry: after `consent_log` is live and verified (D-02). Not Phase 11 DNS.
- Phase 11: `vamostaxi.eu` DNS, live Stripe keys, `pricing_live`, indexing.
- PITR purchase: only if you say so in the dashboard sitting.
- Phase 9 leftover: live Ops Complete click on `VT-26-0723` still needs dashboard login (browser session blocked). Product is on `main` (`a1d6c56`).

</deferred>

---

*Phase: 10-Hardening — Performance, Security & Compliance*
*Context gathered: 2026-09-12*

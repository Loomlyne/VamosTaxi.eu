# Phase 28: Pixel PageView - Research

**Researched:** 2026-10-01
**Domain:** Meta pixel loader in the mock runtime (consent-gated, allow-listed), path-scoped CSP, one narrow Postgres write path for `_fbp` / `_fbc`
**Confidence:** HIGH for code seams and fbevents behaviour (read in source); MEDIUM for what Meta's served config means about the Events Manager switches

## Read this first: two facts for the owner before the flag opens

### 1. Cookie lifetime: "Kept for up to 90 days" holds. Not blocking.

- Observed in Meta's own script (fbevents.js 2.9.412, fetched 2026-10-01 07:19 UTC; module `SignalsPixelCookieUtils`): `h=2160*60*60*1e3` exported as `NINETY_DAYS_IN_MS`. Every write of `_fbp` and `_fbc` is `name=value; expires=<now + 90 days>; domain=.<registrable domain>; SameSite=Lax (Chrome only); path=/` [VERIFIED: fbevents.js source]. On vamostaxi.site that is `domain=.vamostaxi.site`.
- Meta documents the same lifetime for `_fbc` ("with the 90 days expiration time") [CITED: developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc]. Industry cookie databases list `_fbp` as 90 days [CITED: observepoint.com/cookies/_fbp].
- One honest caveat: the cookie plugin (`dropOrRefreshDomainScopedBrowserIDCookie`, `dropOrRefreshClickIDCookie`) rewrites an existing `_fbp` / `_fbc` with a fresh 90-day expiry on every event it sends [VERIFIED: config script, plugin `fbevents.plugins.cookie`]. Each cookie still expires 90 days after the last counted page view, which is how Meta and every consent tool describe it. A visitor who keeps coming back with Accept keeps the same identifier for longer than 90 days in total. Safari caps script-set cookies at 7 days, so "up to" stays true there.
- Our code never sets, extends or copies these cookies to the browser; the server only reads them at the Pay press.
- Verdict: the build sets nothing different from 90 days, so D-08's "if they differ, stop" condition is not met. The planner should put the rolling-refresh sentence in the hand-over so the owner reads it once; no code change is needed to keep the text true.

### 2. Meta's live configuration contradicts "Both are off" for automatic advanced matching. Ask before the flag opens.

- The config script Meta serves for pixel `1595596972063765` (fetched twice: 07:19 and 07:31 UTC, i.e. 09:19 and 09:31 Zurich, 2026-10-01) contains:
  `config.set("1595596972063765", "automaticMatching", {"selectedMatchKeys":["em","fn","ln","ge","ph","ct","st","zp","db","country","external_id"]})` and `instance.optIn("1595596972063765", "AutomaticMatching", true)`, plus `instance.optIn(..., "InferredEvents", true)` [VERIFIED: https://connect.facebook.net/signals/config/1595596972063765].
- A 2026 measurement study of pixel configs states that these two lines appear when Automatic Advanced Matching is enabled, and that AAM is not on by default [CITED: arxiv.org/html/2603.09380v1 §3.2]. So Meta's own server still treats the switch as ON for this pixel, about two hours after the owner answered "Both are off".
- Code defence exists and is required anyway (D-07): `fbq('set','autoConfig',false,PIXEL_ID)` before `init` opts out of `AutomaticSetup`, which cascades to `InferredEvents`, and the config's `optIn(id,"InferredEvents",true)` respects an earlier opt-out (third argument). Every automatic-matching path in the served config (`SubscribedButtonClick` handler, `extractPII`) runs only inside the InferredEvents plugin and first checks `!disableAutoConfig` and the InferredEvents opt-in [VERIFIED: config + fbevents source]. With autoConfig off, form fields on /sign-in, /sign-up and /account are not read.
- META-08 and the decision file still require the owner's switches to be off, and the decision file says the flag goes off if a switch is on. **Exact owner question (question form, before the plan that flips the flags runs):** "Open Events Manager → pixel 1595596972063765 → Settings. Is 'Automatic advanced matching' off right now? Meta's live setup for this pixel, read today at 09:31 Zurich, still has it on with email, phone, name and the other fields." Options: "It is off now (I just checked/saved)" / "It was on, I have now turned it off" / "I cannot find it".
- Recommended gate for the flip task: re-fetch the config (`curl -s "https://connect.facebook.net/signals/config/1595596972063765?v=2.9.412&r=stable" | grep -c 'optIn("1595596972063765", "AutomaticMatching"'`) and require `0` before `SWITCHES_OFF` is set true; record the output in the SUMMARY. If it stays 1 after the owner confirms, stop and ask again (propagation or a different dataset).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Where the pixel may count a page view (owner, 2026-10-01, question form)
- **D-01:** Only clean addresses. Allowed: `/`, `/about`, `/faq`, `/contact`, `/terms`,
  `/privacy`, `/cookies`, `/cancellation`, `/imprint` (and their `/de` `/fr` `/ar` addresses),
  `/coming-soon`, `/sitemap`, signed-in `/account` (incl. `/account/<section>`) and `/bookings`.
  `/sign-in` and `/sign-up` only when their address has no query string at all.
  Example: Lena's page views before checkout count; her route never goes to Meta.
- **D-02:** Never: `/checkout*`, `/confirmation*`, `/checkout/pay/*`, `/manage-booking`,
  `/booking-detail`, `/review`, `/reset-password`, any `/api/*`, ops and the dashboard host, `/dev`,
  and any address carrying a booking reference (`VT-`), `token`, `ref`, `reference`, `session`,
  `resume`, `returnTo`, `code` or `token_hash`. An allow-list decides, never a deny-list; the
  deny rules are tests on top.
- **D-03:** On allowed pages an ad click id in the address (`fbclid`, `utm_*`) is fine — that is
  what `_fbc` is. Nothing else in the query is allowed on `/sign-in` and `/sign-up`.

#### When it loads (carried forward, owner decisions)
- **D-04:** All four must be true, checked in the browser before the loader runs:
  1. `META_LEGAL_GATE_OPEN` is `true` — Phase 28 opens it: the owner's three texts are live since
     the Phase 27 ship (`ce55cd75`) on the banner, cookies and privacy pages in four languages
     (Phase 26 D-05, D-19; decision 2026-09-30-meta-wording).
  2. The owner's Events Manager confirmation — both switches off
     (`.planning/decisions/2026-10-01-meta-events-manager-switches.md`). A code flag, pinned by a
     test to that file. If he ever reports a switch back on, the flag goes off.
  3. The server says marketing is on under the current consent version (`/api/consent/state`),
     never the browser cache alone.
  4. The page is on the D-01 allow-list.
- **D-05:** The script is never in any HTML the server sends. It is added by our mock runtime after
  the four checks. A person who chose Necessary only, or has not chosen, gets no script; cached
  pages stay identical for everyone (Phase 27 D-23).
- **D-06:** Accept on a page loads the pixel on that page (one PageView). A later Necessary only (or
  Save choices with Marketing off) stops every future PageView at once, on this page and the next.

#### What is sent
- **D-07:** PageView only. No advanced matching (no user data in `fbq('init')`), no noscript image,
  automatic configuration off in code as well (`autoConfig` false), no other event, no Purchase in the
  browser, no middle events (quote seen, checkout started, pay step).
- **D-08:** The owner's texts stay verbatim. `_fbp` and `_fbc` must be kept for up to 90 days to keep
  the cookies text true: research confirms the lifetimes Meta's script sets and the plan pins them;
  if they differ, stop and ask the owner.

#### Saving `_fbp` / `_fbc` (META-09)
- **D-09:** Saved on the unpaid booking at the Pay press (`POST /api/checkout/intent`), read from the
  request's first-party cookies, only if the server says marketing is on under the current version at
  that moment, and only values in Meta's own cookie format. Never in Stripe metadata.
- **D-10:** Written only while the booking is `pending`. A paid booking can never be updated to
  add or change them (database check in the definer function, proved by pgTAP).
- **D-11:** One narrow migration in `20261003100000…`: the columns and the write path. Read-only for
  everything else. Safe on real bookings (new nullable columns, no data change).

### Claude's Discretion
- How the loader is shared across mock pages (e.g. a new `app/vamos-meta.js` loaded with the
  consent runtime, waiting for `VamosConsent` as the Phase 27 fix does).
- CSP: allow Meta's script and beacon hosts only where needed; prefer keeping them out of the Next
  pages' policy, since no Next page loads the pixel.
- On a later Necessary only: `fbq('consent','revoke')` for the open page, and removing the
  first-party `_fbp` / `_fbc` cookies from this browser.
- Rewriting the Phase 26 needle scan (`legal-gate.test.ts`) deliberately: the pixel id and Meta's
  host become allowed in exactly the loader and the CSP, nowhere else.

#### Carried forward
- No `sk_live_`, no `vamostaxi.eu`, no invented legal copy, no invented CHF, no hashed e-mail or
  phone. Quote, pay and confirmation logic unchanged (the Pay press only saves two cookie values).

### Deferred Ideas (OUT OF SCOPE)
- Purchase from the settle queue — Phase 29.
- Finish-your-account step with optional phone (27 D-37) — after Phase 29 (owner, 2026-10-01).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| META-06 | After Accept and META-01, pixel `1595596972063765` sends PageView only on public pages with no token, plus signed-in account and bookings. | Loader in `app/vamos-meta.js` (Pattern 1), allow-list rules (Pattern 2), referrer guard (Pattern 3), flags (Pattern 5), browser spec with stubbed fbevents (Validation) |
| META-07 | Never ops, never a pay link, never manage-booking, never a booking reference in the URL. A person who dismissed does not get a cached page that contains the script. | Allow-list + deny tests; loader only in the CookieBanner helmet (ops never mounts it, pinned); path-scoped CSP (Pattern 4); serveDcHtml unchanged (no per-visitor HTML); needle scan rewrite (Pattern 6) |
| META-08 | No advanced matching and no noscript image. Owner confirms in Events Manager that automatic matching and automatic button clicks are off before the pixel can load. | `init` without third argument, `autoConfig` false before `init` (documented) plus `disablePushState`; no `<noscript>` (needle `facebook.com/tr` banned in HTML); `SWITCHES_OFF` flag pinned to the decision file; **owner re-check required (see top, item 2)** |
| META-09 | `_fbp` and `_fbc` are saved on the unpaid booking after the pixel sets them. Not in Stripe. A paid booking cannot be updated to backfill them. | Migration `20261003100000` (columns + checks + definer + trigger), intent wiring as a best-effort dep next to `afterBooking`, consent read through `readConsentChoice`, format regex from fbevents `SignalsFBEventsPixelCookie`, pgTAP + Worker-client test |
</phase_requirements>

## Project Constraints (from CLAUDE.md, .claude/CLAUDE.md, CLAUDE.local.md)

- Work only in `/Users/koss/Developer/vamos-wt/phase-28`; never the main checkout or other worktrees. One job, one branch; bring `origin/main` in before hand-over (main wins conflicts).
- No push, no deploy, no PR, no hosted DB write by executors. Hosted migration apply is the control session's job (verbatim file, read back). Never `db push`, never wipe.
- Live site is `vamostaxi.site`; never `vamostaxi.eu` in code. No `sk_live_`. Never read or print `META_CAPI_ACCESS_TOKEN`. No Purchase event in this phase.
- Owner's Meta texts (`.planning/decisions/2026-09-30-meta-wording.md`) verbatim; no new legal sentence. This phase has no new screen and no new visible string, so no i18n work is expected; if a string appears, it needs en/de/fr/ar in the same pass.
- Mock pages are what customers see (memory `live-home-is-dc-mock`, `live-cookie-banner-is-mock`); the loader goes in the mock runtime, not in Next.
- Worker DB client runs `fetch_types:false`: no array params/results, jsonb via `sql.json` (memory `worker-pg-client-no-arrays`). Never raw table SQL inside `asSystem`; add a definer function (memory `customer-column-grants`).
- Own port-shifted Supabase stack only (memory `isolated-local-supabase`); executors run only touched tests; lead runs the full gate once (memory `parallel-agents-gate-load`).
- In test files, Meta needles are built from string parts (`legal-gate.test.ts` scans product files).
- A Next server start rewrites `apps/web/tsconfig.json` and `apps/web/next-env.d.ts`: restore, never commit.
- After a deploy that touches checkout: one 4242 payment and a read of `booking_payments` (control session).
- Design laws (no glow, no tinted yellow, logical properties) are not touched: no UI in this phase.

## Summary

Every allowed page is a mock (`.dc.html` served by `serveDcHtml` in `apps/web/middleware.ts`), and every customer mock mounts `CookieBanner` exactly once (pinned by `apps/web/lib/consent/mock-mounts.test.ts`); no ops page mounts it. The natural loader seat is one new plain-JS file, `app/vamos-meta.js`, added to the `<helmet>` of both `app/pages/CookieBanner.dc.html` and `app/home/CookieBanner.dc.html` right after `vamos-consent.js`. It waits for `window.VamosConsent` (same 50 ms × 100 poll as `bindConsent`), checks the two baked flags, the allow-list (location and same-origin referrer), and the server state, then runs Meta's base code without the noscript part: `fbq.disablePushState = true`, `fbq('set','autoConfig',false,ID)`, `fbq('init',ID)`, `fbq('track','PageView')`. On `vamos:consent` with marketing false it calls `fbq('consent','revoke')`, never grants again on that page, and deletes `_fbp`, `_fbc` (all domain variants) and Meta's localStorage keys.

Reading fbevents.js (2.9.412) settled the rest of the browser questions. `dl` is `location.href` (full URL with query and hash), `rl` is `document.referrer`. Under today's `Referrer-Policy: strict-origin-when-cross-origin`, a visitor who goes from `/confirmation/VT-…` or `/checkout/pay/<token>` to `/about` arrives with a same-origin referrer that is the full denied address, and fbevents would send it to Meta as `rl`. The loader must refuse to count a page view when the same-origin referrer is not itself an allowed clean address, and the site should switch to `Referrer-Policy: strict-origin` so same-origin referrers become the bare origin. fbevents also fires an automatic PageView on every `pushState`/`replaceState` URL change (account sections, language address, `#faq`) unless `fbq.disablePushState === true`, and on every back-forward-cache restore regardless; the loader handles both. While consent is revoked, fbevents queues commands and replays them on `grant`, so never call `grant` after `revoke` on the same page.

The server side is a narrow, additive migration: two nullable text columns on `public.bookings` with format CHECKs, one `SECURITY DEFINER` function `checkout_set_meta_click_ids(uuid,text,text)` (EXECUTE to `vamos_checkout` only, pending only, 55000 otherwise), and a guard trigger so no role (staff hold whole-table UPDATE on bookings) can set a non-null value on a non-pending booking. The intent route reads `_fbp`/`_fbc` from the request's Cookie header, validates them against Meta's documented format, reads consent through the existing `readConsentChoice` under `asAnon`, and calls the function next to each existing `afterBooking` call, best effort, never touching the Stripe session input.

**Primary recommendation:** Merge `origin/main` first (14 commits, including middleware and the new `scripts/local-test-stack.sh`), then build: migration + pgTAP; intent wiring; `app/vamos-meta.js` + CookieBanner helmet lines; path-scoped mock CSP + `Referrer-Policy: strict-origin`; flags and needle-scan rewrite; vitest + Playwright proofs; flip the two flags last, behind the owner's AAM re-check.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Decide whether this page view may be counted (flags, allow-list, referrer) | Browser (mock runtime `app/vamos-meta.js`) | Frontend server (middleware CSP as a second lock) | D-05: script never in HTML; cached HTML identical for all; only the browser knows the visitor's state |
| Consent state "marketing on under current version" | API (`GET /api/consent/state`, `public.consent_choice`) | Browser (`VamosConsent.state()`) | D-04(3): server, never the cache |
| Loading fbevents and sending PageView | Browser (third-party script) | CDN/Meta | Only after all checks |
| Allowing Meta hosts | Frontend server (middleware `applySecurityHeaders` path for mock HTML) | — | OpenNext returns middleware body responses without next.config headers, so mock CSP is set only in middleware |
| Referrer minimisation | Frontend server (`Referrer-Policy` in `SECURITY_HEADER_PAIRS`) | Browser (loader referrer guard, fail closed) | Header fixes it for every page; guard catches anything missed |
| Withdraw (revoke + delete cookies) | Browser | — | Cookies are first-party, script-written |
| Reading `_fbp`/`_fbc` at Pay | API (`POST /api/checkout/intent`) | — | D-09 |
| Pending-only write, format, no backfill | Database (definer fn + CHECK + trigger) | API (TS validation) | D-10: database check, pgTAP proof |

## Standard Stack

### Core (existing, reused; no new package)
| Library / Tool | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Meta Pixel `fbevents.js` | served by Meta, observed 2.9.412 | PageView beacon, `_fbp`/`_fbc` cookies | Owner-chosen pixel; loaded from `https://connect.facebook.net/en_US/fbevents.js` only [CITED: developers.facebook.com/docs/meta-pixel/get-started] |
| Next.js | 15.5.25 | middleware + intent route | in repo [VERIFIED: apps/web/package.json] |
| @opennextjs/cloudflare / aws | 1.20.2 / 4.1.0 | Worker adapter; decides header precedence | [VERIFIED: pnpm-lock.yaml] |
| postgres.js via `@vamos/db` | repo | `asCheckout`, `asAnon` | Worker client options (`fetch_types:false`) |
| Supabase CLI | `node_modules/.bin/supabase` (2.115.0 per 27) | local stack, pgTAP, types | [CITED: 27-RESEARCH] |
| vitest | 4.1.11 | unit + vm harness for browser JS | [VERIFIED: apps/web/package.json] |
| @playwright/test | 1.62.1 | browser spec with route interception | [VERIFIED] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Flags baked into `app/vamos-meta.js` | `<meta>` injected by `serveDcHtml` (like the Turnstile key) | Injection changes middleware and the D-23 pin in `mock-mounts.test.ts`, and the static test server would need to fake it. Baked constants are identical for every visitor and are pinned to the TS constants by a vitest |
| Loader in CookieBanner helmet | `<script>` line in all 18 page helmets | 18 shared files to touch vs 2; every customer mock already mounts CookieBanner exactly once (pinned) |
| New function `checkout_set_meta_click_ids` | Extend `checkout_create_booking` (15 params) or `checkout_set_booking_details` | Changing either signature drops/recreates grants, touches the pay path and many pgTAP fixtures; a new narrow function is additive and best-effort |
| Path-scoped CSP | Add Meta hosts to `SECURITY_HEADER_PAIRS` everywhere | Would allow Meta on Next pages, denied mocks and the dashboard; the CONTEXT prefers keeping it out |

**Installation:** none. Wave 0 runs `pnpm install --frozen-lockfile` (worktree has no `node_modules` [VERIFIED]).

## Package Legitimacy Audit

No package is installed by this phase. `fbevents.js` is not an npm package; it is Meta's hosted script and is never vendored or fetched in tests (a local stub is served instead).

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| none | — | — | — | — | not run (nothing to check) | — |

## Architecture Patterns

### System Architecture Diagram

```
Visitor opens https://vamostaxi.site/about  (cached marketing HTML, same for everyone)
        │
        ▼
middleware.ts ──serveDcHtml──► HTML (no pixel, no visitor state)
        │   headers: CSP = Meta-enabled ONLY IF flags on AND pixelPageAllowed(url)  [server lock]
        │            Referrer-Policy: strict-origin
        ▼
Browser: CookieBanner helmet loads vamos-consent.js, then vamos-meta.js
        │
        ▼
vamos-meta.js ── wait for VamosConsent (≤5 s) ──► flags baked on? ──no──► stop (clear Meta cookies)
        │ yes
        ▼
urlAllowed(location) AND referrerAllowed(document.referrer) AND host == vamostaxi.site ──no──► stop
        │ yes
        ▼
VamosConsent.state()  → GET /api/consent/state (no-store) → consent_choice(current version)
        │
        ├─ ok && chosen && marketing ──► boot: fbq stub, disablePushState, autoConfig false, init(ID), track PageView
        │                                 └─► connect.facebook.net/en_US/fbevents.js + signals/config/ID
        │                                       └─► www.facebook.com/tr  (GET image; else beacon/form POST)
        ├─ ok && (not chosen || marketing false) ──► clear _fbp/_fbc + localStorage keys; wait
        └─ not ok (503/network) ──► do nothing (no pixel)
        │
on 'vamos:consent' (after a successful POST /api/consent):
        ├─ marketing true  ──► re-read state() ──► boot once (if not revoked on this page)
        └─ marketing false ──► fbq('consent','revoke'); revokedHere = true; clear cookies + storage
on 'pageshow' persisted (bfcache) ──► if revoked or cached choice not marketing ──► revoke synchronously

Pay press: /checkout (Next) ──POST /api/checkout/intent (Cookie: _fbp, _fbc, consent_subject)──►
   route.ts: parse + validate format ─► asAnon: readConsentChoice ─► gate flags
   runWebIntent: … booking created/reused (owner path) … saveDetails ─► afterBooking ─► saveMetaClickIds (best effort)
        └─► asCheckout: public.checkout_set_meta_click_ids(booking, fbp|null, fbc|null)
               └─► status must be 'pending' (55000 else); CHECK format; trigger refuses non-null on non-pending
   Stripe session input: unchanged (no fbp/fbc)
```

### Recommended file changes

```
app/vamos-meta.js                                   NEW  loader (pixel id + Meta host live ONLY here, plus CSP)
app/pages/CookieBanner.dc.html, app/home/CookieBanner.dc.html   +1 helmet line each, after vamos-consent.js
apps/web/lib/meta/legal-gate.ts                     flip META_LEGAL_GATE_OPEN; add META_EVENTS_MANAGER_SWITCHES_OFF; drop @ts-expect-error
apps/web/lib/meta/pixel-pages.ts                    NEW  server twin of the allow-list (for CSP choice) + parity test
apps/web/lib/meta/click-ids.ts                      NEW  readMetaClickIds(cookieHeader) + format regexes
apps/web/lib/security/headers.ts                    Referrer-Policy strict-origin; mockPageCsp({ metaPixel })
apps/web/middleware.ts                              mock-serve branch only: Meta CSP when allowed
apps/web/app/api/checkout/intent/route.ts           wire saveMetaClickIds dep
apps/web/lib/checkout/intent.ts                     optional dep, called next to afterBooking (4 places)
packages/db/supabase/migrations/20261003100000_booking_meta_click_ids.sql   NEW
packages/db/supabase/tests/booking_meta_click_ids.test.sql                 NEW
packages/db/test/local/meta-click-ids.test.ts                              NEW  Worker-client proof
packages/db/database.types.ts                       regenerate
apps/web/lib/meta/legal-gate.test.ts                rewrite needle scan (Pattern 6)
apps/web/lib/meta/vamos-meta.test.ts                NEW  vm harness: bootstrap order, allow-list table, revoke, cleanup
apps/web/lib/security/headers.test.ts               Referrer-Policy pin changes on purpose; Meta hosts only in mock CSP
apps/web/tests/integration/meta-pixel-28.spec.ts    NEW  browser proof (no Next, no DB)
apps/web/tests/fixtures/fbevents-stub.js            NEW  local stand-in for Meta's script
```

### Pattern 1: The loader (`app/vamos-meta.js`)

**What:** Plain ES5 browser script (like `vamos-consent.js`, not transpiled). Exposes `window.VamosMeta = { allowed(href, referrer), loaded(), revoked() }` for tests.
**When:** Loaded by both CookieBanner helmets after `vamos-consent.js`.

```js
/* Vamos Taxi — Meta pixel loader (Phase 28). PageView only. Never in server HTML (D-05). */
(function () {
  if (window.VamosMeta) return;
  var PIXEL_ID = '1595596972063765';
  var GATE_OPEN = true;     // pinned by vitest to lib/meta/legal-gate.ts META_LEGAL_GATE_OPEN
  var SWITCHES_OFF = true;  // pinned to .planning/decisions/2026-10-01-meta-events-manager-switches.md
  var HOST = 'vamostaxi.site';
  var SRC = 'https://connect.facebook.net/en_US/fbevents.js';
  var loaded = false, revokedHere = false;

  function bootPixel() {
    if (loaded || revokedHere || window.fbq) return;          // another fbq on the page: fail closed
    if (!allowed(location.href, document.referrer)) return;  // re-check in the same tick as track
    var n = window.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!window._fbq) window._fbq = n;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    n.disablePushState = true;                 // observed: no automatic PageView on push/replaceState
    loaded = true;
    window.fbq('set', 'autoConfig', false, PIXEL_ID);   // documented: above init
    window.fbq('set', 'autoConfig', false);             // observed: sets disableAutoConfig globally
    window.fbq('init', PIXEL_ID);                       // no user data, ever
    window.fbq('track', 'PageView');
    var s = document.createElement('script'); s.async = true; s.src = SRC;
    document.head.appendChild(s);
  }
  // … wait for VamosConsent, state(), onChange, pageshow, storage, clearMeta() (below)
})();
```
Source: base code [CITED: developers.facebook.com/docs/meta-pixel/get-started], autoConfig placement [CITED: developers.facebook.com/docs/meta-pixel/advanced/], `disablePushState` and global autoConfig [VERIFIED: fbevents.js modules `signalsFBEventsSPANavigationUtil`, `set` → `autoConfig` case].

Flow (prescriptive):
1. Register the `pageshow` listener **at script start, before fbevents exists**, so it runs before fbevents' own `pageshow` handler (listeners fire in registration order). On `e.persisted`: if `revokedHere`, or `VamosConsent.cached()` shows `marketing !== true`, call `fbq('consent','revoke')` synchronously (fbevents then queues the automatic PageView instead of sending it). Then re-run the state check.
2. Poll for `window.VamosConsent` (50 ms × 100). If it never arrives: do nothing.
3. If `!GATE_OPEN || !SWITCHES_OFF`: run `clearMeta()` and stop.
4. `VamosConsent.state()`: `r.ok && r.chosen && r.choice && r.choice.marketing === true` → `bootPixel()`. `r.ok` and not that → `clearMeta()`. `!r.ok` → nothing.
5. `VamosConsent.onChange(detail)`: `detail.marketing === true` → call `state()` again (D-04(3): server, not the event), then `bootPixel()`. `detail.marketing !== true` → if loaded, `fbq('consent','revoke')`; set `revokedHere = true`; `clearMeta()`.
6. `window.addEventListener('storage', …)` for key `vamosCookieConsent`: a Necessary only in another tab → revoke here too.
7. Never call `fbq('consent','grant')`. A second Accept on the same page after a revoke waits for the next page load.

`clearMeta()`:
```js
function clearMeta() {
  var parts = location.hostname.split('.'), domains = [''];
  for (var i = parts.length - 2; i >= 0; i--) domains.push('.' + parts.slice(i).join('.'));
  ['_fbp', '_fbc', '_fbleid'].forEach(function (name) {
    domains.forEach(function (d) {
      document.cookie = name + '=; Max-Age=0; path=/' + (d ? '; domain=' + d : '');
    });
  });
  ['multiFbc', 'aemSource'].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
}
```
Domain variants matter: fbevents writes with `domain=.vamostaxi.site` (it walks hostname suffixes and keeps the first that sticks) [VERIFIED: `writeNewCookie`]. A host-only delete would leave it.

### Pattern 2: Allow-list rules (browser and server twin)

Evaluate on `new URL(href)`:
- Host must be exactly `vamostaxi.site` and protocol `https:`. (Dashboard host, `*.workers.dev`, localhost: no pixel. Tests fulfil `https://vamostaxi.site/**` through Playwright routing, so no test hook is needed in product code.)
- Path (exact, no trailing slash): `/`, `/about`, `/faq`, `/contact`, `/terms`, `/privacy`, `/cookies`, `/cancellation`, `/imprint`; the same nine with `/de`, `/fr`, `/ar` prefix (`/de` for home); `/coming-soon`, `/sitemap`, `/account`, `/account/<section>` with section in `transfers|details|mobile|preferences|security|close` (`ACCOUNT_SECTIONS` in `apps/web/lib/dc-mock-urls.ts:16-23`), `/bookings`; `/sign-in`, `/sign-up`. Everything else (incl. `/en/…`, `/app/pages/*.html`, `/sign-in/confirm` added on main) is denied.
- Query: `/sign-in` and `/sign-up` → `location.search === ''` (D-01 is the stricter reading of D-01 vs D-03; see Open Question 3). Every other allowed path → every key is `fbclid` or matches `/^utm_[a-z_]+$/`; any other key denies.
- Hash: `''` or `/^#[A-Za-z0-9_-]{1,64}$/` (plain anchors like `#faq`). Anything with `=`, `&`, `%` denies (blocks implicit-flow `#access_token=…` and similar).
- Whole decoded href must not match `/vt-\d/i` (booking reference, D-02).

The server twin (`apps/web/lib/meta/pixel-pages.ts`, `pixelPageAllowed(url: URL)`) implements the same rules for the CSP choice. A parity vitest loads `app/vamos-meta.js` in a vm and compares `VamosMeta.allowed()` with `pixelPageAllowed()` over one shared table of ~60 URLs (every D-01 allow, every D-02 deny, each deny key, `?fbclid=`, `?utm_source=`, `?gclid=`, `/de/about`, `/de/sign-in`, `/account/details`, `/account/foo`, `/about/`, `/about#faq`, `/about#x=1`, `/sign-in?returnTo=/checkout`, `/sign-up?fbclid=…`).

### Pattern 3: Referrer guard (keeps `rl` clean)

**Problem [VERIFIED: fbevents module `SignalsFBEventsComparedManagers`]:** `rl` = `document.referrer`. Same-origin navigation under `strict-origin-when-cross-origin` gives the full previous URL, e.g. `https://vamostaxi.site/confirmation/VT-26-0733`, `…/checkout?from=…&to=…`, `…/checkout/pay/<token>`.

**Fix, two layers:**
1. `referrerAllowed(ref)`: empty → true. Same site (`vamostaxi.site`, `www.vamostaxi.site`) → true only if it is the bare origin (`/`, no query, no hash) or itself passes `urlAllowed`. Other origins → true unless the string matches `/vt-\d|token|session|returnTo|@/i` (cheap protection against a third-party URL that carries an identifier). A false result means: no pixel on this page view (fail closed).
2. `Referrer-Policy: strict-origin` in `SECURITY_HEADER_PAIRS` (Next pages through `next.config.ts` headers, mocks through `applySecurityHeaders`). Same-origin referrers become `https://vamostaxi.site/`, so a visitor returning from checkout to `/about` still counts. Cross-origin behaviour is unchanged (origin only, as today), so Mapbox, Google Maps, Turnstile and Stripe see the same Referer as now. No product code reads `Referer` or `document.referrer` [VERIFIED: git grep]. `apps/web/lib/security/headers.test.ts:34` pins the old value and changes on purpose.

The HTTP `Referer` on Meta's script and `/tr` requests is cross-origin, so it is origin-only under both policies.

### Pattern 4: CSP for mock HTML only, and only on allowed URLs

- OpenNext 4.1.0 returns a middleware response that has a body (an "internal result") straight away, without adding next.config `headers()` (`core/routingHandler.js`: `if (isInternalResult(middlewareEventOrResult)) return middlewareEventOrResult;`, before `headers` merge) [VERIFIED: node_modules/@opennextjs/aws/dist/core/routingHandler.js]. Live `/about` carries one CSP header [VERIFIED: curl 2026-10-01]. So the mock CSP is whatever `applySecurityHeaders` sets in `applyStagingNoindex`, and a later `headers.set("Content-Security-Policy", …)` in the mock branch wins. Rewrites (`NextResponse.rewrite(gone)`) are different: they do get next.config headers (main's `gone-headers.test.ts`).
- In the mock-serve branch (`middleware.ts` after `serveDcHtml`/`withSeoHead`, currently lines 648-651 on this branch), after `applyStagingNoindex`: if `metaMeasurementAllowed()` and `pixelPageAllowed(request.nextUrl)` (with the pinned public host), set `mockPageCsp({ metaPixel: true })`. Everything else keeps `SECURITY_HEADER_PAIRS`.
- Directives to add (allowed mock pages only):
  - `script-src … https://connect.facebook.net` (fbevents.js and `signals/config/<id>`) [CITED: developers.facebook.com/docs/meta-pixel/advanced/ "allow JavaScript to load from https://connect.facebook.net"; two paths `/en_US/fbevents.js` and `/signals/config/{pixelID}`].
  - `img-src … https://www.facebook.com` (`/tr/` GET via `new Image()`, the normal path when the URL is under 2048 characters) [VERIFIED: `signalsFBEventsSendGET`].
  - `connect-src … https://www.facebook.com` (`navigator.sendBeacon` / fetch fallbacks) [VERIFIED: `signalsFBEventsFireEvent` order GET → beacon (non-Chrome) → form POST].
  - `frame-src challenges.cloudflare.com https://www.facebook.com` (form-POST fallback posts into a hidden iframe on Chrome when the GET URL is too long) [VERIFIED: `signalsFBEventsSendFormPOST`]. Optional: leaving it out only loses over-long PageViews (fail closed).
  - Do NOT add `connect.facebook.net` to `connect-src` (blocks Meta's `/log/fbevents_telemetry/`), nor `www.instagram.com`, `gw.conversionsapigateway.com`. Less goes to Meta.
- Cache safety: the header depends on the URL only (path + query), not on the visitor; marketing HTML keeps `s-maxage=300` and `Vary: X-Consent-Present`.

### Pattern 5: Flags

```ts
// apps/web/lib/meta/legal-gate.ts
export const META_LEGAL_GATE_OPEN = true as const;               // owner texts live since ce55cd75 (decision 2026-09-30)
export const META_EVENTS_MANAGER_SWITCHES_OFF = true as const;   // .planning/decisions/2026-10-01-meta-events-manager-switches.md
export function metaMeasurementAllowed(): boolean {
  return META_LEGAL_GATE_OPEN && META_EVENTS_MANAGER_SWITCHES_OFF;
}
```
- Remove the `// @ts-expect-error TS2367` line: with `true` the comparison no longer errors and an unused directive fails typecheck.
- The browser learns the flags from constants baked into `app/vamos-meta.js` (`GATE_OPEN`, `SWITCHES_OFF`), identical for every visitor. A vitest pins: JS constants equal the TS constants; the decision file exists and contains "Both are off", "Automatic advanced matching": off and "Track events automatically without code": off; `META_LEGAL_GATE_OPEN =` is assigned exactly once in the repo (keep the existing count test).
- Kill switch latency: `/app/*` is `Cache-Control: public, max-age=300` (`apps/web/public/_headers`), so a flag set back to false reaches a returning browser within about 5 minutes after deploy; the CSP on allowed HTML follows the same 300 s edge cache. Write this in the hand-over.

### Pattern 6: Needle scan rewrite (`legal-gate.test.ts`)

Today `productFiles()` walks `apps/web/{app,components,lib,public}` only; the root mock folder `app/` (where the loader will live) is not scanned [VERIFIED: legal-gate.test.ts:52-54]. Rewrite:
- Scan `apps/web/{app,components,lib,public}`, `apps/web/middleware.ts`, `apps/web/worker.ts` (if present), and the repo-root `app/` tree.
- Per-needle allow map (exact relative paths):
  - `1595596972063765`, `fbq(`, `fbevents.js`: only `app/vamos-meta.js` and its synced copy `apps/web/public/app/vamos-meta.js`.
  - `connect.facebook.net`: those two plus `apps/web/lib/security/headers.ts`.
  - `facebook.com/tr`, `graph.facebook.com`, `META_CAPI_ACCESS_TOKEN`, `<noscript`+`facebook`: nowhere.
- `SECURITY_HEADER_PAIRS` (Next pages) must not contain a Meta host; only the mock-CSP builder may.
- Keep "flag" tests: exactly one assignment, no `process.env`/`fetch(` in `legal-gate.ts`, pixel id not in `legal-gate.ts`.

### Anti-Patterns to Avoid
- **Deny-list in the loader:** D-02 says the allow-list decides; deny rules are tests.
- **Trusting `vamos:consent` alone for a load:** re-read the server (D-04(3)).
- **`fbq('consent','grant')` after a revoke:** replays every queued command, including the automatic bfcache PageView [VERIFIED: `Ve()` pushes to `fbq.queue` while locked; `onUnlocked` replays].
- **`fbq('init', id, {em: …})` or `fbq('set','userData',…)`:** advanced matching. Banned.
- **A `<noscript><img …facebook.com/tr…>`:** banned by D-07 and the scan.
- **Writing fbp/fbc into `createCheckoutSession` input or Stripe metadata:** banned (D-09).
- **Storing `fbclid` before consent to build `_fbc` later:** a server-side cookie/record before Accept breaks "Set only after you accept". Accept the measurement loss.
- **Raw `update public.bookings` in TS:** use the definer function.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pixel transport, cookie minting | Own `/tr` beacon or own `_fbp` | Meta's `fbevents.js` loaded after the checks | Cookie format/refresh and Meta's dedup live there |
| Consent state | New reader | `VamosConsent.state()` (browser), `readConsentChoice` under `asAnon` (server) | Phase 27 reader, version filter, pgTAP-proven |
| Consent subject cookie parse | Regex in the route | `readConsentSubject` (`lib/consent/cookie.ts`) | Already validated UUID handling |
| Pending-only rule | TS status check | Definer function + trigger + CHECK | D-10 requires the database check |
| Local DB stack | New script | main's `scripts/local-test-stack.sh` (after merge) | Parameterised, refuses other sessions' ports |
| Serving mocks in a browser test | `next dev` | Playwright `context.route('https://vamostaxi.site/**')` fulfilled from `apps/web/public` | No Next, no DB; runs in the CI visual job |

**Key insight:** Meta's script does more than the base snippet suggests (SPA PageViews, bfcache PageViews, referrer, rolling cookies, localStorage). Every promise in the owner's text is kept by controlling when the script loads and what URL/referrer it sees, not by patching Meta's code.

## Runtime State Inventory

Not a rename phase. One runtime item matters: Meta's Events Manager pixel settings live in Meta's UI, not in git. Today's served config shows AutomaticMatching on (see top). Action: owner re-check; executor re-fetches the config before the flag flip.

## Common Pitfalls

### Pitfall 1: Automatic PageViews the loader did not ask for
**What goes wrong:** fbevents wraps `history.pushState`/`replaceState` and listens to `popstate`; each URL change sends `trackCustom PageView` with `allowDuplicatePageViews:true`. The mocks call `replaceState` in `account.dc.html:586,641` (`/account/<section>`), `vamos-locale.js:483` (language address), `SiteFooter.dc.html:319` (`#faq`), and `BookingSheet.dc.html:414-415` (same URL). A `pageshow` with `persisted` (back-forward cache) also sends one [VERIFIED: `signalsFBEventsSPANavigationUtil`].
**How to avoid:** `fbq.disablePushState = true` on the stub before fbevents loads; early `pageshow` listener (Pattern 1 step 1).
**Warning signs:** two `/tr` requests on one page in the browser spec.

### Pitfall 2: Referrer leak of a denied address
See Pattern 3. **Warning sign:** a `/tr` request whose `rl` contains `/confirmation`, `/checkout`, `VT-`, `token`.

### Pitfall 3: Allow-list checked earlier than `dl` is read
**What goes wrong:** `dl` is read when fbevents processes the queued `track` (after the script and config load), not when `fbq('track')` is called. A `replaceState` in between changes `dl`.
**How to avoid:** with `disablePushState` the only changes in between are mock `replaceState` calls, all of which keep allowed URLs (section, language prefix, `#faq`). Pin with a test that no mock calls `pushState`/`replaceState` with a query key outside the allow-list (grep test over `app/**/*.dc.html` + `app/*.js`).

### Pitfall 4: `@ts-expect-error` after the flip
`legal-gate.ts:10` breaks `pnpm typecheck` once the constant is `true`. Remove it in the same commit.

### Pitfall 5: Meta host in the Next policy by accident
`SECURITY_HEADER_PAIRS` feeds both `next.config.ts` and mocks. Put Meta hosts only in the mock builder; pin with `headers.test.ts`.

### Pitfall 6: Staff can update the new columns
`vamos_staff` has whole-table `select, insert, update, delete` on `public.bookings` (`20260823000023_rls_staff.sql:66`). Column-level `revoke` does not subtract from a table grant in Postgres. Only a trigger (`before insert or update of meta_fbp, meta_fbc`) makes "a paid booking can never be updated to add them" hold for every role, including definer functions. Allow setting to NULL on any status (future erasure). Staff can still read the values; customers (`authenticated`, column grants) and guests (`vamos_guest`, column grants) cannot, because new columns are not in their lists (`20260823000021_rls_customer.sql:33`, `…022_rls_guest.sql:13`).

### Pitfall 7: Branch is 14 commits behind main
`origin/main` (`137c5554`) changed `middleware.ts` (sign-in confirm page, `applyStagingNoindex(…, false)` for rewrites), added `scripts/local-test-stack.sh`, `tests/e2e-specs.ts`, port offsets, and the 26.0 gate set. Merge first; re-read line numbers after merge.

### Pitfall 8: Mock pages tested at their file path
The Phase 27 static server serves `/app/pages/about.html`; the loader denies that path (correct). The Phase 28 spec must serve mocks at public addresses on `https://vamostaxi.site` (the synced copies carry a `<base>` from `scripts/dc-page-base.mjs`, so relative assets resolve).

### Pitfall 9: Accept needs Turnstile in the browser test
Accept writes marketing true, which requires a Turnstile token. Stub `https://challenges.cloudflare.com/turnstile/**` with a tiny `window.turnstile` that calls the callback, and inject `<meta name="vt-turnstile-site-key" content="test">` into the fulfilled HTML (what `serveDcHtml` does live).

### Pitfall 10: Two cookies with the same name
A host-only and a domain cookie can both exist (`_fbp=a; _fbp=b`). `readMetaClickIds` takes a value only if all occurrences agree; otherwise none.

### Pitfall 11: Local Worker e2e cannot prove META-09 end to end
The intent needs Stripe before a booking exists; 27's run had `d2` N/A (no Stripe key). Prove META-09 with intent unit tests (fake deps), pgTAP, and the Worker-client test; the control session proves it live with one 4242 payment after Accept on `/about` and a read-only check of `meta_fbp` on that booking.

### Pitfall 12: Meta storage beyond the two cookies
The served config writes localStorage `multiFbc` (queue of up to 5 `_fbc` values, entries younger than 90 days, `maxMultiFbcQueueSize:5`) and `aemSource` (only with an `aem`/`brid` click param) [VERIFIED: cookie plugin, `SignalsFBEventsFbcCombiner`]. They are set only after Accept and are cleared by `clearMeta()`. The cookies page names only `_fbp` and `_fbc`. See Open Question 2.

## Code Examples

### Migration `20261003100000_booking_meta_click_ids.sql`
```sql
-- Phase 28 (META-09, D-09…D-11): the two Meta cookie values on the unpaid booking.
-- Additive: two nullable columns, one definer writer, one guard trigger. No data change.
alter table public.bookings add column if not exists meta_fbp text;
alter table public.bookings add column if not exists meta_fbc text;
alter table public.bookings add constraint bookings_meta_fbp_format check (
  meta_fbp is null or (length(meta_fbp) <= 64 and meta_fbp ~ '^fb\.[0-9]\.[0-9]{10,13}\.[0-9]{1,20}(\.(AQ|Ag|Aw|BA|BQ|Bg|[A-Za-z0-9_-]{8}))?$'));
alter table public.bookings add constraint bookings_meta_fbc_format check (
  meta_fbc is null or (length(meta_fbc) <= 600 and meta_fbc ~ '^fb\.[0-9]\.[0-9]{10,13}\.[A-Za-z0-9_-]{1,500}(\.(AQ|Ag|Aw|BA|BQ|Bg|[A-Za-z0-9_-]{8}))?$'));

create or replace function public.tg_bookings_meta_click_ids_pending_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.meta_fbp is not null or new.meta_fbc is not null)
     and (tg_op = 'INSERT' or new.meta_fbp is distinct from old.meta_fbp or new.meta_fbc is distinct from old.meta_fbc)
     and coalesce(case when tg_op = 'UPDATE' then old.status end, new.status) <> 'pending' then
    raise exception 'meta click ids: booking is not pending' using errcode = '55000';
  end if;
  return new;
end $$;
create trigger bookings_meta_click_ids_pending_only
  before insert or update of meta_fbp, meta_fbc on public.bookings
  for each row execute function public.tg_bookings_meta_click_ids_pending_only();

create or replace function public.checkout_set_meta_click_ids(p_booking_id uuid, p_fbp text, p_fbc text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status public.booking_status;
begin
  select b.status into v_status from public.bookings b where b.id = p_booking_id for update;
  if not found then raise exception 'checkout_set_meta_click_ids: booking not found' using errcode = 'P0002'; end if;
  if v_status <> 'pending' then raise exception 'checkout_set_meta_click_ids: booking is not pending' using errcode = '55000'; end if;
  update public.bookings set meta_fbp = p_fbp, meta_fbc = p_fbc where id = p_booking_id;
end $$;
revoke all on function public.checkout_set_meta_click_ids(uuid, text, text) from public;
grant execute on function public.checkout_set_meta_click_ids(uuid, text, text) to vamos_checkout;
```
Pattern source: `20260930130000_checkout_booking_details.sql` (pending check, 55000, grants). The function writes both values each Pay press, including NULLs, so a later press without consent clears earlier values. Check the `booking_status` enum name/schema qualification against `20260823000003_types.sql:31` and the trigger's `old.status` comparison when writing the final file. Regex classes come from fbevents `SignalsFBEventsPixelCookie` (4 or 5 dot parts, appendix 2 chars from `AQ|Ag|Aw|BA|BQ|Bg` or 8 chars; payload dots encoded as `__DOT__`) [VERIFIED] and Meta's format `fb.<subdomainIndex>.<creationTime ms>.<random|fbclid>` [CITED: fbp-and-fbc docs].

### Intent wiring (route stays thin)
```ts
// route.ts (inside postIntent, before runCheckoutIntent)
const cookieHeader = request.headers.get("cookie");
const metaIds = readMetaClickIds(cookieHeader);          // { fbp: string|null, fbc: string|null }, format-checked
const saveMetaClickIds = async (bookingId: string) => {
  let fbp: string | null = null, fbc: string | null = null;
  const subject = readConsentSubject(cookieHeader);
  if (metaMeasurementAllowed() && subject && (metaIds.fbp || metaIds.fbc)) {
    const choice = await asAnon(env, (tx) => readConsentChoice(tx, subject)).catch(() => null);
    if (choice?.marketing === true) ({ fbp, fbc } = metaIds);
  }
  await asCheckout(env, null, (sql) => sql`select public.checkout_set_meta_click_ids(${bookingId}::uuid, ${fbp}, ${fbc})`);
};
// intent.ts: optional dep `saveMetaClickIds?: (bookingId: string) => Promise<void>`, wrapped like afterBooking
// (try/catch, log SQLSTATE only, never the values), called right after each afterBooking(...) on owner paths
// (lines 594, 643, 693, 726 on this branch). Non-owner paths return before it (correct: never write on someone else's booking).
```

### Browser spec skeleton (`meta-pixel-28.spec.ts`)
```ts
// Needles from parts: legal-gate.test.ts scans product files.
const META_SCRIPT = "https://connect." + "facebook" + ".net/**";
const META_TR = "https://www." + "facebook" + ".com/tr**";
await context.route("https://vamostaxi.site/**", fulfilFromPublic);        // mocks at public addresses + meta key tag
await context.route("**/api/consent/state", stateStub);                    // tests/support/consent-state.ts pattern
await context.route(META_SCRIPT, (r) => r.fulfill({ path: STUB, contentType: "text/javascript" }));
const beacons: URL[] = [];
await context.route(META_TR, (r) => { beacons.push(new URL(r.request().url())); return r.fulfill({ status: 200, body: "" }); });
await context.route(/^https:\/\/(?!vamostaxi\.site)/, (r) => r.abort());   // nothing else leaves the browser
```
The stub (`tests/fixtures/fbevents-stub.js`) mimics the observed contract: drains `fbq.queue`, honours `consent revoke` by queuing, records calls on `window.__fbqCalls`, writes `_fbp` like Meta (`fb.1.<ms>.<digits>; expires=+90d; domain=.vamostaxi.site; path=/`), and fires `new Image().src = 'https://www.facebook.com/tr/?id=…&ev=PageView&dl=…&rl=…'`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Meta base code with `<noscript>` image | Base code without noscript, loaded by runtime after consent | This phase | No pixel for anyone who has not accepted |
| `META_LEGAL_GATE_OPEN = false` | `true`, plus `META_EVENTS_MANAGER_SWITCHES_OFF` | This phase | Phase 29 can use `metaMeasurementAllowed()` |
| `Referrer-Policy: strict-origin-when-cross-origin` | `strict-origin` | This phase | Same-origin referrers become the origin |
| One CSP for all HTML | Mock HTML on allowed URLs gets Meta hosts | This phase | Denied pages cannot load Meta even if the loader errs |
| fbevents writes `_fbc` from `fbclid` in URL or referrer, 90 days, refreshed | same (observed 2.9.412); new: `multiFbc` localStorage queue, fbc "param split" with `_aem_` parts | Meta-side, current | Server regex must allow `_`/`-` and the appendix |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `optIn(...,"AutomaticMatching",true)` + `selectedMatchKeys` in the served config means the Events Manager AAM switch is on (from the PixelConfig study, not Meta docs) | Top, item 2 | If Meta always serves it, the owner's answer stands; the code defence still holds. Low cost: one owner re-check |
| A2 | fbevents behaviour observed in 2.9.412 (90-day writes, refresh, SPA/bfcache PageViews, revoke queue, transport order) stays the same at ship time | Patterns 1-4 | Meta ships changes often. Re-fetch and re-grep `NINETY_DAYS_IN_MS`, `disablePushState`, `lockConsent` right before the flip; record in SUMMARY |
| A3 | `fbq('set','autoConfig',false,ID)` before `init` keeps InferredEvents (and so form-based automatic matching) off even though the config opts in later (optIn third arg respects prior optOut) | Top, item 2; Pattern 1 | If wrong, a sign-in form could be scanned on click. Mitigation: the owner switch off + global `autoConfig` false (`disableAutoConfig`) |
| A4 | `Referrer-Policy: strict-origin` has no functional side effect (no code reads Referer; cross-origin unchanged) | Pattern 3 | A third-party key restriction could depend on full same-origin referrer: not the case for cross-origin requests |
| A5 | Our `pageshow` listener runs before fbevents' because it is registered first | Pattern 1 | A bfcache restore after Necessary only in another tab could send one PageView; the `storage` listener reduces the window |
| A6 | Hosted `public.booking_status` and `vamos_checkout` match local; the migration is additive and safe on real bookings | Code Examples | Read back on hosted after apply (hand-over list) |

## Open Questions

1. **Automatic advanced matching state (blocking the flag flip, not planning).** See top, item 2. Recommendation: one question-form item now; the flip task is a `checkpoint` that requires the config grep to return 0.
2. **Meta localStorage keys not named on the cookies page** (`multiFbc`, `aemSource`). What we know: set only after Accept by Meta's script, hold the same `_fbc` values, filtered to 90 days, cleared by our withdraw. Unclear: whether the owner wants them named. Recommendation: mention in the hand-over; do not write any text (owner wording only). Not blocking.
3. **`/sign-in`, `/sign-up` with `?fbclid=`.** D-01 says "no query string at all"; D-03 says "Nothing else in the query is allowed on /sign-in and /sign-up", which could be read as fbclid/utm allowed. Recommendation: build the stricter D-01 reading (no query at all) and list it in the hand-over; ask only if the owner wants ad clicks on sign-in counted.
4. **Retention of saved `meta_fbp`/`meta_fbc` after Phase 29 sends Purchase.** Not in scope; flag for Phase 29 discussion (null them after the send, or keep).
5. **Next banner withdraw does not delete `_fbp`/`_fbc`.** A Necessary only on `/checkout` (Next) leaves the cookies until the next mock page load clears them. The server still saves nothing without consent. Recommendation: accept, or add a two-line `clearMetaCookies()` call to the Next banner's reject/save path (shared file `components/consent/CookieBanner.tsx`); planner's choice.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | all | yes | v26.7.0 | — |
| pnpm | all | yes | 11.7.0 | — |
| node_modules in worktree | tests, build, supabase CLI | **no** | — | Wave 0 `pnpm install --frozen-lockfile` |
| Docker | local Supabase | yes | 29.7.2 | — |
| Free port block | own stack | **6132x free** (61321-61327), inspector 8483 free; 5832x also free but was `vamos-taxi-mg2` (26.0) recently | — | 5832x |
| Running stacks | — | only `vamos-taxi` on 54322 running; `vamos-taxi-20` exists stopped | — | never touch |
| Network to connect.facebook.net | research only | yes (fetched twice) | — | tests never use it |
| slopcheck | package audit | not installed | — | not needed (no packages) |

### Local stack recipe (after merging main)
```
export VAMOS_STACK_ID=vamos-taxi-280 VAMOS_STACK_PORTS=613 VAMOS_STACK_INSPECTOR=8483
bash scripts/local-test-stack.sh start     # then: reset (from-zero replay + mark)
bash scripts/local-test-stack.sh pgtap     # BEFORE roles (extensions.test.sql asserts no password)
bash scripts/local-test-stack.sh roles     # vamos_edge / vamos_public passwords, refuses a wrong port
bash scripts/local-test-stack.sh exec -- pnpm --filter @vamos/db exec vitest run test/local/meta-click-ids.test.ts test/local/consent-reader.test.ts
node_modules/.bin/supabase gen types typescript --local --schema public --workdir "${TMPDIR:-/tmp}/vamos-sb-vamos-taxi-280" | diff -q - packages/db/database.types.ts
bash scripts/local-test-stack.sh stop
```
Check `docker ps` and `lsof -iTCP:61322` before `start`; Docker and port binds need the sandbox off. Never use `pnpm db:reset` / `pnpm db:types:check` as-is (they target 54322). If main's script is not present after merge, copy `scripts/local-stack-27.sh` with 593→613, project `vamos-taxi-280`, inspector 8483.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.11 (`apps/web/vitest.config.ts` include `lib/**/*.test.ts`, `tests/unit/**`); pgTAP via `supabase test db`; vitest `packages/db/test/local` (Worker client options); Playwright 1.62.1 (`apps/web/playwright.config.ts`) |
| Config file | as listed; scratch Supabase config generated by `scripts/local-test-stack.sh` |
| Quick run command | `pnpm --filter web exec vitest run lib/meta lib/security lib/consent/mock-mounts.test.ts lib/checkout/intent.test.ts` |
| Full suite command | `pnpm test:unit` + `bash scripts/local-test-stack.sh pgtap` + `node scripts/sync-dc-mock-to-public.mjs && pnpm --filter web exec playwright test tests/integration/meta-pixel-28.spec.ts tests/integration/consent-banner-27.spec.ts --workers=1` |

### Phase Requirements → Test Map
| Req ID | Behavior (owner-text promise) | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| META-06 | "Set only after you accept": no request to Meta and no `_fbp` before Accept, on every allowed page | Playwright | `… playwright test tests/integration/meta-pixel-28.spec.ts -g "before accept"` | Wave 0 |
| META-06 | "After you accept, Meta records that a page was opened": Accept on `/about` → exactly one `/tr` with `ev=PageView`, `dl` = page URL, `rl` empty or allowed | Playwright | `-g "accept on page"` | Wave 0 |
| META-06 | Already accepted (state marketing true) → one PageView on `/`, `/de/about`, `/account/details`, `/bookings`, `/sign-in` (no query), `/?fbclid=x&utm_source=y` | Playwright | `-g "allowed pages"` | Wave 0 |
| META-06/07 | Allow-list table (every D-01 allow, every D-02 deny, each deny key, hash rules, `vt-\d`, host rule) identical in browser and server twin | unit (vm + parity) | `pnpm --filter web exec vitest run lib/meta/vamos-meta.test.ts lib/meta/pixel-pages.test.ts` | Wave 0 |
| META-07 | "We do not send … route, booking reference": no script request on `/manage-booking`, `/booking-detail`, `/reset-password`, `/sign-in?returnTo=…`, `/sign-up?code=…`, `/about?ref=1`, `/about?session=…`, `/about#token=…`, dashboard host | Playwright | `-g "denied pages"` | Wave 0 |
| META-07 | Referrer from `/confirmation/VT-26-0001` or `/checkout?from=…` (full same-origin) → no PageView; bare origin → PageView | unit + Playwright (`page.goto(url, { referer })`) | `-g "referrer"` | Wave 0 |
| META-07 | Cached HTML has no pixel: every mock HTML and Next page source free of needles; `serveDcHtml` unchanged (D-23 pin) | source pin | `… vitest run lib/meta/legal-gate.test.ts lib/consent/mock-mounts.test.ts` | rewrite |
| META-07 | Ops never loads it: no `app/ops/*` file references `vamos-meta.js`; both CookieBanner helmets do, once | source pin | `… vitest run lib/consent/mock-mounts.test.ts` (extend) | extend |
| META-07 | CSP: Meta hosts only on allowed mock URLs when flags on; never in `SECURITY_HEADER_PAIRS`; Referrer-Policy `strict-origin` | unit | `… vitest run lib/security/headers.test.ts lib/meta/pixel-pages.test.ts` | rewrite + Wave 0 |
| META-08 | "No hashed email or phone": `init` has exactly one argument; `autoConfig` false (with id) precedes `init`; `disablePushState` true before the script tag; no `userData`, no `<noscript>` | unit (vm harness records `fbq` calls in order) | `… vitest run lib/meta/vamos-meta.test.ts` | Wave 0 |
| META-08 | Only PageView: no other `fbq('track…')`/`trackCustom` in product code; replaceState on the page does not add a beacon | source pin + Playwright | `-g "one page view"` | Wave 0 |
| META-08 | Switch flag pinned to decision file; JS constants equal TS constants | unit | `… vitest run lib/meta/legal-gate.test.ts` | rewrite |
| META-06 (D-06) | "Withdraw at any time": Accept then Necessary only on the same page → `fbq('consent','revoke')` called, no further `/tr`, `_fbp`/`_fbc` gone (all domain variants), `multiFbc` removed; next page load: no script | Playwright + unit | `-g "withdraw"` | Wave 0 |
| META-09 | "…the two Meta cookie identifiers, if they exist": pending booking accepts valid values; confirmed/paid refused 55000 and unchanged; direct staff/postgres update on a paid booking refused by trigger; NULL allowed on any status; bad formats refused 23514; grants: `vamos_checkout` EXECUTE only; `authenticated`/`vamos_guest` cannot select the columns | pgTAP | `bash scripts/local-test-stack.sh pgtap` (`booking_meta_click_ids.test.sql`) | Wave 0 |
| META-09 | Through the Worker client options (`fetch_types:false`): text params and NULLs round-trip, no arrays | local vitest | `bash scripts/local-test-stack.sh exec -- pnpm --filter @vamos/db exec vitest run test/local/meta-click-ids.test.ts` | Wave 0 |
| META-09 | Saved only with consent at that moment; invalid formats dropped; flags off → NULLs; failure does not change the Pay response; called only on owner paths | unit | `… vitest run lib/meta/click-ids.test.ts lib/checkout/intent.test.ts` | Wave 0 + extend |
| META-09 | "Not in Stripe": `createCheckoutSession` input never contains the cookie values; `lib/checkout/stripe.ts` has no `fbp`/`fbc` | unit + source pin | same | extend |
| D-08 | Our code never sets `_fbp`/`_fbc` (no `Set-Cookie` / `document.cookie=` with a value for them outside `clearMeta`'s `Max-Age=0`) | source pin | `… vitest run lib/meta/vamos-meta.test.ts` | Wave 0 |

Manual only (owner, Hermes in-app browser, after the control session deploys): Accept on `/about`, Events Manager → Test events shows one PageView and nothing else; devtools shows `_fbp` expiring about 90 days out; Necessary only, reload, no request to Meta; one 4242 payment after Accept, then the control session reads `meta_fbp` on that booking read-only.

### Sampling Rate
- **Per task commit:** quick run command (touched files only, per memory `parallel-agents-gate-load`).
- **Per wave merge:** `pnpm test:unit`, `bash scripts/local-test-stack.sh pgtap`, `pnpm typecheck`.
- **Phase gate (lead, once, machine quiet), each exact:**
  1. `git merge origin/main` (done in Wave 0; re-check `git merge-base --is-ancestor origin/main HEAD` at hand-over)
  2. `pnpm install --frozen-lockfile`
  3. `pnpm test:unit`
  4. `VAMOS_STACK_ID=vamos-taxi-280 VAMOS_STACK_PORTS=613 VAMOS_STACK_INSPECTOR=8483 bash scripts/local-test-stack.sh reset` (from-zero replay)
  5. `… local-test-stack.sh pgtap` (full, before roles)
  6. `… local-test-stack.sh roles` then `… exec -- pnpm --filter @vamos/db exec vitest run test/local/meta-click-ids.test.ts test/local/consent-reader.test.ts`
  7. `pnpm typecheck` · 8. `pnpm lint` · 9. `pnpm lint:css` · 10. `pnpm check:numbers` · 11. `pnpm check:legal-claims` · 12. `pnpm check:public-env` · 13. `pnpm check:db-fences` · 14. `pnpm i18n:check` · 15. `pnpm db:seed:check`
  16. types diff against the 613 stack (recipe above), not `pnpm db:types:check`
  17. `pnpm build` and `pnpm --filter web exec opennextjs-cloudflare build`
  18. Local Worker header proof (memory `seo-head-table-and-language-addresses`): `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgres://x:x@127.0.0.1:5/x pnpm exec wrangler dev --local --port 4300`, then `curl -sI` with `--resolve vamostaxi.site:4300:127.0.0.1` if the host pin needs it: `/about` CSP contains `connect.facebook.net`; `/manage-booking`, `/sign-in?returnTo=/x`, `/checkout` do not; every response has `Referrer-Policy: strict-origin`; `/about` HTML contains no needle
  19. `node scripts/sync-dc-mock-to-public.mjs && pnpm --filter web exec playwright test tests/integration/meta-pixel-28.spec.ts tests/integration/consent-banner-27.spec.ts --workers=1`
  20. Worker e2e `apps/web/tests/e2e-worker/run.sh` against the 613 stack (API 61321, DB 61322, container `supabase_db_vamos-taxi-280`); known red `a3` from 27 unless main fixed it
  21. Must-not greps on added lines of `git diff origin/main...HEAD`: `sk_live_`, `vamostaxi.eu`, `graph.facebook.com`, `META_CAPI_ACCESS_TOKEN`, `noscript`; pixel id / `fbq(` / `fbevents` only in `app/vamos-meta.js` and planning docs
  22. `git diff --numstat origin/main...HEAD` on quote, pricing, stripe, confirmation, checkout page files: only `app/api/checkout/intent/route.ts` and `lib/checkout/intent.ts` (the save dep) change
  23. Config re-fetch: `curl -s "https://connect.facebook.net/signals/config/1595596972063765?v=2.9.412&r=stable" | grep -c 'optIn("1595596972063765", "AutomaticMatching"'` → must be 0 before the flags are committed true
  24. Stop the stack (`… local-test-stack.sh stop`), restore `apps/web/tsconfig.json` and `next-env.d.ts`, no process left

### Wave 0 Gaps
- [ ] `git merge origin/main` (14 commits) and `pnpm install --frozen-lockfile`
- [ ] Own stack `vamos-taxi-280` on 613xx and a baseline pgTAP run on unchanged code (record reds that are main's)
- [ ] `packages/db/supabase/tests/booking_meta_click_ids.test.sql` (template: `checkout_booking_details.test.sql`)
- [ ] `packages/db/test/local/meta-click-ids.test.ts` (template: `consent-reader.test.ts`, `worker-arrays.test.ts`)
- [ ] `apps/web/lib/meta/vamos-meta.test.ts` (vm harness: template `lib/consent/vamos-consent.test.ts`)
- [ ] `apps/web/lib/meta/pixel-pages.test.ts`, `click-ids.test.ts`
- [ ] `apps/web/tests/fixtures/fbevents-stub.js`, `apps/web/tests/integration/meta-pixel-28.spec.ts` (+ a Turnstile stub)

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | Meta cookies are not session cookies; `consent_subject` unchanged |
| V4 Access Control | yes | Definer function, EXECUTE `vamos_checkout` only; trigger blocks non-pending writes for every role; no column grant to `authenticated`/`vamos_guest` |
| V5 Input Validation | yes | Cookie values validated by regex in TS and by CHECK in the DB; values never logged |
| V6 Cryptography | no | — |
| V8 Data Protection | yes | Allow-list + referrer guard + `Referrer-Policy: strict-origin`; nothing in Stripe metadata; consent read at the Pay moment |
| V14 Config | yes | Path-scoped CSP; flags in code, not env; no new secret |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Booking reference or route reaches Meta via `dl`/`rl` | Information disclosure | Allow-list, `vt-\d` rule, referrer guard, `strict-origin`, `disablePushState` |
| Pixel on a cached page for someone who refused | Information disclosure | Script only from the runtime after server state; HTML identical for all; CSP URL-scoped, not visitor-scoped |
| Forged `_fbp` in Cookie header stuffing junk into bookings | Tampering | Format regex + length caps + CHECK; pending-only |
| Backfill on a paid booking (by staff or a later request) | Tampering / Repudiation | Function 55000 + trigger; pgTAP |
| Automatic matching scraping sign-in fields | Information disclosure | `autoConfig` false before `init`, no user data, owner switch re-check |
| Replay of queued events after `grant` | Information disclosure | Never `grant` after `revoke` on a page |
| Meta script compromise | Tampering | Accepted third-party risk; limited to allowed public pages by CSP; never on checkout, pay link, ops |

## Shared-File Risks

- `apps/web/middleware.ts`: changed on main (merge first); other sessions (P1, P6, security) may touch it. Keep the change to the mock-serve branch, a few lines.
- `apps/web/lib/security/headers.ts`, `headers.test.ts`: Referrer-Policy pin changes on purpose; list in hand-over.
- `apps/web/lib/meta/legal-gate.ts`, `legal-gate.test.ts`: changed on purpose (flag flip, scan rewrite); Phase 29 builds on them.
- `app/pages/CookieBanner.dc.html`, `app/home/CookieBanner.dc.html`: one helmet line each; insert exactly, no reformat.
- `apps/web/lib/checkout/intent.ts`, `app/api/checkout/intent/route.ts`: pay path; P1/P6 sessions work on paid-trip edits nearby. Additive optional dep only.
- `packages/db/database.types.ts`: regenerate after the last merge of main.
- Migrations: `20261003100000` sorts before main's already-applied `20261005…`/`20261007…`; from-zero replay order differs from hosted apply order. Neither depends on the other (checked: later files grant on specific functions only, no `alter default privileges`).
- `scripts/db-access-fence-allowlist.json`: merge conflicts seen in 27; keep both sides.

## Hosted read-only checks for the control session (after apply)
1. Before: `select count(*) from public.bookings`. After: same count; `select count(*) from public.bookings where meta_fbp is not null or meta_fbc is not null` = 0.
2. `has_function_privilege('vamos_checkout','public.checkout_set_meta_click_ids(uuid,text,text)','EXECUTE')` true; same for `anon`, `authenticated`, `vamos_system`, `vamos_guest` false.
3. `has_column_privilege('authenticated','public.bookings','meta_fbp','SELECT')` false; same for `meta_fbc` and `vamos_guest`.
4. `pg_get_functiondef` md5 of the function and the trigger function equal local.
5. ORDER: migration before the Worker deploy (the intent calls the function; failure is swallowed, but the save would be lost).

## Sources

### Primary (HIGH confidence)
- fbevents.js 2.9.412 and `signals/config/1595596972063765` fetched 2026-10-01 07:19 and 07:31 UTC (modules `SignalsPixelCookieUtils`, `SignalsFBEventsPixelCookie`, `SignalsFBEvents.plugins.cookie`, `SignalsFBEventsFbcCombiner`, `signalsFBEventsSPANavigationUtil`, `SignalsFBEventsOptIn`, `SignalsFBEventsComparedManagers`, `signalsFBEventsFireEvent`, `signalsFBEventsSendGET`, `signalsFBEventsSendFormPOST`, `SignalsFBEventsNetworkConfig`, consent lock in `Ve()`), saved in the session scratchpad, not in the repo
- https://developers.facebook.com/docs/meta-pixel/get-started (base code)
- https://developers.facebook.com/docs/meta-pixel/advanced/ (autoConfig placement; CSP host and script paths)
- https://developers.facebook.com/docs/meta-pixel/implementation/gdpr (consent revoke before init, grant later)
- https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc (cookie format, 90 days for `_fbc`, case-sensitive click id)
- Repo (this worktree): `apps/web/middleware.ts` (DC_PAGES 33-52, serveDcHtml 112-131, applyStagingNoindex 415-429, applyPublicCacheHeaders 443-478, mock branch 640-653), `apps/web/lib/security/headers.ts`, `headers.test.ts`, `apps/web/next.config.ts` headers(), `apps/web/lib/meta/legal-gate.ts`/`.test.ts`, `app/vamos-consent.js`, `app/pages/CookieBanner.dc.html` (helmet 31, bindConsent 282-298), `apps/web/lib/consent/mock-mounts.test.ts`, `apps/web/lib/dc-mock-urls.ts`, `app/vamos-page-transition.js`, `app/vamos-locale.js:470-485`, `apps/web/app/api/checkout/intent/route.ts`, `apps/web/lib/checkout/intent.ts:551-727`, `apps/web/lib/checkout/create-booking.ts`, `apps/web/app/api/consent/state/route.ts`, `apps/web/lib/consent/read.ts`, migrations `20260827000003_checkout_rpc.sql`, `20260930130000_checkout_booking_details.sql`, `20260823000021/22/23`, `20260823000017_audit_log.sql` (bookings not audited), pgTAP `checkout_booking_details.test.sql`, `apps/web/public/_headers`, `apps/web/tests/integration/consent-banner-27.spec.ts`, `tests/support/consent-state.ts`
- `origin/main` (`137c5554`): `scripts/local-test-stack.sh`, `apps/web/playwright.config.ts` (E2E_SPECS), `.github/workflows/pr.yml`, `.planning/CONTROL-BOARD.md`, middleware diff
- `node_modules/@opennextjs/aws@4.1.0/dist/core/routingHandler.js` (main checkout install, same lockfile version)
- Live reads (read-only): `curl -I https://vamostaxi.site/about` and `/checkout` headers; `GET /api/consent/state` → policy `2026-10-01`; `/app/vamos-meta-texts.js` contains the owner's 90-day line

### Secondary (MEDIUM)
- https://arxiv.org/html/2603.09380v1 (PixelConfig: AAM and InferredEvents representation in config scripts)
- https://www.observepoint.com/cookies/_fbp/ and other cookie databases (90-day `_fbp`)

### Tertiary (LOW)
- none relied on

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no new package; versions from lockfile.
- Architecture: HIGH, every seam read with line numbers; header precedence read in the installed OpenNext source and confirmed on live.
- Pitfalls: HIGH for SPA/bfcache PageViews, referrer, revoke queue, cookie domain (read in Meta's script); MEDIUM for the AAM interpretation (study, not Meta docs).

**Research date:** 2026-10-01
**Valid until:** fbevents-derived facts: re-check on the day the flags flip (Meta changes the script often). Repo seams: until the next merge of main.

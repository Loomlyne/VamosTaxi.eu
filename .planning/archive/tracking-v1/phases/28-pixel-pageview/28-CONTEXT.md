# Phase 28: Pixel PageView - Context

**Gathered:** 2026-10-01
**Status:** Waiting for the owner's signature
**Branch:** `gsd/phase-28-pixel-pageview` in `/Users/koss/Developer/vamos-wt/phase-28`, cut from origin/main `0edf87d9`
**Migrations:** `20261003100000`–`20261003190000` (reserved by the control session)

<domain>
## Phase Boundary

After a visitor accepts marketing under the current consent version, pixel `1595596972063765` sends
one PageView on allowed pages only. `_fbp` and `_fbc` are saved on the unpaid booking when the
visitor presses Pay. Nothing else goes to Meta. No new screen. Purchase is Phase 29.

Requirements: META-06, META-07, META-08, META-09.
</domain>

<findings>
## What is true today (read-only mapping, 2026-10-01)

- Pages whose address carries data the privacy text promises we never send:
  `/checkout` (both street addresses, quote id), `/confirmation/VT-…` (booking reference, also in
  the tab title), `/confirmation?session=cs_…`, `/checkout/pay/<token>`, `/review?token=`,
  `/sign-in?returnTo=/checkout?from=…&to=…` (whole trip).
- Every page on the allow-list below is a **mock** page. No Next page is allowed, so the pixel
  loader lives only in the mock runtime.
- Consent: `GET /api/consent/state` gives `chosen && choice.marketing` under the current version
  (`2026-10-01`). Mock pages have `window.VamosConsent` (`state()`, `onChange`, event
  `vamos:consent` with the chosen categories). Next pages fire `vamos:consent-recorded` without detail.
- CSP (`apps/web/lib/security/headers.ts`) blocks `connect.facebook.net` and `www.facebook.com`.
  No nonce. The `legal-gate.test.ts` needle scan forbids pixel strings in product files.
- `META_LEGAL_GATE_OPEN = false`; no product code imports it.
- The unpaid booking is written at the Pay press by `POST /api/checkout/intent` → `asCheckout` →
  `public.checkout_create_booking` (SECURITY DEFINER), then `checkout_set_booking_details`
  (requires status `pending`). No column exists for `_fbp` / `_fbc`.
- Cached marketing HTML (9 indexable mock pages, `s-maxage=300`) carries no per-visitor state.
</findings>

<decisions>
## Implementation Decisions

### Where the pixel may count a page view (owner, 2026-10-01, question form)
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

### When it loads (carried forward, owner decisions)
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

### What is sent
- **D-07:** PageView only. No advanced matching (no user data in `fbq('init')`), no noscript image,
  automatic configuration off in code as well (`autoConfig` false), no other event, no Purchase in the
  browser, no middle events (quote seen, checkout started, pay step).
- **D-08:** The owner's texts stay verbatim. `_fbp` and `_fbc` must be kept for up to 90 days to keep
  the cookies text true: research confirms the lifetimes Meta's script sets and the plan pins them;
  if they differ, stop and ask the owner.

### Saving `_fbp` / `_fbc` (META-09)
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

### Carried forward
- No `sk_live_`, no `vamostaxi.eu`, no invented legal copy, no invented CHF, no hashed e-mail or
  phone. Quote, pay and confirmation logic unchanged (the Pay press only saves two cookie values).
</decisions>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — META-06…META-09
- `.planning/ROADMAP.md` — Phase 28 success criteria
- `.planning/decisions/2026-09-30-meta-wording.md` — the three texts, 90 days, Meta Platforms Ireland Ltd
- `.planning/decisions/2026-10-01-meta-events-manager-switches.md` — both switches off
- `.planning/phases/27-consent-record/27-CONTEXT.md` (D-19, D-20, D-23) and `27-HANDOVER.md`
- `.planning/phases/26-legal-gate/26-CONTEXT.md` — gate rules
- `apps/web/lib/meta/legal-gate.ts`, `legal-gate.test.ts`
- `app/vamos-consent.js`, `app/pages/CookieBanner.dc.html`, `app/home/CookieBanner.dc.html`
- `apps/web/app/api/consent/state/route.ts`, `apps/web/lib/consent/read.ts`
- `apps/web/lib/security/headers.ts`, `apps/web/middleware.ts` (DC_PAGES, cache, CSP on mocks)
- `apps/web/app/api/checkout/intent/route.ts`, `apps/web/lib/checkout/intent.ts`,
  `apps/web/lib/checkout/create-booking.ts`,
  `packages/db/supabase/migrations/20260827000003_checkout_rpc.sql`,
  `packages/db/supabase/migrations/20260930130000_checkout_booking_details.sql`
- `CLAUDE.local.md`, memory notes worker-pg-client-no-arrays, customer-column-grants, live-cookie-banner-is-mock
</canonical_refs>

<deferred>
## Deferred

- Purchase from the settle queue — Phase 29.
- Finish-your-account step with optional phone (27 D-37) — after Phase 29 (owner, 2026-10-01).
</deferred>

---
*Phase: 28-Pixel PageView · Context gathered 2026-10-01*

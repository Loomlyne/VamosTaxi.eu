# Quick Task 261016-ov1: Google Consent Mode v2 "advanced" - Context

**Gathered:** 2026-10-16
**Status:** Plan drafted; code waits for the owner's signature on the wording file
**Job session:** branch `quick/google-advanced-consent` from origin/main 31b36d03. Controller: T3 thread 0fbbf0c1.

<domain>
## Task Boundary

Owner decision 2026-10-16 ~16:30 CET. Google (Ads AW-368142830, GA4 G-K5MZME44P6) moves from Consent Mode
"basic" (gtag.js added only after `/api/consent/state` says Marketing or Analytics is on) to "advanced": gtag.js
loads for every visitor on the address list with `consent default` = denied, so refusers send cookieless pings.
Accept sends `consent update` granted exactly as today, read from `/api/consent/state`.

Out of scope: Meta pixel (stays consent-only, unchanged); Tag Manager (stays OFF, `GTM_ON`/`GTM_OPEN`/`GTM_SHOWN` false);
remarketing (`ad_personalization` stays denied always).
</domain>

<decisions>
## Implementation Decisions

### Locked by the owner (2026-10-16)
- Advanced mode for Google; default denied for all four signals; update granted only from the server answer.
- Meta unchanged. GTM off. CSP must allow Google hosts before consent.
- Mock and Next pages both use the one loader (`app/vamos-google.js`: mock CookieBanner.dc.html x2, Next `app/[locale]/layout.tsx`).
- Legal wording is a hard gate: draft in `.planning/decisions/2026-10-16-google-advanced-consent-wording.md`; no code before his signature.
- Consent version is bumped.

### Proposed, needs the owner (open choices, recommendation first)
1. **Ads conversion and GA4 purchase while denied.** (a, recommended) send a cookieless conversion/purchase ping
   with amount and CHF only, no booking reference (Google documents conversion modelling from denied pings;
   the booking reference is an identifier we do not hand over without consent). (b) keep today's rule: only when
   granted (no modelling for refusers). (c) send as today incl. booking reference (not recommended).
2. **`ads_data_redaction`**: keep `true` (recommended; today's value). With ad_storage denied, Google redacts the
   ad-click identifier and sends Ads pings through a cookieless domain; only "an ad click happened" remains.
3. **`url_passthrough`**: keep `false` (recommended). `true` appends gclid/wbraid/_gl to internal links and form
   addresses, which breaks our "path only, never a query" rule and the clean-address tests.
4. **GA4 button and booking-step events while denied**: (a, recommended) sent as cookieless pings (event name and
   contact kind only), same fixed list; (b) only when granted.

### Claude's Discretion (technical, stated in the plan)
- Region: the default applies to every visitor (no `region` list): one behaviour, one wording.
- Order: `consent default` before `js`/`config`. The configs and the one page_view go out after the server
  answers (or after a 1.5 s timeout / an unreachable server, as denied), so a visitor who already accepted
  is never counted once denied and once granted.
- Same address list as today (never a pay link, manage-booking, review, dashboard, ops).
- Withdraw: update denied, delete Google cookies on every domain form; the tag stays and sends denied pings.
- CSP: already per address, not per consent (`lib/google/google-csp.ts` via `pixel-csp.ts`); the plan adds any
  denied-mode host Google's CSP guide lists that is missing, proven by the headless run.
- Consent version: `CONSENT_POLICY_VERSION` 2026-10-13 -> the ship day (Zurich), with the legal-gate pin.
</decisions>

<specifics>
## Consent version effect
Every stored choice is under `2026-10-13`. After the bump `/api/consent/state` returns `chosen:false` for everyone:
the banner shows again on the next visit; until they choose, Google runs denied (pings, no cookies) and Meta does
not load; a visitor who accepted before gets no Google cookies and no Meta until they accept again. Meta's
server-side events read consent as of the paid time under the current version, so a booking paid after the bump
by someone who has not re-chosen sends no Meta server event. Old rows stay in `consent_log` as proof; no migration.
</specifics>

<canonical_refs>
## Canonical References
- https://developers.google.com/tag-platform/security/concepts/consent-mode
- https://support.google.com/analytics/answer/11161109
- https://support.google.com/google-ads/answer/10548233
- https://developers.google.com/tag-platform/security/guides/csp
- EDÖB, Leitfaden Cookies und ähnliche Technologien, v1.1, 06.10.2025
- .planning/decisions/2026-10-09-ad-tracking-wording.md, 2026-10-11-ga4-wording.md, 2026-10-13-gtm-wording.md, 2026-10-15-gtm-off.md
</canonical_refs>

---
phase: 05-public-surfaces-customer-accounts
plan: 33
probed: 2026-09-04
worker: vamos
version: 093a4976-a8fe-4fe3-ab97-2ac1bc83ed7b
host: https://vamostaxi.site
ua: Chrome/128
quote_post: not-run
contact_submit: not-run
---

# Phase 5 staging connection table

Chrome-UA curls after Wave 12 deploy of Worker **`vamos`** (100% `093a4976`, custom domains `vamostaxi.site` / `www` / `dashboard.vamostaxi.site`).

**Not run:** `POST /api/quote`. **Not submitted:** `/contact`. Cookieless only — no Gmail session, so `/account` Save is not claimed.

## APIs

| URL | HTTP | Fingerprint | Leftover |
|-----|------|-------------|----------|
| `GET /api/reviews` | 200 | `{ ok: true, data: [5 published rows] }` — no `locked` field | none |
| `GET /api/staff/reviews` | 401 | `{ ok: false, code: "no-session" }` | none |
| `GET /api/auth/session` | 200 | `{ signedIn: false, displayName: null, email: null }` | none |
| `GET /api/geo/suggest?q=zurich&session_token=<uuid>&locale=en` | 200 | `{ ok: true, suggestions: […] }` Mapbox | none |
| `GET /api/flight/LX318` | 503 | `{ error: "provider_unavailable", action: "enter_time" }` | none (honest; AeroDataBox missing) |

## In-scope pages

Locales `/de` `/fr` `/ar` of each path returned the same HTTP and leftover as English unless noted.

| URL | HTTP | Wire fingerprint | Leftover |
|-----|------|------------------|----------|
| `/` `/de` `/fr` `/ar` | 200 | HTML: `/api/geo/suggest` `/api/geo/reverse` `/api/quote` `/api/flight`. Reviews wire is `/app/vamos-reviews.js` → `GET /api/reviews`. Home `.dc` has **no** `const FLIGHTS`. | none |
| `/about` + locales | 200 | DC + i18n dict (no API required) | none |
| `/faq` + locales | 200 | DC + i18n dict | none |
| `/contact` + locales | 200 | `/api/contact` in HTML. Turnstile present. Form **not** submitted. | none |
| `/sign-in` + locales | 200 | `/api/auth` lives in `/app/pages/AuthForm.dc.html` (sibling), not inlined in the shell HTML | none |
| `/account` + locales | 200 | `/api/auth` in HTML. Cookieless Save = handler exists, not a signed-in write | none |
| `/reset-password` + locales | 200 | `/api/auth` | none |
| `/cookies` `/privacy` `/terms` `/imprint` `/cancellation` + locales | 200 | legal DC. TBC pills stay TBC | none |
| `/coming-soon` + locales | 200 | static product page | none |

## Expected 404s

| URL | HTTP | Note |
|-----|------|------|
| `/login` `/de/login` `/fr/login` `/ar/login` | 404 | public login is `/sign-in`; ops login is dashboard only |
| `/partner` | 404 | out of V1 |
| `/become-a-partner` | 404 | out of V1 |
| `/fleet` | 404 | out of V1 |

Those 404 bodies are Next `__next_error__` (~165 KB). The RSC payload still contains the strings `Become a partner` and `Pending client input`. That is the error bundle, **not** a live partner page.

## Out of Phase 5 (HTTP only)

| URL | HTTP | Note |
|-----|------|------|
| `/checkout` | 200 | Phase 7 — mock `pay()` / no Stripe |
| `/confirmation` | 200 | Phase 7 |
| `/bookings` | 200 | Phase 8 — `/api/auth` in HTML |
| `/manage-booking` | 200 | Phase 9 — `/api/auth` in HTML |
| `/booking-detail` | 404 | Phase 9 — live 200 is a later fail-close |

## Asset fingerprints (Wave 12)

| Asset | HTTP | `const FLIGHTS` | `/api/reviews` | `Pending client input` |
|-------|------|-----------------|----------------|------------------------|
| `/app/home/home.dc.html` | 200 | no | no (reviews JS is separate) | no |
| `/app/home/Reviews.dc.html` | 200 | no | no | no |
| `/app/vamos-reviews.js` | 200 | no | yes (`listPath()` public vs staff) | no |

## Secrets after this deploy (names only)

`CONTACT_EMAIL_FROM` `CONTACT_SUPPORT_RECIPIENT` `CONTACT_TURNSTILE_ALLOWED_HOSTNAMES` `MAPBOX_TOKEN` `QUOTE_LOCK_SECRET` `RESEND_API_KEY` `SEND_EMAIL_HOOK_SECRET` `SUPABASE_ANON_KEY` `SUPABASE_URL` `TURNSTILE_SECRET_KEY` `TURNSTILE_SITE_KEY` — 11, same as before. No Stripe keys. No AeroDataBox.

## Owner still open

- **05-27 contact UAT** — do not submit the live form from here.
- **05-28** stays gated on that UAT.
- Signed-in `/account` Save needs Koss Gmail → not claimed.

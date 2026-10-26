# Quick 261026-ckc — summary

Plan signed by the owner 2026-10-26 ("signed, go ahead"). Branch `quick/261026-ckc-banner-and-ads-conversion`.

| Task | Commit | Result |
|---|---|---|
| 1 Banner without human check | `874c31e` | Mock (`app/home`, `app/pages` CookieBanner.dc.html) and Next banner post every choice at once; `/api/consent` no longer verifies Turnstile; rate limit kept |
| 2 Consent Mode v2 advanced | `e7cf224` + review fix | Default denied before GTM/gtag on mock and Next pages; display cache applied at once, server record wins, `vamos:consent` updates; Meta untouched |
| 3 Booking conversion | `d276675` + review fix | `lib/tracking/booking-conversion.ts`: Ads `AW-368142830/2ZvxCLnF2M8cEO7Txa8B` (existing booking goal from GTM, so no new label needed), GA4 purchase, Meta Purchase; once per reference (page-load Set + localStorage), only booked trips with receipt read, within 24 h of payment; CSP adds www.googleadservices.com |

Deviation from plan: the owner checkpoint (new conversion label) was dropped. The existing Ads booking action's label was read from the published GTM container, so bookings land in the goal the campaigns already use.

Checks (cloud container): `pnpm gate:local` green up to and including build and `test:unit` (6095 web tests). `test:db-lab` not run: no Docker in the container; no database change in this job. Sonnet review: no blockers; findings 1 (repeat guard) and 4 (consent timing) fixed; 2 (voucher revisit without paidAt) and 3 (status precedence) accepted, Google dedupes on transaction_id.

Not verified yet: live behaviour. Needs the deploy from the owner's Mac, then: Accept all closes in one click; Google hits carry consent; one 4242 booking sends the conversion hit with the label and transaction_id.

## Live (2026-10-26 ~15:10 UTC)

Owner deployed `main` `fbb6f2e0` from his Mac: Worker `vamos` version `a3cc657c-cb1b-4053-b288-585cab57b5fd` (includes #92 and #93 Dependabot fixes, Next 15.5.28). GitHub deploy path: checks pass, the upload stops until the repo has `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.

Checked on vamostaxi.site (Chromium, fresh profile):
- `/` and `/checkout`: Accept all → `POST /api/consent` 200, banner closes in ~1 s, zero requests to challenges.cloudflare.com.
- Google: dataLayer `consent default denied` → `update granted` after Accept all; hits carry `gcd=13r3r3r3r5l1` and `gcs=G111` after the click.
- `/`, `/de` (`lang="de"`), `/ar` (`dir="rtl"`), `/cookies`, `/checkout` 200.
- Three test consent rows written on live by these checks: one curl POST, Accept all on `/` and on `/checkout`.

Not verified yet: a real booking sending the Ads conversion (needs a paid booking).

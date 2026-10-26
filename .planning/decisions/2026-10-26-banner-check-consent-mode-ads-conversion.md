# Cookie banner, Google consent signals, Ads conversion (owner, 2026-10-26)

Owner report: "The cookie is not working when I accept all, the ads are not converting, and Google is telling me that this business is not verified." Ads send people to vamostaxi.site. The "not verified" screen is in Google Ads.

## Findings (checked live 2026-10-26, vamostaxi.site)

1. Accept all greys out all three buttons and shows a Cloudflare "Verify you are human" box in the banner; nothing closes until it is ticked. If the check never loads (blockers, strict browsers) the banner is stuck. Cause: a choice with Marketing on needs a Turnstile token (Phase 27 D-33): `app/pages/CookieBanner.dc.html`, `app/home/CookieBanner.dc.html`, `app/vamos-consent.js`, `apps/web/components/consent/CookieBanner.tsx`, server `apps/web/app/api/consent/route.ts` + `lib/consent/choice.ts` (`needsTurnstile`).
2. No booking conversion is sent to Google or Meta from the new site. The booking events were removed in `cb23d43` / `419b9a6`. GTM-KPKGT4VH carries the Google tag AW-368142830 with two URL conversion actions that only match old Freshpage addresses (`vamostaxi.eu/booking?step=confirmPayment`, label `2ZvxCLnF2M8cEO7Txa8B`; `www.vamostaxi.eu/book-transfer`, label `GE--CMqHhJ8ZEO7Txa8B`), so they never fire on vamostaxi.site.
3. Google receives no consent status (Consent Mode removed 2026-10-19, `8dfa74d8`); hits carry `gcd=13l3l3l3l1l1` (all unset).
4. vamostaxi.eu still resolves to the old Inware server (94.126.22.215, ns inware.ch).

## Decisions (owner, question form, 2026-10-26)

- **Human check: remove it** from the cookie banner, mock and Next, and from `/api/consent`. The per-IP rate limit stays. Reverses Phase 27 D-33 for consent only; contact, reviews and auth keep Turnstile.
- **Google Consent Mode v2, advanced:** default denied for every visitor; the banner choice updates it (Analytics -> `analytics_storage`; Marketing -> `ad_storage`, `ad_user_data`, `ad_personalization`). Refusers are still counted cookieless. Narrows the 2026-10-19 "count everything" decision for Google only; Meta Pixel and Cloudflare Web Analytics stay as they are.
- **Conversion: a new Google Ads action** "Booking completed", created by the owner; the site sends it once per booking reference with the amount in CHF. GA4 `purchase` and Meta `Purchase` go out with it.

## Still open

- Google Ads advertiser verification ("business not verified"): owner's step in Google Ads, outside the code.
- Retire the two old URL conversion actions in Google Ads once the new one records a booking (owner).
- Banner, /cookies and /privacy wording: still says Analytics and Marketing stay off until allowed, which is not true for Meta. Wording is the owner's (2026-10-19 decision item 1).

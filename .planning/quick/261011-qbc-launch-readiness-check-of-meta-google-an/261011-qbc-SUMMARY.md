---
status: complete
date: 2026-10-11
---
# 261011-qbc: launch readiness of Meta, Google Ads and Google Analytics

Check only: no product code changed, nothing deployed. Session acted as control (none named).

## Live checks (2026-10-11 18:57 +04, read-only)
- Verified: pixel 1595596972063765 and EVENTS_ON live; Google tag AW-368142830 and send_to live with GOOGLE_ON; Consent Mode v2 denied by default; CSP allows Facebook hosts on mock pages and Google hosts on mock + Next pages; Meta Automatic advanced matching still off; Worker has META_CAPI_ACCESS_TOKEN and STRIPE_SECRET_KEY.
- Not verified: any server-side Meta event reaching Meta (META_TEST_EVENT_CODE unset, Stripe in test mode, so every event is skipped); any Google Ads conversion arriving in Google Ads.
- Missing: GA4. Wording adopted 2026-10-11 (`.planning/decisions/2026-10-11-ga4-wording.md`); build waits on the G- id.

## Code review (Fable, 261011-qbc-REVIEW.md)
- CR-01 critical, confirmed by control: `ConfirmationClient.tsx:576` calls `window.VamosGoogle?.conversion` in a mount effect, but `vamos-google.js` loads `afterInteractive` and has no pre-load queue, so on the normal return path the Google Ads conversion is dropped.
- WR-01 high: CAPI events lack client_user_agent / client_ip_address (required for website events).
- WR-02/07: Accept grants ad_personalization beyond the adopted wording; remarketing frame hosts missing. Owner decision.
- WR-03: InitiateCheckout event id is random per page load (reload = new event).
- WR-04..06: no server-side Google fallback; no _fbp when first Accept is on /checkout; Next-page CSP merge order asserted nowhere.

## Next
Fix job for CR-01, WR-01, WR-03 (+ WR-02 after his decision), then GA4 job, then owner proof: Meta test code + 4242 payment + Tag Assistant on live /confirmation.

## Fix landed (2026-10-11)

- Commit 88f74c18 on main: CR-01 (Google conversion queued when the confirmation page renders before the loader), WR-03 (stable InitiateCheckout id, kept only after Marketing consent). Fable fix review: SHIP (`261011-qbc-FIX-REVIEW.md`); its WR-01 fixed in the same commit.
- `pnpm gate:local` green. Deployed Worker `vamos` version d890510e (staging env, vamostaxi.site). Live `/app/vamos-google.js` carries `VamosGoogleQueue`; CSP on /checkout and /confirmation unchanged.
- Open: owner's 4242 payment and booking_payments read; Meta test event code run; GA4 G- id; remarketing wording adoption.

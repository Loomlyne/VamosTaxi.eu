# Tracking: every visit counts (owner, 2026-10-19)

## Decision

Owner's words: "Everything should be counted. I don't care if it's Google or Meta, if he accepts or refuses, it will be counted. If he comes from an ad, it would be counted. Later, we will make any change or text change."

## Done (live)

- Commit `8dfa74d8` on `main`, pushed; Worker `vamos` version `acd0016a` deployed with `--env staging`.
- Removed the Google Consent Mode bridge and Meta's `fbq('consent','revoke')` from `scripts/dc-page-base.mjs` (mock pages) and `apps/web/components/tags/SiteTags.tsx` (Next pages). GTM, GA4 and the Meta Pixel now run as the owner pasted them.
- Cloudflare Web Analytics starts on every page load: `app/vamos-consent.js`, `apps/web/components/consent/CookieBanner.tsx`, `apps/web/lib/consent/web-analytics.ts`.
- Proved on vamostaxi.site with a browser whose saved choice is `reject_all`: GA4 `page_view` and `scroll` (no `gcs`), Meta `PageView`, Cloudflare `cdn-cgi/rum`, and the `_ga` and `_fbp` cookies all present. `/`, `/checkout`, `/cookies`, `/privacy` and `/contact` return 200 with the tags and no consent gate.

## Not done (open)

1. **Legal text is out of date.** /cookies, /privacy and the cookie banner (en/de/fr/ar) still say Analytics and Marketing are off until the visitor allows them. The owner will give the text change later; draft it for his approval (never invent legal copy) and then update the mock pages, Next pages, `app/vamos-i18n-dict.js`, the Next messages and the seed. The approved wording now being replaced is in `2026-10-19-tracking-wording.md`.
2. **Google Ads is not tracking.** GTM container `GTM-KPKGT4VH` is empty (no tags, no AW- id). Needs from the owner: the AW- conversion id and conversion label (Google Ads → Goals → Conversions → New → Website → Install the tag yourself), or an Ads tag added in GTM.
3. **Meta gateway calls are blocked by the CSP.** Console shows `connect-src` blocks for `mpc-prod-21-…us-central1.run.app/events?cee=no` and `5z-…ecs.us-east-1.on.aws/events?cee=no`. PageView still arrives; decide with the owner whether to allow these hosts.
4. **Dependabot alert.** One high-severity dependency alert on `main`: https://github.com/Loomlyne/VamosTaxi.eu/security/dependabot/48 (not looked at).
5. **Banner choice no longer controls tracking.** The banner still records Accept or Reject server-side, but tags fire either way. Whether the banner stays, changes wording, or gets removed is part of item 1.

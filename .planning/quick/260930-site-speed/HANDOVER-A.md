# Site speed, hand-over A: caching and the /about photo

Branch `fix/site-speed`, `origin/main` `3142a6e8` merged in (no conflict). Commit: last commit on the branch ("site speed A"). No push, no deploy, no database change.
Owner answers that cover this: "Yes, keep it 5 minutes" (reviews), "Yes, as described" (static files), "Shrink it, same picture" (/about photo).

## What changed

| Piece | File |
|---|---|
| Short cache (5 minutes, `public, max-age=300`) on our scripts, dictionary, page components, styles, logos: `/app/*`, `/assets/*`, `/_ds/*`, `/brand/*` | `apps/web/public/_headers` |
| One year and `immutable` on `/assets/vendor/*` (React 18.3.1 has its version in the name), `/assets/photography/*`, `/_ds/:pack/assets/fonts/*` | same file |
| `GET /api/reviews`: `public, max-age=300, s-maxage=300` (was `private, no-store`); 405 answers keep `private, no-store` | `apps/web/app/api/reviews/route.ts` |
| `/about` photo: 4.0 MB `/photos/site/fleet-van-street.jpg` replaced by `assets/photography/fleet-van-street-1200.jpg` (1200 px wide, 385 KB, same picture); one `src` edited | `app/pages/about.dc.html`, new `assets/photography/fleet-van-street-1200.jpg` |
| Tests | new `apps/web/lib/cache/static-headers.test.ts`, `apps/web/lib/cache/reviews-cache.test.ts`; updated `apps/web/lib/auth/callback-redirect.test.ts` (reviews GET) |

Two decisions inside the job, both to be read by the owner at Ship:
- **No `stale-while-revalidate`** on the short rule (the control session's brief suggested it). It serves the old file once after expiry, so after a deploy a returning visitor could still get the old script or component for one more page view. With plain `max-age=300`, the old file lives at most 5 minutes.
- The photo is a **new file name** in the repo, not a replacement in storage: `/photos/*` answers `immutable` for a year, so a changed file under the same name would never reach a returning visitor. The 4 MB object stays in R2, unused; I did not touch storage.

## Before and after (same scripts, same pages, same method)

Before = live `vamostaxi.site` on 2026-09-30 (`repeat.mjs` and `live.json`); after = local Worker build of this branch (`localA.json`). The local Worker has no network delay, so only counts and bytes compare, not times.

| Measure | Before (live) | After (local build) |
|---|---|---|
| Second visit, requests that still go to the server, home | 82 (67 of them 304) | 12 |
| Second visit, /faq | 73 (68 of them 304) | 2 |
| Second visit, /about | 70 (65 of them 304) | 4 |
| /about first visit, image bytes | 4270 KB | 535 KB |
| /about first visit, transfer | 8147 KB laptop, 7997 KB phone | 4421 KB laptop, 4271 KB phone |

The second visit here is within 5 minutes. After 5 minutes the short files are asked about again (the long ones never are). The 12 requests left on home are the API calls (`/api/auth/session`, `/api/quote`, `/api/reviews` when expired, `/api/fx` when expired).

## Proof that nothing per-visitor gets a public cache header

On the local Worker build of this branch, every route below answered `Cache-Control: private, no-store` (GET): `/api/auth/session`, `/api/checkout/me`, `/api/checkout/extras`, `/api/quote`, `/account`, `/checkout`, `/checkout/trip` (307), `/manage-booking`, `/bookings`, `/sign-in`, `/confirmation`, `/booking-detail`. With a cookie: `NEXT_LOCALE=de` on `/` and `/faq` answers 302 `private, no-store`; `sb-…-auth-token` on `/` and `/faq` answers `private, no-store`. `/api/fx` stays `public, max-age=3600` (same for everyone, unchanged). A failed `/api/reviews` read (local, no database) answers 500 `no-store`: an error is never cached.
By construction: `_headers` only matches static trees, and `static-headers.test.ts` fails if a rule names `/*`, `/api`, `/account`, `/bookings`, `/booking-detail`, `/checkout`, `/confirmation`, `/manage-booking`, `/sign-in`, `/sign-up`, `/reset-password`, `/ops`, `/dashboard`, `/review`, `/photos` or a language prefix, or if a short rule gains `stale-while-revalidate`, or a long rule loses `immutable`.
`reviews-cache.test.ts` runs the real route handler: GET is `public, max-age=300, s-maxage=300` with no `Set-Cookie` and no `Vary: Cookie`; the route source reads no cookie, header or session.

## "A new deploy is seen within the short time"

The mocks have no version in their names, so the short rule is the whole mechanism: `max-age=300` means a browser asks again after 5 minutes at the latest. Header rules proven on a static-assets Worker and on the built Worker: `/assets/lenis.js`, `/app/vamos-i18n-dict.js`, `/app/pages/SiteHeader.dc.html`, `/_ds/…/_ds_bundle.js`, `/brand/…` = 300; `/assets/vendor/react-…min.js`, `/assets/photography/…`, `…/fonts/Poppins-Regular.ttf` = `31536000, immutable`; `/favicon.ico` and other root files keep `max-age=0, must-revalidate`. Within those 5 minutes a returning visitor can combine an old component file with a new dictionary; that mismatch lasts at most 5 minutes after a deploy.

## Checks

typecheck, `vitest run` (2739 passed, 1 skipped, run once as lead), lint (0 errors, 5 old warnings), lint:css, check:numbers, check:legal-claims, check:public-env, i18n:check, db:seed:check: all pass. Worker build (`opennextjs-cloudflare build`): pass.

## Not verified

- Cloudflare's edge: whether the zone caches `/api/reviews` for 5 minutes (home `/` shows `cf-cache-status: HIT` for the same kind of header, so it is expected) and whether the edge keeps an old copy of a static file after a new deploy. Read after the deploy: `curl -sI https://vamostaxi.site/api/reviews` twice, then `cf-cache-status` and `age`.
- `/api/reviews` success path against a real database (local has none; covered by the handler test).
- The seconds saved on a real mobile network.
- Files under `/assets/photography/` now cache for a year under their current names. If a photo there is ever replaced, give it a new file name (the same rule already holds for `/photos/*`).

## Owner UAT (after deploy)

1. Open https://vamostaxi.site/about. Expect the same van photo as before, sharp, and the page loads noticeably lighter (4 MB photo gone).
2. Open https://vamostaxi.site/faq, then /about, then /contact. Expect each page to open without re-downloading fonts and scripts (the second and third open faster).
3. On the dashboard, publish or unpublish one review, then reload the home page after 5 minutes. Expect the carousel to match.
4. Open a booking link (manage-booking) and your account. Expect them unchanged and never showing another person's data.

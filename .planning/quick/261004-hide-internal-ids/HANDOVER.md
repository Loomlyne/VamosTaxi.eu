# HANDOVER — fix/hide-internal-ids (quick 261004)

Job session, 2026-10-04. Branch `fix/hide-internal-ids`, cut from `origin/fix/cookies-manage-locale-rows`
(its two owner-approved /cookies rows are kept), `origin/main` merged in (0c7adc39). Pushed, no PR.
Nothing deployed, no live database write.

Owner, 2026-10-04: "hide all tokens hide all ids like be more fucking secure about the data everything is expose".

## STOP — before shipping

1. **Copy commit `d8f25617`: APPROVED** — Koss, question form 2026-10-04, "Approve as drafted" (COPY-DRAFT
   sections 1–4), recorded in `.planning/decisions/2026-10-04-hide-internal-ids-copy.md`.
   **Commit `2f412c4b` (plain cookie names)**: the English names are his; the **de/fr/ar of those names and the
   two Functional names are drafts awaiting approval** (COPY-DRAFT §5). Ask the two §5 questions before shipping
   `2f412c4b`, or ship without it.
2. **A fresh reviewer session (security) must read this branch before it ships**: the served-file comment
   stripper (`scripts/strip-public-comments.mjs`) rewrites every public page and script; the API changes
   touch guest/customer booking routes.
3. After deploy: the controller's usual 4242 payment (no checkout code changed, but every served page
   changed) and a live look at /cookies, /privacy, / and /manage-booking in en and ar.

## Commits (oldest first)

| Commit | What |
|---|---|
| 17e82686 | Served DC copy loses developer comments (sources keep them); design-system `readme.md`, `_ds_manifest.json`, `_adherence.oxlintrc.json` no longer served |
| 4b61e2bf | /cookies: auth cookie shown as `sb-…-auth-token` (mock + React twin); Meta row is one block on phones; Marketing table drops the 4 headers over its single sentence |
| 6af249d7 | legal-gate test pins the base branch's approved language-cookie duration (was red on the base branch) |
| d92a9c26 | Guest/customer booking answers drop internal UUIDs (`booking.id`, `bookingId`, `requestId`, `reviewId`) |
| 7f0e0eb4 | /review?token=… removes the token from the address bar on load |
| d8f25617 | Copy, **approved 2026-10-04** (COPY-DRAFT §1–4); also two rendering fixes in the same files: Stripe cookie names stay LTR in Arabic, "Resend" no longer translated to Arabic "إعادة الإرسال" |
| 8e7eb9fa | This hand-over (first version) |
| 2f412c4b | /cookies rows: plain name first, technical name small underneath (mock + React twin, messages `cookies.name-*`, seed regenerated, `seed_idempotent` re-pinned 2710→2715); decision record. de/fr/ar + Functional names awaiting approval (§5) |

## Finding table

Live = read-only GET on https://vamostaxi.site, 2026-10-04 ~10:30–10:50 UTC.

### MUST HIDE

| # | Where (file:line) | Live URL | What leaked | Status |
|---|---|---|---|---|
| H1 | `app/pages/cookies.dc.html:219` (was :216) | /cookies | `sb-yaumjzvylngfjhtuffqs-auth-token` — Supabase project ref | **Fixed** → `sb-…-auth-token` (4b61e2bf). The real cookie name still contains the ref: see owner decision D2 |
| H2 | every served `app/**/*.dc.html` and `app/*.js` (e.g. `home.dc.html` 93 comment blocks; `vamos-i18n-dict.js:1819,2345`; `vamos-meta.js:1-10`; `vamos-consent.js:5,21,32`; `vamos-manage-ticket.js:277`; `booking-detail.dc.html:261`; `AuthForm.dc.html:96`; `SiteHeader.dc.html:345`) | /app/vamos-i18n-dict.js, /app/home/home.dc.html, view-source of every page | Phase/decision ids, `.planning/decisions/*.md` names, repo paths (`apps/web/lib/…`), owner notes ("owner 2026-10-01", "Events Manager switches off") | **Fixed** in the served copy (17e82686). Proof: acorn token streams identical for 105 script bodies, 147 style blocks identical, pages render in Chromium |
| H3 | `design-system/readme.md:41`, `_ds_manifest.json`, `_adherence.oxlintrc.json` | /_ds/vamos-taxi-design-system-245af154-…/readme.md (200) | GitHub repo `Loomlyne/VamosTaxi.eu`, internal doc names, source paths | **Fixed** — no longer copied (17e82686). Live still serves them until deploy |
| H4 | `app/api/manage/booking/route.ts:167` | GET /api/manage/booking (token holder) | internal booking UUID `booking.id` | **Fixed** (d92a9c26) |
| H5 | `manage/{cancel:61,time-change:64,flight:60,resend:58}`, `account/bookings/{paid-cancel:57,time-change:57,flight:53,resend:49}` route.ts | POST only | `bookingId` (+ `requestId`) UUIDs in success JSON | **Fixed** (d92a9c26) |
| H6 | `app/api/reviews/submit/route.ts:158,211` | POST only | `reviewId`, `bookingId` | **Fixed** (d92a9c26) |
| H7 | `apps/web/app/[locale]/review/page.tsx:52` | /review?token=… (200, token stays in URL) | Review token kept in address bar/history; recorded by Cloudflare Web Analytics beacon if analytics allowed | **Fixed** (7f0e0eb4) — client `replaceState` |
| H8 | `/cookies` Analytics, banner panel, `/privacy` processors | /cookies, /privacy, banner | "not in use until live payments" (test mode), Sentry rows "none / not used", "as issued by Supabase Auth", "as set by Cloudflare", "The platform we are building", "used when transactional mail is on" | **Drafted + applied, awaiting approval** (d8f25617, COPY-DRAFT.md) |
| H9 | `lib/ops/fleet-http.ts:335-362`, `lib/ops/rate-book.ts:191-205` | /api/staff/* (401 without session) | raw SQLSTATE codes (`23505`, `42501`…) as `code` to the signed-in dashboard | **Not fixed** — staff-only, the dashboard UI branches on these codes; change both sides in one job. Low |
| H10 | `reviews/submit:179`, `reviews/photo:113`, `manage/*` + `account/*` body fallbacks `bookingId`/`id` | POST | internal UUID accepted as a booking lookup key (only together with a valid token/session) | **Not fixed** — input change on money/booking routes needs its own reviewed job. Low |
| H11 | `apps/web/middleware.ts:530` | every marketing page | `X-Consent-Present: 0/1` response header (cache key) | Not fixed — no data, low; could become a request-only header |
| H12 | Next/OpenNext | /manage-booking?token=… | `x-middleware-set-cookie` header duplicates `Set-Cookie: vt_manage=<token>` on the 302 to the same browser | Not fixed — framework header, same browser that sent the token; listed for the reviewer |

### MUST STAY (public by design)

| Item | Where | Why it is public |
|---|---|---|
| Cookie names (`vamos_qs`, `vt_manage`, `NEXT_LOCALE`, `consent_subject`, `_fbp`, `_fbc`, `__stripe_*`, `cf_clearance`) | /cookies | nFADP/GDPR cookie notice must name them; the browser shows them anyway |
| Meta pixel id | served pages after consent | the browser must load it to fire the pixel |
| Stripe publishable key `pk_test_51UIZmq…` | /checkout HTML | Stripe requires it in the browser. It reveals test mode and the account id prefix by design; disappears when the live key goes in |
| Turnstile site key `0x4AAAAAAElByx…` | forms | Cloudflare requires it in the browser |
| Operator name, "Loomlyne" | /about:101, /imprint:222,229 | imprint law |
| `info@vamostaxi.site`, `+41 79 626 70 82` | footer, contact | public contact |
| Component `.dc.html`, `support.js`, `vamos-*.js`, `_ds_bundle.js` | /app/…, /_ds/… | the DC runtime fetches them; now served without comments |
| `vamos-ops-api.js`, `vamos-ops-data.js`, `vamos-ops-bar.js` | /app/… (200) | loaded by the dashboard shell from the same assets; name staff endpoints only (all 401 without session); comments now stripped. Moving them off the public host = separate job |
| Vehicle class / photo UUIDs | /api/quote `photo_url` | public image paths |
| Review row UUIDs | GET /api/reviews | the shared reviews store (home + dashboard) keys rows by id |
| `cf-placement: remote-ZRH`, `server: cloudflare`, `cf-ray` | all responses | added by Cloudflare at the edge; app cannot remove |
| robots.txt `Disallow: /ops /api/ /app/ /dev` | /robots.txt | names paths, no secrets |

### OK (checked, nothing to hide)

No `err.message`, stack, SQL text or env names in any public `/api/*` error body (quote/geo/flight/auth/
consent/checkout/manage/account return closed codes); no source maps (no `sourceMappingURL`, .map 404);
no `x-powered-by`; no project ref, `sk_`, `acct_` or `/Users/` in `_next` chunks; the browser never talks
to Supabase directly; `Referrer-Policy: strict-origin` everywhere; /manage-booking?token 302-strips the
token into the HttpOnly `vt_manage` cookie; `returnTo`/`next` validated on-site; sitemap and security.txt
clean; `/app/ops/*` 404 on the public host.

### Footer "one letter per line"

Not a visible break. Screenshots `evidence/live-before-en-1440-footer.png`, `live-before-en-390-footer.png`:
links render as normal words. The per-letter roll splits each label into `<span aria-hidden>` cells and puts
the label in `aria-label` on the link (`SiteFooter.dc.html:300-307`), so screen readers read the word once.
Copy-pasting the footer gives one letter per line (each letter twice) — a selection artefact. Not changed.

### Seen, outside this brief (not changed)

- Live `/api/reviews` returns placeholder reviews marked published ("One verbatim sentence from a real review sits here", a stock iconscout link as `sourceUrl`). Owner should look.
- /cookies mobile cards in Arabic show the column labels (NAME, PURPOSE…) in English (`data-l` attribute content is not translated) — pre-existing.
- React twins (`app/[locale]/cookies|privacy/page.tsx`, `i18n/messages`) still mention Sentry; they reach no customer.

## Owner decisions

- **D1 — copy sections 1–4: approved** ("Approve as drafted", 2026-10-04). `cf_clearance` "30 minutes" is Cloudflare's default; the zone's Challenge Passage setting is still not read.
- **D1b — open: COPY-DRAFT §5** — the de/fr/ar of the plain cookie names, and "Language (this browser)" / "Recent addresses" for the Functional rows.
- **D2 — rename the Supabase auth cookie?** Possible: `@supabase/ssr` 0.12.5 takes `cookieOptions.name` (used as the storage key, `createServerClient.js:33`), so setting e.g. `name: "vt-auth"` in `authCookieOptions` (`apps/web/lib/supabase/cookies.ts:54`, used by `lib/supabase/server.ts` and `middleware.ts`) removes the ref from the browser's cookie jar. Cost: every signed-in customer and the dashboard admin are signed out once; sign-up confirmation / magic / reset links issued before the deploy that rely on the PKCE `-code-verifier` cookie fail once; tests that name `sb-*-auth-token` (about 20 files, e.g. `lib/supabase/cookies.test.ts`, `tests/unit/auth/*`, `tests/e2e-worker/*`) and the dashboard gateway's cookie handling must move in the same job. **Owner: its own job, not this one.** The ref is no longer printed on the page; it is only visible in the cookie jar of a signed-in visitor's own browser.

## Verified

- `pnpm test:unit`: scripts 27/27, db 14/14, emails 247/247, web 4791 passed / 31 skipped (417 files), after merging origin/main.
- `pnpm typecheck` clean; `pnpm lint` 0 errors (6 pre-existing warnings in files not touched); `i18n:check`, `check:legal-claims`, `check:numbers`, `check:public-env`, `db:seed:check` pass.
- Comment strip: `evidence/verify-strip.mjs` (acorn token equality, 105 script bodies, 0 problems) and `evidence/verify-css.mjs` (147 style blocks) after the merge.
- Chromium on a static server of `apps/web/public` (port 47391, stopped): home, cookies, privacy, sign-in, about, contact, manage-booking, booking-detail, account, faq, terms, imprint, cancellation, reset-password, sitemap render with no script errors; same text length as the unstripped copy where comparable.
- /cookies and /privacy in en/de/fr/ar at 390 and 1440: `VamosLocale.coverage` = 0, Arabic `dir=rtl`, no sideways scroll (`evidence/coverage.txt`, screenshots `evidence/branch-*`). Before: `evidence/live-before-*`.
- Live checks listed above (read-only GETs).

- Plain names (2f412c4b, after merging origin/main 6737c53c): `pnpm test:unit` scripts 27/27, db 14/14, emails 247/247, web 4794 passed / 31 skipped; typecheck clean; lint 0 errors; `i18n:check` (2707 keys) and `db:seed:check` pass. /cookies and /privacy en/de/fr/ar at 390 and 1440: coverage 0, Arabic rtl, no sideways scroll (`evidence/coverage-names.txt`, screenshots `evidence/names-*`); technical names stay left to right in Arabic.

## Not verified

- Not run on a local Worker build (`opennextjs-cloudflare build`): the strip runs in `prebuild`/`deploy` via the sync script, proven on the static copy only.
- `/review` token strip not clicked in a browser (unit + source pin only).
- `cf_clearance` lifetime on the live zone.
- `seed_idempotent.test.sql` re-pin (2715) not run as pgTAP (no local database stack in this job); `db:seed:check` passes.
- Dashboard host pages with the stripped `vamos-ops-*.js` not opened in a browser (token-equal proof only; `app/ops/` itself is not stripped).

## Failed

- None.

## Rollback

- Before deploy: drop the commit(s) from the ship branch (`git revert <sha>`); each item is its own commit.
- After deploy: `git revert` the commit on main and redeploy, or `wrangler rollback` to the previous Worker version. The comment strip only changes the generated public copy; reverting `17e82686` restores the old served files on the next sync/deploy. No database change anywhere.

## Tools

`tools/shot-legal.mjs` (screenshots + coverage; copy into `apps/web/` to run, needs a static server of
`apps/web/public` on 47391) and `tools/render-pages.mjs` (page error check).

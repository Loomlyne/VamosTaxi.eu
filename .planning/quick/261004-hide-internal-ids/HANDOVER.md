# HANDOVER — fix/hide-internal-ids (quick 261004)

Job session, 2026-10-04, rewritten 16:55 +04 for the controller. Branch `fix/hide-internal-ids`, pushed. No PR.
Nothing deployed, no live database read or write in this pass, no migration.

Owner, 2026-10-04: "hide all tokens hide all ids like be more fucking secure about the data everything is expose".

- **Code tip: `4f398ead`** (evidence on top of `e6dca1e4`); this file is the one commit after it. Folder clean.
- `origin/main` `0be589db` merged in at `2dcf9d88` (16:40); `origin/main` had not moved at 16:52.
- Merge conflicts: `cookies.dc.html`, the React cookies twin, the four message files, `seed.sql`, `seed_idempotent.test.sql`.
  Only main commit touching them was `7b5dfb25`, whose patch is byte-identical to `c4a0e25b` already in this branch
  (the branch was cut from `fix/cookies-manage-locale-rows`). Resolved to the branch side, so main's content is kept
  and the approved §5 plain names stay. `legal-gate.test.ts` (`6af249d7` on both sides) merged cleanly.

## STOP — before shipping

1. **A fresh security reviewer session must read this branch.** Not done yet. The reviewer of 15:00 found F1–F7 and F9
   (fixed below); nobody has read those fixes. Money/sign-in surfaces touched: guest/customer booking routes (answer
   bodies), the review link (new cookie), the Worker's response headers, the served-file comment stripper (rewrites
   every public page, script and stylesheet at sync, so at build and deploy).
2. After deploy: the 4242 payment first (`/checkout` changed: its HTML now carries fewer message namespaces, `d10e7c96`),
   then read `booking_payments` by status.
3. If `fix/auth-cookie-rename` lands first, the Sign-in row's technical name becomes `vt-auth` (decision file §2); expect a
   conflict on `cookies.dc.html` / the twin.

## Owner approvals

| What | Answer | When | Record |
|---|---|---|---|
| COPY-DRAFT §1–4 (legal copy) | "Approve as drafted" | 2026-10-04 (question form) | `.planning/decisions/2026-10-04-hide-internal-ids-copy.md` §1, applied `d8f25617`, React banner follow-up `83a34cbc` |
| Stripe row stays; plain names everywhere (English names his words) | his answers | 2026-10-04 | same file §2, applied `2f412c4b` |
| COPY-DRAFT §5 (de/fr/ar of the names, two Functional names) | "Approve all as drafted" | 2026-10-04, later | same file §2, recorded `a9eda62b` |
| COPY-DRAFT §6 (`vt_review` row) | "Approve as drafted" | 2026-10-04 16:38 +04 | `.planning/decisions/2026-10-04-vt-review-cookie-row.md` (came in with the main merge), applied verbatim `e6dca1e4` |
| D2 rename the Supabase auth cookie | its own job | 2026-10-04 | same file §3 |

No lawyer has read any of it.

## Commits since the 15:05 hand-over (`ce07aaf1`), oldest first

| Commit | Time | What |
|---|---|---|
| `de6b05ec` | 15:41 | **F1, the `vt_review` cookie.** `GET /review?token=…` → middleware answers 302 `/review` and sets `vt_review` (HttpOnly, Secure, SameSite=Lax, Path=/review, Max-Age 30 days); the page reads the query first, then the cookie. Replaces `7f0e0eb4`'s client `replaceState` (lost the token on refresh or language switch). Files: `middleware.ts`, `lib/reviews/review-cookie.ts` (+test), `app/[locale]/review/page.tsx`, `ReviewForm.tsx`; `lib/security/url-without-token.*` deleted |
| `83a34cbc` | 15:42 | F2: React cookie banner (/checkout, /review, 404) carries the approved §3 wording — no Sentry, no "Supabase Auth"; React privacy twin loses the Sentry row and `legal.error-diagnostics`. Seed 2714 keys / 101 reasons. Test: no messages file or dictionary names Sentry, Supabase Auth, test mode or the mail switch |
| `252c309b` | 15:46 | F5: the comment strip is a gate — acorn parses every served script before and after, tokens must be identical, no non-licence comment may remain, else the sync throws (build and deploy stop). HTML strip never enters tags, `<textarea>` or `<title>`. Also strips `.css` and the `support.js` copies. `acorn ^8.18.0` root devDependency (lockfile) |
| `8cf45166` | 15:46 | F3: the served design-system copy is stripped (bundle header, ~4,000 doc comments, styles, tokens); committed `apps/web/public/brand/tokens/*.css` stripped in source; both `OFL.txt` lose the internal provenance note (licence text unchanged) |
| `8750fc09` | 15:46 | F4: the four `support.js` copies drop an internal note inside a CSS template string |
| `85f41007` | 15:47 | F6: the served-copy test skips visibly without a sync and fails in CI; also checks served JS/CSS |
| `d10e7c96` | 15:49 | F7: the locale layout ships only public message namespaces to the browser (`lib/i18n/client-messages.ts`): no dashboard strings, no `$meta`, no review-scaffold notes in public HTML |
| `f2cccc3f` | 15:49 | F9: the Worker removes Next's `x-middleware-set-cookie` from every response (`lib/security/strip-internal-headers.ts`, `worker.ts`) |
| `dc7dff50` | 15:51 | client-messages uses arrays, not a module-scope Set (db-fences isolate rule) |
| `aa05fa7a` | 15:52 | TEST-BRIEF for the lab run |
| `a9eda62b` | 15:53 | COPY-DRAFT §5 approved; §6 drafted |
| `2dcf9d88` | 16:40 | merge `origin/main` `0be589db` (see top) |
| `e6dca1e4` | 16:48 | **`vt_review` row on /cookies**, owner wording verbatim: Strictly necessary, after `vt_manage`; mock `app/pages/cookies.dc.html` + `app/vamos-i18n-dict.js`; twin `app/[locale]/cookies/page.tsx` + messages `cookies.name-review-access`, `review-cookie-purpose`, `review-cookie-duration` (no-param reason: Max-Age in `review-cookie.ts`); seed regenerated 2717 keys / 102 reasons; `seed_idempotent` re-pinned; COPY-DRAFT §6 marked approved |
| `4f398ead` | 16:51 | evidence: the lab run (`evidence/lab/`) and the new row in four languages (`evidence/vt-review-row-*`) |

## Earlier commits on this branch (before 15:05)

`17e82686` served DC copy without developer comments, design-system docs no longer served · `4b61e2bf` /cookies shows `sb-…-auth-token`, Meta row on phones, Marketing table headers · `6af249d7` legal-gate test pin (also on main) · `d92a9c26` booking answers drop internal UUIDs · `7f0e0eb4` review token out of the address bar (superseded by `de6b05ec`) · `d8f25617` approved copy §1–4 · `2f412c4b` plain cookie names.

## Finding table

Live = read-only GETs on https://vamostaxi.site, 2026-10-04 ~10:30–10:50 UTC (first pass). Not re-read in this pass.

### MUST HIDE

| # | What leaked | Where | Status |
|---|---|---|---|
| H1 | Supabase project ref in `sb-yaumjzvylngfjhtuffqs-auth-token` on /cookies | `app/pages/cookies.dc.html`, twin | **Fixed** `4b61e2bf` (shown as `sb-…-auth-token`). The real cookie name keeps the ref until the auth-cookie rename job |
| H2 | Phase/decision ids, `.planning` file names, repo paths, owner notes in served pages and scripts | every served `app/**/*.dc.html`, `app/*.js` | **Fixed** `17e82686`, now a hard gate `252c309b` (acorn token equality or the sync fails); CSS and `support.js` copies `252c309b`/`8750fc09` |
| H3 | GitHub repo name, internal docs in the served design system | `/_ds/…/readme.md`, `_ds_manifest.json`, `_adherence.oxlintrc.json`, bundle header and doc comments, `public/brand` tokens, `OFL.txt` notes | **Fixed** `17e82686` + `8cf45166`. Lab S9: dictionary and bundle start without notes |
| H4 | `booking.id` in GET /api/manage/booking | `app/api/manage/booking/route.ts` | **Fixed** `d92a9c26` |
| H5 | `bookingId`/`requestId` in manage and account POST answers | 8 routes | **Fixed** `d92a9c26` |
| H6 | `reviewId`, `bookingId` in review submit | `api/reviews/submit` | **Fixed** `d92a9c26`; lab S7 answer was `{"ok":true}` only |
| H7 | Review token in the address bar, history, analytics | `/review?token=…` | **Fixed** `de6b05ec` (302 + HttpOnly `vt_review`, replaces `7f0e0eb4`); /cookies names the cookie `e6dca1e4`. Lab S1, S3–S7 pass |
| H8 | Test-mode, Sentry, "Supabase Auth", "as set by Cloudflare", "the platform we are building" lines | /cookies, /privacy, both banners | **Fixed, approved** `d8f25617` + `83a34cbc`. Lab S8: /checkout HTML has none of them |
| H9 | Raw SQLSTATE `code` to the signed-in dashboard | `lib/ops/fleet-http.ts`, `lib/ops/rate-book.ts` | **Not fixed** — staff only; UI branches on the codes; change both sides in one job. Low |
| H10 | Internal UUID accepted as a booking lookup key (with a valid token/session) | reviews submit/photo, manage/account body fallbacks | **Not fixed** — input change on money routes needs its own reviewed job. Low |
| H11 | `X-Consent-Present: 0/1` response header | `middleware.ts` | Not fixed — no data, low |
| H12 | `x-middleware-set-cookie` repeating `Set-Cookie: vt_manage=<token>` | Next/OpenNext | **Fixed** `f2cccc3f`. Lab S1/S2: header absent |
| H13 | Dashboard strings (`Stripe webhook`, `Refunds to issue`…), `$meta`, review-scaffold notes in public HTML | `[locale]/layout.tsx` | **Fixed** `d10e7c96`. Lab S8 |

### MUST STAY (public by design) — unchanged

Cookie names on /cookies (now incl. `vt_review`); Meta pixel id after consent; Stripe publishable key `pk_test_51UIZmq…` on /checkout; Turnstile site key; operator name and Loomlyne on /about and /imprint; `info@vamostaxi.site` and `+41 79 626 70 82`; the DC runtime files (served without comments); `vamos-ops-*.js` on the public host (comments stripped; moving them off = separate job); vehicle photo and review row UUIDs; Cloudflare edge headers; robots.txt paths.

### OK (checked in the first pass, nothing to hide)

No error text, stack, SQL or env names in public `/api/*` error bodies; no source maps; no `x-powered-by`; no project ref, `sk_`, `acct_` or `/Users/` in `_next` chunks; browser never talks to Supabase; `Referrer-Policy: strict-origin`; /manage-booking?token 302s into HttpOnly `vt_manage`; `returnTo`/`next` validated; sitemap and security.txt clean; `/app/ops/*` 404 on the public host.

### Seen, outside this brief (not changed)

- Live `/api/reviews` returns placeholder reviews marked published (stock iconscout link as `sourceUrl`). Owner should look.
- /cookies mobile cards in Arabic show the column labels (NAME, PURPOSE…) in English (`data-l` attribute) — pre-existing, visible in `evidence/vt-review-row-ar-390.png`.

## Gates on the merged tree (`e6dca1e4` code = `4f398ead` code), 16:41–16:51

| Gate | Result |
|---|---|
| `pnpm install --frozen-lockfile` | pass (lockfile up to date) |
| `node scripts/sync-dc-mock-to-public.mjs` | pass: 20 pages, 19 app entries, comments stripped from 90 files (acorn gate passed) |
| `pnpm run typecheck` | pass |
| `pnpm run lint` | 0 errors, 6 warnings, all in files this branch does not touch |
| `pnpm run lint:css` | pass |
| `check:numbers` · `check:legal-claims` · `check:public-env` · `check:db-fences` | pass · pass (3/3) · pass · pass (8/8, 1186 files) |
| `i18n:check` | pass, 2709 keys |
| `db:seed:check` | pass, no drift (2717 keys, 102 no-param reasons) |
| `test:unit` | scripts 29/29, db 14/14, emails 247/247, web 4852 passed / 31 skipped (421 files + 16 skipped) |
| `pnpm --filter web run build` (via `pnpm run build`) | pass |
| pgTAP, full suite on the lab's native stack (`lab.sh pgtap hide-ids`, reset + all migrations incl. main's 260000/270000) | pass, 103 files, 2857 tests; `seed_idempotent` ok with the 2717/102 pins |
| `db:types:check` | not run: needs a default-port local stack; this branch adds no migration and does not touch `database.types.ts` |

New row in a browser (static copy of `apps/web/public`, Chromium): en/de/fr/ar at 390/768/1024/1440 — `VamosLocale.coverage` 0 in all 16, Arabic `dir=rtl`, `vt_review` left to right, no sideways scroll, no page errors (`evidence/vt-review-row.txt`, screenshots at 390 and 1440).

## TEST-BRIEF on a local Worker — run 15:55–16:00 on code tip `a9eda62b` (before the merge and the row)

Lab `hide-ids`, native stack, Worker built 15:54 from this worktree. The tester's written reply was not saved; these come
from the files in `evidence/lab/` (`results.json`, `steps-run2.txt`, headers, screenshots):

| Step | Result | From |
|---|---|---|
| S1 `/review?token=…` | 302 to `/review`, one `vt_review` cookie with HttpOnly, Secure, SameSite=lax, Path=/review, Max-Age=2592000; no `x-middleware-set-cookie` | `S1-headers.txt` |
| S2 `/manage-booking?token=abc` | 302, `vt_manage=abc`, no `x-middleware-set-cookie` | `S2-headers.txt` |
| S3–S7 | PASS: form shows at `/review` without token; after reload; in German; at 390 in Arabic (rtl, no sideways scroll); submit → 1 review row, answer `{"ok":true}` | `results.json`, `S3`–`S7.png` |
| S8 | /checkout HTML (195,889 bytes) has none of the five strings; has cookie text | counted by me from `checkout.html` |
| S9 | dictionary and bundle start with no `/*` note or `@ds-bundle` header; **readme.md 404 not recorded** | `S9-*-head.txt` |
| S10 | "Sign-in" over `sb-…-auth-token`; console showed one `ERR_INVALID_URL` and 404s for `/photos/site/*.jpg` (lab has no photos); a follow-up run logged only the photo 404s and no page error | `results.json`, `s10-detail.txt` |

## Not verified

- The TEST-BRIEF was not re-run after the main merge and the `vt_review` row (Worker code from main changed `worker.ts` queue and cron paths; the row is static markup). The lab stack `hide-ids` (native, db 127.0.0.1:45122) is still up for that re-run; Workers are down. Re-run: `scripts/test-lab/lab.sh up hide-ids` then the brief. Remove with `scripts/test-lab/lab.sh destroy hide-ids`.
- S9 readme.md 404 on the lab Worker (not in the saved files).
- A review link with a language prefix, e.g. `/de/review?token=…`: by reading the code the 302 keeps `/de/review` while the cookie's Path is `/review`, so the browser would not send it there. Review e-mails link to `/review?token=…` only (`ReviewRequestEmail.tsx:23`), and the lab's language switch stayed on `/review` (S5). For the reviewer.
- Dashboard host pages with the stripped `vamos-ops-*.js` not opened in a browser (token-equal proof only).
- `cf_clearance` lifetime on the live zone.
- The React twin `/cookies` is not reached by customers; it was not opened in a browser (typecheck, i18n:check and build only).
- Nothing on live in this pass.

## Failed

- None.

## Owner UAT (after the controller deploys)

1. Pay one test booking with 4242 4242 4242 4242 on https://vamostaxi.site → the confirmation page shows; the controller reads `booking_payments` = succeeded.
2. Open https://vamostaxi.site/cookies → the Strictly necessary table has "Review access" with `vt_review` small underneath, "Lets you open the review form from the link in your e-mail without signing in", Vamos Taxi, 30 days.
3. Switch the language to Deutsch → that row reads "Zugang zur Bewertung", "Damit Sie das Bewertungsformular …", "30 Tage". Switch to العربية → Arabic row, page right to left, `vt_review` still reads left to right.
4. Same page on a phone → the row is a card like the others; nothing scrolls sideways.
5. Open a review link from a review e-mail → the address bar ends in `/review` with no token, the form shows; reload → the form still shows.
6. Open the manage link from a confirmation e-mail → your booking opens; the address bar shows no token.
7. On /cookies and /privacy search the page for "Sentry" and "test mode" → no match.

## Ship notes

- No migration, no new setting, no live data change. `seed.sql` is regenerated (generated file; 2717 keys).
- Each fix is its own commit; the row is `e6dca1e4`.
- New root devDependency `acorn` (lockfile updated in `252c309b`): the sync, so build and deploy, now fail if stripping would change any served script's tokens.

## Rollback

- Before deploy: `git revert <sha>` on the ship branch; each item is its own commit.
- After deploy: revert on main and redeploy, or `wrangler rollback` to the previous Worker version. The comment strip only changes the generated public copy. No database change anywhere.

## Tools

`tools/shot-legal.mjs`, `tools/render-pages.mjs` (static server of `apps/web/public` on 47391), `tools/f2-messages.py`, `tools/strip-brand-css.mjs`, `tools/twin-names.py`; lab step scripts in `evidence/lab/` (`steps.mjs`, `run.sh` sets the lab env).

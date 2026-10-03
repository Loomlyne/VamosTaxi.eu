# Control board

**Controller since 2026-10-02 15:26 (+04): the session with id `004ad4f0-a42f-453d-9991-85113f7d673f`, Claude Code on the owner's Mac, in this folder on `main` (its name in the session list changes at every restart: `vamostaxi-eu-d2`, then `vamostaxi-eu-b2`; the id stays). The owner chose "This session takes control" in the question form. Before: "VamosTaxi - session control" (`local_633b433a-13a1-4f99-bfe8-3d595717a4a1`, 2026-10-01 23:25 to 2026-10-02 15:26), the claude.ai project thread "Vamos Taxi controller" (`local_f9f33973-c2fc-404c-95fe-22b3fb2dd7fa`) and the "Vamos Taxi control session" (`local_03cf7e47-1746-4ac2-a28b-8ee0d831f01b`), all retired: a retired controller starts no work and ships nothing. Hand-over of 2026-10-01: `.planning/HANDOVER-2026-10-01.md`.**

**Control rule (owner, 2026-10-01 18:01 +04; replaces the 17:03 take-over line of `95ccece6` and the 17:12 strict rule of `150a2a20`):**
- Vamos runs from plain Claude Code on the owner's Mac. Every job runs locally, never in the cloud.
- One controller session: the session with id `004ad4f0-a42f-453d-9991-85113f7d673f` (owner's answer in the question form, 2026-10-02 15:26 +04; before it: "VamosTaxi - session control" `local_633b433a-13a1-4f99-bfe8-3d595717a4a1`, retired), in `/Users/koss/Developer/VamosTaxi.eu` on `main`. Only it commits and pushes main, applies live migrations, deploys Workers and cleans branches.
- Every other session is a job session. It runs GSD with the owner's `CLAUDE.local.md`, has its own app worktree under `.claude/worktrees/` in the main folder (the app makes it when the owner starts the session; `/Users/koss/Developer/vamos-wt` is gone, owner 2026-10-01 about 23:35 +04: "vamos-wt no more") and branch cut from `origin/main`, builds and tests, merges `origin/main` back in, writes a hand-over file for the controller and stops.
- The claude.ai project coordinator and its threads are retired, the "Vamos Taxi controller" thread (`local_f9f33973-…`) included.
- A fresh reviewer session, not the builder, reads every money, sign-in or database change before it ships. Opus plans and reviews; Sonnet builds.
- One session per job. Parallel jobs never share files; each plan lists its exact files. In the shared translation files a job adds only its own keys.
- The owner signs discuss, design and plan.
- Clean GitHub: archive tag, then delete the branch, the worktree and the PR.
- Deploy with `--env staging` (Worker `vamos`, live on vamostaxi.site). A deploy without it made the stray Worker `vamos-web` on 2026-10-01.
- Types with the pinned CLI: `pnpm exec supabase` (2.115.0), then `db:types:check`.
- After any seed change, re-pin `packages/db/supabase/tests/seed_idempotent.test.sql` to the counts in the seed header.
- Next migration number: `20261007240000` (`200000` settle safety, `210000` policy settings, `220000` booking reference — all live; `230000` is reserved for the fare-lines job). Ask the controller first and check every remote branch for the file name.
- Standing order (owner, 2026-10-01 17:41 +04, verbatim): "coomit and deply all after verify dont ask me". It is never used for the live Stripe key, the vamostaxi.eu cutover, price book row 18 Publish, deleting test bookings, or wiping data. Those need his word every time.

Kept by the control session. One page: what is live, what is being built, what waits for
the owner, what comes next. Updated at every ship and every hand-over.
`PHASE-CLOSURE-2026-09-29.md` still wins over the ROADMAP progress table.
Rewritten short on 2026-09-30 14:25; the long version is in git history (`8230227c`).

**Last update:** 2026-10-03 03:40 (+04)

## Landing queue, 2026-10-03 00:45 (+04)

| Branch | State | Next |
|---|---|---|
| `fix/policy-settings-publish` (migration `20261007210000`) | **Live 01:47** (`e77b5ede`, Worker `411e698d`) | Owner: set city waiting 30 and press Publish (owner step 2) |
| `fix/booking-pages-polish` | **Live 01:54** (`cddca625`, Worker `561b7bbe`) | Owner UAT in its hand-over |
| `fix/26.2-audit` (migration `20261007220000`) | **Live 02:27** (`eec7951f`, Worker `b985a07d`) | Owner: 4242 with one live coupon and one without |
| `fix/arabic-time-spinner` | **On main 01:58** (`5f72ac01`), React twin only | done |
| Contact overlay ("V" button) redesign | Owner 2026-10-03 ~01:55 (question form, verbatim): "let fullllllyyyyyyy redeign that overley button from scratch and fix it how it shows across mobile and desktop let me see it and apply at across all pages". Cause: on a phone the V button covers PAY on /checkout (found by the video session `vamostaxi-eu-1b`, read-only). Design job running in its own worktree, branch `design/contact-overlay`: 2-3 directions, signing pictures | Owner picks and signs, then one build job for every page (mocks and React twin) |
| Video session `vamostaxi-eu-1b` | Marketing videos from live, read-only; no commits; its exploratory runs 2026-10-02 ~15:20-15:40 clicked "Necessary only" on the home cookie banner about 3 times (possible test consent rows) | none for control |
| Legal translations (U08-11) | **Live 02:55** (`3cac1fc5`, Worker `be0d91e0`) | Owner UAT in `quick/261003-legal-lines-imprint/HANDOVER.md` |
| /imprint unfilled sections (U07-2) | **Live 02:55**: hidden until the owner gives the text (corrected answer, decisions/2026-10-03-audit-owner-answers.md) | Owner: the licence, dispute-body and disclaimer texts when he has them |
| Separate fare lines (U04-3) | Design and plan **signed** (icons, everywhere, Flughafen-Abholgebühr, town names and voucher line on the three booking pages; decisions/2026-10-03-fare-lines-design.md). Branch `feat/fare-lines` e69e90b8 holds PLAN.md; migration `20261007230000` reserved | Builds after the contact button lands; fresh money review |
| Contact overlay | **Live 17:40 2026-10-03** (`6a019ac1`, Worker `b6c8651b`): direction B on every public page, docked in the phone PAY bar; phone PAY reads PAY with the amount in Total (owner, decisions/2026-10-03-pay-bar-phone-amount.md). Live Chromium: /about 1440, /terms 768, /ar/about 1440 (bottom-left), /sign-in 1024: four rows exact, Esc closes, no sideways scroll | Owner: one 4242 payment (PAY bar changed), then payment rows read; then the Arabic header-logo job |
| Quote rate buckets (work session, hand-over `quick/261003-quote-rate-buckets`) | **Live 17:45** (`709c51aa`, Worker `74521422`) | Owner: on a phone, type both addresses on home → /checkout shows class prices |
| Landed and cleaned 00:4x | settle safety, Dependabot, Actions trim: branches deleted on GitHub (archive tags), folders removed; the settle-safety folder waits for its session to close | |

## Controller take-over, 2026-10-02 15:26 (+04)

Read at take-over (15:27 to 15:33): main = origin/main `3978fda9`, tree clean; Worker `vamos` version `7f640c03` (14:12), read with wrangler as `koussayzayeni@gmail.com`. Live runs the code of main: the two commits above `3b1e053d` are planning notes.

| Branch | Tip | Ahead of main | State at take-over |
|---|---|---|---|
| `fix/settle-safety` | `f22b6a04` | 6 | Its session still builds (worktree locked). Money: fresh review before it ships. Migration `20261007200000` |
| `fix/booking-pages-polish` | `3978fda9` | 0 | Its session waits for the owner; nothing committed yet |
| `fix/policy-settings-publish` | `6e21916f` | 5 | On GitHub. Database change: fresh review running. Migration `20261007210000` |
| `fix/dependabot-high-cves` | `d443f38f` | 1 | On GitHub. Review running |
| `ci/trim-actions-minutes` | `d93db028` | 1 | On GitHub. Review running |
| `fix/arabic-time-spinner` | `d16c64de` | 1 | On GitHub. Review running |
| `fix/26.2-audit` | `3978fda9` | 0 | Cut, nothing built |

Next migration number after these two: `20261007220000`; that number went to the 26.2 audit job (booking reference five digits, 2026-10-03 00:3x), next free `20261007230000`.

## Controller take-over, 2026-10-01 23:25 (+04)

The local controller read `.planning/HANDOVER-2026-10-01.md` (the closing state of the claude.ai project) and checked it:

- main = origin/main `7aed613a` before this note; last code `96a17ab7`. Worker `vamos` `6eb1d700` (13:44Z), gateway `vamos-dashboard` `71a307da`, both read with wrangler as the right account; `vamos-web` does not exist. vamostaxi.site and dashboard /login answer 200.
- The blocked "Write the control rule into repo" job committed nothing: its folder `.claude/worktrees/trusting-mirzakhani-c91e36` (`claude/project-thread-q8h6ci`) sits clean on `7aed613a`, and that branch is not on GitHub.
- Differs from the hand-over: `gsd/26.2-p6-build` was already on GitHub at `75b85d2e`; the Mac held 4 newer commits up to `e51940cf` (17:27 +04), pushed now without force. Folder `vamos-wt/phase-26.2` also holds 29 uncommitted files, the P6 job's work in progress, left alone.
- Local-only branch `gsd/phase-26.1-payment-pricing` (`cbb2a3a2`, 2026-09-28, 214 commits found nowhere on GitHub) saved as tag `archive/branch-gsd-phase-26.1-payment-pricing-cbb2a3a2`; the local branch stays until the owner's "yes, delete". The 5 stashes already have `archive/stash-*` tags.
- GitHub branches: main, `ci/e2e-linux-3`, `claude/project-thread-6r5gz9` (B7), `claude/project-thread-cwny3q` (Phase 20), `claude/routesummary-port-only` and its base `fix/main-green`, `docs/lenis-quick-note`, `fix/e2e-linux-2`, `gsd/26.2-p6-build`, `gsd/26.2-p6-paid-trip-edit`, `gsd/phase-20-security-check`, `gsd/phase-26.2-u13`, `gsd/phase-28-pixel-pageview`.
- App worktrees under `.claude/worktrees/` (all clean, every tip on main or GitHub): `awesome-swartz` (Phase 20), `great-khayyam` (B5, shipped), `vigilant-einstein` (/confirmation, shipped), `trusting-mirzakhani` (blocked rule job), and `distracted-nash`, `frosty-shamir`, `interesting-nightingale` (`66d3ba80`), `serene-meninsky`, `stoic-cartwright`, `suspicious-rubin` (`194aee66`). Removed only on the owner's "yes, delete".

## What is left, 2026-10-01 23:38 (+04)

**Lanes that run now, in parallel (no shared files; each job in its own app worktree):**

| Lane | Job | Branch | After it |
|---|---|---|---|
| R | Phase 20 leftovers G7/G10/G11/G12/G28 | **Live 23:51** (`3e2bba66`, Worker `b7a34b05`) | done; branch deleted, `archive/branch-claude-project-thread-cwny3q-84cb34cb` |
| A | P6, change place or time of a paid trip | **Live 02:58** (`05b8f2d1`, Worker `c6a4ecac`) | done; session archived, folder and branches removed. New follow-up from review 2: a customer time request can end a staff change that waits for payment (no money lost); queue it with the follow-ups |
| B | Main green 3 (26.0 finish) | **On main 03:33** (`36445c03`, tests/CI only, no deploy): GitHub E2E Linux 9 jobs inside 30 min, schema + mutation gate green, stale specs fixed. Left: owner decides the 48 SiteHeader pictures (one cause: his signed full-page menu); unclassified Linux reds checkout-hosted 390, checkout-account 768/390; /cookies "#legacy" link with no section | done; session archived, folder, stack and 4 branches removed (archive tags) |
| D | GSD bookkeeping (B10) | **On main 00:00** (`e38026ff`, planning only) | done; GSD now shows 323/337 plans, current 20 (20-09), next 28 |
| V | Van luxury up to 12 travellers | **Live 02:12** (`7f718a5a`, Worker `7cf4af92`) | done; session archived, folder and branch removed |

**Now free to start, one at a time (P6 is live; same money and checkout files):** P6 follow-ups (**live 14:13**) → **Difference-payment settle safety (money; before the live key)**: also the P6 follow-ups R4 warnings (an amount that changed between two Accepts; a staff change replacing a just-paid page); found by the P6 follow-ups reviewer 2026-10-02: (P-1) upsert locks booking→request while settle/accept lock request→booking, and `settle.ts:351-372` acknowledges every SQL error except P0002, so a deadlock (40P01) would drop a captured difference for good — retry instead of acknowledge, one lock order; (P-2) the extra settle's 'requested' branch has no booking-status check (only 'withdrawn' has, `20261007140000:1201-1214`) and `paid-cancel.ts` does not end a waiting change, so a difference paid after a cancel may be applied to a cancelled trip; plus the defence-in-depth row pick in `checkout_extra_payment_settle` (order by status='requested' desc, created_at desc limit 1). Migration number from the controller, fresh review → **Booking pages polish** (parallel with the settle-safety job, no shared files): a signed-in customer's booking page shows a paid booking as "Awaiting payment" with no Cancel (`fromAccount` lacks 'booked'); dates stay English in de/fr/ar ("Tue 6 Oct · 08:15"); Arabic bag plural from dict line 53; English country name in the refund line; home time spinner reads "30 : 04" for 04:30 in Arabic → owner question: the manage-booking "Call dispatch / Cancel instead" card never shows (bookingTiming 'late' is never set) → P6 follow-up (a customer time request must not end a staff change waiting for payment: refuse it or expire that page) → Van luxury follow-up in P6's files (`app/pages/manage-booking.dc.html:693` and `booking-detail.dc.html:675` hard-code Business 3 / Van luxury 7 seats and their counters stop at 8; read the limit from the class rows; also the dashboard booking edit writes `pax` with no seat check, `lib/ops/bookings-write.ts:300`) → Arabic phone left to right in P6's files (`manage-booking.dc.html` ~235/533/661, `booking-detail.dc.html` ~233/523/643) and in the Arabic e-mails (`refund.ts`, `contact.ts`, `ConfirmationEmail.tsx`); remove the 12 local mirror flips the new laws.css rule makes redundant → B2 extras part B (with D1, owner 2026-10-02: extras change only through a draft and Publish; a migration restores live's `tg_pricing_row_frozen` so files match live, `decisions/2026-10-02-live-extras-draft-then-publish.md`) (CHF 0 shows "included")
and part C (count per extra, with a maximum; migrations `20261007120000`, `130000`) → drop the price-band
tables G8/G9 (also the same JSON double encoding in rate-versions publish `publish/route.ts:91,142` and rate-book city-pair rules `rate-book/route.ts:898-908`, found by the Stripe review) (deletes rows of old price-book rows 1-5; fresh review) → B5 follow-up 2 (gate `/checkout` and `/booking-detail`; the phone part is live 12:52) → B3 live-key refusals (one helper for
`^(sk|rk)_live_`; after the owner's refund-by-hand test) → 26.2 rows (airport fee inside the fare line,
JSON double encoding in `stripe_events.payload` and `rate_version_rules.payload`, `data-i18n-skip` leftovers).

**B7 live 23:56; Arabic and design fixes + G23 live 01:53.** Left on that lane: the 19 design-canvas problems, once the owner puts `vamos-design-system-handover.md` into `.planning/`.

**Closed by the owner 2026-10-01 23:59:** Phase 19 (no surge test, not a launch item) and the 26.2 audit units that
never ran (`decisions/2026-10-01-phase19-and-26.2-units-closed.md`). **Last:** u13 stricter check scripts (`gsd/phase-26.2-u13`). **After the owner's Meta check:** Phase 28, then 29.

**The owner's own steps:** (0) GitHub: Settings > Billing and plans: fix the failed payment or raise the Actions spending limit (every Actions job stops after 3 s). (1) Done 23:4x: Cloudflare automatic Web Analytics off. (2) Now: waiting time 30 minutes
in dashboard settings (B7 is live). (3) Real texts of the 5 published reviews. (4) 4242 payment as guest and
with "Create an account". (5) /contact real message. (6) Refund by hand. (7) Pay in de, fr, ar and on a
tablet. (8) UAT of the live jobs (pick-up report section 2). (9) Meta switches on pixel 1595596972063765.
(10) The 48 SiteHeader picture diffs. (11) Repo public or private. (12) The rest of the 18:01 message. Done 23:40: PR #62 closed
(comment says what is on main), `claude/routesummary-port-only`, `fix/main-green` and `docs/lenis-quick-note`
deleted on the owner's answer, each saved in its `archive/*` tag. Launch, his word only: prices + Publish of price
book row 18, delete test bookings, live Stripe key, vamostaxi.eu cutover.

## Live now

| Item | Value |
|---|---|
| Site | https://vamostaxi.site and https://dashboard.vamostaxi.site |
| main = origin/main | `412ac19b` (home sections) plus planning notes |
| Worker `vamos` | version `0069e954` (2026-10-03 18:57, home sections); before: `74521422` (17:45, quote rate buckets), `b6c8651b` (17:40, contact button B), `4a84b952` (15:52, dashboard New trip Save), `be0d91e0` (02:55, legal lines), `b985a07d` (02:27, 26.2 audit), `561b7bbe` (01:54, booking pages polish), `411e698d` (01:47, policy values), `0fccc5e1` (00:28, settle safety), `7f640c03` (2026-10-02 14:12, P6 follow-ups), `660bce80` (12:52, account phone to dashboard), `cdd63f10` (12:39, Stripe event payloads), `44ca2be9` (06:43, /cookies dead link), `c6a4ecac` (02:58, P6 paid-trip edit), `ae61d012` (02:28, guest-cancel hotfix), `7cf4af92` (02:12, Van luxury 12), `1415cd1f` (01:53, Arabic and design fixes + G23), `4e3a6eba` (2026-10-01 23:56, B7 content and legal), `b7a34b05` (23:50, Phase 20 leftovers), `6eb1d700` (17:44, 27.1 finish your account), `8f6720d6` (17:33, /confirmation), `fae3e473` |
| Worker `vamos-dashboard` (gateway) | version `71a307da` (2026-10-01 08:0x); before: `58c6e541`. Rollback of batch C part 2 = both Workers together |
| Rollback point | quote rate buckets: Worker `b6c8651b`, tag `backup/main-before-quote-rate-buckets-20261003-1741` (old Workers ignore the new namespaces); contact button: Worker `4a84b952`, tag `backup/main-before-contact-button-20261003-1733`; New trip Save: Worker `be0d91e0`, tag `backup/main-before-new-trip-origin-20261003-1549`; 26.2 audit: Worker `561b7bbe`, tag `backup/main-before-26.2-audit-f6b5659d` (the reference function is safe to keep); booking pages polish: Worker `411e698d`, tag `backup/main-before-booking-pages-polish-93a1e615`; policy values: Worker `0fccc5e1`, tag `backup/main-before-policy-settings-f0285a16` (the new table and function are additive and can stay); settle safety: Worker `7f640c03`, tag `backup/main-before-settle-safety-3c269d5c`, then the previous bodies from the files named in the migration header (both halves are safe alone); Worker `f58cd68e` + gateway `58c6e541` together, git tag `backup/main-before-c2-df520d08`; before the design: Worker `e2c53324`; before D and the refusal fix: Worker `c45d2782`; before 27: Worker `dfba8779`, tag `backup/main-before-27-a8948162` (the two Phase 27 migrations are additive and can stay); before polish 2: Worker `832b884e`; before batch C1: Worker `24945bab`; before extras A: Worker `2f303d16`; before refunds: Worker `1e1fd4a6`, tag `backup/main-before-refunds-3a486eaa` (note: rolling the Worker back alone re-enables automatic refunds on cancel; the migration stays); before the home change: Worker `852de5f4`; before the three pieces: Worker `d0c427c2`; before native scrolling: Worker `f3f7d929`; before the queue: Worker `92504970`; before class cards: Worker `d80e6577`; before speed A: Worker `8adb148c`; before phone home: Worker `d43e467b`; before 26.2: Worker `0d1806ce`; before the Support button: Worker `2d5906ce` (before 26.5: Worker `fe9314d0`, tag `backup/main-before-26.5-e09f90cb`). Guest accounts off without a deploy: `settings.guest_accounts_live = false` |
| Database | booking reference `20261007220000` applied 2026-10-03 02:25 (live `20261002222545`), body equal to the file, serial 751 untouched; policy draft `20261007210000` applied 2026-10-03 01:45 (live `20261002214448 policy_draft_publish`), read back equal to the file, draft row = live row 15 (180/24/60/15), no policy row published; settle safety `20261007200000` applied 2026-10-03 00:25 (recorded on live as `20261002202619 settle_safety`), read back: six bodies, six comments and grants equal to the file; before it: migrations up to `20260930210000`, 26.5's `20261001100000` to `130000`, Phase 20's `20261005100000` and `110000`, 26.2's `20261007100000`, Phase 20's `20261005120000`, `130000`, `140000` (refunds by hand), 26.2's `20261007110000` (extra names prune), Phase 20's `20261005150000` (last-admin guard), Phase 27's `20261002100000` and `110000`, 26.2 P1's `20261007140000` (class change; 13 function bodies md5-identical, three checks widened), 26.2's `20261007160000` (assign by class; 4 function bodies md5-identical, `chauffeurs.plate` and `deleted_at`), all applied and read back. `guest_accounts_live` = true since 14:58 (owner's answer) |
| Who deploys | the control session, from the owner's Mac. GitHub runs checks, never deploys. |

## Verified 2026-10-01 17:49 (+04), main `96a17ab7`

Clean clone: install from the lockfile and all 11 gates pass; pgTAP from zero on an own stack (`vamos-taxi-ctl`, 643xx) 93 files, 2259 tests pass; `db:types:check` passes; stack stopped. Live migrations: every file since `20260928140000` is on live by name, `20261007170000` read back; 21 older files (2026-08-27 to 2026-09-28 13:00) are recorded on live under split names, their key functions checked present. Live 200: /, /checkout, /confirmation, /sign-up, /account, /contact, /manage-booking, dashboard /login. Worker `vamos` `6eb1d700`, gateway `71a307da`. Not verified: no 4242 payment since the two ships (owner UAT); the e2e and picture jobs were not run. **B7 content/legal held**: Cloudflare's automatic Web Analytics snippet is still injected on live pages (seen with a browser user agent); B7's CSP would let it run before consent. The owner switches it off in Cloudflare, then B7 ships. GitHub after clean-up: main plus `ci/e2e-linux-3`, `claude/project-thread-6r5gz9` (B7, PR #66), `claude/routesummary-port-only` (PR #62) and its base `fix/main-green`, `docs/lenis-quick-note`, `fix/e2e-linux-2`, `gsd/26.2-p6-build`, `gsd/26.2-p6-paid-trip-edit`, `gsd/phase-20-security-check`, `gsd/phase-26.2-u13`, `gsd/phase-28-pixel-pageview`. Shipped today and deleted, each with an `archive/*` tag: `claude/project-thread-wmr715`, `-ii4fuh`, `-vc27aw`, `-jbsapo`.

## Shipped

| Day | Time | What | main | Worker |
|---|---|---|---|---|
| 09-29 | | 26.3 booking flow; account list and guest link; manage booking; dashboard New trip; hourly jobs; sign-in and sign-up | `2bd05b0a` | |
| 09-30 | 00:16 | 26.4 one form, 26.4.1 laptop bar | `0f58ab6d` | |
| 09-30 | 01:35 | Legal pages from the company's text, and the follow-up | `e27014c1` | `a55b2c19` |
| 09-30 | 12:22 | 26.4.2 booking feedback: one-page phone booking, flight before From, class cards with photos, flight-edit fix | `37ba5b62` | `59c18372` |
| 09-30 | 12:38 | Phase 20 batch A (security), two migrations | `e8aaad0b` | `a0d38f64` |
| 09-30 | 12:46 | SEO: head, favicon, share picture, sitemap, one address per language | `5b394833` | `64be5312` |
| 09-30 | 14:40 | Repair of 26.4.2: the phone booking page releases the page scroll on close and covers the screen with the keyboard open | `ec1beed5` | `04a64c26` |
| 09-30 | 14:46 | Scroll repair: a released page lock starts scrolling again on every page (phone menu, dialogs, booking page) | `3d74d6a0` | `fe9314d0` |
| 09-30 | 14:57 | **26.5 account choice before payment**: guest, sign in or create an account; unpaid bookings hidden from the account; paid-only reminder; pay-press limit; four migrations | `9a5263cd` | `2d5906ce` |
| 09-30 | 15:02 | Support e-mail button: answers the customer of that ticket; support copy carries the customer as reply address | `96796ddb` | `0d1806ce` |
| 09-30 | 15:09 | 26.2 audit hand-over 1: 17 bug fixes in dashboard, mails and helpers; sign-in mails clean in de/fr/ar; staff price preview permission | `3142a6e8` | `d43e467b` |
| 09-30 | 15:20 | SEO follow-up (dashboard robots closed, first view follows a stored language) and phone home (Trustpilot row in the booking card, full-page menu, hero behind Safari's bars) | `51b851e3` | `8adb148c` + gateway `58c6e541` |
| 09-30 | 15:28 | Site speed A: static files cached, reviews cached 5 min, About photo 4.0 MB to 385 KB | `02c1bd3d` | `d80e6577` |
| 09-30 | 16:12 | Class cards in layout E on home and checkout; small photo versions (2.77 MB to 0.14 MB); check-script fix | `f7a3528b` | `92504970` |
| 09-30 | 16:39 | Booking-path queue: 26.2 hand-over 2 (16 bugs), security batch B1, erased-booking pay link; migrations `20261005120000` and `130000` applied and read back | `a81e194e` | `f3f7d929` |
| 09-30 | 23:26 | Native scrolling: Lenis and the design-system scroll script removed everywhere | `561d1647` | `d0c427c2` |
| 09-30 | 23:54 | Class photos (no Remove link; unused photos deleted at Publish), sync prune, distance on /checkout | `4da95e14` | `852de5f4` |
| 10-01 | 00:20 | Laptop home without the class section (owner order) | `f37cc0b4` | `1e1fd4a6` |
| 10-01 | 02:30 | **Refunds by hand** (Phase 20 plan 20-10): no automatic Stripe refund on a cancel; admin refund per payment; approved texts | `f29623da` | `2f303d16` |
| 10-01 | 02:37 | Extras part A: the price book row decides an extra, no fixed names; names pruned; Pricing and booking detail changes | `9acfdb51` | `24945bab` |
| 10-01 | 02:42 | Security batch C part 1: Arabic font from our host, four hardening fixes, last-admin guard | `1a105d25` | `832b884e` |
| 10-01 | 02:51 | Booking polish 2: Koffer, Safari Back and the sheet race, footer-band guard, dead leftovers | `5557f6d3` | `dfba8779` |
| 10-01 | 03:02 | **Phase 27 consent record**: cookie choice saved on the server, banner on every customer page, sign-up tick box; Meta still off | `ce55cd75` | `c45d2782` |
| 10-01 | 03:10 | Extras part D (no stop on the way; terms and privacy lines) and dashboard refusal messages + My bookings shows anyway | `0edf87d9` | `e2c53324` |
| 10-01 | 03:24 | Dashboard design: one Actions menu, short phone bar, Assign without a pop-up, driver Car field, edit-box buttons | `4dc72078` | `f58cd68e` |
| 10-01 | 08:06 | Security batch C part 2: sign-in confirm screen, dashboard files off the public host, /dev headers once (two Workers) | `34c726db` | `7fa342a7` + gateway `71a307da` |
| 10-01 | 11:19 | **26.0 main green**: honest test and gate set, Worker-client DB tests, e2e-linux GitHub job, `/dev` test-only, imprint en+de notice for fr/ar readers (D-05); no migration | `6ec73c52` | `c2127d38` |
| 10-01 | 13:36 | **26.2 P1 class change on a paid trip**: dashboard class list with the difference, pay-the-difference mail and 24-hour Stripe page, Withdraw change, refund line on the customer page; customer time-change requests fixed (failed on live with 23514); migration `20261007140000` | `8b65e01b` | `60e61d96` |
| 10-01 | 13:42 | **E-mail change can finish** (Phase 20 follow-up): one mail to the old address, one to the new; first click says "Now open the link we sent to your other address", second click completes; no migration | `11559467` | `38063b7d` |
| 10-01 | 13:45 | **Chauffeurs by class**: Class and required Plate number on the chauffeur, Assign lists only the trip's class as "Name · Plate", bookings history per chauffeur, delete keeps finished trips; mails and booking page show the plate; migration `20261007160000` | `b0ee0421` | `8889f3c3` |
| 10-01 | 14:19 | GitHub e2e job split into four parallel jobs with a 30-minute limit each (workflow files only, no deploy) | `add33513` | unchanged |
| 10-01 | 15:36 | GitHub e2e jobs: own tsconfig for the test runner (ends the 290 "Failed to load tsconfig file" errors), six jobs instead of four (workflow files and one test settings file, no deploy) | `f8a2f635` | unchanged |
| 10-01 | 15:43 | /contact: phone and e-mail read left to right in Arabic; three lines translated (de, fr, ar); no migration | `c5157913` | `fae3e473` |
| 10-01 | 17:33 | **/confirmation redesign** (signed): two buttons, three next steps, help line; time, flight and cancel move to Manage booking; no migration. Rollback: tag `backup/main-before-confirmation-150a2a20`, Worker `fae3e473`. A stray Worker `vamos-web` made by a deploy without `--env staging` was deleted at 17:45 | `50a2a050` | `8f6720d6` |
| 10-01 | 17:44 | **27.1 Finish your account**: a sign-in-link account finishes (name, optional phone, the account tick) before it can pay or open a booking; nobody ticks twice. Migration `20261007170000` applied first and read back (three bodies md5-identical, definer, vamos_system only; table RLS, no client grant). Rollback: tag `backup/main-before-27.1-cbbd4d13`, Worker `8f6720d6` | `96a17ab7` | `6eb1d700` |
| 10-01 | 23:51 | **Phase 20 leftovers** G7, G10, G11, G12, G28 (fresh review: safe; both checkout functions owned by postgres, both definer, read on live first): grants off roles that never call them, `staff_daily_digests` RLS on, dashboard ticket id encoded. Migration `20261007180000` applied verbatim first and read back (the hand-over's expected grant list exactly; checkout owner keeps `create_quote_snapshot`; `vamos_checkout` keeps `checkout_create_booking`). Clean clone: 11 gates, build, 3508 web unit tests, pgTAP from empty 94 files / 2299, types identical. Live 200 on 9 pages + dashboard /login + /api/consent/state. Rollback: tag `backup/main-before-p20-leftovers-42fd9060`, Worker `6eb1d700` (grants stay; they are only narrower) | `3e2bba66` | `b7a34b05` |
| 10-01 | 23:56 | **B7 content and legal** (owner turned Cloudflare's automatic Web Analytics off first; no beacon on 7 live pages before the deploy): Imprint back in the footer, imprint in en/de/fr/ar with German binding, /terms driver details by e-mail, /about Van luxury 12, Web Analytics only after an Analytics yes (CSP allows static.cloudflareinsights.com and cloudflareinsights.com; no beacon in any page's HTML before consent), seed waiting 30 for a fresh database. No migration. Clean clone: 11 gates, build, 3512 web unit tests, pgTAP from empty 94 / 2299, types identical. Live 200 on 12 pages + dashboard /login. PR #66 closed as shipped. Rollback: tag `backup/main-before-b7-3e2bba66`, Worker `b7a34b05` | `ea1141e7` | `4e3a6eba` |
| 10-02 | 01:53 | **Arabic and design fixes + G23** (design signed by the owner 01:09, four recommended options): Arabic numbers left to right on /imprint, /cancellation, /account and two checkout lines; arrows and chevrons mirror in Arabic (one laws.css rule); disabled primary button grey; muted text 5.38:1; Arabic typo انتظار in four strings (live reads the JSON messages, no row to change); Google Maps out of CSP connect-src. No migration. Clean clone: 11 gates, build, 3528 web unit tests, pgTAP from empty 94 / 2299, types identical. Live 200 on 11 pages + dashboard /login. Rollback: tag `backup/main-before-arabic-g23-dace2b1f`, Worker `4e3a6eba`. Not done: the 19 design-canvas problems (list owed by the owner) | `07e43fed` | `1415cd1f` |
| 10-02 | 02:12 | **Van luxury up to 12 travellers** (owner 2026-10-01 16:03): traveller limit from the class rows on home, phone sheet, /checkout and dashboard New trip; server refuses a class with too few seats (real-engine test); language switch de/fr→ar keeps the right Arabic plural (vamos-locale.js). No migration. Fresh review: round 1 fix, round 2 safe (30,636 lookups, 0 regressions). Clean clone: 11 gates, build, 3589 web unit tests, pgTAP 94 / 2299, types identical. Live: /api/quote gives Economy 3, Business 7, Van luxury 12; 8 pages + dashboard /login 200. Rollback: tag `backup/main-before-van-luxury-12-d575917e`, Worker `1415cd1f` | `7f718a5a` | `7cf4af92` |
| 10-02 | 02:28 | **Hotfix: guest cancel from the e-mailed link** (found by P6; live since the token moved into the vt_manage cookie): the page sends the booking on screen; the cancel route checks inside the guest transaction that the cookie owns that booking, else 409 and nothing written. Picks 5dcb9e6c + 421b88f2 from the P6 branch. No migration. Fresh review: round 1 fix (wrong booking via the shared cookie), round 2 safe. Clean clone: 11 gates, build, 3605 web unit tests, pgTAP 94 / 2299. Live: pages 200, served page sends the reference. Rollback: tag `backup/main-before-guest-cancel-28634c81`, Worker `7cf4af92` | `5bedee98` | `ae61d012` |
| 10-02 | 02:58 | **26.2 P6 change place or time of a paid trip** (D1-D21 signed): dashboard trip change re-priced on today's live book (date/time/party in the class keep the price), dearer waits for the difference, cheaper is Refund due by hand, driver clash asks take off or keep (D17 rule); customer time change only at its own price; account flight row and Resend (D20). Migration `20261007150000` applied verbatim first and read back: 11 bodies md5-identical, definer, search_path '', rule `9605dc33`, triggers, grants; 39 legs, 0 kept, no row written. Fresh review: round 1 fix (customer could lower the price; paid difference could fail to record), round 2 safe. Clean clone: 11 gates, build, 3775 web unit tests, pgTAP 95 / 2452, types identical. Live 200; retired generic change POST 405. Rollback: tag `backup/main-before-p6-eb9128f3`, Worker `ae61d012` (the migration stays; its functions only add refusals and new paths) | `05b8f2d1` | `c6a4ecac` |
| 10-02 | 03:33 | **Main green 3**: Linux e2e jobs inside limits, mutation gate and schema job green, stale specs fixed, header diffs explained. Tests, CI and planning only; no deploy | `36445c03` | unchanged |
| 10-02 | 03:42 | **SiteHeader pictures**: the 48 test pictures take the owner-signed full-page menu (owner decision 03:34); tests only, no deploy | `69afa70a` | unchanged |
| 10-02 | 06:43 | **/cookies**: the dead "08 The previous site" menu link removed (owner decision; no section ever existed), string gone in four languages, seed re-pinned (2692). Clean clone: 11 gates, build, unit, pgTAP 95 / 2452. Live: link gone, /cookies /de /ar 200. Rollback: tag `backup/main-before-cookies-link-69afa70a`, Worker `c6a4ecac` | `5d635c44` | `44ca2be9` |
| 10-02 | 12:39 | **Stripe event payloads stored as objects** (26.2 finding): webhook and return-route settle write through one sql.json writer; 72 old string rows stay (nothing reads them; optional conversion is the owner's choice). No migration. Fresh review: safe. Clean clone: 11 gates, build, 3779 web unit tests, pgTAP 95 / 2452, types identical. Live 200; unsigned webhook 400. Not verified: a new row after a real payment (owner 4242, then jsonb_typeof = object). Rollback: tag `backup/main-before-stripe-events-json-62385c05`, Worker `44ca2be9` | `a42809ee` | `cdd63f10` |
| 10-02 | 12:52 | **Account phone reaches the dashboard** (B5 follow-up 1): sign-up and account-page phone written to the customer's own row through checkout's lookup (never an erased or another user's row; created on demand for a confirmed user); dashboard falls back to the latest booking phone. No migration. Fresh review: two rounds, safe. Clean clone: 11 gates, build, 3801 web unit tests, pgTAP 95 / 2452. Live 200. Later notes: fill-blank runs on every link sign-in; sign-in waits one round trip; name edits still write metadata only; four local DB tests clash on a shared stack. Rollback: Worker `cdd63f10` | `b8b9fa7e` | `660bce80` |
| 10-02 | 14:13 | **P6 follow-ups** (owner signed F1-F4 03:58): a customer time request no longer ends a staff change waiting for payment (migration `20261007190000`, applied right after the Worker: body md5 `6aa5b970`, definer, search_path '', EXECUTE postgres/service_role/vamos_system); no Stripe page shared across requests; Withdraw without a page; Arabic phones left to right on booking pages and e-mails; e-mail font; one RTL mirror rule; missing de/fr/ar lines. Reviews: builder R1-R4 (fix, safe, fix, safe) + controller's independent review safe (Worker first, then migration). Live before: 0 shared sessions, upsert `c86124b9`, 0 waiting. Clean clone: 11 gates, build, 3886 web unit tests, pgTAP 96 / 2506, types identical. Rollback: re-apply the P6 upsert body FIRST, then Worker `660bce80` (never the old Worker with the new function) | `3b1e053d` | `7f640c03` |
| 10-02 | 13:13 | **Linux checkout reds** (tests and the Linux e2e workflow only): stale phone-sheet spec, consent-banner stub, auth redirect port, serial legal spec, per-worker build folders. Local proof only: **GitHub Actions refuses every job (account billing: payment failed or spending limit)**; rerun 36986497034 after the owner fixes billing. App findings: `faq.dc.html:68` open-question hover colour; `/api/reviews` 500 on a dev server without Hyperdrive | `08ebcfc7` | unchanged |
| 10-03 | 00:28 | **Settle safety** (money; owner signed plan and texts T1/T2 2026-10-02 14:45): one lock order, booking then change request, in settle and Accept (the 40P01 that dropped a captured difference is gone); the Worker retries database hiccups and never acknowledges a captured payment on an error; every cancel ends a waiting change and closes its Stripe page; a difference that lands on a cancelled trip is recorded, never applied, and shows as Refund due with mail T1; Accept refuses price-changed; a new staff change never replaces a just-paid page. Gates in a clean folder, pgTAP from empty 97/2630, fresh Opus review SHIP. Migration `20261007200000` | `997661d4` | `0fccc5e1` |
| 10-03 | 00:33 | **Dependabot**: the 41 alerts closed (15 high); undici, fast-uri, brace-expansion, js-yaml, qs; no major moved; build tooling only, not in the Worker bundle. Files only, no deploy | `029caeb1` | unchanged |
| 10-03 | 00:40 | **Actions trim**: superseded push runs are cancelled instead of racing; a hand-started deploy is never cancelled; no gate switched off. Workflow files only, no deploy | `33c9b994` | unchanged |
| 10-03 | 01:47 | **Policy values: draft, then Publish** (owner decision 2026-10-02): Minimum advance, free cancel window, airport and city waiting on dashboard Settings save into a one-row draft and reach customers only through Publish (a new settings_versions row; append-only kept). Review fixes: Minimum advance reads minutes (said hours), Cancel button variant, visible Save error, Lucide arrow, Arabic numbers. Gates, pgTAP 98/2648, browser 5/5 en+ar 1440/390. Migration `20261007210000` (live `20261002214448`); draft row = live row 15 | `e77b5ede` | `411e698d` |
| 10-03 | 01:54 | **Booking pages polish** (owner signed four sheets and the plan 2026-10-02 ~15:30): a signed-in paid booking shows its real status and Cancel (it read "Awaiting payment"); dates in the reader's language on both booking pages; Arabic bag plurals; refund country localised; the time row stays 04:30 in Arabic on home and the booking pages. No migration. Gates, job pgTAP 98/2648, Chromium 190 pass, fresh review of the sign-in route SHIP | `cddca625` | `561b7bbe` |
| 10-03 | 01:58 | React TimePicker twin keeps its direction in Arabic (no page renders it; no deploy) | `5f72ac01` | unchanged |
| 10-03 | 02:27 | **26.2 audit, hand-over 3**: voucher accepted at PAY (pre-voucher total signed in the lock, Stripe amount always the server's); /checkout and the pay link read "VAT 8.1 %" (showed 0.81 % while charging 8.1 %); price-book jsonb writers through the JSON helper; refunds read past one page; dashboard redirects uncached; Turnstile fails open only on a 5xx; booking references grow to 5 digits after 9,999. Gates, pgTAP 99/2653, voucher Chromium proof, two fresh reviews SHIP. Migration `20261007220000` (live `20261002222545`) | `eec7951f` | `b985a07d` |
| 10-03 | 02:55 | **Legal lines and /imprint** (owner approved the drafts 02:20; imprint answer corrected 03:30): 19 approved lines on /terms, /privacy, /cookies, /cancellation in de/fr/ar verbatim; "you receive a full refund."; the cookie line says "which language"; /imprint hides sections 05, 07 and the dispute-body line until the owner gives the text, internal notes removed, no TBC on any live page. Untranslated legal strings in de/fr/ar 39 -> 0 | `3cac1fc5` | `be0d91e0` |
| 10-03 | 15:52 | **Dashboard New trip Save** works again (403 csrf since 09-20): dashboard Origin allowed on price/intent only on the dashboard host with a staff session; phone bookings never filed under the admin (customer_id null). Gates 4263 unit, Chromium Save proof VT-26-0028 locally, fresh review SHIP-WITH-NOTES | `e78f17d9` | `4a84b952` |
| 10-03 | 17:40 | **Contact button B** on all public pages and the Next pages; ContactFab removed; /checkout bar Total · contact · PAY, phone amount in Total on one line (owner's answer). Gates 4312 web unit, Chromium 1826 + 1303 checks, 0 failed | `6a019ac1` | `b6c8651b` |
| 10-03 | 17:45 | **Quote rate buckets**: /checkout refused its first price on a phone ("Too many prices") because address lookups, flight and reprice spent the /api/quote bare 4/60 counter; each now has its own (lookup 30, price 8, flight 6 bare), IPv6 keyed by /64, one automatic retry after 61 s. Gates 4331 web unit; live Chromium home → /checkout: 4 lookups + 2 quote calls all 200, prices shown. Open: `VAMOS_QS_SECRET` not set on live (owner secret step); quote Turnstile reads `TURNSTILE_SECRET` but live has `TURNSTILE_SECRET_KEY` | `709c51aa` | `74521422` |
| 10-03 | 18:03 | **Test lab** (`scripts/test-lab/lab.sh`, `vamos-tester` Sonnet agent, TEST-BRIEF template; runs like live) and **26.2 u13 stricter gates** (numbers, db fences, i18n coverage, test:scripts 20). No site code, no deploy. Gates on main + both: all pass, 4331 web unit | `e6f3d660`, `590bd978` | none |
| 10-03 | 18:57 | **Home sections** (signed): Our classes, Where we drive, At the airport, Trust facts, Business travel, closing band; Services, Reviews, FAQ rebuilt; owner's original-review link restored (dropped by the rebuild). Gates 4331 web unit; live Chromium 1440/390/ar: all sections, no errors, no sideways scroll | `412ac19b` | `0069e954` |
| 10-03 | — | Open: phase 28 Meta pixel (review 2 SHIP-WITH-NOTES, consent fixes running on `fix/phase-28-review-2`; migration `20261007240000` waits for the Supabase connector); fare lines building (`feat/fare-lines-build`, migration `20261007230000`, same wait) | | |

## Ship order from here

Owner's order: booking, payments, account, Meta first.

| # | Job | State | Needs |
|---|---|---|---|
| 1 | Phone sheet bugs | **Live 14:40.** Live read at 390: the sheet covers the screen, scrolling works again after closing. Real iPhone and keyboard: the owner's check | |
| 1a | Scroll lock never released on any page | **Live 14:46** (owner said Ship now). Live read at 390 on /faq: page lock and the real phone menu stop scrolling while open and release it on close | |
| 1b | Support e-mail button | **Live 15:02** (owner's word 14:32). Thread is certain only when he presses Reply on the inbox copy of a new ticket; later customer replies live in the dashboard only. Follow-up for certainty: copy each customer reply to his inbox (one migration) | Owner check signed in |
| 2 | 26.5 account choice before payment | **Live 14:57**, under the day's ship mode. Clean-clone gates and 2831 unit tests green on the merged tree; 7 function bodies read back identical; the key name is in 0 client files. Live read: /checkout shows the three options and the guest line, no password field. Not checked: a payment, a mail, the sign-in link | Owner UAT, 11 steps in the 26.5 HANDOVER, 4242 as guest first |
| 3 | 26.2 audit, hand-over 1 | **Live 15:09** (owner said Ship). Next from 26.2: booking-path rows, one owner question per confirmed bug; gate scripts last | Owner UAT, 13 dashboard steps in `26.2-HANDOVER-1.md` |
| 4 | SEO follow-up | **Live 15:20**, gateway 15:22. Live read: dashboard robots.txt is `Disallow: /`, dashboard sign-in opens; a stored Arabic language without a cookie lands on `/ar` on the first view | |
| 5 | Class cards: layout E, small photo files | **Live 16:12** (owner said Ship). Live read at 1440: photo on the side, small card; `?w=640` answers a 138 KB WebP in about 1 second, original 2.77 MB | Owner: look, then one 4242 (checkout class step changed) |
| 6 | 27 consent record | **Live 03:02** | Next: 28 pixel page view and 29 purchase event; the owner's two switches in Meta Events Manager first |
| 7 | 28 pixel page view, 29 purchase event | Not started. Meta wording is the owner's (`.planning/decisions/2026-09-30-meta-wording.md`) | After 27. Two switches in Meta Events Manager first |
| 8 | Phase 20 batch B | Waits | After 26.5. Includes refunds by hand (F11): signed plan first |
| 9 | Phase 20 batch C part 1 (Arabic font from our host; four hardening fixes approved 2026-10-01; last-admin guard `20261005150000`) | **Handed over** `dcfcc64c` | Control check, owner's Ship. Part 2 (F12 confirm screen, F16) after 27 |
| 10 | Phone home design | **Live 15:20** (owner signed and said Ship). Live read at 375: hero fills the screen, Trustpilot row inside the booking card. Full-page menu and Safari bar colour: the owner's iPhone check | Owner's iPhone |
| 10a | Phase 20 batch B1 (return-route limit, F8, lock-secret 503, ticket reply refused, staff e-mail check, reviews column grants `20261005120000`) | Handed over `75b0aba0`; touches checkout files | Owner's 26.5 test first, then his Ship, then a 4242 payment |
| 10b | Site speed A | **Live 15:28** (owner said Ship). Live read: scripts and page parts 5 minutes, engine and photos one year, reviews 5 minutes with 5 rows; checkout, account, manage booking, sign-in and the per-visitor APIs stay `private, no-store`. A deploy now reaches a returning visitor within 5 minutes. B (native scrolling) is built on `fix/native-scroll`, hands over after class cards and Phase 27 | |
| 10c | 26.2 hand-over 2: 16 booking-path bugs, each approved by the owner through the form (mails, dashboard booking edit, New trip, price book, address search, re-price) | Handed over `975c3ab4`; checked green by the control session on main `3b4f86d8` | Owner's 26.5 test first, then his Ship, then a 4242 payment |
| 10f | **Refunds by hand** (Phase 20 plan 20-10, owner-signed): no automatic Stripe refund on a cancel; "Refund due"; admin picks payment and amount; five approved texts in four languages | Handed over `0ca067bb`; not yet checked by the control session | Tomorrow: control check, owner's Ship; migration `20261005140000` and deploy back to back; three hosted content strings updated; UAT: booking, cancel, manual refund |
| 10g | Distance on /checkout | **Live 23:54** (owner said Ship). The km shows once a route is priced; not exercised by the control session | Owner: one booking to see it, and it counts as the owed 4242 |
| 10h | Class photos: no Remove link anywhere; unused class photos deleted at Publish | **Live 23:54** (owner said Ship). Live dashboard file carries no Remove link. **First Publish deletes old unused class photos for good**; the control session reads the Worker log after it | Owner: look at /pricing photo field |
| 10e | Sync prune (scripts only) | **On main 23:54** (owner said Ship) | |
| 10d | Native scrolling | **Live 23:26** (owner's word 16:00). Live read: no Lenis file or global on /faq, the bundle writes no --vt-scroll, page scrolls by script at 390, phone menu locks and releases. Note: the sync script leaves old copies in `apps/web/public/assets`; the control session removed the three Lenis copies by hand before the deploy | Owner: scroll the site on his phone and laptop |
| 11 | Scroll and speed | Measuring on live | A plan for the owner's signature |
| 12 | 26.0 main green | **Live 2026-10-01 11:19** (`6ec73c52`, Worker `c2127d38`) | Folder, branch and stack removed; branch `fix/main-green-2` and tag `archive/26-0-main-green-01679f12` on GitHub |
| 13 | 26.2 gate scripts (stricter checks) | On `gsd/phase-26.2-u13` | Last, after 27 to 29 |

**Ship mode on 2026-09-30 only:** the control session ships 26.4.2 (and its repairs), 26.5 and
27 to 29 without asking, when every check of its own passes, and tells him right after.
Everything else, and everything from 2026-10-01, needs his Ship.
Full text: `.planning/decisions/2026-09-30-priorities-and-ship-mode.md`.

## Queue for 2026-10-01, in order (each: control check in a clean clone, then the owner's Ship)

| # | Job | Database | After the ship |
|---|---|---|---|
| 1 | Refunds by hand | **Live 02:30** (owner said Ship). Migration applied and read back (7 function bodies identical, intents table RLS forced, staff SELECT only), deploy right after. Live /cancellation carries the new sentence. Owner UAT: booking, cancel on the site, refund by hand on the dashboard | done |
| 2 | Extras part A | **Live 02:37** (owner said Ship). Migration applied and read back (function body identical, vamos_staff EXECUTE, admin check inside; it would delete nothing on live today, the names table is empty). Owner UAT: add an extra, book with it and pay 4242, delete it and publish | done |
| 3 | Security batch C part 1 | **Live 02:42** (owner said Ship). Trigger function read back identical, trigger on `staff`; live has 1 active admin (the owner), so his own account can no longer be removed. Live serves the Arabic font files from our host; the Google link is gone. Owner check: /ar on the phone | done |
| 4 | Phase 27 consent record | **Live 03:02** (owner said Ship). Both migrations applied and read back before the deploy (reader body identical, anon EXECUTE only; record_account_agreement now vamos_checkout and vamos_system). Live: /api/consent/state answers policy 2026-10-01; banner mounted on home and checkout. Meta gate closed. Owner UAT: banner in a private window; one sign-up with the tick | done |
| 5 | Booking polish 2 | **Live 02:51** (owner said Ship). Owner check: iPhone, open the booking page, close, reopen at once, Back closes it | done |

## Queue after 03:10

| # | Job | State |
|---|---|---|
| 1 | Phase 28 pixel page view | **On hold, nothing built.** Discuss signed, research committed (`99b2285d`, folder `phase-28`, branch `gsd/phase-28-pixel-pageview`). The owner said both Meta switches are off, but Meta's own setup file for the pixel, read 2026-10-01 09:15 UTC by the Meta session, still lists automatic matching (e-mail, name, phone, address) and inferred events as on. The Meta session re-reads it every hour and starts building when it shows off (`.planning/decisions/2026-10-01-meta-events-manager-switches.md`). Migration `20261003100000` reserved, not written |
| 2 | Dashboard design | **Live 03:24** (owner said Ship). Live OpsDetail mock identical to the source. Owner UAT: 5 steps in `.planning/quick/260930-dash-design/HANDOVER.md`, Assign first once the driver has a car |
| 3 | Security part 2 | **Live 08:06** (owner said Ship). Live: dashboard sign-in 200; dashboard screen files 200 on the dashboard host with CSP, X-Frame-Options and noindex, 404 on the public host; /dev sends each header once; /sign-in/confirm answers. **Finding:** the hand-over said new gateway + old vamos keeps the dashboard working; on live it did not: the dashboard answered 404 between the gateway deploy and the vamos deploy (about the length of one build). Owner UAT: sign-in link opened on the phone; dashboard sign-in. Open owner question: e-mail change cannot finish (hook mails only the old address) |
| 4 | P1 class change, P6 place/time change | **P1 live 13:36** (`8b65e01b`, Worker `60e61d96`; folder and stack removed; owner UAT: 11 steps in `.planning/quick/260930-p1-class-change-reprice/HANDOVER.md`, a 4242 payment of a difference first). **P6 plan signed 2026-10-01** (`.planning/decisions/2026-10-01-p6-paid-trip-edit.md`, migration `20261007150000`): time-only keeps the price; unbookable place refused; cheaper late = full difference as Refund due; too many people offers a larger class; people, bags, contact and flight change instantly; the customer's change page drops five dead fields (picture first). Built after P1 on P1's functions. **No Cars page** (owner correction 2026-10-01, `.planning/decisions/2026-10-01-no-cars-page.md`): refined: chauffeur form as before with Class and one new plate-number field; Assign lists drivers of the booking's class; bookings history per chauffeur; migration `20261007160000`; branch `gsd/26.2-chauffeur-car`, pictures first |
| 5 | 26.0 main green | **Live** (owner said Ship, 2026-10-01). Gates honest again; `/dev` test-only; imprint declares en+de with a notice for fr/ar readers (D-05); e2e-linux GitHub job added (deploys nothing). Playwright still not green: owner-ruled reds (RouteSummary, SiteFooter), 48 SiteHeader screenshot diffs (undiagnosed, also on main without 26.0), home reds on main (`.planning/phases/26.0-main-green/home-red-36.txt`), unclassified reds listed in `.planning/phases/26.0-main-green/26.0-HANDOVER.md` |
| 6 | Phase 29, then the finish-your-account follow-up (27 D-37) | After 28 |
| 7 | Stricter check scripts (u13) | Last |

## Sessions and folders on this Mac

**Clean at 2026-10-01 23:38 (+04), owner's order "vamos-wt no more i want al clean":** one folder,
`/Users/koss/Developer/VamosTaxi.eu` on `main`, no other worktree; one local branch (`main`);
`/Users/koss/Developer/vamos-wt` deleted. Before removal: the P6 job's 29 uncommitted files were committed
and pushed as `6af6b74c` on `gsd/26.2-p6-build` (not reviewed, not a hand-over); `home-red-36.txt` moved to
`.planning/phases/26.0-main-green/`; every removed worktree was clean with its tip on GitHub. Removed: 4
vamos-wt worktrees (e2e-linux-3, phase-26.2, phase-26.2-u13, phase-28), 10 app worktrees under
`.claude/worktrees/`, 65 local branches (each fully on GitHub or in a tag), Docker stacks `vamos-taxi-20`
and `vamos-taxi-chauffeur` with their volumes. Kept: Docker `vamos-taxi` (port 54322, the main folder's
test database) and `twenty-crm` (another product).

From now on a job session works in an app worktree under `.claude/worktrees/` (made by the app when the
owner starts it), with its own port-shifted stack, and the controller removes worktree, branch and stack
the day the job ships.

Prompts for sessions: `.planning/prompts/`, shared rules in `00-common-rules.md`.

## Owner requests, 2026-09-30

| Time | Request | Goes to | State |
|---|---|---|---|
| 12:55 | Class cards: photo on the side, card smaller, on laptop home and step 1 of /checkout | 26.4.2 session, `feat/class-photo-small` | Layout E signed; home built; checkout after 26.5 |
| 12:55 | Scrolling glitches everywhere; the site must be faster | SEO session, `fix/site-speed`, prompt `07-site-speed.md` | Measuring |
| 14:19 | **Bug:** after opening and closing the booking page on the phone, the home page no longer scrolls until a reload | 26.4.2 session, `fix/phone-sheet-bugs` | First, test first |
| 14:19 | **Bug:** with the iPhone keyboard open the booking page shrinks and the home page shows through under SEE PRICES | same | Same |
| 14:22 | Trustpilot block under the phone bar: smaller, redesigned, inside the white area | 26.4.2 session, `fix/phone-home` | Pictures, signature |
| 14:22 | Phone menu opens as a full page, not a side panel (shared header, every page) | same | Same |
| 14:22 | Hero fills the screen; no white strips at the top and bottom of Safari | same | Same |
| 14:27 | Support e-mail button must open the exact e-mail in the mail app he is signed in to, and his answer must stay in that thread. Today it is a plain new mail to the customer | Security session, `fix/support-open-in-mail` | Owner answered 14:32: always the mail of that ticket's customer, never mixed; mail app automatic for now, admin choice if cheap; build it; **ship when the control session's checks pass** (his word, this job only) |
| 23:28 | Remove the "Choose your class" section from the laptop home | 26.5 session | **Live 2026-10-01 00:20.** Live home carries no class section; checkout keeps the cards |
| 16:30 | The trip distance (km) is not shown on /checkout or anywhere in the booking flow, especially on the phone | 26.5 session, `fix/booking-polish`, prompt `10-booking-polish.md`, hand-over 1 | Pictures, his signature |
| 16:30 | Four small items, decided by the control session on his word: German "Koffer"; SELECT 54 px; dark band under the phone footer; Safari Back after closing the sheet | same, hand-over 2 | Not started |
| 16:25 | Signed plans in the 26.2 session: **P4 extras** (a paid extra is a tick box; a CHF 0 extra shows as included; per extra an optional number with a maximum; night, weekend, holiday, waiting and extra stop removed; airport fee stays inside the fare) and **P1 class change on a paid trip** (dearer class only after the difference is paid by an e-mailed pay link, priced with today's price book; cheaper class = Refund due). New decision **P6**: place and time changes on a paid trip get the same treatment | 26.2 session. P4 part A is being built. Order on main: hand-over 2, security B1, erased pay link, P4-A, refunds by hand, P1, P6 | P4-A building; P1 signed, waits; P6 plan after P1 |
| 16:20 | Class photo: Remove link goes; a replaced photo and its small copies are deleted at publish (`.planning/decisions/2026-09-30-class-photo-replace.md`) | **Needs a new session**: the 26.4.2 session reached its context limit and wrote a hand-off. Prompt `09-class-photo-replace.md`, branch `feat/class-photo-replace` | Not started |
| 10-01 | Four small hardening fixes approved (geo session IP source, claims pass only the role, never zero admins, 5 MB cap while reading attachments) plus the lock-secret fallback | Security session, batch C, migration `20261005150000` | Building |
| 10-01 | Fix the booking sheet race (reopen right after closing breaks Back), relayed from the SEO session | 26.5 session, booking polish hand-over 2, with the Safari Back item | Not started |
| 15:40 | Five owner decisions from the 26.2 questions that need a signed plan before code: P1 class change on a paid trip re-prices; P2 refund across both payments; P3 class photo Remove link goes, replaced photo deleted from storage; P4 a deleted extra is deleted completely (hard-coded Ski/Waiting names go); P5 pay link for an erased booking | P1, P4: 26.2 session, own jobs, P4 first. P2, P5: security session (with refunds by hand). P3: 26.4.2 session (photo job) | Plans for his signature |
| 09-29 | Later, its own job: passwords off on the whole site, e-mail link or passkey only | Not scheduled | His word when to start |

## Security (Phase 20)

Findings file: `20-06-FINDINGS.md`, live re-probe `20-09-LIVE.md`, branch `gsd/phase-20-security-check`.
The owner decided every finding F1 to F14. Every Phase 20 ship needs his Ship.

| Batch | When | What |
|---|---|---|
| A | **Live 12:38** | Pay link no longer opens Manage booking (F1). Dashboard Support read-only (F2). Confirmation read derives the customer from the session (F5). Resend job cut-off (F10). Page engine from our own host (F13). Re-probed on live from outside: all hold |
| with 26.5 | **Live 14:57** | Pay-button limit (F3): 5 presses per quote (exact, in the database) and about 8 per minute per visitor. Re-probed on live: the per-visitor brake is loose by design of Cloudflare's limiter (about 19 requests passed before the first refusal); the per-quote cap is the exact one. A request without the account block skips the bot check by design (26.5 D-09) |
| B | After 26.5 | Limit on the payment return address (F6), F8, rest of F14, **refunds by hand (F11)**: customer cancels, booking shows "Refund due", admin presses Refund. Signed plan and a check of every refund promise on /cancellation, /terms, FAQ and mails first. The refusal of a live Stripe key goes with it |
| C | After 27 | Sign-in confirm screen (F12), dashboard screen files off the public address (F16), Arabic font from our own host (F17), double headers on /dev |
| Owner decision | With Phase 27's cookie table | Cloudflare Web Analytics script is blocked by our own header, so it collects nothing (F15): switch off, or allow and say so on /cookies |
| New rows from 26.2 | In the Phase 20 queue | The staff ticket route still sends a reply when called directly (staff only); about 30 more rows in the 26.2 review files |
| Accepted, no work | | F4 ("Confirm email" is on), F7, F9. 41 dependency alerts on GitHub: all build tooling, none in the Worker |

## Migration numbers

| Lane | Numbers |
|---|---|
| 26.5 | `20261001100000` agreement record, `110000` unpaid hidden, `120000` paid-only reminder, `130000` pay-press cap |
| Phase 27 | `20261002100000` to `190000` |
| Phase 28 | `20261003100000` to `190000` |
| Phase 29 | `20261004100000` to `190000` |
| Phase 20 | `20261005100000`, `110000` (live) |
| Class photos | `20261006100000` to `190000` |
| 26.2 | `20261007100000` staff price preview (live); P4-A `110000`, trigger clean-up `120000`, P4-C `130000`; P1 `140000` (live); P6 `150000`; chauffeurs by class `160000` (live); **27.1 finish your account `170000`** (taken by the project chat "Finish your account" on 2026-10-01, reserved here after the fact) |
| Phase 20 (more) | `20261005120000` reviews column grants (B1), `130000` erased-booking pay link (20-12), `140000` refunds by hand (20-10); leftovers G7/G10/G11/G12/G28 `20261007180000` (live 23:51); P6 `20261007150000` live 02:58 |
| P6 follow-ups | `20261007190000` booking_edit_request_upsert: a customer time request waits while a staff change awaits payment (**live 14:13**; reserved 03:09, `fix/p6-followups`) |
| Settle safety | `20261007200000` difference-payment settle: one lock order, retry on deadlock, paid-after-cancel is Refund due (reserved 2026-10-02 14:15, `fix/settle-safety`) |
| **Next free** | **`20261007210000`**. Ask the controller first; check every remote branch for the file name |

## Decisions that stand

Full texts in `.planning/decisions/`.

| Decision | File |
|---|---|
| Service-role key on Worker `vamos`; read by staff digest, staff invite and, with 26.5, account creation, through one server-only module | `2026-09-29-checkout-account-notice.md` |
| Checkout account notice texts and the tick box, four languages | same |
| Legal pages: list A values; refund above 24 hours is 100 %; privacy paragraph "Your account" | `2026-09-30-legal-pages.md` |
| An unpaid booking never continues on another device; a paid trip can be shared | `2026-09-30-unpaid-booking-other-device.md` |
| Priorities and the one-day ship mode; the reminder goes to paid bookings only | `2026-09-30-priorities-and-ship-mode.md` |
| The three Meta texts, four languages | `2026-09-30-meta-wording.md` |
| SEO titles and descriptions; one address per language | `2026-09-30-seo-head-text.md` |
| Phase 19 (surge test) is closed | memory, PHASE-CLOSURE |
| Phase 27 keeps our own banner, no library; 27 is held until 26.5 is live (27 D-21, D-34) | Phase 27 context |

## Known on live, not fixed yet


| What | Carried by |
|---|---|
| Safari: Back pressed within a second after closing the phone booking page with the X does nothing | `fix/booking-polish` |
| German class card says "Gepäckstücke"; the signed picture said "Koffer" | `fix/booking-polish` |
| SELECT on the home class card is 44 px high, the rule for primary booking buttons is 54 | `fix/booking-polish` |
| An empty dark band of about 400 px sits under the footer on the phone home page | `fix/booking-polish` |
| On a laptop the page behind an open booking page or dialog scrolls by mouse wheel | native scrolling job |
| /terms section 03 mentions SMS; /about fleet numbers differ from the live classes (archived work `archive/legal-follow-up-fe4e37a0`, never shipped) | 26.2 list, not assigned |
| Settings say 15 minutes standard waiting, the pages say 30 | Owner changes the setting if both should agree |
| The airport fee is saved inside the fare line, not as its own line | 26.2 list |
| `data-i18n-skip` still sits in the frozen legal pages, `LegalPage`, `PendingSlot` and `manage-booking.dc.html`; the runtime ignores it (no customer effect). `app/[locale]/(ops)/api/staff/content/[key]/route.ts` exports non-route helpers | 26.2 list, not assigned |
| GitHub e2e jobs, run 36856406309 on `f8a2f635` read 16:08: the tsconfig fault is gone (0 errors). Two jobs cut at the 30-minute limit with no result (1440 px shard 1 of 4; 768 and 390 px); 1024 px took 27 min; shards 2 to 4 took 17 to 21 min. "Dev server did not become ready" 26 times across three jobs (cold start on GitHub runners). 18 failed and 8 flaky in the four finished jobs (about, legal pages, home specs, faq, contact, checkout-account, public-routes, confirmation, checkout-page, auth-forms) | Job 3 sent to the 26.0 session 16:08: branch `ci/e2e-linux-3`, one reusable e2e workflow plus a push trigger for `ci/**`, proven by a run on GitHub before the hand-over |
| Playwright: 48 SiteHeader screenshot diffs (open and unconfirmed states, every language, 3 widths) fail with and without 26.0, cause not found; home specs red on main (`.planning/phases/26.0-main-green/home-red-36.txt`); unclassified reds: checkout-hosted 390, currency, confirmation S3/S4, checkout-account 768 | `26.0-HANDOVER.md`; booking-polish for the home reds |
| Class photos are 2.3 to 2.8 MB each | `feat/class-photo-small` |
| VT-26-0739 and VT-26-0742 are not in the owner's account | Not a bug: booked with another e-mail address |
| Three `checkout.session.completed` rows in `stripe_events` stay without `processed_at` (2026-09-30 10:24Z, 12:29Z `return_cs_…`, 2026-10-01 23:09Z); their payments are recorded `succeeded` (VT-26-0746, -0747, -0750, test mode). Bookkeeping only, no money lost | 26.2 list |
| Settle safety review, non-blocking: (1) a difference added to a `processing`/`failed` refund can be overwritten when a decided refund batch settles (add only on `pending_ops`); (3) `lib/checkout/money-events.ts:107` acknowledges every SQL error on charge.refunded and disputes, a deadlock included (payment-row-first vs booking-first order in the refund functions); (5) unused `booking_edit_refund_record` still locks request then booking, drop it; (7) the cancel's page close lacks the legacy-account guard | 26.2 list |
| Dashboard Settings: the header Discard button uses `variant="outline"`, which the kit does not have (renders as a plain button); a refused Save leaves the bad value in the change list ("45 min min"), Publish stays locked | 26.2 list |
| Booking pages (W1, older than the polish job, now also on the signed-in page): the "full refund" line uses the cancel window read when the page opened; a customer who waits across the 24 h line is promised a full refund and gets Refund due (you decide). Copy only, no money; fix: re-read the window when the cancel screen opens or refuse with 409. W2: the e-mailed page's hours can differ by 1 around the clock change | 26.2 list |
| Dashboard New trip Save (403 `csrf` on live since 09-20) | **Live 15:52 2026-10-03** (`e78f17d9`, Worker `4a84b952`). Dashboard Origin passes price/intent only on the dashboard host with a staff session; on the dashboard host no customer actor is read, so phone bookings stay guest bookings (fresh review: BLOCK on round 1, fixed; SHIP-WITH-NOTES round 2). Live read-only: signed out and foreign Origins still 403, public checkout unchanged. Not verified on live: a signed-in Save (needs the owner's session). Follow-up: /api routes do not forward refreshed session cookies (same as /api/staff/* today) | Owner: New trip → Save once, then cancel that trip |
| Video session local-stack findings 2026-10-03: React hydration error #418 on the booking and confirmation pages (maybe its text mask; unconfirmed); the local seed price book has empty airport-start/city prices, so /api/quote answers partially_priced_class on a fresh seed | 26.2 list |
| Live i18n and layout, from the video session's read-only de/fr/ar recordings 2026-10-03: (1) Arabic desktop home date picker time reads "05 : 15" for 15:05 (check after `cddca625`); (2) /checkout de+fr "Child seat", de "Optional" untranslated; (3) home currency dropdown aria-label "Select" English; (4) Arabic airport suggestions English, chosen From stays "Zurich Airport", "Child seat" and the Stripe line English/mixed; (5) Turnstile "Verify you are human" English everywhere; (6) desktop home: From/To/When values truncate once the flight field appears; (7) desktop travellers panel runs off a 900 px viewport; (8) Arabic "Who" heading "من" reads as "from" | next i18n/layout job |
| A voucher that covers the whole fare makes the charge CHF 0 (or under CHF 0.50); Stripe refuses it, PAY shows an error; no money lost (26.2 audit review) | owner decision |
| `money-events.ts` `settleWithError` still acknowledges every SQL error other than P0002 on refunds and disputes, a deadlock included | 26.2 list |
| The column comment on `settings.vat_rate_bps` says "hundredths of a percent"; the value is tenths (81 = 8.1 %) | 26.2 list |
| The confirmation e-mail never shows the voucher line; it prints the fare already reduced (fare-lines design read, not checked on a real mail) | fare-lines build |
| `apps/web/lib/ops/refund-by-hand.local.test.ts` uses the fixed refund id `re_retry` (passes once per stack); live `booking_edit_request_set_extra_session` differs from its file by line breaks only | 26.2 list |

## Owner checks passed, 2026-09-30 14:27

| What | Result |
|---|---|
| 4242 payment on the current version | Passed. VT-26-0746, 14:24, confirmed, payment succeeded, method card, CHF 35.56, linked to his account, confirmation mail claimed (read on live by the control session) |
| 26.4.2 UAT | He works through it with the 26.4.2 session; what is left is design |
| Dashboard Support read-only | Accepted, with one requirement (next table) |
| Tab title, icon, share preview, language addresses | Approved |

## Owner checks passed, 2026-09-30 16:30

| What | Result |
|---|---|
| Payment through the 26.5 checkout | Passed. VT-26-0747, 16:29, confirmed, payment succeeded by Apple Pay, linked to his account (he was signed in), confirmation mail claimed, one pay press counted. Read on live by the control session. The guest path and "Create an account" have not been paid through yet: no account agreement record exists |
| Class cards in layout E | "All good as I wanted" |
| iPhone: hero, Trustpilot row, menu, scrolling | "All good" |

## Open at the control session's stop, 2026-09-30 16:40 (usage limit)

| What | State |
|---|---|
| Native scrolling | Shipped 23:26 |
| Owner payment after the 16:39 ship | Owed: checkout files changed (intent.ts, return route) |
| Folders to remove after proof | `phase-20` branches shipped (keep folder: refunds by hand is building there), `native-scroll` after its ship, `main-check` (ask the SEO session) |
| 26.2 session | Stopped at its usage limit; P4 part A core built on `gsd/26.2-p4-extras` `d72c934d`, not a hand-over. Findings: pgTAP `seed_idempotent` test 33 fails on main again (wants 2696, seed has 2698); the JSON double encoding also affects `stripe_events.payload` (68 live rows), `booking_edit_requests.payload` (an accepted customer time change would apply nothing) and `rate_version_rules.payload` |
| Live reviews | The 5 published reviews on live carry placeholder text ("One verbatim sentence from a real review sits here"). For the owner |

## Waiting for the owner

| # | What | Where |
|---|---|---|
| 5 | Signatures as they come: phone home pictures, scroll and speed plan, refunds-by-hand plan | the sessions |
| 6 | **Blocks Phase 28.** Two switches in Meta Events Manager (Automatic advanced matching off; Track events automatically without code off): Meta's setup file for pixel 1595596972063765 still showed both on at 09:15 UTC on 2026-10-01. Check that the change was saved, on that pixel | Meta |
| 7 | Older UAT not reported: manage link of VT-26-0743, dashboard New trip, sign-in 14 steps | e-mail, dashboard, phone |
| 8 | The unsigned Lenis folder `.planning/quick/260928-q4t-…` (feeds the scroll and speed plan) | decision |
| 9 | Empty the Trash; `brag-output` and `.pnpm-store` in the main checkout | his click |
| 10 | 26.0 UAT: (1) vamostaxi.site/imprint in French, then Arabic: a notice says the page exists in English and German, English binding; is the French and Arabic wording right? (2) /dev and /dev/home/services answer 404 (checked by control 11:20). (3) The 48 SiteHeader screenshot diffs and the page diffs (about, contact, faq, home sections, legal pages, error pages de/fr): intended change (rebaseline on his Mac) or bug, one decision per page; images in `.planning/phases/26.0-main-green/evidence/`. (4) First run of the GitHub job "Booking funnel e2e on Linux" on `6ec73c52`: failures listed back to control | site, GitHub |
| 11 | **P1 UAT, payment first** (dashboard.vamostaxi.site, test bookings paid with the Stripe test card): Economy to Business, pay the difference from the e-mail with 4242; Withdraw change on a second booking; Business to Economy, Refund due, the refund line on the customer page in four languages, Confirm refund. 11 steps in `.planning/quick/260930-p1-class-change-reprice/HANDOVER.md`. Control reads `booking_payments` and `booking_refunds` after steps 5 and 10 | dashboard, e-mail |

## Owed by the control session

| What | When |
|---|---|
| Check the hand-over of `ci/e2e-linux-3` (must carry a GitHub run link where every e2e job ends inside its limit) | On hand-over, then the owner's Ship |

Done 2026-10-01, between 13:15 and 13:19 by the clock: (1) reminder cron error: the live database log of the last 22 hours holds no "permission denied" line at all (read-only log query; the hourly job ran in that window; the reminder function was replaced on 09-30 by `20261001120000`). Closed. (2) First "Booking funnel e2e on Linux" run on `6ec73c52`: cancelled at its 45-minute limit, no result (run 36829545716). The repository is public, so the minutes cost nothing; board-only commits do not start a run.

## Project chats, 2026-10-01 15:44

The owner created the Claude project and opened seven chats in it. Each works in an app-made folder
under `.claude/worktrees/` on a `claude/*` branch. All are filed in the sidebar group "Vamos Taxi".
Nothing was deleted on GitHub (105 safety tags, 75 branches, read 15:40).

| Chat | Branch | State |
|---|---|---|
| Contact page comments | `claude/project-thread-jbsapo` | **Shipped 15:43** (`c5157913`, Worker `fae3e473`); tip saved as `archive/contact-b8-f7ecc6bf`; its folder `interesting-germain-5cabab` is clean and goes when the chat is archived |
| Finish your account (27.1) | `claude/project-thread-vc27aw` | Building; design signed, plan 01 waits for the owner's signature; migration `20261007170000_account_finish.sql`; stack `vamos-taxi-b5` most likely its own (not confirmed) |
| Build confirmation redesign | `claude/project-thread-wmr715` | Building; design and build plan signed by the owner |
| Design system comparison | `claude/serene-meninsky-fd94c1` | Working, no commit |
| Road to launch; GitHub branch and tag cleanup; Vamos on your Mac | no commits | Idle |

The control session's messages with the hand-over rules to "Finish your account" and "Build confirmation
redesign" are held in those chats until the owner approves them there.

Owner decision 8 done: the `vehicles` table on live is empty (read 15:38). P6 design signed by the owner
at 15:00; the 26.2 session is building it.

## Seen on live, 2026-10-01 14:47

VT-26-0749: a guest booking started 14:04, paying in EUR, reached the Stripe page and was not paid; the
Stripe webhook marked the payment failed at 14:35 and the booking stays pending. The 31-minute gap fits
an abandoned Stripe page that expired; Stripe itself was not read. No other payment, class change,
assignment or refund on live since today's ships; the chauffeur has a class and no plate; the one
`vehicles` row is still there. The 26.2 session waits for the owner's signature on the P6 pictures
(committed 14:44).

## Hand-overs waiting, 2026-10-01 13:37

| # | Job | State |
|---|---|---|
| 1 | Chauffeurs by class | **Live 13:45** (`b0ee0421`, Worker `8889f3c3`); branch and `archive/26.2-chauffeur-car-319519a6` on GitHub. Live: chauffeurs list and the new history path answer 401 without a session; the dashboard screens carry "Plate number", "Choose a chauffeur" and P1's "Withdraw change". Owner UAT: 6 steps in `.planning/quick/261001-chauffeur-car/HANDOVER.md`; step 1 first (his live driver has no class or plate, so Assign lists nobody until he sets them). Owner decision 8: the one `vehicles` row on live (model "sedan", plate 2098890, no photo; no leg, no chauffeur, no seat row points to it, read 2026-10-01) is deleted by the owner in the Supabase SQL editor (control does not hard-delete rows); control reads back |
| 2 | E-mail change fix | **Live 13:42** (`11559467`, Worker `38063b7d`); folder removed; branch and `archive/phase-20-email-change-6abe05d0` on GitHub. Owner UAT: Account, change the e-mail to a second address of yours; one mail in each inbox; old inbox link says to open the other; new inbox link signs in with the new address |
| 3 | GitHub e2e job time limit | **On main 14:19** (`add33513`, no deploy; owner said Ship). Folder `e2e-linux-time` and stack `vamos-taxi-e2e` removed; branch and `archive/e2e-linux-time-8c1d2c68` on GitHub. First run 36848434943 is queued behind the older runs; expected red per spec (about 80 known failures: screenshot drift, stale home specs, the unclassified ones), not a timeout. Control reads it and reports |

Archived on 13:37: local-only branches `fix/26.3-manage-booking`, `fix/26.3-new-trip-save` and the withdrawn Cars page tip as `archive/branch-*` tags on GitHub. Folder `phase-26.2-p1` removed.

## Sessions at 13:19 on 2026-10-01

| Session | Folder | Branch | State |
|---|---|---|---|
| Phase 26.2 audit | `phase-26.2`, `phase-26.2-p1` | `gsd/26.2-chauffeur-car`, `gsd/26.2-p1-class-change` | busy; P1 tip `091e9977` (Withdraw change and the refund line, committed 13:17), no hand-over yet; chauffeur job last commit 11:37, pictures being remade |
| Phase 26.0 main green completion | `e2e-linux-time` | `fix/e2e-linux-time` | busy; measuring the test list per browser project; stack `vamos-taxi-e2e` running |
| Vamos Taxi security phase | `email-change` | `fix/phase-20-email-change` | busy; cut from `b5285d6e`, no commit yet; not ordered by the control session |
| Meta measurement phases 27-29 | `phase-28` | `gsd/phase-28-pixel-pageview` | idle, on hold until Meta shows automatic matching off; hourly check |
| 26.2 gate scripts | `phase-26.2-u13` | `gsd/phase-26.2-u13` | parked, last; 91 behind main |
| 26.5, 26.4.2 completion, SEO | none | shipped | idle; can be closed |

Local database stacks running at 13:19: `vamos-taxi` (default ports, started 13:16, owner session not identified), `vamos-taxi-e2e`, `vamos-taxi-p1`. `twenty-crm` is another product.

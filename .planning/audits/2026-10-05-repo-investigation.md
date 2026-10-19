# Repo investigation — 2026-10-05

Owner (verbatim): "now run an investigation on the repo if there is any security leak, any problem we didnt solve, any missing information; get help from obsidian".

Three read-only investigators (security Opus, unsolved problems Opus, missing information Sonnet), 2026-10-05 ~02:00–11:55 +04; the controller re-checked the top items on live. The Obsidian app was not running, so the vault's generated notes in `Board/` were read as files. Nothing was changed by the investigators.

## Done already (2026-10-05)

| What | Result |
|---|---|
| GitHub repo was public (S1) | Owner chose "Yes, you make it private". Made private 11:58 +04 (`gh repo edit --visibility private`); signed-out page and API now 404. 0 forks, 0 stars, 0 web views in 14 days; 2,495 clones / 585 unique in 14 days (GitHub Actions runners clone on every run; cannot be told apart). No live secret was ever in the history (34,310 objects scanned). |
| Unpaid bookings cannot be deleted (U1) | Confirmed on live: `tg_append_only` carve-out 3 does not cover `account_agreement_records` (FK `on delete set null`). VT-26-0748, 0749, 0751 pending and purge-eligible since 1–2 Oct. Job `fix/purge-agreement-records` running (migration `20261007300000`). |

## Owner answers (question form, 2026-10-05)

| Question | Answer |
|---|---|
| Make the repo private | Yes, controller does it (done) |
| Placeholder reviews on home (M1) | "Keep them until I send real texts" |
| Admin second factor (S2) | "Yes, require it for the admin": owner adds an authenticator (Settings → Security); the gate already requires the code once a verified factor exists |
| Plain HTTP (S3) | "You flip it in Cloudflare": Always Use HTTPS |

## Security

| id | sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| S1 | high | Repo was public | API `private:false` | **Done** (private 11:58) |
| S2 | high | Admin has no second factor | live: 1 active admin, 0 verified factors; `lib/ops/staff-gate.ts:50-54` asks aal2 only when a factor exists | Owner adds authenticator; then consider refusing removal of the last factor |
| S3 | medium | http:// answers 200, no redirect | `http://vamostaxi.site/`, `http://dashboard.vamostaxi.site/login` | Owner: Cloudflare Always Use HTTPS |
| S4 | medium | `vt-auth` cookie not httpOnly; CSP allows unsafe-inline/eval | `lib/supabase/cookies.ts:70-77` | `httpOnly: true` (sign-in change: reviewer) |
| S5 | medium | Sign-up / forgot-password send branded mail to any address, no Turnstile, no per-address limit, typed name in the mail | `app/api/auth/route.ts:612-736`, `email-hook/route.ts:194-197` | Turnstile + per-address limit + no name before confirmation |
| S6 | medium | 8 functions callable by anon, 7 by authenticated through Supabase REST (`quote_rate_book` returns coupon rows incl. code; `evaluate_coupon` unlimited guessing; `record_consent` unthrottled) | Supabase advisors | Move EXECUTE to `vamos_*` roles; check Worker paths first (`vamos_edge` is a member of anon) |
| S7 | low | Staff APIs answer on the public host (401) | `lib/dc-mock-urls.ts:195-208` | 404 unless dashboard host |
| S8 | low | Quote id can cancel a payer's Stripe session | `app/api/checkout/lock-expire/route.ts:35-71` | Require `vt_manage`, rate limit |
| S9 | low | Manage cookie overwritten from a link | `middleware.ts:638-660` | Do not overwrite a valid cookie |
| S10 | low | Internal ids public (review UUIDs, class UUIDs in photo URLs, rate_version id, settings_version_id) | `/api/reviews`, `/api/quote`, `lib/quote/respond.ts:98-99` | Drop or replace |
| S11 | low | No length caps on checkout/review fields; email not checked server side | `lib/checkout/intent-schema.ts:66-72`, `reviews/submit/route.ts:126` | `.max()` + email check |
| S12 | low | DB-backed public reads without rate limit | checkout status/resume, manage GET, pay-link open, lock-expire, reviews GET | Lookup counter |
| S13 | low | `withStaff` = `withAdmin` today; `staff.active` never read | — | Admin writes via `withAdmin`; check active |
| S14 | low | Draft prices reachable on dashboard host without session (not exploitable while row 18 is live) | `lib/quote/engine.ts:183-184` | Draft only with a staff session |
| S15 | low, unverified | Two Pay presses on one quote: loser may get winner's manage token | `lib/checkout/intent.ts:589, 669-686` | Same ownership check |
| S16 | low | 8 Dependabot alerts, dev-only (braces via stylelint; undici 8.x in packages/db); `pnpm audit --prod` 0 | — | Bump undici ≥ 8.10.2, override braces ≥ 3.0.4 |

Checked clean: secrets in history and live pages; Stripe/Resend/Supabase-hook webhook signatures and replay; all 68 staff handlers guarded; no SQL injection, open redirect, SSRF or error text leaks; manage/pay tokens 32 bytes hashed with expiry; RLS on every table; anon read-only on published content; no storage buckets; leaked-password protection on; security headers (HSTS, CSP frame-ancestors, XFO, nosniff, Referrer, Permissions); signed-out cookies HttpOnly/Secure/Lax; Actions without secrets or pull_request_target.

Not checked: Supabase auth settings beyond advisors, direct DB host exposure, Cloudflare WAF/SSL mode, Stripe and Resend dashboards, SPF/DMARC, anything behind sign-in.

## Problems not solved

| id | Problem | Status | Who | Severity |
|---|---|---|---|---|
| U1 | Unpaid booking cannot be deleted; Pay → back → change → Pay suspected refused; hourly purge stuck since 29 Sep | job running | controller | blocks customers (being reproduced) |
| U2 | No chauffeur for Business or Van luxury; VT-26-0753 (15 Oct) and VT-26-0752 (16 Oct) are Business | open | owner | blocks the owner |
| U3 | Refund by hand and class/trip change refuse `sk_live_`; `rk_live_` not handled (`refund.ts:362`, `edit-request.ts:279`, `booking-change.ts:631,968`, `booking-trip-change.ts:278`) | open | owner decides, then controller | blocks the owner at launch |
| U4 | Refund/dispute events: any DB error except not-found filed as permanent (deadlocks too) (`money-events.ts:100-112,176,225`) | open | controller | rare |
| U6 | Checkout signed in as a customer untested since the vt-auth rename | open | owner (one 4242) | not verified |
| U7 | Dashboard shows CHF 000 while loading or on failure | open | design + job | owner |
| U8 | Dead session → blank screen, not /login; `/app/vamos-ops-*.js` outside app/ops; no-store vs ETag; Auth call timeout | open | controller | owner |
| U9 | Toast "Dismiss" English; Arabic "km 240"; board day line English; error toasts close at 3.6 s; three tone calls | open | controller / owner | cosmetic |
| U10 | Class names hard-coded; `first`/`mahaha` read as Economy; sort not price-book order | open | controller | cosmetic |
| U11 | `variant="outline"` used 28× in 11 screens; the design-system button has no such variant (renders unstyled), incl. Settings Discard | open | controller | cosmetic |
| U12 | `first`, `mahaha` classes still exist (mahaha held by retired books 14, 15); old price-band tables (95 rows) never dropped | open | owner decides | cosmetic |
| U13 | 30 of 43 legs: `scheduled_at` 2 h after `scheduled_local` (all past, test bookings) | open, no current impact | goes with test-booking delete | cosmetic |
| U14 | 8 past paid trips still confirmed, no driver (0736, 0737, 0738, 0739, 0742, 0743, 0747, 0750); no completion sweep by design | open | owner | cosmetic |
| U15 | Each paid checkout settles twice (webhook + return page); second never marked processed (11 rows); 26 expired rows 22P02; 75 double-encoded payloads | open | controller | bookkeeping |
| U16 | City waiting: live policy 15 min, /terms and /cancellation say 30 | open | owner (set 30, Publish) | customers |
| U17 | Signed P4 parts B (CHF 0 extra shows "included") and C (count per extra with a maximum) never built | open | controller | missing signed feature |
| U18 | Manage booking "Call dispatch / Cancel instead" card never shows (`manage-booking.dc.html:892`) | open | owner | cosmetic |
| U19 | Voucher covering the whole fare → CHF 0 charge refused by Stripe (none exists today) | open | owner decides | latent |
| U20 | CI red on every push: macOS visual job times out; 8 of 9 e2e shards fail (~9 specs stale); possibly real: /de/terms scrolls sideways at 390 px; voucher funnel at 390 | open | controller | /de/terms may be customer-visible |
| U21 | Unit tests and pgTAP never run for main on GitHub (`pr.yml:69`, `schema.yml:1-6`) | open | controller decides | hidden gap |
| U22 | 31 skipped web tests: 28 DB tests need a local port (money paths manual only); one uses a fixed refund id | open | controller | hidden gap |
| U23 | Production section of `wrangler.jsonc` all placeholders (cutover) | open | owner's word | launch on .eu |
| U24 | Test-booking deletion owed (all 43 are Stripe test mode); would hit U1 too | open | owner | — |
| U25 | "Publish price book row 18" is obsolete: row 18 live since 2026-09-26; row 19 is a draft from 09-27 | obsolete | owner | — |
| U26 | `vat_rate_bps` column notes say hundredths; value is tenths | open | controller | cosmetic |
| U27 | Refund lock order hand-over line 41 wrong | open | controller | docs |
| U28 | Owner UAT not reported: P1 class change, /imprint fr/ar notice, VT-26-0743 manage link, dashboard New trip Save on live, sign-in 14 steps | open | owner | not verified |
| U29 | Housekeeping: `rollback/auth-cookie-rename` still on GitHub; ctl-check 2.4 GB; empty `.claude/worktrees/booking-pages-polish`; 5 stashes (all archived); `brag-output` 301 MB | open | controller / owner | cosmetic |
| U30 | STATE.md stopped 2026-10-01; ROADMAP rows 28/29 say "nothing built"; control board waiting/known tables hold fixed rows | stale | controller | docs |

Obsidian cards with the wrong status: Phase 28 and 29 "In progress" (both live; 29 waits only on the test code); quick 260819-279 and 260819-vjz "Planned" (obsolete; AeroDataBox still missing from the privacy supplier list); waiting cards "Blocks Phase 28", "Signatures: phone home, scroll and speed, refunds by hand", "Unsigned Lenis folder", most of "26.0 UAT" (only /imprint fr/ar wording left), "Empty the Trash" (brag-output left). Missing from the board: U1–U4, U7, U8, U15–U17, U20–U22.

## Missing information

Customers see it:

| id | Missing | Where | Who |
|---|---|---|---|
| M1 | 5 placeholder reviews published as verified, drive the 5.0 chips | home, `/api/reviews` | owner — **kept until real texts (owner answer)** |
| M2 | /about "Image slot — the founder" box with an English brief | `about.dc.html:105` | owner (photo or remove) |
| M3 | City waiting 15 (policy) vs 30 (terms, cancellation) | = U16 | owner |
| M4 | Flight tracking promised (FAQ, cancellation 04, terms 08, home hint) but no provider: `FLIGHT_API_KEY` unset, `/api/flight/*` 503 | `lib/flight/aerodatabox.ts:95` | owner (AeroDataBox or reword) |
| M5 | 11 legal slots hidden (terms 7, privacy 2, cancellation 2); Terms 13 Liability one sentence | legal pages | lawyer or owner |
| M6 | /imprint 09 shows an internal note about agency credit | `imprint.dc.html:231` | owner |
| M7 | /imprint 05, dispute body, 07 hidden until texts exist | /imprint | owner |
| M8 | "Last updated" dates stale (30 Sep / 1 Oct; lines landed 3–4 Oct) | `app/vamos-legal-updated.js:6-8` | controller |
| M9 | Cookie table lists 2 functional items; code stores 7 more keys (pre-consent writes unchecked) | /cookies | owner wording, then job |
| M10 | Privacy: Resend country and log retention not stated | /privacy 04–06 | lawyer |

Owner only: M11 Settings > Company card is a dead control (empty row, nothing reads it; imprint, footer, e-mails hard-code values); M12 Meta test code (+ `PURCHASE_EVENT_SOURCE_URL` at cutover); M13 launch items (live key, cutover); M14 Qurova licence not recorded as bought, TTFs public; M15 D-37 test-booking deletion and old classes; M16 20 `content_strings` still `pending_value`; M17 AuthForm TBC note in an unreachable stage; M18 `settings_versions.label` grows "draft", DB tiers keep a 75 % rung.

Docs: D1 legal checklist and client-input pack are August snapshots; D2 ROADMAP/STATE/Obsidian stale for 28/29; D3 README pre-build, `apps/web/package.json` `deploy` has no `--env staging`; D4 `.dev.vars.example` lists 6 of ~25 env names; D5 runbooks stale (manual assignment, refunds), two runbook folders, no deploy/rollback/live-key/cutover runbook; D6 e-mails README says one template (14 exist), Supabase auth templates English only.

Deliberate, do not "fix": `CHF 000` until the owner flips prices; no TBC pills on customer pages (hidden slots by owner rule 2026-10-03); /coming-soon bare; imprint binding text German; adopted legal and Meta wording; no Sentry; Why Vamos hidden; phone and e-mail consistent everywhere.

Verified clean: `i18n:check` 2709 keys; 12 live pages 0 untranslated in de/fr (ar clean); e-mails 125 keys × 4 languages; SEO on 13 URLs (title, description, canonical, hreflang, og:image), sitemap 36 URLs = robots.

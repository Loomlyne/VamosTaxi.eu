# Hand-over from the retired controller (Claude Code session 1d72bf81, "Vamos Taxi controller")

Claude Code id `1d72bf81-bf8b-4701-a3a1-d3fd79b5acc4`, app id `local_8685dcc2-2474-4a07-9b0c-595e219c8d7b`.
Written 2026-10-11 20:3x (+04) on the owner's retire prompt. This session ships nothing more.
Its last ship was `fix/signup-safety`, 2026-10-05 21:05 (main `63ff0d31`, Worker `246719e4`, migration `20261007330000`).
The board already listed it as retired on 2026-10-09 14:55, when T3 thread `c24bb69d-1096-4631-985c-588cdb7f872f` (Grok) took control.
`CLAUDE.local.md` (owner, 2026-10-11) now says no controller is named and the Grok thread is retired too.
This file is committed as a planning note: no code, no deploy.

All facts below were read live, read-only, between 20:30 and 20:35 (+04) unless a line says otherwise.

## Live now

- **Wrangler login:** `koussayzayeni@gmail.com`, account VamosTaxi `e64b47deef83692806ab23279d53633e` (the account named in `CLAUDE.local.md`).
- **Worker `vamos`** (`--env staging`, vamostaxi.site):
  - Live: `c19ff672-92ca-4aa6-a505-f8fe82f7fd71`, deployed 2026-10-11 19:56:05.
  - Rollback target: `72e71f62-a965-4806-9a9c-69556c5c4d40`, deployed 19:50:41.
  - Earlier the same day: `8adac97a` 19:48, `41ef09eb` 19:42, `39293492` 19:30.
  - The last code commit on main is `25f64c9b` (19:54). Every commit after it is a planning note. That the live build is `25f64c9b` was not proven.
- **Worker `vamos-dashboard`** (`-c wrangler.dashboard.jsonc`, dashboard.vamostaxi.site):
  - Live: `71a307da-754e-4ffe-b1cb-bf4eb19efda6`, deployed 2026-10-01 08:04:29.
  - Rollback target: `58c6e541-72a6-4692-aff9-81b21019c6e7`, deployed 2026-09-30 15:22.
- **Pages:** https://vamostaxi.site returns 200. https://dashboard.vamostaxi.site/login returns 200.
- **Supabase `yaumjzvylngfjhtuffqs`:**
  - The newest applied migration is `20261011145105` `coupon_cap_no_key_update` (file `20261011100000`).
  - `20261007320000` `rest_function_revoke` is **not applied**.
  - None of the ten `20261009*` payment-job migrations is applied.

## Git

- `main` = `origin/main` = `a5ebb8ff` (20:26, phase 30 planning note), before this note's commit.
- 40 commits have landed since this session's last ship `617dc0c7` (2026-10-05 21:07), all by other sessions. The code commits:
  - Destination, business and hero photos (10-07)
  - Booking bar flight number (#68)
  - Dashboard login by e-mail link only (`53bf66f7`)
  - Live publishable key on the staging Worker (#70)
  - Settle closes a canceled intent quietly (`80c173e9`)
  - Stale tests fixed
  - CI minutes saving plus `pnpm gate:local` (`df5c2447`)
  - Coupon race and coupon lock fix (#72)
  - Coupon limit refusal (#73)
  - Tracking fix, quick 261011-qbc
  - VAT-inclusive class cards (#74)
  - Grain overlays removed
  - Turnstile script reuse in consent and contact
  - Language-cookie redirect never cached (`25f64c9b`)

## Branches and worktrees

- **GitHub branches:** `main` only.
- **Worktree `.claude/worktrees/lab-jev`:**
  - Branch `lab/jev-funnel-test` at `5350a410`: 9 behind main, 0 ahead, clean, not on GitHub.
  - Its tip is main's own #74 commit, so nothing in it is unique.
  - Remove it when its session is done.
- **Worktree `.claude/worktrees/phase-30-vehicle-class-lifecycle`:**
  - Branch `phase-30-vehicle-class-lifecycle` at `a5ebb8ff`: 0 behind, 0 ahead, not on GitHub. Only untracked `node_modules` in it.
  - Phase 30 (class Draft/Live/Retired) was planned today. Its session is "Fleet lifecycle discussion".
- **Payment jobs J1–J10 (2026-10-09, T3 Grok era):**
  - They exist only as 10 `archive/pay-j*` tags on GitHub: no branch, no worktree, nothing on main.
  - `archive/pay-j10-drop-test-mode-9d874b9c` holds the whole chain: J1–J9 merged in, plus `origin/main` of 10-09. That is 18 commits over 190 files.
  - It adds 10 migrations, `20261009100000` to `20261009180000`. None is live.
  - It carries `a81a2247` "J10 review: Fable read of the money diff, verdict clear".
  - Not done:
    - merge of the main commits since 10-09, which include #72's coupon lock fix and migration `20261011100000`;
    - a clean-clone check;
    - a different-model review of the merge;
    - his Ship.
  - `decisions/2026-10-11-single-leg-refund-own-subtotal.md` names J7 and J10 as open jobs to land before the single-leg refund job.
  - **Numbering:** all ten files sort before the live `20261011145105` / file `20261011100000`. Landing them needs new numbers after `20261011100000`, or the next controller's decision.
  - **Overlap:** J9 (`db_privilege_hardening`) may overlap the held `20261007320000`. Compare the two before applying either.

## Sessions, threads, agents

- **Background agents started by this session:** none running.
- **Vamos sessions in the app** (read with `list_sessions`). None was running at read time:
  - "Fleet lifecycle discussion", `local_f1a6a4c1-863d-40dd-a248-6d508621d796`, ungrouped. Last active around 20:31. It is the phase 30 owner.
  - "Haiku vs Sonnet for image changes", `local_5dad5a73-fb23-4333-a371-2d12bdfa00cb`, Vamos Taxi group. Last active 2026-10-07.
- **T3 Code threads:** not readable from this session (no T3 tools). The board names thread `c24bb69d-1096-4631-985c-588cdb7f872f` (Grok) as controller from 2026-10-09 14:55. `CLAUDE.local.md` says it is retired.

## Half-done or not in this commit

- **`.planning/prompts/11-coordinator-takes-control.md`:** one uncommitted line. The Jev rule changes from "Hermes-only" to "plugin `typesafe`, advisory, real calls only". Owner session not known; probably the session that rewrote the Jev rules today. Left alone.
- **Nine untracked `.planning/audits/2026-10-09-stripe-*.md`:**
  - The Stripe A-to-Z review: plan, W1–W6, the J1 review, and the summary `stripe-payments-REVIEW.md`.
  - The summary's status line: "findings delivered, awaiting owner signature per finding".
  - Written on 10-09 by the payments review (T3 era). They are the source of J1–J10. Nobody committed them. Left alone.
- **`.planning/phases/30-vehicle-class-lifecycle/.gitkeep`:** untracked, belongs to the Fleet lifecycle session. Left alone.
- **`.planning/STATE.md`:** no diff when this note was committed, so it is not in this commit.
- **`CLAUDE.local.md` live-facts line:** "Next migration number `20261007340000`" is stale. `340000` was never used, and files have reached `20261011100000`. The next number comes after that. Only the controller line was changed by this retirement (step 5); the next controller fixes this one.
- **`CONTROL-BOARD.md`:** "Last update" still reads 2026-10-05 21:07. The ships from 10-07 to 10-11 are not in its landing queue; only its top lines changed. The next controller brings it up to date from `git log`.

## Pull requests and Dependabot

- **Open PRs:** none. #68 to #74 are merged.
- **Open Dependabot alerts** (GitHub gives every one scope "runtime"; this session did not assess them):

| Alert | Severity | Package | Fixed version |
|---|---|---|---|
| #52 | critical | proxy-addr | 2.0.8 |
| #48 | high | braces | none (range ≤ 3.0.3) |
| #53 | high | source-map-js | 1.2.2 |
| #54 | high | sharp | 0.35.5 |
| #51 | medium | postcss-selector-parser | 7.1.6 |
| #49, #50, #55, #56 | medium | next | 15.5.27 |

  The retire prompt calls #48 dev-only. GitHub says runtime, and this session did not verify either.

## Held migration `20261007320000` (REST revoke on eight functions)

- **Condition:** Worker `bca6e755` or a later one has run about a day, and his 4242 payment passes. The board adds one voucher quote and one cookie-banner choice.
- **Worker part:** met. Later Workers have run since 2026-10-05.
- **Payment part:** two succeeded `booking_payments` rows have been created since 2026-10-05 16:29, the latest at 2026-10-09 16:22. Whether these were his 4242 check, with a voucher quote and a cookie choice, was not verified.
- **Rollback after applying:** re-grant to anon, plus authenticated on `record_consent` and `checkout_account_settings`.
- Check the J9 overlap above first.

## His outstanding steps (board, "Waiting for the owner", as of 2026-10-05 18:12; not re-checked)

1. Cloudflare: switch on Always Use HTTPS.
2. Dashboard Settings, Security: add an authenticator. This may be overtaken by "dashboard login: e-mail link only" (10-08).
3. City waiting 30 minutes in dashboard Settings, then Publish.
4. Chauffeurs for Business and Van luxury. This is overtaken by the live classes Economy Sedan / Economy Van / Luxury Van; Business is a test class to be removed.
5. GitHub, Settings, Billing and plans: fix the failed payment or raise the Actions limit.
6. One 4242 payment, one voucher quote and one cookie-banner choice on live. This releases `20261007320000`.
7. Dashboard: sign out and in, save one thing, open the board, the calendar, one booking and Money in.
8. Read /terms 08 and the FAQ "What if my flight is late?" on a phone.
11. /imprint in French, then Arabic: is the wording right?
12. Older UAT: the manage link of VT-26-0743, dashboard New trip, sign-in in 14 steps.
13. P1 UAT, payment first: 11 steps in `quick/260930-p1-class-change-reprice/HANDOVER.md`.
14. Empty the Trash; `brag-output` and `.pnpm-store` in the main checkout.
15. From `fix/signup-safety` (10-05): sign up once with a fresh address, then forgot password once.

Then the stripe review's per-finding signatures (`audits/2026-10-09-stripe-payments-REVIEW.md`).

Launch items, his word only: prices and Publish of price book row 18, deleting test bookings, the live Stripe key, the vamostaxi.eu cutover.

Board rows 15 to 19 are controller jobs, not his steps:
- live-key refusals for `rk_live_`;
- dashboard CHF 000 while loading;
- later dashboard fixes;
- webhook-first settle return row;
- P4 parts B and C.

## GitHub Actions minutes, October 2026

Read with `gh api /users/Loomlyne/settings/billing/usage?year=2026&month=10`:
- VamosTaxi.eu: 7,068 Linux minutes and 1,168 macOS 3-core minutes. The account total is 7,074 Linux minutes.
- Net billed amount: $0.
- The newest usage entry is 2026-10-04, which matches Actions being blocked on billing since 10-04.
- The private-repo allowance is 3,000 minutes a month, and macOS counts 10x.

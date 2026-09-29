# Handoff: continue the Vamos Taxi audit and repair locally

Paste everything below the line into Claude Code on the Mac, started from
`/Users/koss/Developer/VamosTaxi.eu`. Written 2026-09-27 ~18:45 UTC by the cloud session
https://claude.ai/code/session_01HrwcM8EreV3yXiUWfqEa6F.

---

You are continuing work started in a Claude Code **cloud** session on this repo
(Loomlyne/VamosTaxi.eu, product Vamos Taxi, live at https://vamostaxi.site). The owner is
Koss (Koussay Zayani). He moved to this local session to spend his weekly usage instead of
cloud usage. Pick up exactly where the cloud session stopped. Do not redo finished work.

## 0. Before you touch anything

1. Read `CLAUDE.md`, `.claude/CLAUDE.md` and `CLAUDE.local.md` (if present). They are
   binding: the four platform laws (no glow, no tinted yellow, `CHF 000` + `data-tok`
   gaps, four languages in the same pass), the shared `SiteHeader`/`SiteFooter`, Lenis,
   and 1440/1024/768/390 responsive checks.
2. Read `docs/audit/2026-vamos-audit.md` in full, especially §5 (fix plan), §6 (owner
   decisions 1–28) and the "Update 2026-09-27 evening" section at the end.
3. Read `.planning/phases/26.1-payment-pricing-integrity/26.1-CONTEXT.md`. It is the
   discuss record for the payment and pricing phase, refined with the owner's rules
   D-01…D-25 (payments, refunds, pricing formula, cantons CHF 50, classes, admin sign-in).
4. Fetch everything: `git fetch origin --prune`.

### If you need to double-check something

The cloud session stays open at
https://claude.ai/code/session_01HrwcM8EreV3yXiUWfqEa6F. Its full transcript holds every
command, test result and owner answer from today. If anything here is unclear, conflicts
with what you see in the repo, or you need the exact wording of an owner decision:
- first look in the committed files listed in §0 (they carry the decisions verbatim);
- if still unclear, write the exact question for Koss and ask him to paste it into that
  cloud session. It can read its own history and answer. If your tools list that cloud
  session in `ListAgents`, you may `SendMessage` it, but it **cannot reply to you**; its
  answer appears only in its own transcript, which Koss relays.
- Never guess an owner decision. Ask Koss.

## 1. Owner's standing rules (from his profile and today)

- Direct, no filler, no process replay. Numbered UAT steps with expected results.
- GSD gates (discuss, plan, UAT, ship) are signed by Koss. Stop at each gate. Never
  self-approve. `.planning/` exists, so never start a new GSD project.
- **Supabase project `yaumjzvylngfjhtuffqs` has real paid bookings. Never wipe it, never
  write to it from the agent.** Read schema, policies and advisors only. Migrations for
  live are handed to Koss as SQL; he runs them himself in the SQL editor.
- **Stripe:** only the Vamos Taxi sandbox `acct_1UIZmqHcNp9GZYjz` (IDs contain
  `HcNp9GZYjz`). The old account (IDs contain `AJS2YBf21S`) is retired, and its webhook is
  deleted. Always CHF. Never make Stripe changes yourself.
- Never invent rates, fares, amounts or legal copy. Pricing is discussed with Koss first.
- Meta Pixel stays off.
- Secrets stay in Koss's terminal. Report "present / missing / exposed" only. Give him one
  numbered step, then wait. Never type a password or 2FA code.
- Password fields have a right-side show/hide eye.
- Cloudflare, not Vercel. Commit before deploy. Verify the live URL, not just the exit
  code.
- When Koss corrects you, write the rule down (skill, profile line, or `CLAUDE.local.md`)
  before you finish.

## 2. Where things stand (heads at handoff)

| Branch | PR | Head | What it is |
|---|---|---|---|
| `claude/vamos-taxi-audit-nv3crt` | #58 draft | this commit | Audit docs, 100 screenshots, `ui.config.vamos.json`, 26.1 CONTEXT, this handoff, CLAUDE.md phone-line fix. Docs only. |
| `ci/free-actions-minutes` | #59 draft | `ed91f67` | Cuts Actions minutes: `paths-ignore` for docs/planning/md, visual job only when the PR has the `visual` label. |
| `fix/main-green` | #60 draft | `7b22dd6` | Phase 26.0: gets `main`'s CI green. |
| `visual-baselines/main-green` | none | `7b22dd6` + bot commit | Throwaway. The macOS workflow commits regenerated darwin PNGs here for review. |
| `claude/great-ritchie-7cuht2` | #61 draft | `71a943e` | From a **different** cloud session (`session_011AKsvvhgUd9P3KQ8ysfBe8`): inserts a Phase 26.1 "codebase audit, bug fix & simplify" into ROADMAP/REQUIREMENTS/STATE. |
| `main` | — | `f0238bd` | Red CI until #60 merges. |

**Numbering collision:** #61 claims `26.1` for a different phase than this audit's
`26.1-payment-pricing-integrity`. Ask Koss which number each gets (for example audit
payment/pricing = 26.1, #61's cleanup = 26.2) before writing any plan or touching
ROADMAP/STATE.

The GitHub repo is **public** right now (Koss flipped it to escape the private-repo
Actions minute limit). He wants it private again once #60 and #59 are merged.

### What #60 already fixed (all verified locally in the cloud)

- Migration `20260919000001` guards the `rls_auto_enable()` revoke (replay no longer fails).
- `apps/web` `test` script syncs DC mocks into `public/` before vitest.
- 12 stale unit tests updated; `CheckoutClient.tsx` `sendPayLink` no longer fails
  silently (`emailFailed` / `payCouldNotStart` refusals).
- `Reviews.dc.html` uses the kit `Icon` instead of hand-drawn SVG; logical CSS properties
  in `ServiceCard.css`, `Services.css`; `CookieBanner.css` hover uses a token.
- `check-no-invented-numbers.mjs` has a per-file `CHF_ALLOW` list with reasons (owner
  allowed numbers in tests); `check-legal-language-claims.mjs` requires the imprint in all
  four languages (owner decision D-27).
- New migration `20260927180000_ops_refund_record_rappen_cast.sql` (int4 casts in the
  refund record). **Koss already applied this SQL to live and it was verified.**
- pgTAP fixed across 15 files; seed generator is sandbox-safe and handles empty tables;
  `seed.sql` and `database.types.ts` regenerated.
- Module-scope `Set`s replaced with frozen arrays (Workers global-scope fence);
  `db-access-fence-allowlist.json` updated; `test/local` fixtures read the trigger-made
  customers row.
- `.github/workflows/visual-baselines.yml` (regenerates darwin baselines on macOS for a
  pushed `visual-baselines/**` branch); root `test:visual` script syncs mocks first;
  `messages.ts` imports the four JSON dictionaries statically; behaviour specs follow
  shipped changes.
- `34da64a`: staff/MFA tests follow owner rule D-16/D-16a (only the admin signs in; a
  second factor is optional; aal2 required only once a factor is enrolled, which ships in
  26.1).
- `7b22dd6`: the Playwright harness (`apps/web/tests/support/mock-harness.ts`) now shims
  `next/navigation`'s `usePathname` to `/about`. Before, it returned null, `SiteHeader`
  read that as home and forced the overlay variant, so every header baseline was a blank
  transparent bar. With the fix every SiteHeader state passes, including the 1440
  mock-vs-port diff.

Local results in the cloud on `34da64a`/`7b22dd6`: pgTAP 1110/1110, mutation gate passed,
`test/local` 15/15, db-fences/seed/types checks pass, vitest 1631/1631, typecheck, lint
(0 errors), lint:css, check:numbers, legal-claims all pass.

## 3. Your next steps, in order

### Step 1: finish the darwin screenshot baselines for #60 (you are on a Mac: do it locally)

Darwin baselines can be produced right here. No CI run is needed.

```bash
cd /Users/koss/Developer/VamosTaxi.eu
git checkout fix/main-green && git pull origin fix/main-green
pnpm install --frozen-lockfile
pnpm --filter web exec playwright install chromium
pnpm test:visual --update-snapshots=changed
git status --short 'apps/web/tests/**/*-snapshots/*.png'
```

Then **look at every changed PNG** (old from `git show HEAD:<path>`, new on disk) before
committing. Accept only images that match the live design:
- Header: charcoal inverse bar, logo, language, currency, sign in / avatar, yellow
  *BOOK A TRANSFER*. **No phone pill**: it was removed on purpose on 2026-09-20 (#45,
  commit `f6950da`); the phone lives in `ContactFab`. Overlay states are transparent.
- If an image is blank, unstyled, or missing the logo or CTA, it is a harness bug, not a
  new baseline. Investigate; do not commit it.

The cloud also started a macOS CI run (Visual baselines run 3 on
`visual-baselines/main-green`, started 18:34 UTC). If that finished, you may compare its
PNGs with yours instead. Either way, commit only reviewed images to `fix/main-green`.

**Known, real, expected red after that: `SiteFooter default` mock-vs-port at 1440.** The
live footer (the `.dc.html` mock, which is what vamostaxi.site serves) and the React port
`apps/web/components/shell/SiteFooter.tsx` have drifted: the mock has an Explore column,
the small wordmark, the language switch, logo payment marks and social icons, while the
port has a giant wordmark band, 5 columns, text payment chips, and a **visible internal
note** ("Marks awaiting confirmed Stripe provider config — show only enabled methods").
The test is correct. Do not skip or loosen it, and do not update its baseline to hide the
drift. It is fixed in the approved "compile the DC mocks pixel-identical" phase. Also log
that internal note there as a must-fix before the React footer ever ships. Say this once
on #60 as a PR comment.

### Step 2: get #60 green, then merged by Koss

- Check CI on the latest #60 head: `gate` and `schema` should be green; `visual` red only
  for the footer divergence above.
- Never skip, disable or quarantine a test; never push an empty commit to kick CI; never
  force-push `fix/main-green` (merge `main` in if it conflicts).
- Ask Koss to merge #60, then #59 (after #60, `main` is green, so #59's own checks should
  pass). Rebase nothing of his.

### Step 3: repo back to private (Koss does it; you guide)

After #60 and #59 are merged, give him one numbered step:
1. GitHub → Loomlyne/VamosTaxi.eu → Settings → General → Danger Zone → Change repository
   visibility → Private.
Then confirm the next PR's CI still starts (with #59 in, docs-only PRs skip CI and the
macOS job runs only with the `visual` label, so the free private minutes last).

Also clean up the throwaway branch after #60 merges:
`git push origin --delete visual-baselines/main-green`. Keep `visual-baselines.yml`.

### Step 4: Phase 26.1 (payment and pricing integrity): wait for Koss's signature

- Discuss is written and refined (`26.1-CONTEXT.md`). Koss has **not** yet said "discuss
  signed". Do not write plans until he does.
- Resolve the #61 numbering collision with him first (see §2).
- When he signs: write the 26.1 plans from D-01…D-25, add the phase to ROADMAP/STATE as
  an inserted phase before 27, and **stop at the plan gate**.
- Key content (verbatim decisions are in the CONTEXT file; do not re-litigate):
  - Payment always ends confirmed (revives a cancelled or expired booking); every cancel
    or expire expires the Stripe session; refunds use the PaymentIntent ID, never `cs_`;
    DLQ consumer + alert; `charge.refunded` and disputes reach the DB.
  - The sandbox charge CHF 77.80 (`cs_test_a1lyA5…`, Apple Pay) gets its refund recorded
    in `booking_refunds`. Koss wanted the refund process started and payment flows kept
    running.
  - Price per leg = start fare + per-km × km + airport fee (airport pickup or flight
    number entered) + city-to-city (different places, both directions) + enabled
    surcharges; then coupon % (never below CHF 0); then VAT 8.1 % on top. No minimum
    fare, no bands.
  - All 26 cantons; canton → different canton = CHF 50, the same for all classes.
  - Classes: Economy (was Saden), Business (was V-Class), Van luxury. First dropped.
    Hard delete when unreferenced (`mahaha` goes).
  - Pay link locks the booking 24 h; the other payer confirms it; unpaid → auto-cancel; if
    the customer pays first, the link shows "already paid"; a race accepts one, and the
    second charge is refunded automatically.
  - Refunds: > 24 h before pickup = automatic full; < 24 h = admin approves + sets %;
    after the trip = admin accepts or rejects.
  - Only the admin signs in. In account settings: add passkey, add TOTP, or switch
    password ↔ magic link; all must work end to end. Once a factor is enrolled, aal2 is
    required. Changing password or email requires signing in again. Leaked-password
    protection on.
  - Rate book version 18 stays labelled "placeholder, not owner-approved"; Koss reviews
    numbers; the agent never clicks Publish.

### Step 5: later phases (already decided; do not start without Koss)

- Phase B hardening (security findings S1–S15 in the audit).
- Compile the DC mocks into React, pixel-identical (includes SiteFooter drift + internal
  note above).
- Polish: a11y; delete photos 12, 22, 24, 25, 26, 27 and use 9 (fleet-van-street) as the
  replacement; anime.js + Lenis; `/de` `/fr` `/ar` URLs; Trustpilot (most important),
  Google, Tripadvisor reviews; info@ email copy without the private manage link; data
  retention per Swiss rules (10 years for accounting records, other periods for counsel).
- Support stays in the dashboard (no Intercom).

## 4. Local environment notes

- Node 22, pnpm 11.7.0 (`corepack enable` if needed).
- Local Supabase for pgTAP: Docker Desktop running, then from the repo root
  `pnpm db:start && pnpm db:reset && pnpm db:test`, then `pnpm db:seed:check`,
  `pnpm db:types:check`, `pnpm db:local-roles`,
  `pnpm --filter @vamos/db exec vitest run test/local`, `pnpm db:mutation-gate`,
  `pnpm check:db-fences`, `pnpm db:stop`. Local only. Never `db:push` or `db:link` to the
  live project.
- Fast checks before any push (same order as the CI gate job): `pnpm check:public-env`,
  `pnpm typecheck`, `pnpm test:unit`, `pnpm lint:css`, `pnpm lint`, `pnpm i18n:check`,
  `pnpm check:legal-claims`, `pnpm check:numbers`, `pnpm build`.
- Worker `vamos` (site) and `vamos-dashboard` (gateway) on Cloudflare; the Stripe webhook
  secret is set in the Worker by Koss via wrangler (present, verified with a 200 OK
  delivery on 2026-09-27).

## 5. Cloud-side things that may still fire

The cloud session has one-shot check-ins scheduled (`trig_01GDyryPTPJwyiuhKFmffAXE` at
18:56 UTC for PRs #58–#60), and the other cloud session has `trig_01VCTQpGREnbzX3XhBKoHBJZ`
at 19:00 UTC for #61. They use cloud usage. If Koss wants all work local, he can cancel
them from the Routines list in claude.ai, or ask the cloud session to delete them.

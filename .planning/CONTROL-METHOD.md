# Vamos Taxi: the goal and how the work is run

Written by the control session on 2026-10-01, on the owner's request. The general method is the skill
`control-session` (`~/.claude/skills/control-session/SKILL.md`); this page is what is specific to Vamos.
Status lives on `.planning/CONTROL-BOARD.md`, not here.

## The goal

A customer books a fixed-price, one-way, pre-booked transfer on https://vamostaxi.site in under a
minute, pays by card and gets the confirmation; the driver is there. The owner runs the day alone on
https://dashboard.vamostaxi.site. Not Uber: no live GPS, no driver app, no marketplace.

Done means all of this is true on live data, not on paper:

1. **Book and pay.** Home, class choice with real prices, one checkout page, Stripe payment,
   confirmation, e-mails, in English, German, French and Arabic, on phone, tablet and laptop.
2. **Change and cancel.** The customer's booking page and account; class, place and time changes on a
   paid trip with the difference paid or refunded by hand; cancellations with refunds by hand.
3. **Run the day.** Dashboard: bookings, chauffeurs by class with a plate, assign, prices and extras,
   support tickets, reviews, settings, secure sign-in.
4. **Lawful.** Legal pages from the company's own text, consent saved on the server, measurement
   (Meta) only after consent and only when the owner opens the gate.
5. **Safe to operate.** Every gate green in a clean clone, security findings closed, one writer on main,
   a rollback point for every ship.
6. **Launch, on the owner's word only.** Real Stripe key, the public domain, his prices. Until then:
   Stripe sandbox, vamostaxi.site, and no session invents a price, a rate or legal copy.

## Who does what here

**Control rule (owner, 2026-10-01 18:01 +04; replaces the 17:03 take-over line of `95ccece6` and the 17:12 strict rule of `150a2a20`):**
- Vamos runs from plain Claude Code on the owner's Mac. Every job runs locally, never in the cloud.
- One controller session: "VamosTaxi - session control" (`local_633b433a-13a1-4f99-bfe8-3d595717a4a1`), in `/Users/koss/Developer/VamosTaxi.eu` on `main`. Only it commits and pushes main, applies live migrations, deploys Workers and cleans branches.
- Every other session is a job session. It runs GSD with the owner's `CLAUDE.local.md`, has its own app worktree under `.claude/worktrees/` in the main folder (the app makes it when the owner starts the session; `/Users/koss/Developer/vamos-wt` is gone, owner 2026-10-01 about 23:35 +04: "vamos-wt no more") and branch cut from `origin/main`, builds and tests, merges `origin/main` back in, writes a hand-over file for the controller and stops.
- The claude.ai project coordinator and its threads are retired, the "Vamos Taxi controller" thread (`local_f9f33973-…`) included.
- A fresh reviewer session, not the builder, reads every money, sign-in or database change before it ships. Opus plans and reviews; Sonnet builds.
- One session per job. Parallel jobs never share files; each plan lists its exact files. In the shared translation files a job adds only its own keys.
- The owner signs discuss, design and plan.
- Clean GitHub: archive tag, then delete the branch, the worktree and the PR.
- Deploy with `--env staging` (Worker `vamos`, live on vamostaxi.site). A deploy without it made the stray Worker `vamos-web` on 2026-10-01.
- Types with the pinned CLI: `pnpm exec supabase` (2.115.0), then `db:types:check`.
- After any seed change, re-pin `packages/db/supabase/tests/seed_idempotent.test.sql` to the counts in the seed header.
- Next migration number: `20261007210000`. Ask the controller first and check every remote branch for the file name.
- Standing order (owner, 2026-10-01 17:41 +04, verbatim): "coomit and deply all after verify dont ask me". It is never used for the live Stripe key, the vamostaxi.eu cutover, price book row 18 Publish, deleting test bookings, or wiping data. Those need his word every time.

| Session | Model, effort (read 2026-10-01) | Job |
|---|---|---|
| VamosTaxi - session control (local, this folder on `main`; the project thread "Vamos Taxi controller" and the old "Vamos Taxi control session" are retired) | Opus 5.5, xhigh | The only one that commits on main, applies migrations to Supabase `yaumjzvylngfjhtuffqs`, pushes, deploys Worker `vamos` with `--env staging` (and the gateway with an explicit yes) and cleans branches |
| Phase 26.2 audit | Opus 5.5, xhigh | Dashboard and booking changes: class change, chauffeurs by class, place and time change, extras |
| Vamos Taxi security phase | Opus 5.5, medium | Phase 20 security batches, refunds by hand, e-mail change |
| Meta measurement phases 27-29 | Opus 5.5, medium | Consent record (live), pixel page view, purchase event |
| Phase 26.0 main green completion | Sonnet 5.5, medium | Tests, gates, the GitHub test job |
| Sub-agents in any session | Sonnet executors, Opus planners | Signed plans only |

Job sessions live in an app worktree under `/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/` on their own branch with their own
port-shifted local database. The main checkout stays on `main`.

## The rules, where they are written

- `CLAUDE.local.md`, section "One job, one branch, one ship": the 12 binding points.
- `.planning/prompts/00-common-rules.md`: what every work session reads first; job prompts beside it.
- `.planning/decisions/`: every owner decision and approved text, dated, used verbatim.
- `.planning/CONTROL-BOARD.md`: live versions, shipped table, queue, reserved migration numbers, what
  waits for the owner.
- `.planning/PHASE-CLOSURE-2026-09-29.md`: closed phases stay closed.

## One ship, step by step (as done for every ship since 2026-09-29)

1. Hand-over arrives by commit name, main merged in, folder clean.
2. Clean clone of main: merge the branch, `pnpm install --frozen-lockfile`, sync the mocks, then
   typecheck, lint, lint:css, check:numbers, check:legal-claims, check:public-env, check:db-fences,
   i18n:check, db:seed:check, test:unit, build.
3. Migration read in full; live database read-only for the preconditions.
4. Fresh reviewer verdict for any money, sign-in or database change. Then ship under the owner's standing order
   ("coomit and deply all after verify dont ask me"); his own word for the five items it excludes.
5. `backup/main-before-*` and `archive/*` tags pushed. Migration applied verbatim, read back by md5.
6. Squash to one commit on main; staged tree identical to the checked tree; push.
7. Deploy from this Mac with `--env staging`; migration always before the Worker that needs it.
8. Live checks on vamostaxi.site and dashboard.vamostaxi.site; say what is not verified.
9. Board updated and pushed as a planning note. Work folder, stack and build output removed after proof.
10. Owner UAT, numbered; after a checkout change a 4242 payment first, then the payment rows are read.

## Where the sessions are in the app

Sidebar group **Vamos Taxi** in the Code tab: every Vamos session, the four that had been archived
included (restored on 2026-10-01 so they could be filed). The control session stays pinned.

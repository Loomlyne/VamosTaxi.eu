# Rules every Vamos work session follows

You are a job session, not the controller. The controller is the only one that commits on main,
pushes main, applies live migrations and deploys. Since 2026-10-11 20:47 +04 it is the T3 Code thread
`46cc55aa-7644-44df-9954-73863d645414` (since 2026-10-31; `0fbbf0c1-980e-4de3-9345-e3c8fe69811b` is retired). Retired: Claude Code `1d72bf81-…` ("Vamos Taxi controller"),
the T3 Code thread `c24bb69d-…` (Grok), `004ad4f0-…`, `vamostaxi-eu-0b` and "VamosTaxi - session control". A retired controller starts no work. Leave your hand-over file and tell the owner.

**Control rule (owner, 2026-10-01 18:01 +04; replaces the 17:03 take-over line of `95ccece6` and the 17:12 strict rule of `150a2a20`):**
- Vamos runs from plain Claude Code on the owner's Mac. Every job runs locally, never in the cloud.
- One controller session: the T3 Code thread `46cc55aa-7644-44df-9954-73863d645414` (Claude Opus 5.5), since 2026-10-31 (owner's word in that thread), in `/Users/koss/Developer/VamosTaxi.eu` on `main`. Only it commits and pushes main, applies live migrations, deploys Workers and cleans branches. It builds nothing itself: it starts work threads, checks, lands, reads live and keeps the board. Retired: Claude Code `1d72bf81-bf8b-4701-a3a1-d3fd79b5acc4` ("Vamos Taxi controller", `local_8685dcc2-2474-4a07-9b0c-595e219c8d7b`, hand-off `.planning/handoff/2026-10-11-retired-controller-1d72bf81.md`), the T3 Code thread `c24bb69d-1096-4631-985c-588cdb7f872f` (Grok), `004ad4f0-a42f-453d-9991-85113f7d673f`, `vamostaxi-eu-0b` `e1cf20b1-cfca-47f7-8c6e-199fd5cd9a6d` and "VamosTaxi - session control" `local_633b433a-13a1-4f99-bfe8-3d595717a4a1`.
- Every other session is a job session. It runs GSD with the owner's `CLAUDE.local.md`, has its own app worktree under `.claude/worktrees/` in the main folder (the app makes it when the owner starts the session; `/Users/koss/Developer/vamos-wt` is gone, owner 2026-10-01 about 23:35 +04: "vamos-wt no more") and branch cut from `origin/main`, builds and tests, merges `origin/main` back in, writes a hand-over file for the controller and stops.
- The claude.ai project coordinator and its threads are retired, the "Vamos Taxi controller" thread (`local_f9f33973-…`) included.
- A fresh reviewer session, not the builder, reads every money, sign-in or database change before it ships. Opus plans and reviews; Sonnet builds.
- One session per job. Parallel jobs never share files; each plan lists its exact files. In the shared translation files a job adds only its own keys.
- The owner signs discuss, design and plan.
- Clean GitHub: archive tag, then delete the branch, the worktree and the PR.
- Deploy with `--env staging` (Worker `vamos`, live on vamostaxi.site). A deploy without it made the stray Worker `vamos-web` on 2026-10-01.
- Types with the pinned CLI: `pnpm exec supabase` (2.115.0), then `db:types:check`.
- After any seed change, re-pin `packages/db/supabase/tests/seed_idempotent.test.sql` to the counts in the seed header.
- Next migration number: `20261012100000` (owner, 2026-10-11 20:5x +04). Files reach `20261011100000` (live stamp `20261011145105`). Reserved: `20261012100000`–`20261012190000` for the ten J1–J10 payment migrations in their current order; Phase 30 starts at `20261012200000`. `20261007320000` (REST revoke) is on main and not applied. Each job still asks the controller before it takes a number and checks every remote branch for the file name.
- Ship (owner, 2026-10-11 20:47 +04; replaces the standing order "coomit and deply all after verify dont ask me" of 2026-10-01): every Ship is the owner's own answer in the question form. The live Stripe key, the vamostaxi.eu cutover, price book row 18 Publish, deleting test bookings and wiping data need his word every time.

## Read first, in this order
1. `CLAUDE.local.md`, section "One job, one branch, one ship". Binding.
2. `CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/rules/connections.md`, `~/.claude/CLAUDE.md`.
3. The auto memory index and every note it lists.
4. `.planning/CONTROL-BOARD.md`: what is live, what is in work, the order, reserved migration numbers.
5. `.planning/decisions/`: every file. Owner-approved texts are used verbatim.
6. `.planning/PHASE-CLOSURE-2026-09-29.md`.

## Facts on 2026-09-30, verify each
- main = origin/main is on the control board. Live site https://vamostaxi.site and
  https://dashboard.vamostaxi.site, both served by Worker `vamos`. Never vamostaxi.eu.
- The pages customers see for home, about, faq, contact, terms, privacy, cookies, cancellation,
  imprint, sign-in, sign-up, reset-password and manage-booking are the mocks `app/**/*.dc.html`
  with `app/vamos-i18n-dict.js` (`apps/web/middleware.ts`, `DC_PAGES`). `/checkout` and
  `/confirmation` are Next.js pages. Find out which surface a customer sees before you edit.
- The Worker's SQL clients run with `fetch_types: false`; arrays are registered in
  `packages/db/src/pg-types.ts`. The job role `vamos_system` is definer-only: a raw table
  statement inside `asSystem` fails with 42501 on live. Use narrow SECURITY DEFINER functions.
  Database tests run through the Worker's client options.
- Supabase `yaumjzvylngfjhtuffqs` holds real paid bookings. Read-only selects only. Never wipe,
  never `db push`, never change a row, a user or a setting.
- Stripe is the sandbox `acct_1UIZmqHcNp9GZYjz`. No `sk_live_`.
- `SUPABASE_SERVICE_ROLE_KEY` is on the Worker. Never read or print a secret value.

## Your folder
- Work only in your own app worktree under `/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/` on your own branch. Never create a folder outside the main folder.
- Your own local database on shifted ports. Never touch another session's Docker project.
- No push to main, no PR, no deploy. The stash command is forbidden except its list and show forms.
- Add files to git by name. Never add a whole folder.
- Do not edit `.planning/ROADMAP.md`, `.planning/STATE.md` or `.planning/CONTROL-BOARD.md`.
- Ask the control session for a migration number before you write a migration.
- Shared files: `app/vamos-i18n-dict.js`, `apps/web/i18n/messages/*.json`,
  `packages/db/supabase/seed.sql` (generated, never hand-edited). Append, do not reorder.
- Merge origin/main before every hand-over. Main wins a conflict.

## The owner
- He wants speed. One decision per question, through the question form, plain words, the page
  on vamostaxi.site named, one example with a named customer. Never re-ask what a decisions
  file or a SESSION-HANDOFF already answers.
- He signs discuss, design, plan and UAT. A design is signed before code.
- Never invent a price, a rate or legal copy. If legal wording is missing, ask the control
  session for a draft he can approve.
- Four languages in the same pass. Vamos design system only. No glow, no tinted yellow.
  Checked at 1440, 1024, 768 and 390.
- Sonnet for executors, Opus for planning.

## Hand-over
One file: final commit; folder clean; every check with its result on that commit (unit tests,
pgTAP, from-zero replay, typecheck, lint, lint:css, check:numbers, check:legal-claims,
check:public-env, check:db-fences, i18n:check, seed:check, types:check, build); what was NOT
verified, in plain words; new migrations and whether each is safe on real paid bookings; new
settings; numbered owner UAT with expected results, the 4242 payment first when checkout is
touched. Then stop and tell the owner and the control session.

DISK AND LOCAL DATABASES (owner rule, 2026-09-30)
- One local database stack per session. Stop it when the session is idle.
- When your job has shipped, your last step is to tell the control session. It removes your
  folder and your Docker stack the same day, after checking the branch tip is on GitHub. You
  never remove a folder, a branch or a stash yourself.
- Do not run the full test set from several agents at once; agents run the tests they touched,
  the lead runs the full set once.

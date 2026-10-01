# Rules every Vamos work session follows

You are a work session, not the control session. The control session is the only one that
commits on main, pushes main and deploys. It is "Vamos Taxi controller", session id
`local_f9f33973-c2fc-404c-95fe-22b3fb2dd7fa` (since 2026-10-01 17:03 +04); message it with SendMessage.

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
- Work only in your own folder under `/Users/koss/Developer/vamos-wt/` on your own branch.
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

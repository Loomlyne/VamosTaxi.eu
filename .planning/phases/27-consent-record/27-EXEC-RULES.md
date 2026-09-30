# Phase 27 — binding rules for executors

WORKING DIRECTORY: /Users/koss/Developer/vamos-wt/phase-27 (git worktree, branch gsd/phase-27-consent-record). Every command runs there (`cd /Users/koss/Developer/vamos-wt/phase-27 && …`, absolute paths). Never touch /Users/koss/Developer/VamosTaxi.eu or any other worktree.

Read first: your PLAN file (follow it exactly), 27-CONTEXT.md, 27-UI-SPEC.md if your plan touches UI, the sections of 27-RESEARCH.md your plan cites, the SUMMARY files of the plans you depend on, CLAUDE.md, CLAUDE.local.md, and /Users/koss/.claude/projects/-Users-koss-Developer-VamosTaxi-eu/memory/executor-stall-prevention.md and parallel-agents-gate-load.md.

HARD RULES (a breach = stop and report, do not work around):
- Never write to the hosted/live database; no `supabase db push`; no deploy; no push; no PR; do not switch branches; never stash, never hard-reset, never discard changes in files you did not change.
- Local Supabase: only this worktree's own stack via scripts/local-stack-27.sh on port 59322 (5932x). NEVER use or reset ports 54322, 55322, 56322, 57322, 58322, 60322 or another Docker project. Never run `pnpm db:reset` / `pnpm db:types:check` as-is.
- Do NOT edit .planning/STATE.md or .planning/ROADMAP.md. Only write your SUMMARY.
- packages/db/supabase/seed.sql is generated — never hand-edit. Shared files (app/vamos-i18n-dict.js, apps/web/i18n/messages/*.json, app/pages/cookies.dc.html, privacy.dc.html): insert/replace exact lines only, no reordering, no reformatting, no deletions from the dictionary.
- The owner's Meta texts (.planning/decisions/2026-09-30-meta-wording.md) are verbatim: never reword, shorten, translate or add to them. Do not write any legal sentence. If a string you need has no existing translation and is not in the plan, STOP and report.
- Do not read or print secrets. META_LEGAL_GATE_OPEN stays false. No fbevents/pixel, nothing to Meta. Do not change quote/pay/confirmation logic. In test files, Meta pixel needles are built from string parts (lib/meta/legal-gate.test.ts scans test files).
- Design laws: no glow, no --vt-yellow-50..300 surfaces or -600/-700 text, logical properties, four languages, design-system components only.
- Other executors may work in this same worktree on different files. `git add` ONLY the files your task changed (explicit paths, never add-all); if `index.lock` exists wait 5s and retry; never commit another plan's files. A Next server start rewrites apps/web/tsconfig.json and apps/web/next-env.d.ts: restore those two with `git checkout -- <file>` and never commit them.
- Commit per task: `feat(27-NN): …` / `test(27-NN): …`, ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Small reads, tail long output (`| tail -40`). Run only the tests your plan touches, not the whole suite. If a command needs the sandbox off (Docker, port bind), say so in your report instead of skipping a check. Never weaken a test or add test.skip to get green.
- Tests reading apps/web/public/app/** need `node scripts/sync-dc-mock-to-public.mjs` first.
- Known, not yours: visual "SiteFooter default" and RouteSummary x8 are owner-ruled red; SiteHeader 390 diffs are a macOS effect; `locale-follow-26-3.spec.ts:164` is stale since main's SEO ship; pgTAP `extensions.test.sql` test 12 fails on the local stack because role passwords are set.
- If an acceptance criterion cannot be met, stop and return the exact failure.

Done = all tasks, each acceptance criterion checked with its command output, per-task commits, 27-NN-SUMMARY.md written and committed (what was built, commands + results, deviations, not verified). Final message: commit hashes, test results, deviations, blockers.

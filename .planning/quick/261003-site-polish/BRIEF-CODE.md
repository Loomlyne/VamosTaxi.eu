# Coding round — owner signed (DECISIONS.md). Read BRIEF.md + DECISIONS.md + your round2/<job>/proposal.md first.

- Worktree /Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/site-polish only. Do NOT commit, push or deploy; the lead commits.
- Edit only the files your job lists. Several builders edit app/home/home.dc.html AT THE SAME TIME (different regions):
  on that file use ONLY the Edit tool with small exact replacements; never rewrite it whole, never sed -i / python write it,
  never reformat it. If an Edit fails because the file changed, Read again and retry.
- Twins: app/home/X.dc.html ↔ app/pages/X.dc.html stay byte-identical (copy after editing).
- Strings: new visible strings go to .planning/quick/261003-site-polish/i18n/<JOB>.js (lead merges), never into vamos-i18n-dict.js —
  except a job that deletes strings says so in its report (lead deletes).
- Every state built, 1440/1024/768/390, en/de/ar, no sideways scroll at 390, laws (no glow, no tinted yellow, tokens, logical props).
- Playwright chromium 1234 is reinstalled; specs run from apps/web (`pnpm exec playwright test <spec> --project=<...>` — read
  apps/web/playwright.config.ts for project names; run only specs touching your files; update baselines ONLY for intended changes and
  say which). Unit tests: `pnpm exec vitest run <file>` from apps/web. After DC changes run `node scripts/sync-dc-mock-to-public.mjs`
  from the worktree root before specs. Own port for any static server; kill only your own PID.
- Pictures of the built result: screens/CODE-<JOB>-<what>-<lang>-<w>.png (en 1440, ar 390 minimum).
- Report: files changed, tests run with pass/fail counts, baselines updated, strings added/removed, anything not done.

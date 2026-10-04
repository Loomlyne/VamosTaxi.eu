# Round 2 — five owner comments (2026-10-03), PICTURES ONLY

Read BRIEF.md first; every rule there holds. On top of it, this round:

- Owner: "pictures for my signature before code". You do NOT edit any product file (app/**, apps/**, assets/**, design-system/**).
  You may only write under .planning/quick/261003-site-polish/round2/<JOB>/ (sketch HTML, shot scripts, notes) and screens/.
- How to picture a proposal on the real page: sync + serve apps/web/public as in BRIEF.md, then in Playwright inject your proposed
  CSS / DOM into the live mock (page.addStyleTag / page.evaluate), and screenshot. Keep the injected CSS + markup in
  round2/<JOB>/proposal.css / proposal.md so the coder can apply it verbatim after signature. Tokens only (var(--vt-*)), laws hold.
- Widths 1440 / 1024 / 768 / 390, languages en + ar (ar = RTL check). Before (as is) and after (proposal) for each.
  Name: screens/R2-<JOB>-<before|after|optA|optB>-<lang>-<width>.png. Bare crops of the area, no frames.
- If you see two good directions, show A and B; say which you recommend in one sentence.
- Playwright's pinned chromium build may be missing: launch with executablePath pointing at the newest
  ~/Library/Caches/ms-playwright/chromium-*/chrome-mac*/... binary that exists.
- Final report: what is wrong today (one line each), the proposal, the picture list, the exact files the coder will touch,
  and any law or behaviour risk.

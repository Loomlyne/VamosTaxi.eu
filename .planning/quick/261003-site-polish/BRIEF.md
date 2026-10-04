# Quick 261003-site-polish — shared brief for every builder

Owner request (2026-10-03, verbatim intent):
1. A home section that also exists on another page (e.g. FAQ) — the new home design is the primary; use it there; update the design system.
2. Hero taller than the screen on Safari phone — booking bar hidden until scroll. (DONE by lead, commit 47aa8665.)
3. Floating contact circle: animates by itself — sometimes closed (icon only), sometimes icon + text, text changes with what is inside:
   "Call us", "WhatsApp us", "Email us". Over the footer it must change colour (today charcoal on the charcoal footer = invisible).
4. Reviews: real stars of each review platform (Trustpilot green boxes, Google gold stars, Tripadvisor bubbles), not generic icons. Reviews section on other pages too.
5. Business travel section: not a white background; redesign so a visitor stops on it.
6. Every WhatsApp button/icon: the original WhatsApp logo, in its colour, on that button.

## Rules (binding — read /Users/koss/Developer/VamosTaxi.eu/CLAUDE.md + .claude/CLAUDE.md; key points)
- Worktree: /Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/site-polish (branch design/site-polish). Work ONLY there. Never touch the main checkout, never push, never deploy, never commit (the lead commits). Edit ONLY the files your job lists.
- Live home and pages are the `.dc.html` mocks. React twins under apps/web/components reach no customer unless your job says so.
- Twins: app/home/X.dc.html and app/pages/X.dc.html with the same name are byte-identical — edit one, copy to the other.
- Design system laws: no glow, no tinted yellow (no --vt-yellow-50..300 surfaces, no -600/-700 text), tokens only, Lucide via Icon, logical properties, 4 languages.
- Brand-mark exception (owner, 2026-10-03): WhatsApp = assets/social/whatsapp.svg (green #25D366 glyph) and assets/social/whatsapp-white.svg (white glyph for a #25D366 ground). Review platform marks live in assets/reviews/. These are the only non-token colours allowed, and only on that brand's own control.
- Strings: do NOT edit app/vamos-i18n-dict.js. Put every new visible string (en key → de/fr/ar, Swiss German "ss") in
  .planning/quick/261003-site-polish/i18n/<JOB>.js as `module.exports = { "English": { de, fr, ar }, ... }` (patterns as a separate `patterns` array of {re, de, fr, ar} if needed). Lead merges.
- Checking: `node scripts/sync-dc-mock-to-public.mjs`, then serve apps/web/public with `python3 -m http.server <YOUR_PORT>` (run it in the background, remember its PID, kill only that PID at the end; never pkill). Stub `/api/**` in Playwright. Playwright: `import { chromium } from '@playwright/test'` from a script placed in apps/web (deps are there). Reviews fixtures: see apps/web/tests/visual/home-reviews.spec.ts for how the review store is seeded.
- Check 1440 / 768 / 390, en + de + ar (RTL). No sideways scroll at 390. VamosLocale.coverage(root) must be empty after the lead merges strings (you may report the expected list).
- Pictures for the owner's signature: .planning/quick/261003-site-polish/screens/<JOB>-<what>-<lang>-<width>.png. Bare crops, no frames. "before" (git show origin/main version) and "after".
- Run only tests touching your files (find them with grep in apps/web/tests). Do not run full suites.
- Finish with a short report: files changed, pictures written, tests run + result, anything not done.

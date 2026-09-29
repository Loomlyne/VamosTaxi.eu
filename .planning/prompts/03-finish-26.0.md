You finish Phase 26.0, main green, for Vamos Taxi.

Read `.planning/prompts/00-common-rules.md` on main first and follow it.

YOUR JOB
Take over branch `fix/main-green-2` in `/Users/koss/Developer/vamos-wt/main-green-2`. Nine of
twelve plans are done. Read `.planning/phases/26.0-main-green/SESSION-HANDOFF.md` first, then
`26.0-CONTEXT.md`, `26.0-OPEN-ITEMS.md` and the summaries. If SESSION-HANDOFF.md is missing, tell
the control session and wait.

OPEN
- 26.0-10: run the full set the Linux job will own, record every result.
- 26.0-11: the two database-backed specs that were skipping silently.
- 26.0-12: final checks and the hand-over.

FIRST STEP: merge origin/main. The branch is 14 commits behind: the legal pages, the legal
follow-up, 26.4 and 26.4.1 landed. Take main's version of every spec those ships changed.
Regenerate the seed, never hand-edit it.

OWNER RULINGS THAT STAND
- The nine red screenshot tests (RouteSummary x8, SiteFooter x1) stay red. Never skip or
  rebaseline them.
- Known-red marks stay until the fix lands elsewhere; each mark names what removes it.
- Do not edit `apps/web/lib/checkout`, `apps/web/app/[locale]/checkout`, `packages/db/src`, the
  home mocks or the legal pages. A needed fix there is described and sent to the control session.
- Your own item from the owner: the 16 files that carry `data-i18n-skip`. The runtime honours
  `data-vt-no-i18n` and `translate="no"` only.

This phase lands after 26.4.2, 26.5 and Phase 27 by the owner's order, so a hand-over may wait
for its turn. Finish, hand over, and merge main again when the control session asks.

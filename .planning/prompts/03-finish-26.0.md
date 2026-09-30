You finish Phase 26.0, main green, for Vamos Taxi.

Read `.planning/prompts/00-common-rules.md` on main first and follow it.

YOUR JOB
Take over branch `fix/main-green-2` in `/Users/koss/Developer/vamos-wt/main-green-2`. Nine of
twelve plans are done. Read `.planning/phases/26.0-main-green/SESSION-HANDOFF.md` first, then
`26.0-CONTEXT.md`, `26.0-OPEN-ITEMS.md` and the summaries.

FIRST STEP: `pnpm install` (the folder was slimmed on 2026-09-30), then merge origin/main. The
branch is far behind (about 66 commits on 2026-09-30 evening): 26.4.2, 26.5, Phase 20 batches A,
B1 and 20-12, SEO with one address per language, phone home, class cards, site speed A, native
scrolling (Lenis removed everywhere), 26.2 hand-overs 1 and 2. Take main's version of every
test those ships changed. Regenerate the seed, never hand-edit it.

OPEN
- 26.0-10: run the full set the Linux job will own, record every result.
- 26.0-11: the two database-backed specs that were skipping silently.
- 26.0-12: final checks and the hand-over.

STALE TESTS ON MAIN, YOURS (each known-red, fix or replace, never skip without a note)
- `tests/integration/locale-follow-26-3.spec.ts:164` expects `/de/about` to redirect; since the SEO
  ship it is a real page. `tests/integration/ssr-locale.spec.ts` compares old mock titles.
- `tests/visual/legal-privacy-cookies.spec.ts` "rtl and English data-tok" expects 17 pills; the
  legal ship removed them.
- checkout-page spec "Edit trip: fields in home order": stale since 26.4.2 (Flight, From, To).
- `lib/ops/bookings-write.test.ts` times out at the 5 s default under load (cold import 4 to 6 s).
- `checkout-pay-19.spec.ts` now mocks `/api/quote/reprice`; its `test.fail` on the flight-edit
  case can go.
- Anything that waits for Lenis, `__vtLenis` or `--vt-scroll`: native scrolling since 2026-09-30
  23:26; `assets/lenis*` no longer exist.
- `seed_idempotent.test.sql` pins content-string counts by hand and goes red after every
  dictionary append; read the counts from the seed header instead.
- The 16 files that carry `data-i18n-skip`: the runtime honours `data-vt-no-i18n` and
  `translate="no"` only.

OWNER RULINGS THAT STAND
- The nine red screenshot tests (RouteSummary x8, SiteFooter x1) stay red. Never skip or
  rebaseline them.
- Known-red marks stay until the fix lands elsewhere; each mark names what removes it.
- Do not edit `apps/web/lib/checkout`, `apps/web/app/[locale]/checkout`, `packages/db/src`, the
  home mocks or the legal pages. A needed fix there is described and sent to the control session.

HOW TO WORK
- After any spec that starts `next dev`: remove `apps/web/.next-*` and restore
  `apps/web/tsconfig.json` and `apps/web/next-env.d.ts`; the gate scripts skip `.next-*` since
  `af0099bb`, but the folders still cost disk.
- Agents run only the tests they touched; you run the full set once, as lead. One local database
  stack, stopped when idle.
- Hand over by commit name; the control session checks in a clean clone; every ship needs the
  owner's Ship. Report to the control session when you start and when you hand over.

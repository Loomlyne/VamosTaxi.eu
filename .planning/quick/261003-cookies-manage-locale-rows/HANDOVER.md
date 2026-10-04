# Hand-over: vt_manage and NEXT_LOCALE rows on /cookies

Branch `fix/cookies-manage-locale-rows` (cut from origin/main fddfae18). Job session, no main commit, no deploy, no live DB.

## What changed
- `app/pages/cookies.dc.html` (the live page): two rows in Strictly necessary after `vamos_qs`: `vt_manage` (30 days) and `NEXT_LOCALE` (1 year), owner wording verbatim.
- `app/vamos-i18n-dict.js`: the two purposes (de/fr/ar) and `30 days` (30 Tage / 30 jours / 30 يومًا; the plain unit, not part of the approved text). `1 year` and `Vamos Taxi` already existed.
- React twin `apps/web/app/[locale]/cookies/page.tsx` (reaches no customer): NEXT_LOCALE shows the approved purpose and `1 year` (was a pending slot); `vt_manage` row added. Messages: `cookies.language-cookie-purpose` text replaced, new `cookies.locale-cookie-duration`, `cookies.manage-cookie-purpose`, `cookies.manage-cookie-duration` (both durations in `noParamKeys`).
- `packages/db/supabase/seed.sql` regenerated (2710 keys, 100 no-param-reason); `seed_idempotent.test.sql` re-pinned to 2710 / 100.
- Decision record `.planning/decisions/2026-10-03-cookies-manage-locale-rows.md`.

## Checks
- Passed: `pnpm i18n:check`, `pnpm check:legal-claims`, `pnpm db:seed:check`, `tsc --noEmit` (apps/web), eslint on the twin page.
- Passed: mock /cookies in a browser (Chromium on a static server of apps/web/public, own port 4817, stopped) at 390 and 1440 in en, de, fr, ar: both rows visible with the approved wording, `VamosLocale.coverage` of the table = 0, Arabic `dir=rtl`, no sideways scroll. Screenshots and `results-*.txt` in `evidence/`; script in `tools/cookies-rows-check.mjs`. One first run of de at 1440 failed on a load race (translation not yet applied); the rerun passed.
- Not run: the pgTAP seed test against a database (pin only edited), full unit suite, test lab, live site.

## Rollback
`git revert` the feat commit. No migration, no live data touched.

## Owner UAT
1. Open https://vamostaxi.site/cookies after the ship, English. Expected: in Strictly necessary, after `vamos_qs`, rows `vt_manage` (30 days) and `NEXT_LOCALE` (1 year) with the approved sentences.
2. Switch to Arabic. Expected: same two rows in Arabic, page right-to-left.

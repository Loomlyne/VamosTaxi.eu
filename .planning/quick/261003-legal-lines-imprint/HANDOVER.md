# Hand-over — legal lines + imprint empty sections (quick 261003-legal-lines-imprint)

Branch `fix/legal-lines-imprint`, cut from `origin/main` 18be38cb, origin/main merged in again before push.
Job session (not control). No deploy, no live database, no migration, no setting.
First written 2026-10-03 02:45 +04; imprint part redone 02:50 +04 after the owner's corrected U07-2 answer
("Hide those sections (Recommended)", `.planning/decisions/2026-10-03-audit-owner-answers.md`, main 46887db0).

## What changed

### Part 1 — owner-approved legal translations (U08-11, U08-15)

Source: `.planning/decisions/2026-10-03-legal-translations-approved.md` and
`.planning/quick/261003-legal-translations/DRAFTS.md`. The de/fr/ar cells were lifted from DRAFTS.md by
script (`evidence/scripts/build-entries.mjs`), not retyped. Output: `evidence/new-entries.js.txt`.

1. `app/vamos-i18n-dict.js`: 19 new entries in one block at the end of `strings` (comment "26.2 audit
   U08-11 legal lines"), plus C6 in place of the old line. Rows T1–T3, P1–P10, C1–C5 (C5 = P6, one entry),
   X1, C6. No new key already existed; no new de/fr/ar text equals another entry's translation
   (checked by the build script).
2. Two rows are keyed around a value, as the drafter asked ("register number and the figure 10 sit inside
   `vt-dir-keep`"). The words are the approved words, only the value sits in its own span:
   - /terms 01 (T1): `Registered as Vamos Taxi GmbH, company number` + `<span class="vt-dir-keep" data-vt-no-i18n="1">CH-020.4.077.792-7</span>`
     + `at the commercial register of the Canton of Zurich. Full company details are on the` + the existing `imprint` link entry.
   - /privacy 06 (P8): `<span class="vt-dir-keep" data-vt-no-i18n="1">10</span>` + `years (Swiss books) for accounting and tax.`
3. X1: /cancellation 05 English is now "…you receive a full refund." (page and key), with the approved de/fr/ar.
4. C6: /cookies 04 `vamosLang` purpose is now "Remembers which language you read the site in" with the approved
   de/fr/ar. The old "English or German" entry was removed from the mock dictionary: nothing else in the
   mocks used it. (The Next.js `apps/web/i18n/messages/en.json`, `key-map.json` and the local `seed.sql`
   still carry the old line; they reach no customer and no gate reads them for this. Not changed.)
5. The 14 provider and cookie names the drafter listed now carry `data-vt-no-i18n="1"` (what they show is
   unchanged): privacy `Stripe Payments Europe Ltd`, `Supabase`, `Cloudflare`, `Mapbox`, `Sentry`;
   cookies `sb-yaumjzvylngfjhtuffqs-auth-token`, `Vamos Taxi · Supabase`, `__stripe_mid · __stripe_sid`,
   `Stripe`, `cf_clearance`, `Cloudflare`, `vamosLang`, `vamos:recent-places`, `Sentry`.
6. Beyond the drafter's list: the imprint had 6 names and codes counted as gaps (`GmbH`,
   `CH-020.4.077.792-7`, `vamostaxi.site`, `Ben Othman Houssein`, `Vamos Taxi / Loomlyne`, `Loomlyne`). They
   now carry `data-vt-no-i18n`; the register number and the domain also get `vt-dir-keep`, the way the VAT
   number row already does. What they show is unchanged.
7. Next.js legal pages (`apps/web/app/[locale]/{terms,privacy,cookies,cancellation,imprint}/page.tsx`): checked
   only. They hold the older text, none of the 19 edited lines; the imprint twin still has the "Client
   input" notes. They reach no customer and the i18n gate passes; not changed.

### Part 2 — /imprint: sections without real text are not rendered (U07-2, owner "Hide those sections")

`app/pages/imprint.dc.html`:
- Section 05 "Supervisory authority and licence" (`#aufsicht`) and section 07 "Disclaimer" (`#haftung`) are
  removed from the page, with their two entries in the "On this page" side menu.
- Section 06 "Dispute resolution" keeps only its existing complaints line ("We take complaints directly; the
  route is in the terms."); there is no dispute-resolution-body line.
- No TBC pill anywhere on the page.
- The internal "Client input" notes are removed from the markup, not just hidden: they had no other use
  (hidden by `[data-slot]{display:none!important}` since ae9165bf; the only reader was the `showSlotNotes`
  review prop). With them went the `[data-slot]` CSS, the `showSlotNotes` prop and the `slotNotes` value.
  The old text stays in git (e.g. `git show 18be38cb:app/pages/imprint.dc.html`, lines 220–249) for when
  the owner gives the real values.
- Numbering: the numbers are written by hand in each heading and side-menu entry (not generated), so they
  are kept as they were. The page now reads 01, 02, 03, 04, 06, 08, 09.
- The page-local `[data-tok]` styling (built from `--vt-yellow-50/300/700`) and its print override are
  removed: nothing on the page uses `data-tok` now.
- Note: the hidden "Client legal text" note in `terms.dc.html` §12 still links to `imprint.dc.html#dispute`;
  that anchor still exists. Not changed.

### Tests changed

- `apps/web/lib/live-no-tbc.test.ts`: identical to main (the earlier imprint exception is reverted). No live
  page may show a TBC pill, /imprint included.
- `apps/web/tests/visual/legal-cancellation-imprint.spec.ts` ("rtl and English data-tok"): the imprint
  expects zero pills (as before), plus: `#aufsicht` and `#haftung` do not exist, and no `main section[id]`
  is a bare heading. Not run here (needs a Worker build).

## Files

- `app/vamos-i18n-dict.js`
- `app/pages/terms.dc.html`, `privacy.dc.html`, `cookies.dc.html`, `cancellation.dc.html`, `imprint.dc.html`
- `apps/web/tests/visual/legal-cancellation-imprint.spec.ts`
- `.planning/quick/261003-legal-lines-imprint/` (this file, `evidence/`)

## Checks (re-run after the imprint change)

| Check | Result |
|---|---|
| `pnpm i18n:check` | pass (`evidence/gate-i18n:check.txt`) |
| `pnpm check:legal-claims` | pass, all 3 checks |
| `pnpm check:numbers` | ok |
| `pnpm lint` | exit 0; 6 warnings, all in files this job did not touch |
| `pnpm typecheck` | pass |
| Targeted unit tests (13 files: live-no-tbc, legal-updated, legal-text-hygiene, arabic-design-g23, consent/legal-pages-27, consent/owner-texts, consent/mock-banner, legal/refund-texts-20-10, legal/privacy-account-paragraph, legal/extract-no-invent, contact-source, unit/locale-pattern-switch, checkout/manage-pages-i18n) | 213 / 213 pass |
| Full `pnpm test:unit` (once, before the imprint change; not re-run, per the one-run limit) | pass: web 4246 passed / 31 skipped, emails 239, db 14 |
| Chromium, synced public mocks on a static server (port 4871, stopped after), `VamosLocale.coverage(document.body)` per page in de/fr/ar | see table below |
| /imprint probe in en/de/fr/ar (`evidence/imprint-probe-after.txt`) | sections register, kontakt, vertretung, mwst, dispute, urheberrecht, credits; side menu 01 02 03 04 06 08 09; 0 pills; 0 bare sections |
| Sideways scroll at 390 px (ar and de, all five pages) | none: scrollWidth = clientWidth = 390 |
| Screenshots: 390 px Arabic + 1440 px German of each changed section (terms 01/04/11, privacy 04/06, cookies 03/04, cancellation 05, imprint 04–08) | `evidence/screens/` (18 files), looked at; imprint pair replaced |

### Coverage, untranslated strings per page (same count in de, fr and ar)

| Page | Before | After |
|---|---|---|
| /terms | 3 | 0 |
| /privacy | 15 | 0 |
| /cookies | 14 | 0 |
| /cancellation | 1 | 0 |
| /imprint | 6 | 0 |

Before and after lists: `evidence/coverage-summary.txt` (full JSON in `coverage-before.json`,
`coverage-after.json`). Nothing English is left on these pages in de/fr/ar except names and codes marked as such.

## Not verified

- Not run on the local Worker build or on vamostaxi.site; only the synced public mocks on a static server.
- Full `pnpm test:unit` not re-run after the imprint rework (one run allowed; the targeted 13 files were re-run).
- Visual pixel baselines (`apps/web/tests/visual/legal-*.spec.ts-snapshots`, darwin and Linux) for terms,
  privacy, cookies, cancellation and imprint were not run or re-captured. The text changed in de/fr/ar and
  the imprint lost two sections, so these baselines will differ and need a re-capture by the controller.
- Integration/e2e and pgTAP suites not run (nothing here touches the database or an API).
- No native speaker read the Arabic, French or German in place; the texts are the owner-approved drafts verbatim.
- Observation, not changed: in Arabic at 390 px the register number on /terms 01 breaks after "CH-" at the
  line end (reading order is right; `vt-dir-keep` in laws.css has no `nowrap`).
- Observation, not changed: `imprint.dc.html` still has `[data-lg-prose] a:hover{color:var(--vt-yellow-700)}`
  (Law 02 token; laws.css maps it to charcoal, so it renders charcoal).

## Owner UAT on vamostaxi.site (after the controller ships)

1. Open https://vamostaxi.site/de/terms, scroll to 01. Expected: "Eingetragen als Vamos Taxi GmbH, Firmennummer CH-020.4.077.792-7 im Handelsregister des Kantons Zürich. Alle Angaben zum Unternehmen stehen im Impressum."
2. Same page, 11 Payment. Expected: "Akzeptierte Zahlungsmittel: Visa, Mastercard, Apple Pay, Google Pay und TWINT."
3. Open https://vamostaxi.site/fr/privacy, section 01. Expected: data protection officer row "aucun délégué désigné"; EU representative row "aucun désigné".
4. Open https://vamostaxi.site/ar/privacy, section 06, Payment records row. Expected: "10 سنوات (الدفاتر التجارية السويسرية) للمحاسبة والضرائب." with 10 on the right.
5. Open https://vamostaxi.site/de/cookies, section 04. Expected: vamosLang row reads "Merkt sich, in welcher Sprache Sie die Website lesen" and "bis Sie die Sprache ändern".
6. Open https://vamostaxi.site/cancellation (English), section 05. Expected: "…no vehicle came, you receive a full refund."
7. Open https://vamostaxi.site/ar/cancellation, section 05. Expected: "إذا أظهرت سجلاتنا أنك كنت في نقطة الانطلاق ولم تصل أي سيارة، تحصل على استرداد كامل للمبلغ."
8. Open https://vamostaxi.site/imprint. Expected: the side menu lists 01, 02, 03, 04, 06, 08, 09; there is no "Supervisory authority and licence" and no "Disclaimer" section; 06 "Dispute resolution" shows only "We take complaints directly; the route is in the terms."; no TBC anywhere.
9. Open https://vamostaxi.site/ar/imprint. Expected: the same sections in Arabic, no empty heading, no English text except names (Vamos Taxi GmbH, Loomlyne, Ben Othman Houssein) and codes.

## For the controller

- Review: legal copy and one page's structure only; no money, sign-in or database code.
- After merge: re-capture the legal visual baselines; the "rtl and English data-tok" spec now also checks
  that the imprint has no section 05/07 and no bare section.

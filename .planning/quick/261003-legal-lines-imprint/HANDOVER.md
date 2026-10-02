# Hand-over — legal lines + imprint gaps (quick 261003-legal-lines-imprint)

Branch `fix/legal-lines-imprint`, cut from `origin/main` 18be38cb, origin/main merged in again before push.
Job session (not control). No deploy, no live database, no migration, no setting.
Written 2026-10-03 about 02:45 +04.

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

### Part 2 — /imprint internal notes become labelled gaps (U07-2, owner "Labelled TBC gaps")

`app/pages/imprint.dc.html`:
- The three "Client input" blocks (05 licence, 06 dispute body, 07 content and links) are replaced by
  `data-tok` pills, markup copied from the earlier legal pills
  (`<span data-vt-no-i18n="1" data-tok="1" title="Awaiting a confirmed value from Vamos Taxi">…</span>`):
  - 05 Supervisory authority and licence: `licensing authority` TBC, `licence number` TBC
  - 06 Dispute resolution: `dispute resolution body` TBC (under the existing complaints line)
  - 07 Disclaimer: `content and links disclaimer` TBC
  Labels stay English in every language (ADR-011). No value, body name or number invented.
- Removed the now-dead slot machinery: `[data-slot]` CSS, the `showSlotNotes` prop and `slotNotes` value.
- Removed the page-local `[data-tok]` CSS, which was built from `--vt-yellow-50/300/700` (Law 02 tokens).
  The pills now use the system rule in `design-system/tokens/laws.css` (grey dashed hairline, TBC tag).

Finding on U07-2: on the served mock the "Client input" blocks were already hidden
(`[data-slot]{display:none!important}` since ae9165bf). Customers did not see the notes; they saw
sections 05 and 07 as bare headings. Probe before/after: `evidence/imprint-probe-before.txt`,
`evidence/imprint-probe-after.txt`. The audit's "visible" was wrong; the owner's fix still applies and now
fills the two empty sections.

### Tests changed

- `apps/web/lib/live-no-tbc.test.ts`: the owner's 2026-09-30 rule "no TBC on any page a customer can see"
  conflicts with his 2026-10-03 U07-2 answer. The newer, narrower answer wins: the four imprint pills are
  allowed by file and exact label; any other pill on any live mock still fails. A new test pins the imprint
  to exactly those four pills and no `data-slot` / "Client input".
- `apps/web/tests/visual/legal-cancellation-imprint.spec.ts` ("rtl and English data-tok"): the imprint now
  expects the four English labels, identical in en/de/fr/ar (was: zero pills). Not run here (needs a Worker build).

## Files

- `app/vamos-i18n-dict.js`
- `app/pages/terms.dc.html`, `privacy.dc.html`, `cookies.dc.html`, `cancellation.dc.html`, `imprint.dc.html`
- `apps/web/lib/live-no-tbc.test.ts`
- `apps/web/tests/visual/legal-cancellation-imprint.spec.ts`
- `.planning/quick/261003-legal-lines-imprint/` (this file, `evidence/`)

## Checks

| Check | Result |
|---|---|
| `pnpm i18n:check` | pass (`evidence/gate-i18n:check.txt`) |
| `pnpm check:legal-claims` | pass, all 3 checks |
| `pnpm check:numbers` | ok |
| `pnpm lint` | exit 0; 6 warnings, all in files this job did not touch |
| `pnpm typecheck` | pass |
| Targeted unit tests (13 files: live-no-tbc, legal-updated, legal-text-hygiene, arabic-design-g23, consent/legal-pages-27, consent/owner-texts, consent/mock-banner, legal/refund-texts-20-10, legal/privacy-account-paragraph, legal/extract-no-invent, contact-source, unit/locale-pattern-switch, checkout/manage-pages-i18n) | 214 / 214 pass |
| Full `pnpm test:unit` (once) | pass: web 4246 passed / 31 skipped (395 files + 16 skipped), emails 239, db 14 |
| Chromium, synced public mocks on a static server (port 4871, stopped after), `VamosLocale.coverage(document.body)` per page in de/fr/ar | see table below |
| Sideways scroll at 390 px (ar and de, all five pages) | none: scrollWidth = clientWidth = 390 |
| Screenshots: 390 px Arabic + 1440 px German of each changed section (terms 01/04/11, privacy 04/06, cookies 03/04, cancellation 05, imprint 05–07) | `evidence/screens/` (18 files), looked at |

### Coverage, untranslated strings per page (same count in de, fr and ar)

| Page | Before | After |
|---|---|---|
| /terms | 3 | 0 |
| /privacy | 15 | 0 |
| /cookies | 14 | 0 |
| /cancellation | 1 | 0 |
| /imprint | 6 | 0 |

Before and after lists: `evidence/coverage-summary.txt` (full JSON in `coverage-before.json`,
`coverage-after.json`). The only English left on purpose is the four imprint `data-tok` labels, which the
runtime does not count (they carry `data-vt-no-i18n`).

## Not verified

- Not run on the local Worker build or on vamostaxi.site; only the synced public mocks on a static server.
- Visual pixel baselines (`apps/web/tests/visual/legal-*.spec.ts-snapshots`, darwin and Linux) for terms,
  privacy, cookies, cancellation and imprint were not run or re-captured. The text changed in de/fr/ar and
  the imprint gained pills, so these baselines will differ and need a re-capture by the controller.
- Integration/e2e and pgTAP suites not run (nothing here touches the database or an API).
- No native speaker read the Arabic, French or German in place; the texts are the owner-approved drafts verbatim.
- Observation, not changed: in Arabic at 390 px the register number on /terms 01 breaks after "CH-" at the
  line end (reading order is right; `vt-dir-keep` in laws.css has no `nowrap`).
- Observation, not changed: `imprint.dc.html` still has `[data-lg-prose] a:hover{color:var(--vt-yellow-700)}`
  (Law 02 token; laws.css maps it to charcoal, so it renders charcoal).

## Owner UAT on vamostaxi.site (after the controller ships)

1. Open https://vamostaxi.site/de/terms, scroll to 01. Expected: "Eingetragen als Vamos Taxi GmbH, Firmennummer CH-020.4.077.792-7 im Handelsregister des Kantons Zürich. Alle Angaben zum Unternehmen stehen im Impressum."
2. Same page, 11 Payment. Expected: "Akzeptierte Zahlungsmittel: Visa, Mastercard, Apple Pay, Google Pay und TWINT."
3. Open https://vamostaxi.site/fr/privacy, section 01. Expected: Délégué à la protection des données "aucun délégué désigné"; Représentant… "aucun désigné".
4. Open https://vamostaxi.site/ar/privacy, section 06, Payment records row. Expected: "10 سنوات (الدفاتر التجارية السويسرية) للمحاسبة والضرائب." with 10 on the right.
5. Open https://vamostaxi.site/de/cookies, section 04. Expected: vamosLang row reads "Merkt sich, in welcher Sprache Sie die Website lesen" and "bis Sie die Sprache ändern".
6. Open https://vamostaxi.site/cancellation (English), section 05. Expected: "…no vehicle came, you receive a full refund."
7. Open https://vamostaxi.site/ar/cancellation, section 05. Expected: "إذا أظهرت سجلاتنا أنك كنت في نقطة الانطلاق ولم تصل أي سيارة، تحصل على استرداد كامل للمبلغ."
8. Open https://vamostaxi.site/imprint, sections 05, 06, 07. Expected: grey dashed pills "licensing authority TBC", "licence number TBC" under 05; "dispute resolution body TBC" under 06; "content and links disclaimer TBC" under 07. No "Client input" text anywhere.
9. Open https://vamostaxi.site/ar/imprint, same sections. Expected: the same four English pills, right-aligned under Arabic headings.

## For the controller

- Review: legal copy only, no money, sign-in or database code. The test change in `live-no-tbc.test.ts`
  relaxes a rule for four exact labels on one page; please confirm that reading of the two owner answers.
- After merge: re-capture the legal visual baselines; the "rtl and English data-tok" spec now expects four imprint pills.

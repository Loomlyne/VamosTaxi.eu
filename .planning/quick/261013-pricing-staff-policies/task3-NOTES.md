# Quick 261013 · Task 3 notes (dashboard UI)

Commit: `e6f50220` on `fix/pricing-staff-policies` (parent `c528887a`). Not pushed. No database stack, no lab, no live data.

## Files changed

- `app/ops/OpsPricing.dc.html`
  - Distance rules pane: the signed `lockField` markup (render-bands.mjs) right after the pane opening, above the class
    table. Changes from the signed markup, all as briefed: Save `variant="{{ lockSaveVariant }}" disabled="{{ lockSaveOff }}"`;
    kit Input `error="{{ lockErrorText }}"`; `data-err` on the wrapper; one `data-lock-ok` line (`role="status"`, `--vt-success`)
    under the hint, shown only after a 200.
  - Helmet CSS: `[data-lock-save]` joins the existing `[data-vat-save]` disabled/hover/press rules; the kit's
    `.vt-field__err` is placed in the hint's slot (`position:absolute; inset-block-start; inset-inline`) and the hint gets
    `visibility:hidden` while an error shows, so Save stays level with the box. `[data-price-warn]` rule removed.
  - Logic: state `lockHours`, `lockSavedHours`, `lockError` ('' | 'invalid' | 'save'), `lockBusy`, `lockOk`; `loadVat()` also
    reads `data.quoteLockHours` (no literal default in the DC); `lockHoursValue()`, `setLockHours`, `saveLock`
    (`VamosOps.saveDraftQuoteLock(n)`, busy guard, answer's hours become the saved value). renderVals: tLockLabel,
    tLockSuffix, tLockHint, tSaveLock, tLockSaved, lockHours, setLockHours, saveLock, lockErrorText, lockErrFlag,
    lockOkDisplay, lockSaveVariant, lockSaveOff.
  - T (en/de/fr/ar): lockLabel, lockSuffix, lockHint, saveLock (SIGNED.md verbatim) + lockError, lockSaveError, lockSaved.
  - Removed: Publish dialog `<p data-price-warn …>`, tBandOverlapWarn/bandWarnDisplay, bandRowsRaw, bandsOverlap(),
    regionsOverlap(), gap kinds rule/band/band_overlap in gapKind and paneForGap, `recap` state + recapLine(), and 30 dead
    T keys in every language that had them (colRule, addRule, editRule, saveRule, deleteRuleTitle, deleteRuleBody,
    emptyRulesTitle, emptyRulesBody, searchRules, nounRule, nounRules, kindWaiting, kindLock, kindFreeWait, kindServiceArea,
    fPayload, hRulePayload, regionPercentWarn, previewKicker, recapStart/Km/Bands/Region/Extras/Vat/Total, gapRule, gapBand,
    gapBandOverlap, bandOverlapWarn). Each had 0 uses before removal (grep at 04:2x), except the four live ones whose
    consumers went with them.
- `app/vamos-ops-data.js`: bands / regionPremiums / rules collections, cleanBand / cleanRegion / cleanRule, `ruleId` in
  cleanSurcharge and the three names in resetAll removed; `saveDraftQuoteLock(hours)` →
  `api("PUT", "/api/staff/rate-book", { kind: "rule", ruleKind: "quote_lock", quoteLockHours: hours })`, clears the book
  cache on ok; header comment names it.
- `app/vamos-i18n-dict.js`: 'Class floors, km bands, region %' and 'Class floors and km bands' removed (no consumer);
  five lock strings added next to 'Save VAT' (same de/fr/ar as T) so `VamosLocale.coverage` on the field is empty.
- Tests: new `apps/web/lib/ops/ops-pricing-lock-field.test.ts` (25 tests); `ops-pricing-tabs.test.ts`,
  `ops-pricing-source.test.ts` (overlap presence → absence), `ops-dc-p4.test.ts`, `ops-dc-class-lifecycle.test.ts`
  (stub `bands` collection dropped).
- Tools: `tools/verify-lock-field.mjs` (offline, committed), `tools/lab-lock-field.mjs` (lab, committed, not run),
  `screens/final/sheet-final.png` (committed; the 27 frame PNGs in screens/final/ are not).

## New copy (not in the signed sheets; written to the brief, four languages)

| key | en | de | fr | ar |
|---|---|---|---|---|
| lockError | Enter whole hours, 1 or more. | Gib ganze Stunden ein, 1 oder mehr. | Saisissez des heures entières, 1 ou plus. | أدخل عددًا صحيحًا من الساعات، 1 أو أكثر. |
| lockSaveError | Could not save. Try again. | Speichern nicht möglich. Bitte erneut versuchen. | Enregistrement impossible. Réessayez. | تعذّر الحفظ. حاول مرة أخرى. |
| lockSaved | Saved in the draft. | Im Entwurf gespeichert. | Enregistré dans le brouillon. | تم الحفظ في المسودة. |

lockSaveError reuses the dictionary's existing 'Could not save. Try again.' translations word for word.

## Runs (clock from `date`, +04)

| Time | Run | Result | Log (logs/) |
|---|---|---|---|
| 04:29:07 | `node scripts/sync-dc-mock-to-public.mjs` | 20 pages synced | task3-sync.log |
| 04:29:08 | vitest, 6 pricing DC tests (before updating them) | 1 failed: ops-pricing-source expected `/overlap/i` (presence check of the removed warning), inverted | task3-vitest-0.log |
| 04:30:43 | vitest `ops-pricing-lock-field.test.ts` | 25 passed | (stdout) |
| 04:30:55 | vitest, 62 unit files that read OpsPricing / vamos-ops-data / vamos-i18n-dict | 62 files, 1232 tests passed | task3-vitest-1.log (list: task3-related-tests.txt) |
| 04:31:02 | `pnpm i18n:check`, `pnpm check:numbers`, `pnpm lint:css` | all exit 0 | task3-i18n-check.log, task3-check-numbers.log, task3-lint-css.log |
| 04:31:19 | `node --test scripts/*.test.mjs` | 40 pass, 0 fail | task3-test-scripts.log |
| 04:33:12 | `verify-lock-field.mjs` (first) | ALL PASS | (overwritten) |
| 04:33:52 | `verify-lock-field.mjs` (table-order check made strict) | ALL PASS: 1440-en 34, 390-en 34, 390-ar 35, 1440-de 33, 1440-fr 33 checks; sheet 274641 B | verify-lock-field.log |
| 04:35:44 | after the dictionary addition: sync, vitest same 62 files, i18n/numbers/css, eslint touched files, plan grep gate | 1232 passed; all exit 0; grep gate empty | task3-vitest-2.log, task3-eslint.log |
| 04:35:54 | `tsc --noEmit -p apps/web` | 1 error in my new test (possibly undefined), fixed | task3-tsc.log |
| 04:36:05 | `tsc --noEmit -p apps/web`, vitest lock-field test, eslint on it | exit 0, 25 passed, exit 0 | task3-tsc.log |

## What verify-lock-field.mjs proves (real synced page, real vamos-ops-data.js / vamos-ops-api.js, stubbed /api/*)

Per frame (1440 en, 390 en, 390 ar, 1440 de, 1440 fr): value 24 from GET rate-book; signed label, suffix, hint and Save
text; inputMode numeric; Save ghost + disabled at rest; input box and Save 44 px, same line (mid offset 0); Save on the
inline-end side (left in ar); no clipped text in the field (German and French fit at 1440); field above the class table;
focused input box-shadow none; Save box-shadow none at rest and hover; typing 48 → primary + enabled; PUT body exactly
`{"kind":"rule","ruleKind":"quote_lock","quoteLockHours":48}`; 200 → value 48, Save ghost + disabled, saved line;
"0" and "1.5" → kit error text, red box, aria-invalid, Save disabled, hint hidden, error inside the field block, Save still
level, no PUT; 36 → second PUT → 400 invalid → failure text, 36 kept, Save primary + enabled; Publish dialog has no
`[data-price-warn]` and no band wording; 390: scrollWidth ≤ 390; ar: `dir=rtl`; no page error. 1440 en:
`VamosLocale.coverage('[data-lock-field]')` empty.

## Verified
- The field reads, validates, saves (PUT contract from task2-NOTES.md) and reports both outcomes in the real page, four
  languages, 1440 and 390, RTL, against stubbed answers.
- Band warning, band/rule gap kinds, recap, dead strings and the three store collections are gone (unit + grep gate).
- 62 related unit files, tsc, eslint, i18n:check, check:numbers, lint:css, scripts tests green.

## Not verified
- Against the real Worker and database: sign-in, PUT writing quote_lock_minutes, reload showing 48, Publish keeping 2880
  on the live book and settings_versions. That is `tools/lab-lock-field.mjs`, written, syntax-checked, not run (no lab in
  this task, by instruction).
- The no-draft case end to end (first save forks a draft, page re-reads versions so the Draft mark and Publish follow):
  unit-tested only.
- 1024 / 768 widths and de/fr at 390 were not rendered (brief listed 1440 en, 390 en/ar, de/fr 1440).
- The PNGs were not looked at by me (work-thread rule: no PNG reads); the DOM assertions above are the evidence.
- Full `test:unit`, `gate:local`, `lab.sh`, pgTAP, `*.local.test.ts`: not run (by instruction).

## Failed
- None open. Two self-inflicted failures fixed in the same pass (source test presence check at 04:29:08, tsc type at 04:35:54).

## Deviations
1. [Brief over plan] Error and saved lines added (plan said "no new copy"); the orchestrator's brief asked for them. Shown via
   the kit Input `error` prop; to keep Save level with the box the error takes the hint's slot (CSS above).
2. [Rule 2] After the first save on a live book (no draft yet) the page calls `loadDraft()` so the Draft mark and the Publish
   button follow without a reload (the plan said only to record this). Without it the owner could not publish the value he
   just saved until he reloaded.
3. [Rule 2] Discard and Clone into draft now also call `loadVat()`, so the VAT and price-valid fields show the book that is
   on screen after the switch (previously VAT kept the discarded draft's value).
4. [Rule 2] Save is disabled while a save is in flight (no double PUT).
5. The five lock strings were added to `vamos-i18n-dict.js` (the plan allowed it when coverage flagged them).
6. TDD order: the code and tests landed in one pass, not a RED commit first (one atomic commit as briefed).
7. HANDOVER.md was not rewritten (plan step 7); the brief asked for this notes file instead.
8. The GSD worktree commit guard expects a `worktree-agent-*` branch; this T3 worktree's branch is
   `fix/pricing-staff-policies`, as the brief directs.

## How to run lab-lock-field.mjs (orchestrator, single lab session)

1. `bash scripts/test-lab/lab.sh up pricing-pol --rebuild` (dashboard Worker on; it must run this branch's DC and routes)
2. `node .planning/quick/261013-pricing-staff-policies/tools/lab-lock-field.mjs pricing-pol` (detached:
   `nohup zsh -c 'node .planning/quick/261013-pricing-staff-policies/tools/lab-lock-field.mjs pricing-pol; echo exit=$?' > .planning/quick/261013-pricing-staff-policies/logs/lab-lock-field.log 2>&1 &`)
3. Read `logs/lab-lock-field.log`: lines `PASS | L1…L7 | evidence`, then `N pass, M fail`, `exit=0`. Evidence PNGs and
   results.json go to `screens/lab-lock-field/`.

It loads the lab's variables itself (`lab.sh env <name>`; an earlier `eval` is optional), refuses a non-local
LAB_DB_URL, reads the database through `postgres` from apps/web in a read-only session, and leaves the lab book at
48 hours (`lab.sh reseed pricing-pol` restores the seed). Steps: L1 sign-in, L2 Distance rules shows 24 / Save ghost,
L3 48 → Save → PUT 200 with the contract body and the draft holds 2880, L4 reload shows 48, L5 Publish 200 with no band
text or `[data-price-warn]`, L6 live book = the saved draft id with 2880 and newest settings_versions 2880, L7 no page
error. It assumes the seeded book holds 1440 (L2 fails otherwise) and that the draft has no completeness gaps (L5 fails
with the server's answer in the evidence otherwise).

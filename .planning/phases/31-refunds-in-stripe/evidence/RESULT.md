# Phase 31 test brief results

Run 1 evidence: `run-1/`. Run 2 (failed and blocked steps only, after fixes 8066fb89, 10be254f, ec7c148c, 4a966216 and brief fix 15f19abe) is appended below.

## Run 1 — vamos-tester reply, verbatim (2026-10-13 18:18 +04, commit b56e3c39)

**Brief:** `/Users/koss/.t3/worktrees/VamosTaxi.eu/phase-31-refunds-in-stripe/.planning/phases/31-refunds-in-stripe/31-TEST-BRIEF.md`
**Commit tested:** b56e3c39
**Lab:** p31-refunds
**Time:** Tue 2026-10-13 18:18 +04
**Evidence folder:** `.../31-refunds-in-stripe/evidence/` (step scripts, `results-dashboard.json`, `results-customer.json`, `d12-coverage.json`, `c8-coverage.json`, `d9-requests.json`)

Run deviations, all within the brief's steps:
- **Dashboard sign-in:** the dashboard login has only an email link and 6-digit code, no password field, so I typed the code from the lab's local mail file into the real form as `lab-admin@vamos.local`.
- **D1 delay:** I held the `/stripe-payments` answer 4 s so the disabled item could be read before it arrived.
- **Stripe stub:** the Stripe tab was answered by a stub, so only its URL was checked.
- **Lab restart:** the dashboard Worker dropped once after setup and I did `down` then `up` once. The fixtures and the customer user survived.
- **D12 order:** I ran D12 before D9 so D9's request log covers all dashboard steps.

| step | result | evidence | screenshot |
|---|---|---|---|
| D1 | PASS | before the response: `aria-disabled="true"`; after: `"false"`; exactly one new page `https://dashboard.stripe.com/acct_1UIZmAQbJiSLxJfu/test/payments/pi_lab_p31_a`; no "Which payment?" | D1.png, D1-before.png |
| D2 | PASS | 2 `[data-ops-stripe-row]`; both links `_blank`, `rel="noopener noreferrer"`, hrefs end `pi_lab_p31_b_extra` and `pi_lab_p31_b` | D2.png |
| D3 | PASS | "This booking has no Stripe payment to open." shown; no new page | D3.png |
| D4 | PASS | "Refund to check" shown; no "Confirm refund" or "Decline refund" | D4.png |
| D5 | PASS | "Refund to check" absent (case-insensitive) | D5.png |
| D6 | FAIL | "Refund to check" absent, but "Refunded" is not on the page in any case. Page shows a CANCELLED badge, "Refund issued" (twice) and "The customer has been emailed that the refund was issued to their bank account." | D6.png |
| D7 | PASS | own `[data-ops-fold]` hidden, item in the top-bar menu; "أي دفعة؟" with 2 rows; link top 520 vs text bottom 512 (row 2: 649 vs 641), link inside 0-390; scrollWidth 390/390; dir rtl | D7.png |
| D8 | PASS | title and body strings both found; `dir` rtl | D8.png |
| D9 | PASS | 154 API requests over D1-D12; no path ends in `/refund` or `/refund-decision`; 17 `GET .../stripe-payments` | (none; `d9-requests.json`) |
| D10 | PASS | menu item "In Stripe rückerstatten"; "Welche Zahlung?"; 2 rows; both buttons "IN STRIPE ÖFFNEN"; scrollWidth 1024/1024 | D10.png |
| D11 | PASS | menu opened from the top bar; one new page with `pi_lab_p31_a`; (d) note shown; scrollWidth 768/768 on both | D11.png, D11-a.png |
| D12 | FAIL | menu calls not empty: de 1 ("Ankunft markieren"); fr 2 ("Assigner un chauffeur", "Marquer l’arrivée"); ar 1 ("تسجيل الوصول"). The six calls on the (b) list region and the (d) Alert returned 0. The (d) note sits in an Alert, not in `[data-ops-refund-region]`, so I used the Alert. | D12-de.png, D12-fr.png, D12-ar.png |
| C1 | PASS | line found; no "CHF", no "Stripe" in the sheet | C1.png |
| C2 | PASS | Arabic line found; no CHF or Stripe; scrollWidth 390/390 | C2.png |
| C3 | BLOCKED | `/booking-detail?ref=VT-99-31304` shows "We could not find this booking." although signed in and `customer_id` linked as the brief says | C3.png |
| C4 | BLOCKED | same not-found page | C4.png |
| C5 | BLOCKED | the 9 customer pages read (C1, C2, C6, C8 sheet de/fr/ar, and the C3, C4 and C7 pages) contain no "Stripe". But C3, C4, C7 and the C8b pages were the not-found page, not the booking view, so "every customer step" is not covered. | (none) |
| C6 | PASS | German line found; no "CHF"; scrollWidth 1024/1024 | C6.png |
| C7 | BLOCKED | same not-found page | C7.png |
| C8 | FAIL | cancel sheet coverage not empty in all three languages: de, fr and ar each return 1 string, "Zurich Airport → Zug" (the route in the sheet header). The Refund-row half could not run (see the C8b line below). | C8-sheet-de.png, C8-sheet-fr.png, C8-sheet-ar.png |

The Refund-row coverage half of C8 is BLOCKED for the same reason as C3. It ran as sub-step C8b, and the row was missing in all three languages (`C8-row-de.png`, `C8-row-fr.png`, `C8-row-ar.png`).

**Gates** (`scripts/test-lab/lab.sh gates`):
- PASS | typecheck | apps/web typecheck: Done
- FAIL | eslint | bash: -c: line 0: syntax error near unexpected token `(' (the command was built from a file list)
- PASS | i18n:check | 2698 keys checked for cross-locale coverage
- FAIL | check:numbers | invented CHF figure (Law 04 / D-46) at `apps/web/lib/checkout/refund-check.test.ts:332` and `apps/web/lib/ops/ops-refund-stripe-dc.test.ts:148`
- PASS | check:db-fences | all 8 checks passed (1289 files scanned)
- PASS | check:legal-claims | all 3 checks passed
- FAIL | vitest:apps/web | bash: -c: line 0: syntax error near unexpected token `(' (same cause as eslint, on the `app/[locale]/(ops)/...` path)
- PASS | vitest:packages/db
- PASS | vitest:packages/emails

**Not verified (tester):** customer Refund row (C3, C4, C7, C8b) — the account view matches on `lower(b.contact_email)` (`apps/web/app/api/account/bookings/route.ts:60`), fixture (d) had contact email `lab-p31-d@vamos.local`; C5 for the booking view; real Stripe pages (out of scope).

### Lead triage of run 1
- D6: brief error. The existing success Alert reads "Refund issued" (`refundedTitle`, unchanged from origin/main); brief fixed in 15f19abe.
- C3/C4/C7/C8b/C5: brief fixture error (contact_email); fixed in 15f19abe.
- D12: dictionary lacked "Mark arrival" and had a different fr for "Assign driver" than the dashboard T table (pre-existing); fixed in ec7c148c.
- C8: cancel-sheet route (place names) was not marked untranslatable (pre-existing); fixed in 4a966216.
- Gates: check:numbers fixed in 8066fb89; lab.sh quoting of parenthesised paths fixed in 10be254f.

## Run 2 — failed and blocked steps only (one re-run)

Part 1 (2026-10-13 18:36 +04, commit 15f19abe; cut by a Mac restart at about 18:38 after these two steps), `run-2/results-dashboard.json`:

| step | result | evidence |
|---|---|---|
| D6 | PASS | refund to check (ci) false; "Refund issued" visible true |
| D12 | PASS | de/fr/ar: menu 0, region 0 (rows 2), note[Alert] 0 |

Part 2 — vamos-tester reply, verbatim (2026-10-13 23:17 +04, commit 4843dd9c), evidence `run-2/`:

| step | result | evidence | screenshot |
|---|---|---|---|
| C3 | PASS | /booking-detail?ref=VT-99-31304; row "REFUND Refund follows the cancellation policy" | C3.png |
| C4 | PASS | row "المبلغ المسترد الاسترداد وفق سياسة الإلغاء"; scrollWidth 390/390 | C4.png |
| C5 | PASS | 12 pages read (C1, C2, C6, C8 sheets de/fr/ar, C3, C4, C7, C8 rows de/fr/ar); none contain "Stripe" | (none) |
| C7 | PASS | row "REFUND Refund follows the cancellation policy"; scrollWidth 768/768 | C7.png |
| C8 | PASS | cancel sheet of (a) coverage: de 0, fr 0, ar 0 | C8-sheet-de.png, C8-sheet-fr.png, C8-sheet-ar.png |
| C8 (Refund row, step id C8b) | PASS | Refund row of (d) coverage: de 0 "Rückerstattung gemäss Stornierungsbedingungen"; fr 0 "Remboursement selon la politique d’annulation"; ar 0 "الاسترداد وفق سياسة الإلغاء" | C8-row-de.png, C8-row-fr.png, C8-row-ar.png |

Gates (`scripts/test-lab/lab.sh gates`, `run-2/gates.log`): typecheck, eslint (75 changed files), i18n:check (2698 keys), check:numbers, check:db-fences (8 checks, 1289 files), check:legal-claims, vitest:apps/web, vitest:packages/db, vitest:packages/emails: all PASS.

Not re-run (results from run 1): D1-D5, D7-D11 (PASS), C1, C2, C6 (PASS). D9 request log is from run 1.

## Final per-step result

D1 PASS · D2 PASS · D3 PASS · D4 PASS · D5 PASS · D6 PASS (run 2) · D7 PASS · D8 PASS · D9 PASS · D10 PASS · D11 PASS · D12 PASS (run 2) · C1 PASS · C2 PASS · C3 PASS (run 2) · C4 PASS (run 2) · C5 PASS (run 2) · C6 PASS · C7 PASS (run 2) · C8 PASS (run 2, both halves).

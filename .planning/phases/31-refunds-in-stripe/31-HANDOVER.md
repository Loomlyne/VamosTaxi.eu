# Phase 31 hand-over — Refunds in Stripe

## 0. Status

Branch `phase-31-refunds-in-stripe`. The head commit is the one that updates this file (`git log -1`). Second merge of origin/main (95253429: #77 remarketing off, #78 notification kinds, migration 20261012230000) at **edd7d6d8**, clean, no conflicts. First merge was 89e68ca8. Third merge bcf34728 brings origin/main aa85e5ec (planning notes only: Phase 30 Ship decision, Phase 31 internal lines signed); no code, so the gate and pgTAP results below stand.
Not pushed to main. No deploy. No live write. No live MCP call during execution; the only live calls were read-only SELECTs on 2026-10-12/13 for the 23514 facts, before execution.

## 1. What was built

| Plan | What | Commits | Requirements |
|---|---|---|---|
| 31-01 | Stripe Dashboard link builder; `GET /api/staff/bookings/[id]/stripe-payments` (both mounts, withAdmin, force-dynamic) | 200dd445 56db5924 058cf480 133dd53e ddc98f3f | R31-01 |
| 31-02 | In-app refund sender, refund and refund-decision routes, parsers, and tests removed; db-fence allowlist cleaned | 0c811d7a 90a80aae ff7e556e | R31-02, R31-03, R31-04 |
| 31-03 | Migration `20261012240000_refund_check_reader.sql` (three definers), pgTAP 52/52, database.types.ts | 9a5aa235 5a66c275 8aaea646 | R31-06, R31-08 |
| 31-04 | Customer refund mail: sender, Resend idempotency key `refund-mail:<re_id>`, signed copy, info@ alert, decision file | c2a6dad3 73c4b5bc db0e1ebb e09f3873 9393e3e2 | R31-06 |
| 31-05 | Webhook sends the mail on 'recorded' only (not app-made duplicates); the notification sweep retries kind 'refund' | d16338a4 1a6065ac e66627af d19c317d 3936bf1b c11417b1 061c7fe1 | R31-03, R31-04, R31-06 |
| 31-06 | Nightly read-only refund check at 03:00 UTC, mails info@ (English) only on a finding | d0c65d97 d385a6fb e61d4a68 34991af0 d01e830d 316dfbcc 18d4daf4 | R31-08 |
| 31-07 | Cancel answers carry no amount; owed amount is 0 on a cancelled booking in both reads | 02aab0a1 0239eddc 0ad5f870 d15272d3 83400b11 | R31-05 |
| 31-08 | Cancellation e-mail: one signed refund line in 4 languages; ops must-fix mails say Stripe (W4, W5) | 8d8c7e6e 6c0c0d7e 0d0edf5a b052a106 75ff6ac7 175a8d9f | R31-07, R31-09 |
| 31-09 | Dashboard OpsDetail refund area per signed sheets; Refund in Stripe and the "Which payment?" list | 38d383e3 0a259c4f 8e892ffd dc23f359 | R31-01, R31-02 |
| 31-10 | Customer cancel sheet, Refund row and card (signed W1-W3); dictionary, React twins, seed | d04f0ec5 436e1ba4 74c659bc cb3ecb23 362ea770 | R31-05, R31-10 |
| 31-11 | `STRIPE_ACCOUNT_ID` in `env.staging.vars`, with a pin test | 29a860ca 890c7625 bc790dde | R31-01 |
| 31-12 | O-1 = A: one "Cancel this transfer" sub-line on both pages (W6) | 9473814a e1ebb6d6 ea949776 | R31-10 |
| 31-13 | Merge, runbook, test brief, alert footer fix, brief-run fixes, seed pin, renumber, this hand-over | 89e68ca8 5963f960 b56e3c39 8066fb89 10be254f ec7c148c 4a966216 15f19abe 4843dd9c b67211d3 d813815a 6ec58e9b | all |

## 2. Migration and ship order

- File: `packages/db/supabase/migrations/20261012240000_refund_check_reader.sql`, md5 `c0c516f2b5dd56357267468313c1a296` (was 07371cd7… before the PR #82 review fix, 2026-10-14: `refund_check_read` gained `site_refund_booking_id` and `refund_mail_claimed`; not applied live, so the file was changed in place).
  - Renumbered from 20261012220000 by the owner, 2026-10-13 ~23:25 +04, because Phase 30 owns `20261012220000_edit_request_retired_class.sql`.
  - It is additive: three SECURITY DEFINER functions, `refund_check_read`, `notification_claim_refund` and `notification_refund_read`. No table change. It does not touch `booking_notifications_kind_check`; kind 'refund' is already allowed.
- **Migration first:**
  1. Apply it verbatim as one transaction (connector `apply_migration`, md5 guard).
  2. Read back:
     - `has_function_privilege` is true only for `vamos_system` on all three functions;
     - `provolatile = 's'` for `refund_check_read`;
     - `pg_get_functiondef` md5 per function matches the own stack.
  3. Then deploy: `pnpm --filter web run deploy -- --env staging`.
- If the Worker goes out first, the 03:00 cron only logs `refund_check failed` (the other 03:00 jobs are unaffected). The customer refund mail would fail its claim and send the info@ alert.
- Phase 30 ships first. Whichever ships second must merge, re-run `ops-dc-*` tests and regenerate `database.types.ts` (`pnpm db:types:check`). That file will conflict, because Phase 30's 30-01 also changes it.

## 3. Live checks after deploy

1. Open one booking's Actions > Refund in Stripe. It should open the right `pi_` page on the live account `acct_1UIZmAQbJiSLxJfu` (C-01).
2. Make one real sandbox card payment through the checkout (memory real-card-payment-before-ship), then refund part of it in Stripe. Read `booking_refunds` and the Resend log: there should be exactly one customer refund mail, in the booking language, with Stripe's amount (D-10, D-11).
3. The next morning, read the Worker log line `refund_check` (D-09). A mail arrives only if there is a finding.
4. The Stripe webhook endpoint is still subscribed to `charge.refunded`, `refund.updated`, `refund.failed` and `charge.refund.updated`.

## 4. Config

`STRIPE_ACCOUNT_ID = acct_1UIZmAQbJiSLxJfu`, in `env.staging.vars` only. The controller confirmed it against the live publishable key (S-11, 2026-10-13 ~16:20 +04). The live Worker gets it at the next deploy.

## 5. Owner answers used

- S-01..S-05 (2026-10-12 ~19:05 +04): sheets 1-3 signed; customer wording W1-W3 signed; Q1 = A (refund mail); Q2 = A (no NO REFUND button); no next-step line.
- S-06 (2026-10-13 ~16:20 +04): refund mail copy signed, en/de/fr/ar, used verbatim. Template version `refund@2026-10-13-1`. Pinned in `.planning/decisions/2026-10-12-refund-mail-copy.md`.
  - Derived from the signed text: the heading inside the mail = the subject words; the greeting without a name = "Hello," / "Guten Tag" / "Bonjour," / "مرحبًا،".
- S-07: O-1 = A (W6). S-08: keep "See what comes back" and "— keep it, because that is what your refund is calculated from." S-09: ops mails that say Stripe accepted. S-10/S-10a: migration number. S-11: account id.

### New internal lines — SIGNED as written

Signed by the owner, question form 2026-10-13 ~23:35 (+04), `.planning/decisions/2026-10-13-p30-ship-p31-lines-rls-fix.md` item 3 (origin/main aa85e5ec): every line in this part (31-06 nightly refund check mail, 31-04 refund-mail alert, 31-08 W4/W5 en/de/fr/ar). Used verbatim; nothing changed in code.

31-06 nightly refund check mail (English, info@ only):
- totalDiffers line: `- VT-26-0001 · booking refunded CHF 40.00 · refund records CHF 30.00`
- truncated line: `Stripe listed more than 500 refunds; the newest 500 were compared.`
- derived status wording: `Stripe succeeded · booking failed` (when the site's refund was reversed)
- did-not-run mail: subject `Refund check did not run`; body `Stripe did not answer tonight's refund check, so nothing was compared. It runs again tomorrow at the same time.`
- footer: the public phone number only.

31-04 refund-mail alert (English, info@ only):
- Subject: `Refund mail not sent: {reference}`
- Body: `Stripe made refund {refundId} on booking {reference}, but the customer refund email could not be prepared, so the customer has not been told by email. Open the refund in Stripe and tell the customer yourself.`

31-08 ops must-fix mails. These change the signed 2026-10-02 T1 wording; the owner accepted the change (S-09), but the de/fr/ar sentences are new:

W4 `differenceNotAppliedBody`:
- en: "The customer paid the difference for this booking, but the change was not applied: the trip was cancelled, a newer change replaced it, or it no longer fits. The payment is recorded. Refund it in Stripe, or make the change again."
- de: "… Die Zahlung ist verbucht. Erstatten Sie sie in Stripe oder nehmen Sie die Änderung erneut vor."
- fr: "… Le paiement est enregistré. Remboursez-le dans Stripe ou refaites la modification."
- ar: "… الدفعة مسجّلة. نفّذ الاسترداد في Stripe، أو أجرِ التغيير مرة أخرى."

W5 `refundFailedBody`:
- en: "Stripe reported a refund as failed after it was recorded. Open the payment in Stripe to try again."
- de: "Stripe hat eine bereits verbuchte Rückerstattung als fehlgeschlagen gemeldet. Öffnen Sie die Zahlung in Stripe, um es erneut zu versuchen."
- fr: "Stripe a signalé comme échoué un remboursement déjà enregistré. Ouvrez le paiement dans Stripe pour réessayer."
- ar: "أبلغت Stripe عن فشل استرداد سبق تسجيله. افتح الدفعة في Stripe لإعادة المحاولة."

Full rows: `.planning/decisions/2026-10-12-refund-wording-signed.md` W4, W5.

## 6. Phase 30

- The merge at 89e68ca8 brought in only 4 planning-note commits from origin/main. Phase 30 has not landed, so there was no code, migration or types change.
- One conflict, in `.planning/decisions/2026-10-12-refunds-in-stripe.md`: both sides were kept.
- Expected overlaps when the second phase lands (C-03):
  - `database.types.ts`: regenerate.
  - OpsDetail T tables and `app/vamos-i18n-dict.js`: keep both sides' keys.
  - `ops-dc-*` tests: keep both sides' pins and re-run.

## 7. Lists

### Verified (clock times +04, 2026-10-13)

- **After the second merge (edd7d6d8, origin/main 95253429):**
  - #78 widens `booking_notifications_kind_check` (adds time_change, flight_no) and keeps 'refund'. The Phase 31 claim (`notification_claim_refund`, kind 'refund') and the sweep (kinds confirmation + refund) need no change. No Phase 31 code used the removed `notifyRefundFailed`. `database.types.ts` did not conflict (#78 adds no function).
  - Touched tests: notify-lifecycle, edit-request-notify-outcome, google, refund-mail, notify, money-events, settle: 7 files, 344 passed. `tsc --noEmit` (apps/web) exit 0.
  - Full gate, 23:29:03–23:31:40 on edd7d6d8: `pnpm gate:local && pnpm check:db-fences`, `exit=0`. Log: `evidence/gate-local.log`. apps/web 6088 passed, 55 skipped (the `.local` files); emails 360; db 14; test:db-lab db 76, web 11 + 42 passed; check-db-access-fences all 8 checks passed (1290 files).
  - pgTAP after reset on the own stack (applies 20261012230000 then 20261012240000): `PASS | pgtap | Files=118, Tests=3501`, `exit=0`; notification_kinds, refund_check_reader, seed_idempotent ok. Logs: `evidence/pgtap.log`, `evidence/pgtap-detail.log`.
  - The browser brief was not re-run after this merge: #77/#78 touch no page the brief covers (app/vamos-google.js is the remarketing switch).

Earlier results (before the second merge):

- **Full gate**, 23:17:44–23:19:35 on b67211d3: `pnpm gate:local && pnpm check:db-fences` gave `exit=0`. Log: `.planning/phases/31-refunds-in-stripe/evidence/gate-local-b67211d3.log`.
  - apps/web: 6085 passed, 55 skipped (the `.local` files, which run in test:db-lab).
  - packages/emails: 360 passed. packages/db: 14 passed.
  - test:db-lab on a fresh stack: db 76, web 11 + 42 passed.
  - check-db-access-fences: all 8 checks passed.
  - Since b67211d3, only d813815a (pgTAP pin) and 6ec58e9b (migration renamed, comments) changed. Both are covered by the two runs below.
- **pgTAP**, 23:22, on the own stack after reset, including the renamed migration: `PASS | pgtap | Files=117, Tests=3488`, `exit=0`. `refund_check_reader.test.sql` ok; `seed_idempotent.test.sql` ok after the pin fix d813815a (31-10 removed one dead key, so the count is 2706).
  - Logs: overwritten by the post-merge pgTAP run above (same files).
  - The first try at 23:20 failed only on that seed count pin.
- **Local DB tests** (refund-check, refund-mail) on lab p31-refunds, one file at a time: Test Files 2 passed, Tests 4 passed, none skipped, `exit=0`. Log: `evidence/local-tests.log`.
  - A first run with both files in parallel failed the "writes nothing" row count, because the other file wrote a notification row at the same time. Log: `evidence/local-tests-parallel-run.log`. The gate's test:db-lab also runs them one at a time.
- **Browser brief**: all 20 steps PASS. Results: `evidence/RESULT.md`; evidence in `run-1/` (18:18, b56e3c39) and `run-2/` (D6, D12 at 18:36, 15f19abe; C3, C4, C5, C7, C8 at 23:17, 4843dd9c).
  - D1–D12 and C1–C8 at 1440/1024/768/390 in en/de/ar, with fr/de/ar coverage.
  - Run 2 also ran `lab.sh gates`: 9/9 PASS.
- **Run 1 findings fixed:**
  - D12 dictionary (ec7c148c); C8 route marked untranslatable (4a966216); check:numbers (8066fb89); lab.sh path quoting (10be254f).
  - Brief errors fixed in 15f19abe: D6 expects "Refund issued", the existing alert title, unchanged from main; fixture (d) gets the customer's contact email.

### Not verified

- The Stripe Dashboard link format on a real payment, live and sandbox (needs his Stripe login).
- A real customer refund mail through Resend, a real refund webhook, and the cron on a deployed Worker. These are the three manual rows in 31-VALIDATION.md.
- Arabic subject rendering in real inboxes.
- `apps/web/tests/e2e-worker/p6-browser.e2e.mjs`: edited in 31-09, not run.
- Resend remembers an idempotency key for 24 h only. A sweep retry after that relies on the claim row alone.
- `database.types.ts` was generated with Supabase CLI 2.119.0, plus the three functions added by hand. `db:types:check` with the pinned CLI needs Docker and was not run.

### Failed

- None open.

## 8. Left for later (not in this phase)

- Drop the `ops_refund_*` SQL after a week live (D-07). `findRefundByIntent` / `payoutFactsFromRefund` lost their only production caller.
- The C-04 / 23514 notification kinds bug (`assignment_customer`, `time_change`, `flight_no`, `refund_failed` refused by the live check constraint). This is a separate job with migration 20261012230000; not touched here.
- PR #82 review note 3, done 2026-10-14 (owner: "do what you think is best"): the account bookings list (`app/pages/BookingRow.dc.html:251`) now says "Cancelled by you. Any refund follows the cancellation policy." in en/de/fr/ar: its own first sentence plus W1's second sentence, both already in use. No new wording.
- PR #82 review note 2, done 2026-10-14: a recorded Stripe Dashboard refund whose mail claim never landed is picked up by the 03:00 check (`refund_mail_claimed = false`), which runs the same claim, send and settle as the webhook. Not for app refunds, amount differences or reversed refunds; the claim keeps it to one mail. The info@ alert stays as the first signal.
- `apps/web/i18n/messages/fr.json` `ops.assign-driver` says "Attribuer un chauffeur", while the dashboard and dictionary say "Assigner un chauffeur". The React twin reaches nobody.
- `docs/runbooks/stripe-webhook.md:28` still says the booking "shows the refund as due again".
- The archive copy `archive/ds-upgrade/app/manage-booking.dc.html` keeps the old lines; no customer sees it.
- The lab stack `vamos-lab-p31-refunds` (native postgres, port 45222) is still running for the controller's checks. Remove it with `scripts/test-lab/lab.sh destroy p31-refunds` after landing.

**Next step for the controller:** open a PR from this branch, review it (Grok 4.7 verifier), run the clean-clone check, then his Ship.

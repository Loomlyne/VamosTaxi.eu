---
phase: 31-refunds-in-stripe
plan: 08
subsystem: emails / refunds / copy
tags: [email, i18n, refunds, copy]
requires: []
provides:
  - ".planning/decisions/2026-10-12-refund-wording-signed.md: W1..W3 signed customer wording, W4/W5 internal must-fix bodies, O-1 answered (A, S-07), S-08/S-09 recorded"
  - "cancellation.refundPolicy (W3) in packages/emails/src/messages/{en,de,fr,ar}.json; refundPendingOps and refundFullCaptured removed"
  - "CancellationEmail: full_captured and pending_ops render the same policy line, plain text (no nowrap ltr span); none unchanged"
  - "opsMustFix.differenceNotAppliedBody and opsMustFix.refundFailedBody point to Stripe in four languages"
affects: [31-10 (retires T5 cancel-sheet check and the T1/T2/T3/ROW pins with the DC pages; reads W1/W2 from the new file), 31-12 (adds W6 under O-1 and applies it), 31-13 (whole emails suite and docs/runbooks/stripe-webhook.md line 28 wording)]
tech-stack:
  added: []
  patterns: [signed wording tables read by tests byte for byte ("### Wn" + "| lang | text |" rows, block ends at the next heading)]
key-files:
  created:
    - .planning/decisions/2026-10-12-refund-wording-signed.md
    - packages/emails/src/CancellationEmail.test.tsx
  modified:
    - packages/emails/src/CancellationEmail.tsx
    - packages/emails/src/messages/en.json
    - packages/emails/src/messages/de.json
    - packages/emails/src/messages/fr.json
    - packages/emails/src/messages/ar.json
    - packages/emails/src/OpsMustFixEmail.test.tsx
    - apps/web/lib/legal/refund-texts-20-10.test.ts
decisions:
  - "Both paid refundLine values (full_captured, pending_ops) map to one key cancellation.refundPolicy; the CancellationRefundLine type and customer-resend.ts stay as they are"
  - "The policy sentence renders without ltr(): it is a sentence that must wrap and follow the mail's direction, not a figure"
  - "The O-1 section records the answer already given (A, 2026-10-13 ~16:20 +04, S-07) instead of an open placeholder; W6 and its rows are left to plan 31-12"
  - "Tests also pin W4/W5 in the decision file against the OpsMustFix test tables, so the internal copy cannot drift from the file"
metrics:
  duration: "about 4 min (2026-10-13 13:06Z to 13:10Z)"
  completed: 2026-10-13
  tasks: 2
  files: 9
---

# Phase 31 Plan 08: Signed refund wording in the cancellation and must-fix mails Summary

The cancellation e-mail of a paid trip now carries one refund line, the signed policy sentence W3 ("Any refund follows the cancellation policy and goes back to the payment method you used. Your bank may take a few days to show it." and its de/fr/ar), for both refund lines that used to differ; no amount, never Stripe, never "our team". The two internal must-fix mails tell the owner to refund in Stripe. The signed wording lives once in `.planning/decisions/2026-10-12-refund-wording-signed.md`, which the legal pin test and the new e-mail test read byte for byte.

## Tasks

| Task | Name | Commits | Files |
| ---- | ---- | ------- | ----- |
| 1 | Signed wording file and one policy line in the cancellation e-mail | 8d8c7e6e (RED), 6c0c0d7e (GREEN) | decision file, CancellationEmail.tsx/.test.tsx, messages/*.json, refund-texts-20-10.test.ts |
| 2 | Internal must-fix mails say "refund it in Stripe" | 0d0edf5a (RED), b052a106 (GREEN) | messages/*.json, OpsMustFixEmail.test.tsx, decision file (W4/W5) |

## New internal sentences (for the hand-over sign-off list; S-09 accepted)

W4 `opsMustFix.differenceNotAppliedBody`, new action part after "…or it no longer fits.":
- en: "The payment is recorded. Refund it in Stripe, or make the change again."
- de: "Die Zahlung ist verbucht. Erstatten Sie sie in Stripe oder nehmen Sie die Änderung erneut vor."
- fr: "Le paiement est enregistré. Remboursez-le dans Stripe ou refaites la modification."
- ar: "الدفعة مسجّلة. نفّذ الاسترداد في Stripe، أو أجرِ التغيير مرة أخرى."

W5 `opsMustFix.refundFailedBody` (whole body):
- en: "Stripe reported a refund as failed after it was recorded. Open the payment in Stripe to try again."
- de: "Stripe hat eine bereits verbuchte Rückerstattung als fehlgeschlagen gemeldet. Öffnen Sie die Zahlung in Stripe, um es erneut zu versuchen."
- fr: "Stripe a signalé comme échoué un remboursement déjà enregistré. Ouvrez le paiement dans Stripe pour réessayer."
- ar: "أبلغت Stripe عن فشل استرداد سبق تسجيله. افتح الدفعة في Stripe لإعادة المحاولة."

The old middle sentence of refundFailedBody ("The booking shows the refund as due again.") is dropped, as the plan's text specifies. `refundFailed.body` ("The trip stays cancelled. Retry the refund in Stripe.") is unchanged.

## Verification

- `packages/emails`: `vitest run src/OpsMustFixEmail.test.tsx src/CancellationEmail.test.tsx src/layout.test.ts src/lib/t.test.ts` — 4 files, 132 passed
- `apps/web`: `vitest run lib/legal/refund-texts-20-10.test.ts lib/checkout/customer-resend.test.ts lib/lifecycle/notify-cancellation.test.ts lib/lifecycle/notify-lifecycle.test.ts lib/ops/staff-cancel-by-hand.test.ts` — 5 files, 34 passed
- `packages/emails` `tsc --noEmit` — exit 0
- `pnpm check:db-fences` — all 8 checks passed
- W1..W3 rows of the decision file compared to 31-UI-SPEC.md lines 260-262 by script: 12/12 identical
- Acceptance greps: no refundPendingOps/refundFullCaptured in the four e-mail message files or CancellationEmail.tsx; one "refundPolicy" per file; no sharp s in de.json or the decision file; W4 and W5 headings present; "Retry the refund in Stripe." kept
- No `db:seed:gen` needed: only `packages/emails` messages changed; the seed is built from `apps/web/i18n/messages`

## Deviations from Plan

**1. [Objective override] O-1 written as answered, not as an open placeholder**
- The plan asked for "Open: owner answer pending (plan 31-12)." The owner answered on 2026-10-13 ~16:20 (+04) (S-07), so the section records A, signed, question form via the controller, and says plan 31-12 adds W6 and applies it. No copy rows under it.

**2. [Addition] S-08 and S-09 recorded in the decision file**
- An "Owner answers" section notes S-08 (keep "See what comes back" and "— keep it, because that is what your refund is calculated from.") and S-09 (ops mails that say Stripe accepted). The W4/W5 notes also carry the S-09 acceptance.

**3. [Rule 2 - drift guard] OpsMustFix tests also compare their tables to W4/W5 of the decision file**

No other deviation. Worktree note: the branch is the owner's phase branch `phase-31-refunds-in-stripe` (his naming rule), not a `worktree-agent-*` branch; commits went there as instructed.

## Deferred / not verified

- `docs/runbooks/stripe-webhook.md:28` still says the booking "shows the refund as due again"; it describes the database, not the mail, and is left for the docs pass (31-13).
- The whole `packages/emails` and `apps/web` unit suites were not run (lead runs them once in 31-13).
- No real mail sent; rendering proven by tests only.

## Known Stubs

None.

## Threat Flags

None (copy only; T-31-35..38 mitigated by the tests above).

## Self-Check: PASSED

- FOUND: .planning/decisions/2026-10-12-refund-wording-signed.md
- FOUND: packages/emails/src/CancellationEmail.test.tsx
- FOUND commits: 8d8c7e6e, 6c0c0d7e, 0d0edf5a, b052a106

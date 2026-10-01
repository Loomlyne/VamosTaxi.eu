---
phase: 20-security-audit-fixup
plan: 10
status: shipped; owner steps open
completed: 2026-10-01
written_by: GSD bookkeeping job B10, 2026-10-01, from git history and the control board
---

# 20-10 summary: refunds by hand (finding F11)

**Outcome: live 2026-10-01 02:30 (+04).** Main `f29623da` (2026-10-01 02:25, "feat(refunds): refunds by hand…"), Worker `2f303d16`. Migration `20261005140000` applied and read back before the deploy: 7 function bodies identical, intents table RLS forced, staff SELECT only.

- A customer's cancel no longer refunds automatically on Stripe; the booking shows "Refund due"; the admin picks payment and amount and presses Refund. Five approved texts in four languages.
- Two fresh reviews: `20-10-REVIEW.md` (4 blockers, all fixed), `20-10-REVIEW-2.md` (none).
- `20-10-PLAN.md` on main still says "DRAFT — not signed"; the copy on `origin/gsd/phase-20-security-check` and board row 10f say the owner signed it on 2026-09-30.

**Not verified:** the refund by hand has not been exercised on live (`booking_refund_intents` had 0 rows when 20-09 was read).

**Left:**
- Owner: book, cancel, then Refund on the dashboard (owner step 6 in `.planning/HANDOVER-2026-10-01.md`).
- B3 live-key refusals: `apps/web/lib/ops/refund.ts:340`, `booking-change.ts:489` and `:655`, `edit-request.ts:225` match only `sk_live_`; after the owner's refund test and before the live key.
- Open questions in the review files: edit-accept refunds can be pressed by any staff member; after-trip refunds have no %/CHF switch; the "Refund issued" mail can go twice on a double click; a refund Stripe fails after we recorded it is not noticed.

**Sources:** `.planning/CONTROL-BOARD.md` "Shipped" row 10-01 02:30, "Queue for 2026-10-01" row 1, row 10f; `20-10-REVIEW.md`, `20-10-REVIEW-2.md`; `.planning/HANDOVER-2026-10-01.md` section 5 (B3).

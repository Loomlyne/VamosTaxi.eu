---
phase: 20-security-audit-fixup
plan: 12
status: shipped; owner UAT open
completed: 2026-09-30
written_by: job session docs/phase20-close, 2026-10-02, from HANDOVER-20-12.md, the control board and the 20-09 live read
---

# 20-12 summary: a pay link no longer works for an erased booking

**Outcome: live 2026-09-30 16:39 (+04)** in the booking-path queue ship, main `a81e194e`, Worker `f3f7d929`.
Migration `20261005130000_pay_link_erased_booking.sql` applied and read back by the control session.

- `checkout_pay_link_by_hash`, `checkout_pay_link_lines`, `checkout_pay_link_state` require `erased_at is null`;
  an erased booking answers like an expired link.
- `checkout_payment_settle` refuses a payment for an erased booking with `payment_not_found`, so the existing
  path refunds it automatically.
- pgTAP `pay_link_erased_booking.test.sql` (13): 8 failed before, 13 pass after.

**Live re-check 2026-10-02 (20-09):** all four bodies check `erased_at` and are md5-identical to the migration file.

**Not built (plan point 2):** erasing a booking does not revoke its pay token; the functions already refuse it.

**Not verified:** the Worker's automatic refund for a payment on an erased booking, end to end; an extra-fare
payment page on an erased booking.

**Owner UAT (from `HANDOVER-20-12.md`):** 1. Dashboard → an unpaid test booking → Send pay link to your own
address → open it: the pay page shows. 2. Erase that booking. 3. Open the same link. Expected: "this link has
expired", no payment page.

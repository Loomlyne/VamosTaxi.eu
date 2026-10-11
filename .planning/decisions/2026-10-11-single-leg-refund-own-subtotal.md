# Single-leg cancel refunds the leg's own subtotal (decided 2026-10-11)

**Decision (owner, 2026-10-11):** cancelling one leg of a return trip refunds that leg's own amount, not the whole booking.

**Why:** the phase 04 validation audit found that `app.apply_customer_cancel` cancels one leg, then calls `compute_cancellation_refund(booking_id)`, which works at booking level (timing from the earliest leg, basis = sum of all captured payments). Local-lab probe: legs 4000 + 6000 rappen, 10000 captured, cancelling the 6000 leg set `refund_owed_rappen = 10000` while leg 1 stayed live. `price_snapshot_legs.leg_subtotal_rappen` is documented as the single-leg refund basis but nothing reads it.

**Rule to build:**
1. Basis = the cancelled leg's own `leg_subtotal_rappen`, with any booking-level discount shared pro rata.
2. Window = hours from that leg's own `original_scheduled_at`.
3. Refund never exceeds what was captured, and the sum over all cancelled legs never exceeds the captured total.
4. The leg's amounts come from its stored row only: unchanged when the rate book changes.

**Test:** one pgTAP file, two-leg booking with a `price_snapshot_legs` row per leg, cancel leg 2, assert the refund equals leg 2's stored subtotal; change the rate book; assert it is unchanged. Closes GAP-3 of `04-VALIDATION.md`.

**Not built yet.** Open jobs `pay/j7-refund-policy` and `pay/j10-drop-test-mode` both rewrite `compute_cancellation_refund` and are not on `main`. Build this on a fresh `origin/main` after they land, as its own migration.

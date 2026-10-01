---
phase: 20-security-audit-fixup
plan: 09
status: live proof done; waiting for the owner's 4242 payment (UAT step 1)
completed: pending UAT step 1
written_by: job session docs/phase20-close, 2026-10-02 02:45 (+04)
---

# 20-09 summary: prove the fixes on live and close the 2026-10 check

**Outcome: every Phase 20 fix holds on live.** Read 2026-10-02 02:30–02:41 (+04) against main `eb9128f3`,
Worker `vamos` `ae61d012`, gateway `71a307da`, database `yaumjzvylngfjhtuffqs`. Details and every probe:
`20-09-LIVE.md`, section "Close of the 2026-10 check".

- **Re-probed with their original proofs:** F3 pay-press limit (per IP: 429 on the 12th POST), batch B1
  (F6, G2, G20, G27, 20-12), refunds by hand (F11: bodies, texts, no refund yet), batch C1 (F17, G17),
  C2 (F12 confirm screen, F16 dashboard files, /dev headers once), the e-mail change fix, the leftovers
  G7/G10/G11/G12/G28 and G23 (no maps.googleapis.com in the CSP). Batch A (F1, F2, F5, F10, F13) and the
  2026-09-19 regression list still hold.
- **Hosted functions and grants against the migration files:** a from-zero replay of all 127 files compared
  row by row with live. Every Phase 20 function is md5-identical; every function grant, table grant, RLS
  flag, trigger and view is identical. Drift D1–D8 exists, none from Phase 20 (findings below).
- **TEST SECURITY bookings:** none left (VT-26-0745 removed by the hourly clean-up). Nothing for D-37.
- **Payments baseline (02:41):** succeeded 12, failed 18, requires_payment 9; no payment since the 02:12 deploy.

## Findings for the controller (not fixed here)

| # | What | Serious | Suggested next step |
|---|---|---|---|
| D1 | `tg_pricing_row_frozen` on live is the first version; migration `20260911000002_live_passenger_extras.sql` was never applied there. The file's version allows add/change/delete of extras with seven fixed codes on a published price-book row, keyed on names. | No (not security; files and live disagree on extras editing) | Owner question: keep live's behaviour (then a new migration restores the original body so files match live) or apply the file's behaviour without fixed names. Check with the extras jobs (B2 parts B/C) first. |
| D2 | Three edit-request functions on live lack `#variable_conflict use_column` (and `refund_record` has `numeric` for `numeric(8,2)`) | No | Ride the next migration that touches them: re-create from the file. |
| D3 | `bookings.is_test` not granted to `vamos_guest` on live | No (narrower) | Leave, or align the file; no code reads it as guest. |
| D4 | `distance_rates.airport_start_rappen`, `city_price_rappen` are `integer` on live, `rappen` in files | No | With G8/G9 (drop or fix the band tables). |
| D5 | `rate_version_rules`: kind check missing on live; extra restrictive policy `_staff_gate` on live | No | With G8/G9. |
| D6 | `rate_versions` checks written without `is null or` on live | No (same meaning) | None. |
| D7 | `distance_bands`: duplicate index and a stricter unique key on live | No | With G8/G9. |
| D8 | 8 functions differ only in comments or whitespace | No | None. |

## Owner UAT (numbered; step 1 closes the phase)

1. On vamostaxi.site book a trip more than 2 days ahead, continue as a guest, press PAY, pay with card
   4242 4242 4242 4242 (any future date, any CVC). Expected: the Booked page with a reference VT-26-…
   Then tell this session "paid" and the reference; it reads `booking_payments` by status (expected:
   succeeded 13).
2. Open the manage link in the confirmation e-mail → Cancel → confirm. Expected: "This trip will be
   cancelled. You get a full refund; our team sends it."; afterwards the Refund row says "Full refund · sent
   by our team"; Stripe shows no refund yet.
3. dashboard.vamostaxi.site → that booking → Confirm refund. Expected: "Refund issued"; one "Refund issued"
   e-mail; the Stripe sandbox shows one refund. This session then reads `booking_refund_intents` and
   `booking_refunds`.

Steps 2–3 are 20-10's owner step (refund by hand). If they are not done now, they stay on the board as the
owner's step 6 and do not hold Phase 20 open.

## Not verified

- F6, F8, F14, G14, G15, G22 from outside (logic and source checks only, as shipped).
- The 5-press cap per price (needs a real quote and a Turnstile pass), a real pay link (0 active), the two
  e-mail-change mails.
- Schemas other than `public` and `app`; grants held by postgres, service_role and supabase_admin.

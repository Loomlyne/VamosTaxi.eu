---
phase: 20-security-audit-fixup
plan: 09
status: complete
completed: 2026-10-02
written_by: job session docs/phase20-close, 2026-10-02 03:15 (+04)
---

# 20-09 summary: prove the fixes on live and close the 2026-10 check

**Outcome: every Phase 20 fix holds on live, and the owner's 4242 payment went through. Phase 20 is complete.**
Read 2026-10-02 02:30–02:41 (+04) against main `eb9128f3`, Worker `vamos` `ae61d012`, gateway `71a307da`,
database `yaumjzvylngfjhtuffqs`; P6 shipped at 02:58 (Worker `c6a4ecac`, migration `20261007150000`, no Phase 20
function touched), so the Phase 20 bodies, the grants and every HTTP probe were re-read at 03:13 on `c6a4ecac`:
unchanged. Every probe: `20-09-LIVE.md`, section "Close of the 2026-10 check".

- **Owner UAT step 1 (03:09, on Worker `c6a4ecac`):** VT-26-0750 booked on his phone on vamostaxi.site as a guest, paid with 4242:
  booking `confirmed`, payment `succeeded` (amount equals the booking total), confirmation e-mail sent;
  `booking_payments` succeeded 12 → 13.
- **Re-probed with their original proofs:** F3 pay-press limit (per IP: 429 on the 12th POST), batch B1
  (F6, G2, G20, G27, 20-12), refunds by hand (F11: bodies, texts, no refund made yet), batch C1 (F17, G17),
  C2 (F12 confirm screen, F16 dashboard files, /dev headers once), the e-mail change fix, the leftovers
  G7/G10/G11/G12/G28 and G23 (no maps.googleapis.com in the CSP). Batch A (F1, F2, F5, F10, F13) and the
  2026-09-19 regression list still hold.
- **Hosted functions and grants against the migration files:** a from-zero replay of all 127 files compared
  row by row with live. Every Phase 20 function is md5-identical; every function grant, table grant, RLS
  flag, trigger and view is identical. Drift D1–D8 exists, none from Phase 20 (findings below).
- **TEST SECURITY bookings:** none left (VT-26-0745 removed by the hourly clean-up). Nothing for D-37.

## Findings for the controller (not fixed here)

| # | What | Serious | Suggested next step |
|---|---|---|---|
| D1 | `tg_pricing_row_frozen` on live is the first version; migration `20260911000002_live_passenger_extras.sql` was never applied there. The file's version allows add/change/delete of extras with seven fixed codes on a published price-book row, keyed on names. | No (not security; files and live disagree on extras editing) | Owner question: keep live's behaviour (a new migration restores the original body so files match live) or apply the file's behaviour without fixed names. Check with the extras jobs (B2 parts B/C) first. |
| D2 | Three edit-request functions on live lack `#variable_conflict use_column` (and `refund_record` has `numeric` for `numeric(8,2)`) | No | Ride the next migration that touches them: re-create from the file. |
| D3 | `bookings.is_test` not granted to `vamos_guest` on live | No (narrower) | Leave, or align the file; no code reads it as guest. |
| D4 | `distance_rates.airport_start_rappen`, `city_price_rappen` are `integer` on live, `rappen` in files | No | With G8/G9 (drop or fix the band tables). |
| D5 | `rate_version_rules`: kind check missing on live; extra restrictive policy `_staff_gate` on live | No | With G8/G9. |
| D6 | `rate_versions` checks written without `is null or` on live | No (same meaning) | None. |
| D7 | `distance_bands`: duplicate index and a stricter unique key on live | No | With G8/G9. |
| D8 | 8 functions differ only in comments or whitespace | No | None. |

Seen, not Phase 20: payments by a UAE card are stored in AED (Stripe adaptive pricing, session in CHF);
`stripe_events` has 35 rows never marked processed (the second of each completed pair, plus 26 expired), 2
with an error.

## Owner UAT

1. Done 03:09: 4242 payment on vamostaxi.site (VT-26-0750). Passed.
2. Open the manage link in the VT-26-0750 confirmation e-mail → Cancel → confirm. Expected: "This trip will be
   cancelled. You get a full refund; our team sends it."; afterwards the Refund row says "Full refund · sent
   by our team"; Stripe shows no refund yet.
3. dashboard.vamostaxi.site → VT-26-0750 → Confirm refund. Expected: "Refund issued"; one "Refund issued"
   e-mail; the Stripe sandbox shows one refund.

Steps 2–3 are 20-10's owner step (the board's owner step 6, refund by hand) and do not hold Phase 20 open.

## Not verified

- F6, F8, F14, G14, G15, G22 from outside (logic and source checks only, as shipped).
- The 5-press cap per price (needs a real quote and a Turnstile pass), a real pay link (0 active), the two
  e-mail-change mails, a refund by hand.
- Schemas other than `public` and `app`; grants held by postgres, service_role and supabase_admin.

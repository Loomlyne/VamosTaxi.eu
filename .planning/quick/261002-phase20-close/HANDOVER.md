# Hand-over: Phase 20 close (plan 20-09) — planning notes only

**To:** the control session "VamosTaxi - session control" (`local_633b433a-13a1-4f99-bfe8-3d595717a4a1`).
**From:** job session in `.claude/worktrees/phase20-close`, branch `docs/phase20-close`, cut from origin/main
`28634c81`, origin/main merged at `3c50511f` (P6 and its board notes in). Written 2026-10-02 03:16 (+04).
**Final commit:** the one that adds this file. Pushed (branch only, no force). No PR. No deploy. Nothing written on live.

## What this branch carries (planning files only; no code, no migration, no setting)

| File | Change |
|---|---|
| `.planning/phases/20-security-audit-fixup/20-09-LIVE.md` | brought from `origin/gsd/phase-20-security-check` unchanged (commit `9df28fe4`), then the section "Close of the 2026-10 check" added |
| `.planning/phases/20-security-audit-fixup/20-11-TRIAGE-26.2.md`, `20-12-PLAN.md` | brought from the same branch, unchanged (`9df28fe4`) |
| `.planning/phases/20-security-audit-fixup/20-09-SUMMARY.md` | new: Phase 20 complete, findings D1–D8, owner UAT |
| `.planning/phases/20-security-audit-fixup/20-12-SUMMARY.md` | new: 20-12 was shipped 2026-09-30 but had no summary, so GSD counted the phase open (outside 20-09 strictly; from `HANDOVER-20-12.md` and the live read) |
| `.planning/ROADMAP.md` | Phase 20 marked complete in the checklist, the phase section and the progress table (allowed by the controller for this job) |

GSD after the change: `init.execute-phase 20` gives 11 plans, 0 incomplete; `roadmap.analyze` gives current
phase none, next phase 28.

## Result

**Phase 20 holds on live and is complete.**

- Every shipped fix re-probed with its original proof at 02:39 on Worker `ae61d012`, and the whole probe
  script again at 03:13 on Worker `c6a4ecac` (P6 shipped at 02:58 in between): identical results. F3, B1,
  refunds by hand (texts and bodies; no refund made yet), C1, C2 (F12, F16, /dev headers once), e-mail change,
  G7/G10/G11/G12/G28, G23, batch A and the 2026-09-19 list.
- Hosted functions and grants against a from-zero replay of all 127 migration files (own stack
  `vamos-taxi-p20c`, port 63122, stopped and removed): every Phase 20 function md5-identical (re-read after
  P6: 22 of 22 unchanged); every function grant, table grant, RLS flag, trigger and view identical.
- TEST SECURITY bookings: none left. Nothing for the owner's D-37 script.
- Owner UAT step 1 passed: VT-26-0750, 4242 on his phone as a guest, 03:09; `booking_payments` succeeded
  12 → 13, booking `confirmed`, amount equals the total, confirmation e-mail sent.

## Findings for you (not fixed; none is a Phase 20 regression, none serious)

| # | Finding | Suggested |
|---|---|---|
| D1 | `20260911000002_live_passenger_extras.sql` was never applied on live (not in the live migration list): live `tg_pricing_row_frozen` is the first version. The file's version allows add/change/delete of extras with seven fixed codes on a published price-book row, keyed on names. Files and live disagree; tests run against the file. | One owner question, then a migration that makes files match the chosen behaviour (no fixed names). Check with the extras jobs (B2 parts B/C). |
| D2 | `booking_edit_clone_quote_snapshot`, `booking_edit_mint_extra_snapshot`, `booking_edit_refund_record` on live lack `#variable_conflict use_column` (`refund_record`: `numeric` instead of `numeric(8,2)`). Same behaviour today. | Re-create from the file with the next migration that touches them. |
| D3 | `bookings.is_test` column grant: live `authenticated` only; files also `vamos_guest`. Narrower on live; no guest code reads it. | Leave or align the file. |
| D4 | `distance_rates.airport_start_rappen`, `city_price_rappen`: `integer` on live, `rappen` in files. | With G8/G9. |
| D5 | `rate_version_rules`: no `kind` check on live; one extra restrictive policy `rate_version_rules_staff_gate` on live. | With G8/G9. |
| D6 | `rate_versions` checks written without `is null or` on live (same meaning). | None. |
| D7 | `distance_bands`: duplicate index and a stricter unique key on live. | With G8/G9. |
| D8 | 8 functions differ only in comments or whitespace. | None. |

Seen, not Phase 20: payments by a UAE card are stored with `charged_currency = AED`
(`fx_source = stripe_adaptive_pricing`; the session is CHF), same as 09-29/09-30. `stripe_events` has 35
rows never marked processed (each payment leaves the Stripe event and the return-route record; one of the
pair stays unprocessed; plus 26 expired), 2 with an error.

## Checks

This branch changes planning files only, so the code gates were not run (nothing they check changed).
Merge with origin/main `3c50511f`: no conflict. Live reads: see `20-09-LIVE.md`.

## Not verified

- F6, F8, F14, G14, G15, G22 from outside (logic and source checks only, as shipped).
- The 5-press cap per price, a real pay link (0 active), the two e-mail-change mails, a refund by hand.
- The full schema comparison was not re-run after P6 (only the Phase 20 bodies, the G10–G12 grants and the HTTP probes).
- Schemas other than `public` and `app`; grants held by postgres, service_role and supabase_admin.

## Owner UAT

1. Done 03:09: 4242 payment on vamostaxi.site, VT-26-0750. Passed.
2. Open the manage link in the VT-26-0750 confirmation e-mail → Cancel → confirm. Expected: "This trip will be
   cancelled. You get a full refund; our team sends it."; then the Refund row says "Full refund · sent by our
   team"; Stripe shows no refund yet.
3. dashboard.vamostaxi.site → VT-26-0750 → Confirm refund. Expected: "Refund issued"; one "Refund issued"
   e-mail; the Stripe sandbox shows one refund.

Steps 2–3 are the board's owner step 6 (refund by hand, 20-10); they do not hold Phase 20 open.

## For the controller

- Land the branch as a planning note (no code, no deploy). Then remove the worktree
  `.claude/worktrees/phase20-close` and the branch after it is on GitHub/main. No local database is left.
- `gsd/phase-20-security-check`: its three notes are now on this branch unchanged, but it still differs from
  main: it holds the signed `20-10-PLAN.md` (main has the "DRAFT — not signed" version, as `20-10-SUMMARY.md`
  notes) and older code files main has since removed (Lenis, old ops actions). Not brought here (outside this
  job's list). Bring the signed plan to main or tag `archive/*` before any delete.
- The board's Phase 20 lines and lane R can say "Phase 20 complete 2026-10-02".

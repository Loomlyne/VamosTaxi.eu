---
phase: 19
slug: v1-production-close-out-leftover-live-gates-and-10k-booking
status: draft
rewritten: 2026-09-29
---

# Phase 19 — UI contract (rewritten for the 26.3 checkout)

One visible change only: the **busy-and-retry state on PAY** on `/checkout` (D-09). Everything
else on home, `/checkout`, the loading screen and "Booked" stays as 26.3 shipped it.

## Surface

| Screen | Route | What 19 changes |
|---|---|---|
| Home box | `/` | Nothing |
| Checkout | `/checkout` | PAY gets a busy state and an out-of-retries state |
| Payment | Stripe hosted page | Nothing (not ours) |
| Loading / Booked | `/checkout/return`, `/confirmation/[ref]` | Nothing |
| Dashboard | `dashboard.vamostaxi.site` | Nothing |

## States of PAY

| State | What the customer sees | Rule |
|---|---|---|
| Default | PAY, as today | — |
| Opening payment | "Opening payment" (26.3) | — |
| Busy | Button stays pressed and disabled, label "Busy — trying again"; everything typed stays; no scroll jump | Shown when the server answers 429 or 503 with a retry hint; retries with back-off |
| Out of retries | Inline error under PAY: "We are very busy. Try again in a minute, or write to info@vamostaxi.site." + PAY enabled again | Uses the existing checkout error slot; `--vt-danger` text; no new component |

Copy above is the English source. It is added to the dictionary in de, fr and ar in the same
pass (Swiss German, "ss"). The owner may change the wording at the plan gate.

## Design laws

Tokens only (`--vt-*`). No glow, no tinted yellow, no new colour, no new component when the
existing checkout error and Button loading state exist. Lucide via `Icon` only if an icon is
needed (none planned). Arabic RTL with logical properties. Checked at 1440, 1024, 768 and 390,
nothing scrolls sideways at 390, PAY keeps its 54 px height.

---
phase: 07-checkout-payment
verified: 2026-09-10T16:27:00Z
status: passed
source: 07-UAT.md
---

# Phase 7 verification

Owner UAT on https://vamostaxi.site. Tests 1–9 passed.

- Dummy-card pay confirms via webhook. No auto-dispatch.
- VAT 8.1% on fare + extras, on top of subtotal.
- Coupon line shows percent or fixed off. Apply/remove does not stack.
- Signed-in account click on a paid ref opens the ticket (`VT-26-0720`).

Live Worker already serving this. This PR is the GitHub SHA.

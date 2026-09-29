# Phase closure, 2026-09-29

Owner decisions, given one by one through the question form in the control session.
Reason: from Phase 26 on the product changed a lot (26.1 payment and pricing, 26.3 booking
flow rebuild with Stripe's hosted page). Old open phases must not be picked up by a session
that reads the ROADMAP table.

**This file wins over the ROADMAP progress table and the phase checklist until the 26.3 ship
writes these states into `ROADMAP.md`.** The control session did not edit `ROADMAP.md` or
`STATE.md` on main, because the 26.3 branch already rewrote them.

A session that runs `/gsd-progress` and is offered a phase listed here as closed, replaced,
dropped or parked: do not start it. Tell the owner and point to this file.

## Closed

| Phase | Name | State | Note |
|---|---|---|---|
| 1 to 15 | Foundation to support tickets | Complete | Loose plans inside 4, 5 and 11 are listed below |
| 16 | Staging MX and end-to-end UAT | Complete | Built, `16-UAT.md` complete, 10 of 10 passed. The table said "not started"; that was stale. |
| 17 | Ops chauffeur profile, shift roster, two-driver vehicles | Closed, feature removed | Owner: "we deleted that part". If it is wanted later it gets a fresh phase. `17-UAT.md` stays as history (partial, some steps failed). |
| 18 | OPS Pricing source of truth | Complete | |
| 26 | Legal gate | Complete | On main since 2026-09-24 (b2af7ce8). Pixel stays off. |

## Replaced, do not build

| Phase | Name | Replaced by |
|---|---|---|
| 21 | Charge gate, visible refusal, payable intent | 26.1 (live). Built but never fully tested; its client code is rebuilt by 26.3. |
| 22 | Card confirm and thank-you webhook wait | 26.3. Payment is Stripe's hosted page; there is no card form on vamostaxi.site. |
| 23 | Wallets and Dashboard methods | 26.3. Stripe's page shows card, Apple Pay, Google Pay and TWINT. |
| 24 | Dual-payer, pay-link, mail split | 26.1 for the server. 26.3 removes the pay-link option from checkout. |
| 25 | /bookings unpaid, TEST UAT, secret-swap design | 26.1 and 26.3. |
| 04.3 | Blended distance bands (plan 04.3-01) | The owner formula: start price + price per km × km, then airport fee, ticked surcharges, route amount, VAT, coupon. No bands. |

## Dropped

| Plan | What | Note |
|---|---|---|
| 05-19 | "Become a partner" page | The page is not on live (404) and its table was removed on 2026-09-04 (`drop_partner_applications`). A fresh plan if it is wanted later. |

## Parked

| Phase or plan | What | When it comes back | Note |
|---|---|---|---|
| 19 | V1 close-out and the 10,000-booking surge proof | Before real launch, after 26.3 is live | **Must be rewritten first.** Its three plans were written for the old checkout. Owner: update it to the new flow and run the test against all the new changes. Needs a paid Cloudflare capacity step that only the owner takes. |
| 20 | Security audit fix-up | After 26.3 (and 26.0) | **Kept open on purpose.** Nothing is left to build from the 2026-09-19 list: 52 items fixed and live, 7 accepted with a written reason, K10 (staff second step) solved by 26.1 (code asked once an authenticator app is enrolled), K11 (leaked-password check) on since the move to Supabase Pro on 2026-09-28. Owner wants a new security check of the changed app, and the phase updated to match it. Plans 20-04 and 20-05 as written are out of date. |
| 05-24 | Checks that need a person: sign-up e-mails, contact form | After 26.3 | |
| 05-28 | Four owner comments on vamostaxi.site/contact | After 26.3 | The always-visible Turnstile "Success" box, the resize corner on the message field, social controls, contact mail delivery. |
| 26.0 | Main green | After 26.3 is live | Owner rulings and open items: `.planning/phases/26.0-main-green/26.0-OPEN-ITEMS.md`. The refund fix in PR #63 rides with it. PR #62 stays open. #63 and #64 were closed on 2026-09-29 with a comment and an archive tag. |
| 26.2 | Codebase audit, bug fix and simplify | After 26.0 | PR #61 was closed unmerged; 26.2 gets a fresh plan. |

## Owner-held, not a gap

| Plan | What |
|---|---|
| 11-12 | The owner approves the numbers on the pricing page and clicks Publish. His step, in his time. The agent never clicks Publish and does not raise it. |

## Shipped, owner tests moved

| Phase | State |
|---|---|
| 26.1 | Shipped 2026-09-28 (cff97a0e), live. UAT step 1 failed on the old checkout client and is success criterion 1 of 26.3. The checkout-page steps are replaced by the 26.3 UAT. Plan 26.1-28 (reconcile old test bookings) is moot: the owner deletes all test bookings after 26.3 is live (26.3 D-37). The dashboard tests (sign-in methods, refunds, deleting `mahaha` and First) move to the end of the 26.3 UAT. |

## Order from here

26.3 (shipped 2026-09-29, af93fc8e) → 26.0 → 26.2 → 20 → 19 → 27 to 29 (pixel stays off until the
owner supplies the legal lines in four languages). Order of 20 before 19 signed by the owner on
2026-09-29. Phase 26.4 (owner comments 4 to 6 after the 26.3 ship) and the small fixes after the
ship run beside 26.0.

## Not closed by this file

Branches, stashes, worktrees and the open PR #62 are untouched (#63 and #64 closed with archive tags). Removing any of
them needs the owner's yes and proof that the content is safe elsewhere.

## Folders removed on 2026-09-29

Owner decision: the folders of three closed items were deleted from `.planning/phases`, so
no session reads their plans. Git keeps them; the last commit that has them is `37e55d26`.

| Folder | Bring it back with |
|---|---|
| `17-ops-chauffeur-profile-shift-roster-two-driver-vehicles` | `git checkout 37e55d26 -- .planning/phases/17-ops-chauffeur-profile-shift-roster-two-driver-vehicles` |
| `21-charge-gate-visible-refusal-payable-intent` | `git checkout 37e55d26 -- .planning/phases/21-charge-gate-visible-refusal-payable-intent` |
| `04.3-blended-distance-bands` | `git checkout 37e55d26 -- .planning/phases/04.3-blended-distance-bands` |

Phases 22 to 25 never had a folder. Their text in `ROADMAP.md`, and the text of 17, 21 and
04.3, is removed at the 26.3 ship, because the 26.3 branch rewrote that file.

## Rewritten and signed on 2026-09-29

| Phase | State |
|---|---|
| 19 | Rewritten for the 26.3 checkout, plans 19-01 to 19-05, signed. Waits for 20 and for the owner's paid steps. |
| 20 | New security check, plans 20-06 to 20-09, signed. 20-04 and 20-05 superseded. |
| 26.2 | Fresh plan, 26.2-01 to 26.2-12, signed. Starts after 26.0 has landed. |

The `ROADMAP.md` lines for these are listed in
`.planning/phases/26.2-codebase-audit-bug-fix-simplify/PLANNING-REWRITE-HANDOVER-2026-09-29.md`.
They are applied when the 26.4 branch, which also edits `ROADMAP.md`, has landed.

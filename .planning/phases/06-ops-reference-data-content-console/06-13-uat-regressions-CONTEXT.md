# Phase 06 — UAT regression correction context

**Captured:** 2026-09-01
**Scope:** Correct only the UAT failures from the 11-item dashboard comment pack. No checkout, dispatch, pricing, DNS, legal, or new dashboard capability work.

## Locked decisions

1. **Dashboard navigation transition** — hash-tab changes must have no page-cover overlay at all: neither yellow nor white. Keep the in-place transition very fast and smooth.
2. **Fleet hierarchy** — restore the prior Fleet hierarchy exactly as it appeared before the comment-pack change.
3. **Morning digest** — include guest bookings correctly. The digest must be genuinely branded and organized, not a raw operational dump.
4. **Profile avatar** — the profile photo must reliably persist and restore after save/reload.
5. **Currency control** — the CHF control must be visibly full width.
6–10. **Accepted in UAT** — published languages, Stripe supported-payment-method row, accepted-invitation staff access, in-field password eye, and real passkey sign-in/enrolment.
11. **Delete profile** — remove the remaining delete-profile UI/entry point completely.

## Verification required

- Live staging visual check for nav behavior, Fleet hierarchy, full-width CHF control, profile avatar persistence, and no delete-profile affordance.
- Digest test covers guest booking inclusion and branded/structured rendered content without exposing recipient or booking details in logs.
- Run focused dashboard/profile/digest tests plus `git diff --check`.
- Deploy to `vamos-web-staging` only and re-run staging fingerprints before UAT.

## Boundaries

- Preserve the DC mock as the dashboard product.
- No fake sends: digest delivery uses only configured delivery mechanisms.
- No pricing, payment charge/setup, driver dispatch, public-funnel, DNS, or legal changes.

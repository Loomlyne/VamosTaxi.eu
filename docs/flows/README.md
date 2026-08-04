# Page Flows

Per-page flow specs for Vamos Taxi V1, one file per page, matching the granularity of the source Figma board ("Vamos Taxi — Customer Site Map and Booking Flow"). Each file covers: purpose, entry points, step-by-step flow, data captured, exit points, edge cases, constraints (traced back to `docs/DECISIONS.md` / `docs/SCOPE-OF-WORK.md` / `docs/PROJECT-BRIEF.md`), and open questions still blocking a build-ready spec.

Intended use: hand the relevant file into a **Claude Design** session (`docs/BUILD-PLAYBOOK.md` tool matrix) when freezing that screen, or into **Claude Code** when implementing the slice.

## Already built (Claude Design)

- Home
- Content and Legal (About, Contact, Terms, Privacy, Imprint, Cancellation Policy)

## Booking flow

1. [booking-details-extras.md](booking-details-extras.md) — passenger info, extras, auth fork, coupon
2. [booking-checkout.md](booking-checkout.md) — Stripe checkout, payment fork, retry/expiry
3. [booking-confirmation.md](booking-confirmation.md) — voucher, guest claim-into-account

## Account

4. [account-sign-in-sign-up.md](account-sign-in-sign-up.md)
5. [account-profile.md](account-profile.md)
6. [account-booking-history.md](account-booking-history.md)
7. [account-booking-detail.md](account-booking-detail.md)
8. [account-manage-cancel.md](account-manage-cancel.md)

## Services

9. [services-airport-transfers.md](services-airport-transfers.md)
10. [services-city-to-city.md](services-city-to-city.md)
11. [services-corporate-transfers.md](services-corporate-transfers.md)
12. [services-chauffeur-hourly.md](services-chauffeur-hourly.md) — **conditional**, V1 inclusion unconfirmed
13. [services-fixed-route-template.md](services-fixed-route-template.md) — one template, many instances, blocked on client route list

## Not covered here

Admin/ops dashboard pages (Overview, Bookings, Fleet, Customers, Pricing, Settings — Figma board, left cluster) are dashboard-CRUD screens, not customer flows, and follow a different design cadence (`docs/BUILD-PLAYBOOK.md` M003). Ask for a separate pass if you want the same treatment for those.

## Open questions surfaced while writing these

- Auth method: password vs magic link vs both (touches sign-in/up and details-extras).
- Whether a fresh sign-up auto-attaches prior guest bookings by email match, or only the emailed claim link does.
- Self-service booking **modify** (reschedule) scope vs cancel-only.
- Auto-refund on cancel vs admin-reviewed refund.
- Chauffeur-by-the-hour V1 inclusion, and its hourly pricing model (not in the current data model).
- Corporate transfers: marketing-only page vs needing account/invoice fields.

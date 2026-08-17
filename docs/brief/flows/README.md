# Page Flows

Per-page flow specs for Vamos Taxi V1, one file per page. Each file covers: purpose, entry points, step-by-step flow, data captured, exit points, edge cases, constraints (traced back to `docs/DECISIONS.md` / `docs/SCOPE-OF-WORK.md` / `docs/PROJECT-BRIEF.md`), and open questions still blocking a build-ready spec.

Intended use: hand the relevant file into a **Claude Design** session (`docs/BUILD-PLAYBOOK.md` tool matrix) when freezing that screen, or into **Claude Code** when implementing the slice.

## Already built (Claude Design, confirmed 2026-08-04)

- Home
- Booking checkout ([booking-checkout.md](booking-checkout.md))
- Booking confirmation ([booking-confirmation.md](booking-confirmation.md))
- About, Contact, FAQ
- Terms, Privacy, Cookies, Cancellation Policy, Imprint

## Not built — next up

- [manage-a-booking.md](manage-a-booking.md) — public, lookup-gated booking self-service. Overlaps with the Account section below; see status notes on both.
- [become-a-partner.md](become-a-partner.md) — driver/fleet-owner lead-gen form. **Conditional** — blocked on legal-checklist item A12 (build vs unlink).

## Booking flow

1. [booking-details-extras.md](booking-details-extras.md) — passenger info, extras, auth fork, coupon. *(Not confirmed built or not — check whether this is still a separate step ahead of the built checkout, or got folded into it.)*
2. [booking-checkout.md](booking-checkout.md) — built
3. [booking-confirmation.md](booking-confirmation.md) — built

## Account

**Status (2026-08-04): whole section is undecided** — may ship alongside [manage-a-booking.md](manage-a-booking.md), may be superseded by it. Don't build past a wireframe until resolved.

4. [account-sign-in-sign-up.md](account-sign-in-sign-up.md)
5. [account-profile.md](account-profile.md)
6. [account-booking-history.md](account-booking-history.md)
7. [account-booking-detail.md](account-booking-detail.md) — overlaps with manage-a-booking.md
8. [account-manage-cancel.md](account-manage-cancel.md) — overlaps with manage-a-booking.md

## Services

9. [services-airport-transfers.md](services-airport-transfers.md) — still queued
10. [services-city-to-city.md](services-city-to-city.md) — still queued
11. [services-corporate-transfers.md](services-corporate-transfers.md) — still queued; marketing-only for now, real B2B billing wanted eventually, shape undecided
12. [services-chauffeur-hourly.md](services-chauffeur-hourly.md) — still queued; proceeding, pricing model pending from client
13. [services-fixed-route-template.md](services-fixed-route-template.md) — still queued; one template, many instances, blocked on client route list

## Not covered here

Admin/ops dashboard pages (Overview, Bookings, Fleet, Customers, Pricing, Settings — Figma board, left cluster) are dashboard-CRUD screens, not customer flows, and follow a different design cadence (`docs/BUILD-PLAYBOOK.md` M003). Ask for a separate pass if you want the same treatment for those.

## Decisions locked this session (2026-08-04)

- **Auth method:** both email+password and magic link, user's choice.
- **Guest booking auto-attach:** a fresh signup auto-attaches prior guest bookings by verified email match (in addition to the explicit claim link).
- **Refund execution:** always admin-reviewed. Self-serve cancel computes the entitled refund share by policy and flags it; a human executes the actual Stripe refund from the admin dashboard. No auto-refund.
- **Services pages:** still queued as the next Claude Design batch after Manage-a-booking / Become-a-partner.

## Reference

- The **legal checklist** (items A2, A12, A13, and presumably more) referenced by the Manage-a-booking and Become-a-partner specs lives in **Claude Design's workspace, not this git repo**. It's the source for exact refund-share percentages, the modification-deadline threshold, and the become-a-partner build/unlink call. Ask for the relevant items when a doc below needs them — don't invent numbers.

## Open questions surfaced, still unresolved

- **Account section vs. Manage-a-booking:** does the full authenticated Account area (sign-in/up, profile, history) still ship, or does the public Manage-a-booking page replace it? Undecided.
- **Modification-deadline threshold** and **refund-share tiers/percentages** (checklist A2/A13) — pending, source is the external legal checklist above.
- **Chauffeur-by-the-hour pricing model** — client signaled per-vehicle rates, possibly multi-currency, possibly per-place; exact calculator pending. The multi-currency signal specifically may ripple beyond this one page — `docs/DECISIONS.md` currently treats CHF as the platform's sole currency (recommended, not locked). Worth flagging to whoever owns that file if the client's input confirms multiple currencies.
- **Corporate Transfers B2B billing shape** — Stripe Invoicing/net-terms vs. company account with multiple bookers vs. both; client wants "real" billing eventually but hasn't picked a shape. Likely SOW change-order territory once decided.
- **Become-a-partner build vs. unlink** — checklist item A12.
- Whether [booking-details-extras.md](booking-details-extras.md) is still a distinct step before the now-built checkout, or got merged into it during the Claude Design build.

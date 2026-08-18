# ADR-006 — Return trips are one booking with two legs, not a `return_at` column

**Status:** Accepted, 2026-08-19
**Phase:** 2 (schema). This is the schema decision Phase 2 depends on.

## Context

The booking widget carries a return tab, and the shape is currently modelled in the mocks as
a single `bookings` row carrying a `return_at` column — one commercial booking, one implicit
extra timestamp for the trip back.

## Decision

**One booking, two legs.**

A `bookings` row stays the commercial record: customer, payment, price, reference, refund. A
new `booking_legs` table carries one row for a one-way trip or two rows for a return, each leg
independently holding its own direction, pickup, dropoff, `scheduled_at`, flight, vehicle
class, chauffeur and status.

The argument, not merely the shape: a return leg needs its own driver, because the outbound and
return trips are frequently days apart and there is no reason the same driver is available for
both. It needs its own vehicle for the same reason. It needs its own scheduled pickup time,
because a return is booked against a different flight or a different plan than the outbound
leg. It needs its own status, because a customer can cancel or reschedule only the return leg
while the outbound leg has already happened, and it needs its own flight number, because an
inbound and outbound flight are two different bookings with the airline. A single `return_at`
column cannot carry any of that — it is one timestamp, not a second dispatchable unit — and it
breaks the moment dispatch tries to assign a different driver to the return leg, or the
customer wants to cancel only the way back. The alternative of modelling a return as two
separate one-way `bookings` rows was considered and rejected: it would hand the customer two
references and two confirmation emails for what they experience and paid for as one purchase,
which breaks "one booking, one fixed price" — the product's core promise, stated in
`.claude/CLAUDE.md`'s Core Value line.

**Stated explicitly, because it is easy to conflate with the schema question and it is not
decided here:** a discounted round trip is a pricing rule that sits on top of either model —
it changes what the price calculation does with two legs' worth of fare, not how the legs are
stored. It is not decided by this ADR. No discount percentage is named here; that number
belongs to the CHF matrix and stays open under Q11.

## Consequences

**Good.** Dispatch can assign the outbound and return legs to different drivers and vehicles
without any schema contortion. A customer can cancel or reschedule one leg through the same
refund and status machinery every other booking action already uses, rather than a special
case bolted onto a single-row model. The product's "one booking, one fixed price" promise
survives a return trip exactly as it does a one-way trip.

**Cost.** Every piece of the system that currently assumes one leg per booking now has to read
through `booking_legs` instead of the `bookings` row directly — the ops board, the dispatch
assignment screen, confirmation and reminder emails, the manage-booking view. That is real
surface area, but it is surface area Phase 2 pays once, at the schema's foundation, rather than
retrofitting later.

**Cost of being wrong.** This is the most expensive of the eight decisions in this set to
reverse. Every ops screen that displays or assigns a booking, every email template that
renders trip details, and the refund path all key off this shape once Phase 2 builds it.
Changing it after launch means migrating live bookings mid-flight — bookings with drivers
already assigned, payments already captured, some possibly already partially completed — which
is a materially harder migration than adding a column would be. That is precisely why this is
settled in Phase 2, before any of that downstream surface exists to migrate, rather than
discovered as a Phase 9 rewrite.

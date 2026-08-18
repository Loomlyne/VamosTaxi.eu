# ADR-003 — Booking reference format: `VT-YY-####`

**Status:** Accepted, 2026-08-19
**Phase:** 2 (the schema seed)

## Context

The mocks use `VT-4821`-style references throughout — dispatch board, confirmation emails,
manage-booking lookup, ops search. `cleanBooking` at `app/vamos-ops-data.js:202` generates
`'VT-' + Math.floor(1000 + Math.random() * 8999)`: a random four-digit suffix drawn fresh on
every booking, collision-prone by construction rather than merely by exhaustion — nothing
checks the generated number against references already in use, and the space is only 9000
values wide. `CLAUDE.md` already cites `VT-4821` as the canonical example of a code that must
carry `.vt-dir-keep` so it stays left-to-right inside Arabic text.

## Decision

**`VT-YY-####`** — a two-digit year prefix, then four digits, e.g. `VT-26-4821`.

Digits stay rather than moving to base32 or an alphanumeric code, because dispatchers read
references aloud to customers and drivers on the phone, and a mixed-case alphanumeric string
is materially worse for that than a run of spoken digits. The year prefix resets the numeric
space annually, so the ceiling becomes 9999 bookings per calendar year rather than 9999
bookings ever — comfortably above a Zurich transfer operation's near-term volume — and the
format is extendable to five digits within a year without breaking the shape if volume ever
demands it. A side effect that costs nothing: the reference is self-dating in ops search, so a
dispatcher or support agent can tell a booking's year from the reference alone.

## Consequences

**Good.** The generator stops being collision-prone by construction — the year segment
partitions the numeric space so a random four-digit collision only has to be checked against
the current year's bookings, not the whole table's history. References stay short enough to
read aloud and stay self-dating for free.

**Cost.** Every place a `VT-####` reference is displayed, generated or pattern-matched moves
to the new shape in the same pass — confirmation emails, the manage-booking form's reference
field, ops search, support scripts. The mock's random-suffix generator (`cleanBooking` at
`app/vamos-ops-data.js:202`) is replaced outright, not extended: the new generator does not
take the old function's last four random digits and merely prefix a year onto them, because
that would still carry the same construction-level collision risk this ADR exists to fix.

**Constraint this format depends on, stated as a consequence rather than a footnote:**
sequential or near-sequential references are enumerable — a dispatcher or an attacker who
knows today's date can guess a large fraction of the valid reference space for that year. The
manage-booking link therefore must stay a signed token and must never become a lookup by
reference alone. That property already exists in the design; this ADR records that the
reference format's safety depends on it staying that way.

References stay `.vt-dir-keep` in Arabic under the new format exactly as they do under the
old one, per `CLAUDE.md`'s existing rule.

**Cost of being wrong.** This is the highest-friction of the cheap, engineering-only decisions
in this set to reverse. Changing the format after launch leaves two formats permanently in
circulation — in emails already sent and sitting in customer inboxes, in support threads that
quote a reference back, in ops search history, and in the manage-booking lookup's stored
tokens. There is no clean migration that rewrites a reference a customer has already been
told and may have written down. That is why it is settled now, before Phase 2 seeds the first
row, rather than left open until it is discovered as a live production problem.

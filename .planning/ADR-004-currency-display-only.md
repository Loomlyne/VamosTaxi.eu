# ADR-004 — Currency is display-only; CHF is the one priced currency

**Status:** Partially superseded 2026-08-22 by ADR-014 §1.
**Still binding:** one CHF amount in the schema — no per-currency price lists.
**Superseded:** “the switch changes the mark, never the number” and “Stripe always settles CHF”. The owner chose Stripe FX conversion on the hero and checkout, and the **charge currency is the customer’s choice** (changeable again on Stripe Checkout).
**Phase:** 4 (pricing engine)
**Superseded by:** `.planning/ADR-014-owner-sitting-2026-08-22.md`

## Context

`app/vamos-ops-data.js` stores a separate figure per currency via `moneySet()` for fixed
routes, per-km rates and surcharges, and its inline comment claims dispatch can genuinely
price a route differently in EUR than in CHF — four maintained price lists per priceable
thing (CHF, EUR, USD, AED). `VamosLocale.money()` does the structural opposite: it swaps the
currency mark and never touches the number, so switching the currency selector on any page
today changes only which symbol is shown, not what is charged. `CLAUDE.md` states this as a
binding platform rule, not a preference: "the currency switch changes the mark, never the
number." Stripe, as fixed by `HANDOFF-CLAUDE-CODE.md` §3, settles in CHF.

## Decision

**Display-only. CHF is the one priced currency in the schema.**

`CLAUDE.md` is binding and already says this is how the product behaves; Stripe settles CHF
regardless of what the customer sees on screen, which makes every other currency
presentational by construction rather than by choice; and four maintained price lists are four
things that can silently drift out of sync with each other the moment the real CHF matrix
lands and nobody remembers to update the other three. The mock's `moneySet()` comment
describing genuine per-currency dispatch pricing does not survive the port.

**Schema consequence, stated concretely because Phase 4 builds directly from this:** one CHF
amount per rate, per route and per surcharge — no per-currency columns anywhere in the pricing
tables. The port drops `moneySet`'s extra currency slots rather than mirroring them into the
schema as unused or display-derived columns.

## Consequences

**Good.** One number to get right per priceable thing instead of four. The pricing engine,
the audit trail on price changes, and the ops Pricing screen all reason about a single CHF
figure, which is also the number Stripe actually charges — there is no class of bug where the
displayed currency and the charged currency disagree about the amount, because only one amount
exists.

**Cost.** Stated plainly and near the top of this section, not buried at the end: showing a
EUR or AED mark next to a CHF-derived number while the customer is in fact charged CHF is
arguably misleading if checkout does not say so explicitly. This is a requirement on the
checkout screen — the charge currency must be stated in words, not only implied by the mark
next to the total — and it is flagged here as a requirement rather than decided here; this ADR
does not write that copy or decide its wording.

**Cost of being wrong.** If the business ever genuinely needs EUR pricing — a real EUR rate
card independently maintained, not a converted display of the CHF figure — that is an additive
migration: a `prices` table keyed by currency, added when the need is real. Building four
price lists now on the chance that need arrives, and then collapsing three of them back down
once it is confirmed CHF was always the only priced currency, throws real work away for
nothing. The cheap direction — one currency now, add a table later if proven necessary — is
the one this ADR takes.

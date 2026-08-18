# ADR-008 — Recorded scope decisions: corporate invoicing and review import

**Status:** Accepted, 2026-08-19
**Phase:** 2 (schema — corporate customer type) and post-launch (review import, tracked
LATER-02)

Both items below are being recorded here, not decided here — the scope call was already
implicit in what V1 does and does not build, and this ADR exists to make that explicit and
give it an answer line, not to argue a new position.

## Context

**Q17, corporate pay-by-invoice.** `docs/MISSING-FEATURES.md` already marks this 🟡 on
checkout and ⚪ for corporate accounts — partially specified, not committed. Yet
`app/vamos-ops-data.js:328` seeds `invoice: true` in the SETTINGS singleton, and the customers
fixture carries `type: 'corporate'` entries with a note at `:217` reading "Invoiced monthly" —
the mock data implies a working invoicing feature that nothing in the committed scope actually
builds.

**Q26, review import.** `app/vamos-reviews.js` carries a `source` field distinguishing Google,
Tripadvisor and Trustpilot reviews from ones entered manually. Each of those three imports
needs that platform's own API access and per-platform onboarding — credentials, review
scraping or API integration, ongoing sync — none of which has launch-blocking value.

## Decision

**Q17 — out of V1, hidden, kept in planning.** The pay-by-invoice flag ships `false` in
production regardless of what the mock seeds, and the ops surface hides the invoice-payment
option entirely rather than showing a disabled control. The `corporate` customer type stays in
the schema, because it is a customer attribute — who the customer is — not a payment feature;
removing it would also remove the ability to record which customers are corporate accounts for
non-payment reasons (reporting, contact handling), which is not what this decision is scoping
out.

**Q26 — post-launch, tracked as LATER-02.** The `source` field on a review record stays in the
schema — it costs nothing to keep and the manual review-entry path already writes it — but no
platform import is built for launch.

## Consequences

**Good.** Neither decision blocks or reshapes anything Phase 2 or later phases build. The
corporate customer type and the review source field are cheap to carry forward exactly as they
already exist in the mock schema.

**Cost.** The mock's SETTINGS singleton and customer fixtures currently imply a feature — real
working invoicing — that the production build will not ship at launch. That is a fixture
correction owed to the mock data, not a schema or scope problem: `invoice: true` should read
`false` in the fixture the moment this is acted on, so the mock stops asserting a capability
production does not have.

**Cost of being wrong, stated once for both.** Near zero in either direction. Both features are
additive if the business wants them post-launch — invoicing as a payment method addition,
review import as an integration addition — and neither constrains anything Phase 2 or Phase 4
builds now. The only real cost of the current state is that the mock data promises a feature
the V1 build does not ship, which is a fixture correction, not a migration, and does not
warrant delaying either phase to fix pre-emptively.

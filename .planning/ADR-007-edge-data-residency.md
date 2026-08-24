# ADR-007 — Proposal: pin data-touching routes near Frankfurt, leave marketing routes at the edge

**Amended 2026-08-23 (D-37):** Supabase project `yaumjzvylngfjhtuffqs` is in Central Europe
(Zurich); every "Frankfurt" below reads "Zurich". Lane 7 of 02-RESEARCH.md also records that
Smart Placement is a latency optimiser, not a residency control — the revision itself is Phase
10 work.

**Amended 2026-08-25 (Phase 3 D-22/D-24, plan 03-03):** Two further corrections to this
proposal's mechanism, not to the region (already amended above) and not a second pass at the
Frankfurt→Zurich fix, which Phase 2 D-37 already landed here and in `PROJECT.md`:

- **Placement Hints, not Smart Placement.** This ADR's "Decision" section below proposes Smart
  Placement (`"placement": { "mode": "smart" }`) for the data-touching routes. Phase 3 chooses
  **Placement Hints** instead — `"placement": { "region": "aws:eu-central-2" }` inside each
  named `env.*` block in `apps/web/wrangler.jsonc` — because Smart Placement learns over
  traffic which of *several* candidate backends is fastest, and this platform has exactly
  **one** single-homed database: there is no ambiguity for the learner to resolve, and Smart
  Placement's up-to-15-minute warm-up buys nothing a deterministic hint does not already give
  from the first deploy. This corrects the "Decision" section's mechanism; the underlying
  recommendation (pin the data-touching routes, leave marketing routes at the edge) is
  unaffected.
- **Placement pins fetch handlers only.** Neither Smart Placement nor a Placement Hint places
  `scheduled` (Cron) or `queue` (Queues consumer) handlers — Cloudflare's own placement
  documentation states the mechanism "only affects fetch event handlers." Phase 9's reminder
  emails and no-show sweep, and Phase 7's Stripe webhook fan-out, are `scheduled`/`queue` on
  the same Worker and are **not** pinned by anything this ADR can configure. This narrows what
  this ADR can promise about where passenger data is processed: the pinning proposal below
  covers fetch-triggered booking/account/ops routes, not the Cron/Queue paths that also touch
  identity-scoped data via `withIdentity`. Whether those paths need a separate Cloudflare
  Regional Services answer is carried forward as open, not resolved here.

The counsel question below — whether transient processing at a Cloudflare point of presence is
a "transfer" under nFADP/GDPR — is untouched by either correction and stays open.

**Status:** Proposed, pending counsel, 2026-08-19
**Phase:** 8 (ops hardening), noting that `.planning/STATE.md` requires this resolved before
Phase 10

## Context

Supabase is pinned to eu-central (Frankfurt) per `.planning/PROJECT.md`'s stated data
residency constraint — the closest region to Zurich. Cloudflare Workers, by contrast, execute
wherever the incoming request lands, anywhere in Cloudflare's edge network, unless a route is
explicitly pinned. `.planning/STATE.md` already carries this mismatch as an open blocker
awaiting counsel, tied to the requirement that Sentry/monitoring must not ship ahead of a
working `consent_log` in Phase 10.

## Decision

**Proposed engineering default — pin the data-touching routes near Frankfurt using Cloudflare
Smart Placement; leave public marketing routes running at the edge, unpinned.**

This is a proposal, not a decision — the point of writing it as an ADR is to give counsel a
costed choice to sign off on rather than an abstract, unscoped question. Three options exist,
stated here with their real costs so counsel is choosing between concrete outcomes:

**Pin everything.** The easiest position to defend to counsel — every request touching
passenger data, and every request that does not, executes near Frankfurt. Costs edge latency
on static marketing pages that would otherwise benefit from running at the requester's nearest
edge node — but those pages are cached at the edge regardless of where the origin executes, so
the true latency cost of pinning them is small.

**Pin nothing.** The fastest option operationally. Passenger data would then be processed in
whatever jurisdiction the request happens to land in, which means the nFADP/GDPR transfer
analysis has to cover every Cloudflare point of presence the platform might ever route
through — a much larger and more open-ended legal surface. This option is unlikely to get a
fast sign-off from counsel precisely because of that open-endedness.

**Pin the data routes only — the recommendation.** Booking POST, account reads and the entire
ops route group execute near Frankfurt via Smart Placement; public marketing pages stay
edge-cached and unpinned. The latency cost lands on the one request per booking where roughly
100 ms is invisible next to a payment round-trip through Stripe. This option is also the same
fix the Hyperdrive round-trip cost independently wants — running the data routes near the
database region reduces Hyperdrive's connection latency regardless of the legal answer — so it
pays for itself operationally no matter what counsel decides.

**The question engineering cannot answer, stated in its own paragraph:** whether transient
processing of passenger data at a Cloudflare point of presence, with no persistence at that
location, constitutes a data transfer at all under nFADP and GDPR. That is a legal question
about transient-processing doctrine, and nothing in this repository or in engineering's
competence answers it. This ADR proposes an engineering default; it does not resolve the legal
question the default is meant to satisfy.

## Consequences

**Open.** This entire ADR is open pending counsel's answer. Nothing here is implemented until
that answer lands, and `.planning/STATE.md`'s Phase 10 gate stays in place until it does.

**Cost of being wrong**, stated per counsel outcome so the reversal cost is concrete rather
than abstract: if counsel requires every route pinned, moving the remaining public routes to
match is a configuration change plus a small, already-accepted latency cost on pages that are
cached at the edge anyway — cheap. If counsel accepts the proposed data-routes-only pinning,
nothing changes and the recommendation stands on its operational merits regardless of the
legal answer, since it was already paying for itself via the Hyperdrive latency fix. The
genuinely expensive failure mode is not a wrong pinning choice — it is shipping Phase 10
monitoring (Sentry, and the analytics decision under Q22/A6) before this question is answered
at all, since `.planning/STATE.md` already ties Sentry's launch to a working `consent_log`,
and a `consent_log` built on an unresolved residency question is exactly the kind of thing
that has to be rebuilt once counsel answers.

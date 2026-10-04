# Phase 29: Webhook Purchase - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-03
**Phase:** 29-Webhook Purchase
**Areas discussed:** Late refusal, Extras paid, Auto refunds, Test or real (asked directly, one decision per question; the roadmap already fixes the rest)

## Late refusal
| Option | Selected |
|---|---|
| Don't send: check the cookie choice again before sending | ✓ |
| Send anyway: the Pay press decides | |

## Extras paid
| Option | Selected |
|---|---|
| No, booking only: one Purchase for the first payment | ✓ |
| Yes, one per payment | |

## Auto refunds
| Option | Selected |
|---|---|
| No Purchase when settle refunds at once | ✓ |
| Send, then nothing | |

## Test or real
| Option | Selected |
|---|---|
| Follow Stripe: test-mode → Meta Test events, live-mode → real | ✓ |
| Test tab until the owner says | |
| Real from day one | |

## Claude's Discretion
Where the send runs, how "sent once" is stored, Graph version, timeout and logging.

## Deferred Ideas
Refund or cancel events to Meta; finish-your-account step (27 D-37).

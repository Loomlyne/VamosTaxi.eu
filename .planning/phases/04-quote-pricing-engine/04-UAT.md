---
status: partial
phase: 04-quote-pricing-engine
source: [04-01-SUMMARY.md, 04-02-SUMMARY.md, 04-03-SUMMARY.md, 04-04-SUMMARY.md, 04-05-SUMMARY.md, 04-06-SUMMARY.md, 04-07-SUMMARY.md, 04-08-SUMMARY.md, 04-09-SUMMARY.md, 04-10-SUMMARY.md, 04-11-SUMMARY.md, 04-12-SUMMARY.md, 04-13-SUMMARY.md, 04-14-SUMMARY.md, 04-15-SUMMARY.md, 04-16-SUMMARY.md]
started: 2026-08-29T23:28:34Z
updated: 2026-08-29T23:30:00Z
---

## Current Test

[testing paused — 13 items outstanding]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server/service. Clear ephemeral state (temp DBs, caches, lock files). Start the application from scratch. Server boots without errors, any seed/migration completes, and a primary query (health check, homepage load, or basic API call) returns live data.
result: blocked
blocked_by: prior-phase
reason: "All tests, keep them later because I can't test anything right now because there is no UI or application I can see."

### 2. Quote amounts stay CHF 000 while pricing is not live
expected: A quote for an eligible Zurich route returns a vehicle-class board where every amount reads `CHF 000` (not a guessed fare). The `/dev/quote` gallery shows the same placeholder in every priced state. Flipping a preview flag must not make a draft rate look live.
result: blocked
blocked_by: prior-phase
reason: "All tests, keep them later because I can't test anything right now because there is no UI or application I can see."

### 3. Eligible class board, ineligible classes stay visible
expected: After a quote, every vehicle class still appears. Eligible cards can be selected. Ineligible cards stay on the board (not hidden) with a reason such as party size, bags, unavailable, no fare table, or off sale — never a blank gap.
result: blocked
blocked_by: prior-phase
reason: "All tests, keep them later because I can't test anything right now because there is no UI or application I can see."

### 4. Pickup and destination by search
expected: Typing an address into search returns Mapbox suggestions. Choosing one pins a real place. Empty or missing coordinates are refused (400), not silently treated as 0,0.
result: blocked
blocked_by: prior-phase
reason: "All tests, keep them later because I can't test anything right now because there is no UI or application I can see."

### 5. Quote lock holds for 30 minutes
expected: A successful quote issues a server-signed lock that remains valid for 30 minutes. Repricing with a coupon only does not extend that deadline.
result: blocked
blocked_by: prior-phase
reason: "All tests, keep them later because I can't test anything right now because there is no UI or application I can see."

### 6. Expired quote is rejected server-side
expected: After the lock expires, the server refuses to snapshot or charge that quote even if the UI countdown is ignored. Nothing is written for the expired lock.
result: blocked
blocked_by: prior-phase
reason: "All tests, keep them later because I can't test anything right now because there is no UI or application I can see."

### 7. Coupon accepted or refused in the customer's language
expected: A valid coupon reduces the quote. An out-of-window, exhausted, or otherwise invalid coupon is refused with a translated reason (en/de/fr/ar keys), not a raw English server string.
result: blocked
blocked_by: prior-phase
reason: "All tests, keep them later because I can't test anything right now because there is no UI or application I can see."

### 8. Flight number fills landing time
expected: Entering a flight number looks up the landing time once. Overnight duplicates are disambiguated rather than taking the first record. Honest failures (unknown, no data, provider down) are shown as such, not as a fake time.
result: blocked
blocked_by: prior-phase
reason: "All tests, keep them later because I can't test anything right now because there is no UI or application I can see."

### 9. Extras appear as their own priced lines
expected: Adding a child seat, an extra stop, or oversized luggage shows as its own line on the quote breakdown, not silently folded into the base fare. Amounts still read `CHF 000` until the matrix is live.
result: blocked
blocked_by: prior-phase
reason: "All tests, keep them later because I can't test anything right now because there is no UI or application I can see."

### 10. Service-area and minimum-advance refusals name which rule
expected: A booking outside the service area, or inside the minimum advance window, is refused with a message that says which rule failed — not a generic "cannot quote".
result: blocked
blocked_by: prior-phase
reason: "All tests, keep them later because I can't test anything right now because there is no UI or application I can see."

### 11. Repeated anonymous quotes are rate-limited
expected: Hammering `/api/quote` or the geo endpoints as an anonymous visitor hits a rate limit and/or a Turnstile challenge. The API does not stay wide open.
result: blocked
blocked_by: prior-phase
reason: "All tests, keep them later because I can't test anything right now because there is no UI or application I can see."

### 12. Client-supplied prices are rejected
expected: A quote or reprice body that includes a client-chosen price, distance, or line total is rejected structurally. The server never trusts a browser-sent fare.
result: blocked
blocked_by: prior-phase
reason: "All tests, keep them later because I can't test anything right now because there is no UI or application I can see."

### 13. Quote copy and gallery in four languages
expected: Quote errors, refusals, and the `/dev/quote` gallery render in English, German, French, and Arabic. Arabic is RTL. The service-area TBC pill stays English (ADR-011). Every UI-SPEC state (class board, lock countdown, return leg, refusals) is reachable in the gallery.
result: blocked
blocked_by: prior-phase
reason: "All tests, keep them later because I can't test anything right now because there is no UI or application I can see."

## Summary

total: 13
passed: 0
issues: 0
pending: 0
skipped: 0
blocked: 13

## Gaps

[none yet]

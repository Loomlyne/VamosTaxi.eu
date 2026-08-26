# QUOTE-09 — Rate limiting, Turnstile and abuse defence for `POST /api/quote`

Lane: abuse-ratelimit (Phase 4). Builds on Phase 2 `02-RESEARCH.md` (D1–D24, U1–U22) and
`docs/build/CLOUDFLARE-RESOURCES.md` (D-34 binding inventory). Does not re-litigate the
quote-engine's response contract (U6, owned by quote-engine-core) or coupon consumption
timing (U7, owned by coupons-extras) — it assumes U6's recommendation (one
`price_snapshots` row per eligible vehicle class, server-derived, never client-supplied)
and treats it as a fixed, small, non-attacker-controlled fan-out.

## 0. What's actually unresolved going in

`docs/build/CLOUDFLARE-RESOURCES.md` inventories every binding this Worker has
provisioned — `GEO_CACHE` (KV), `PHOTOS` (R2), `STRIPE_EVENTS` (Queue), a cron trigger,
and a deliberately-deferred `HYPERDRIVE`. **It says nothing about the Cloudflare zone
(`vamostaxi.eu`) plan tier**, and neither does `docs/build/GSD-LAUNCH.md` §Phase 0 — the
only "Pro plan ($25/project)" line there is Supabase's, not Cloudflare's. The budget line
in GSD-LAUNCH §Secrets only names `Workers Paid $5 + usage`. So: **the zone is presumptively
on Cloudflare's Free plan today**, which materially changes what's available at the edge
(§1, §3). This is the first open item this brief settles by recommendation, not by
discovering a decision that was already made.

## 1. Cloudflare Rate Limiting Rules (zone-level, WAF product)

### 1.1 What the plan tier actually buys

Verified against the current `waf/rate-limiting-rules/` and `waf/managed-rules/` docs
(2026):

| Capability | Free | Pro | Business | Enterprise |
|---|---|---|---|---|
| Rate limiting rules per zone | 1 | 2 | 5 | 100 |
| Counting characteristic | `ip.src` only | `ip.src` only | `ip.src`, `cf.unique_visitor_id` (NAT-aware, cookie-based) | + headers/cookie/query/ASN/country/path; Advanced RL adds JA3/JA4, body, JSON/JWT fields |
| Minimum period | 10 s | 10 s | up to 10 min | up to 65,535 s (Advanced) |
| Mitigation-duration control on challenge actions | fixed throttle only | fixed throttle only | fixed throttle only | fully configurable |
| Cloudflare Managed Ruleset / OWASP Core Ruleset | **not available** (Free Managed Ruleset only — CVE coverage, no CRS) | available | available | available |
| Super Bot Fight Mode | not available (Bot Fight Mode only) | available | available | available |

[Rate limiting rules — Availability](https://developers.cloudflare.com/waf/rate-limiting-rules/) ·
[Rate limiting parameters](https://developers.cloudflare.com/waf/rate-limiting-rules/parameters/) ·
[Managed rules availability](https://developers.cloudflare.com/waf/managed-rules/)

On the presumed-Free zone today, `/api/quote` gets **one** rate-limiting rule, keyed on
raw `ip.src` only, and **no** OWASP Core Ruleset — the "Free Managed Ruleset" is CVE
patching, not general injection/anomaly scoring. That is not enough for an endpoint that
is public, unauthenticated, and pays Mapbox per call. **§6 recommends moving the zone to
Pro** specifically to unlock the second rule slot and CRS; it does not require Business
(NAT-aware `cf.unique_visitor_id` costs a large plan jump for a problem §2 solves more
cheaply at the Worker layer).

### 1.2 The rule itself

Zone-level rate limiting rules count **globally across Cloudflare's network** when keyed
on `ip.src` (unlike the Workers-runtime binding in §2, which is explicitly per-colo — see
that section). This makes it the right *coarse outer backstop*: cheap, plan-available even
on Free/Pro, and it stops a request before it ever reaches the Worker (so a flood that
would otherwise burn Worker/Mapbox spend is rejected at the edge for free).

Rule (via the Rulesets API, `http_ratelimit` phase — `cloudflare_rate_limit` is
deprecated in favour of `cloudflare_ruleset`):

```bash
curl "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/rulesets/$RATELIMIT_RULESET_ID/rules" \
  --request POST \
  --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  --json '{
    "description": "quote-api-outer-backstop",
    "expression": "(http.request.uri.path eq \"/api/quote\" and http.request.method eq \"POST\")",
    "action": "managed_challenge",
    "ratelimit": {
      "characteristics": ["ip.src"],
      "period": 60,
      "requests_per_period": 30,
      "mitigation_timeout": 600,
      "counting_expression": ""
    }
  }'
```

Terraform equivalent lives in one `cloudflare_ruleset` per zone with `kind = "zone"`,
`phase = "http_ratelimit"` — every rate-limiting rule for the zone in that one resource,
rate-limiting rules last in the rule list.
[Terraform: rate limiting rules](https://developers.cloudflare.com/terraform/additional-configurations/rate-limiting-rules/) ·
[Create via API](https://developers.cloudflare.com/waf/rate-limiting-rules/create-api/)

**Threshold reasoning for 30/60s per IP, action `managed_challenge` not `block`:** this
rule exists to catch a single IP hammering the endpoint, not to be the fine-grained
per-visitor gate (that's §2). 30/min tolerates a legitimate household or small office NAT
(a few people quoting concurrently) plus a customer bouncing back and forth adjusting
pax/luggage (§5). `managed_challenge` (Cloudflare's own interactive/non-interactive
challenge, served entirely at the edge) rather than a hard `block` because it survives a
Turnstile-siteverify outage (§2.4) — the edge challenge doesn't call back into the
Worker or Cloudflare's siteverify API, so it keeps working even when §2's server-side
verification path is degraded.

**Response shape:** `managed_challenge` returns a Cloudflare interstitial (HTML challenge
page or non-interactive JS challenge, resolved transparently for most real browsers) — not
a JSON 429. Because `/api/quote` is called by `fetch()` from React, not by a top-level
navigation, a challenge response looks like an opaque non-JSON body to the client. The
booking-widget fetch wrapper must treat "response isn't JSON with the expected shape" as
"you've been challenged — reload $\to$ retry once" rather than surfacing a raw parse error;
this is a UI detail for whichever lane owns the quote-widget's fetch client, flagged here
because the rate-limit design creates the requirement.

## 2. Worker-native rate limiting binding (primary, fine-grained layer)

### 2.1 Why this is the real gate, not the zone rule

The Workers Rate Limiting binding (`ratelimits` in `wrangler.jsonc`, GA) is a Workers
Platform feature — **it is available regardless of the zone's WAF plan tier**, and it's
already inside the budgeted Workers Paid $5/mo line, so it needs no new spend decision.
It is the layer that can be keyed on something smarter than raw IP.

```jsonc
// wrangler.jsonc, per env — new binding, no new external resource
"ratelimits": [
  {
    "name": "QUOTE_RATE_LIMITER",
    "namespace_id": "1101",
    "simple": { "limit": 8, "period": 60 }
  }
]
```

```ts
// apps/web/app/api/quote/route.ts (illustrative — not writing into apps/web from this lane)
const key = `${cfConnectingIp(req)}:${anonQuoteSessionId(req)}`; // compound, not bare IP
const { success } = await env.QUOTE_RATE_LIMITER.limit({ key });
if (!success) {
  return quoteRateLimitedResponse(); // 429, i18n'd body — see §6 for what triggers before this
}
```

[Workers Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

### 2.2 The characteristic: why not bare IP, and what to use instead

The task brief is right that IP is weak behind CGNAT/corporate NAT. Cloudflare's own
answer to that (`cf.unique_visitor_id`, a `_cfuvid`-cookie-based NAT-aware identity) is
**Business-plan-only** at the zone level — a real cost jump this project hasn't budgeted
and shouldn't need to just to fix rate-limit keying.
[NAT-aware characteristic](https://developers.cloudflare.com/waf/rate-limiting-rules/parameters/)

**Decision: key the Worker-side limiter on `ip + a first-party anonymous session
identifier`, not IP alone.** Concretely: the home page (already same-origin, already
setting `vamosTrip`-style localStorage per the mocks' contract) mints a random UUID into a
`vamos_qs` cookie (`HttpOnly`, `SameSite=Lax`, 24 h TTL) on first response if absent —
zero extra round-trip, set as a `Set-Cookie` on the existing page render. `/api/quote`
reads it. Same-origin `fetch()` from the booking widget already sends cookies by default,
so no client code change beyond "the widget calls a same-origin path" (already true).
This distinguishes ten browser tabs behind one CGNAT IP (ten cookies, ten counters) from
one script hammering the endpoint without ever loading the page (no cookie → falls back to
the bare-IP bucket, which is deliberately the *stricter* bucket — §2.3).

The Rate Limiting binding doc explicitly warns **against** IP/location as the key for
exactly this weak-signal reason and recommends a stable per-caller identifier instead —
this design follows that guidance, adapted to an anonymous public endpoint that has no
API key or session to key on.

### 2.3 Bare-IP fallback bucket

A caller with no `vamos_qs` cookie (script hitting the API directly, never rendered the
page) gets keyed on IP alone, at a **tighter** limit than the cookie'd bucket — e.g. 4/60s
vs 8/60s — since "never loaded the page" is itself a signal for a non-browser client. This
is a Worker-side `if` before the `.limit()` call choosing which namespace/threshold to
apply, not a Cloudflare config knob.

### 2.4 Caveat that must not be lost

The binding doc states the limiter is **"permissive, eventually consistent, and
intentionally designed not to be used as an accurate accounting system,"** with **a
separate counter per Cloudflare location** for a given key. [Same source.] That means: a
distributed attacker hitting different Cloudflare PoPs (or plain load-balanced retries)
can see a multiple of the nominal limit before every colo's local counter trips. This is
acceptable for its job here (defeating a single-origin script hammering the endpoint) but
is **not** the layer that catches a slow, geographically distributed campaign — that's
what §4's daily circuit breaker and §6's alerting are for. Say this plainly rather than
imply the binding is authoritative: it isn't, by Cloudflare's own description.

## 3. Turnstile

### 3.1 Placement and mode — protecting "book in under a minute"

**Invisible mode**, mounted on the booking widget as soon as the pickup/dropoff fields
have both been touched (not on page load, to avoid paying the widget's script weight
before the visitor has expressed intent; not blocking the first render). The widget's
background challenge (proof-of-work/proof-of-space/browser-integrity — no user gesture)
typically resolves within the seconds a visitor spends filling the rest of the form, so by
the time they submit, a fresh token is already sitting in state. **This never adds a
step** — invisible mode has no checkbox, no "verify you're human," and the token is ready
before it's needed.
[Turnstile widget modes](https://developers.cloudflare.com/turnstile/concepts/widget/)

### 3.2 The escalation rule — the actual defence-in-depth answer to QUOTE-09

Do **not** require a passing Turnstile token on every quote request — that would burn one
`siteverify` round-trip (network call from the Worker to Cloudflare, tens of ms, but not
zero) on every single quote, including the very first, most price-sensitive one in the
"under a minute" flow. Instead:

1. Every `/api/quote` POST carries the Turnstile token if one exists in client state
   (it usually will, per §3.1's pre-warming), and the Worker **always sends it to
   `siteverify` and logs the result** (§6) — but for a visitor's first 2 requests within
   the §2 rate-limit window, a failed/missing/expired token is **logged, not enforced**.
2. Once a visitor's `QUOTE_RATE_LIMITER` key crosses a lower **soft** threshold (e.g. the
   3rd request in the rolling 60 s window — implemented as a second, tighter binding
   check, or by inspecting the same counter's remaining budget if the binding exposes it),
   the Worker starts **requiring** `siteverify.success === true` before proceeding, and
   rejects with 403 if it isn't.
3. A legitimate customer adjusting passengers/luggage a few times in a minute (§5) never
   crosses the soft threshold in normal use and never notices Turnstile exists. A script
   POSTing directly to `/api/quote` without ever loading the page has no token at all and
   gets cut off exactly at the point its request volume starts costing real Mapbox spend.

This directly satisfies "challenge only after N requests, not on the first" from a
concrete mechanism, not a vague policy.

### 3.3 Server-side verification (idempotent)

```ts
async function verifyTurnstile(token: string, ip: string, idempotencyKey: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET,
        response: token,
        remoteip: ip,
        idempotency_key: idempotencyKey, // safe retry on the SAME token+attempt
      }),
    });
    return (await res.json()) as TurnstileResult;
  } finally {
    clearTimeout(timeout);
  }
}
```

`idempotency_key` (a UUID minted once per submit attempt, reused only on retry of that
same attempt) is exactly the mechanism to safely retry a `siteverify` call that timed out
without risking a `timeout-or-duplicate` false rejection on the retry — each Turnstile
token is single-use, so retrying with a **new** `idempotency_key` on a token that already
succeeded elsewhere would legitimately fail as a duplicate; retrying with the **same**
`idempotency_key` is Cloudflare's documented escape hatch for that scenario.
[Server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)

Error codes worth branching on: `timeout-or-duplicate` (token consumed or expired at 300 s
— tell the client to get a fresh token and resubmit, not a hard failure), `internal-error`
(Cloudflare-side transient — retry once with the same idempotency key, then treat as §3.4).

### 3.4 If Turnstile itself is unavailable

Cloudflare's docs recommend retry-with-backoff and "have fallback behavior for API
failures" but **do not publish an explicit fail-open/fail-closed recommendation** — this
is engineering judgement for this product, stated as such, not cited as Cloudflare policy:

- One retry, 2 s total budget (§3.3's `AbortSignal`). This endpoint is on the critical
  path of "book in under a minute" — it cannot afford a 3-attempt exponential backoff.
- Below the §3.2 soft threshold: fail open (these requests never required Turnstile
  anyway).
- At/above the soft threshold, with `siteverify` unreachable: **do not hard-block the
  customer** — a Cloudflare-side Turnstile outage is not the customer's fault and blocking
  legitimate high-intent traffic (someone re-quoting because they're actually deciding
  between vehicle classes) directly damages the core value. Instead, fall back to §1's
  zone-level `managed_challenge` rule as the sole gate for that tier — it is enforced by
  Cloudflare's edge before the request reaches the Worker at all, so it does not share
  fate with the Worker→Cloudflare-API `siteverify` call. Log the degraded-mode event
  (§6) so ops can see a Turnstile outage happening in near-real-time rather than
  discovering it from a spend spike days later.

## 4. Defence in depth beyond the edge

### 4.1 Reject obviously-bogus geometry before calling Mapbox

Server-side, before any Mapbox call:
- Reject pickup/dropoff strings under ~3 chars or over a sane length cap (also bounds
  request-body size feeding into WAF inspection, §5).
- Reject `pickup === dropoff` (zero-distance junk — never a real transfer).
- If coordinates (not free text) are supplied, reject anything outside a generous
  bounding box around Switzerland + immediate neighbours — Zurich-first service area per
  the product brief, not a global taxi dispatcher; a coordinate pair in another
  hemisphere is definitionally not a real quote request.
- Validate the whole request body against a strict schema (zod) — reject unknown fields,
  wrong types, before touching any external API. This is also the primary defence against
  WAF false positives (§5): if the server already rejects malformed input structurally,
  the WAF's job is catching exploitation of the *stack* (Next.js/Worker RCE/XSS vectors),
  not policing business-data shape.

### 4.2 Eligible-class fan-out is not a Mapbox cost lever — don't treat it as one

Per U6 (price-snapshot.md, quote-engine-core's ground to own, not re-litigated here): one
`price_snapshots` row per **eligible** vehicle class, computed server-side from `settings`
+ pax/bags, never from a client-supplied list of classes. Mapbox spend per quote is
already bounded to **one** geocode-pair lookup + **one** Directions call (KV-cached 24 h by
place-id pair, per GSD-LAUNCH §4.1) regardless of how many vehicle classes end up priced —
pricing additional classes is a local computation over the already-fetched
distance/duration, not an extra external call. The actual attack surface this cap
protects is **Postgres write volume and response payload size** (bounded anyway, since
`vehicle_classes` is a small fixed operator-controlled table, not user input) — the one
thing to verify in the request schema is that no field ever lets a caller pass an array of
class IDs to price; if such a field exists, it must be ignored server-side or removed.

### 4.3 The KV counter — a spend circuit breaker, not the per-visitor limiter

Workers KV is the wrong tool for a hot per-second/per-visitor counter: it caps writes to
**one write per second per key** and is eventually consistent (last-write-wins on
concurrent writes) — using it as the fine-grained gate would either throttle legitimate
concurrent traffic on a hot key or silently lose counts.
[KV write limits](https://developers.cloudflare.com/kv/api/write-key-value-pairs/)

That's exactly why §2 uses the native `ratelimits` binding for per-visitor gating instead.
**KV's actual job here: a coarse, whole-service daily Mapbox-spend circuit breaker** — the
one risk no per-visitor limiter catches, because a low-and-slow attacker spreading
requests thinly across thousands of distinct IPs/sessions never trips any individual
counter, yet can still run up real Mapbox billing in aggregate.

```ts
const budgetKey = `quote:mapbox-budget:${todayUTC()}`; // one key per day — low write concurrency
const current = Number((await env.QUOTE_ABUSE.get(budgetKey)) ?? "0");
if (current >= DAILY_MAPBOX_QUOTE_BUDGET) {
  await recordDegradedMode("daily_budget_exhausted"); // Analytics Engine, §6
  return quoteTemporarilyUnavailableResponse(); // graceful degrade, not a raw 500
}
// best-effort increment — eventual consistency is acceptable for a coarse breaker
await env.QUOTE_ABUSE.put(budgetKey, String(current + 1), { expirationTtl: 172800 });
```

A dedicated `QUOTE_ABUSE` KV namespace (new binding, following D-34's staging/production
split) rather than reusing `GEO_CACHE` — the two have different TTL semantics (geocode
cache: 24 h correctness cache; this: a 2-day rolling spend breaker) and mixing purposes in
one namespace makes both harder to reason about and evict correctly.

`DAILY_MAPBOX_QUOTE_BUDGET` is a real number that depends on the Mapbox plan tier chosen
in Phase 0 (§Accounts) and is genuinely unknown until that account exists — **flag as
UNCERTAIN, settled by**: read the Mapbox account's actual plan/rate-limit ceiling once
provisioned, set the breaker at ~70% of the monthly-cost-tolerable ceiling divided by 30,
and alert (§6) well before the breaker itself trips.

## 5. What must not be rate-limited into uselessness

A customer comparing Economy vs Business vs Van, or nudging pax/luggage counts to see how
the price moves, plausibly re-quotes **4–6 times inside a couple of minutes** — that is
core-value behaviour ("trust the fixed price"), not abuse. Threshold reasoning:

- §2's per-visitor binding (8/60s, cookie-keyed) comfortably exceeds that pattern — a
  human re-quoting by hand cannot generate 8 requests in 60 seconds even editing fields
  rapidly, since each edit is followed by a debounce + a real network round-trip.
- §3.2's Turnstile soft threshold (3rd request in-window) sits *below* §2's hard limit
  deliberately — it adds an invisible, zero-friction proof rather than a rejection, so a
  legitimate 4th/5th/6th re-quote in the same minute still succeeds, just now carrying a
  verified token. The customer never sees a difference.
- §1's zone-level rule (30/60s) is the outermost, loosest tier — it only ever fires for
  genuinely IP-wide floods (many visitors or a script), never for one person's own
  re-quoting.
- **Debounce the client call itself** (quote-widget's job, not this lane's) — e.g. 400 ms
  after the last field change — so a user dragging a passenger-count stepper doesn't fire
  one request per click in the first place. This is the cheapest defence of all and belongs
  in the widget regardless of anything above.

## 6. Observability without Logpush

Logpush is explicitly deferred (`CLOUDFLARE-RESOURCES.md` §Logpush — no destination chosen
yet). What's already available and needs no new decision:

- **Workers Logs** — already on (`"observability": { "enabled": true }` in
  `wrangler.jsonc`). Workers Paid gives **7-day retention**, 20M events/month included,
  queryable via the dashboard's Query Builder or `wrangler tail` live.
  [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
  Structured `console.log` at each decision point (rate-limit tripped, Turnstile
  escalation entered, siteverify failed/timed out, daily budget breaker fired) is enough
  to reconstruct an incident from this alone within the 7-day window.
- **WAF/Rate Limiting security analytics** — the zone-level rule (§1) and any WAF managed
  rules (§7) surface in the dashboard's Security Analytics / Firewall Events and the
  GraphQL Analytics API, independent of Logpush, on any plan.
- **Turnstile's own dashboard** — solve-rate and challenge-volume per site key; a spike
  here is itself an early signal of an attack against `/api/quote` specifically, since
  that's the only place this Turnstile widget mounts.
- **Workers Analytics Engine** (new binding, no external destination, so no Logpush
  dependency) — the mechanism that actually answers "how is an attack noticed" rather than
  just "how is it reconstructed after the fact":

  ```jsonc
  // wrangler.jsonc
  "analytics_engine_datasets": [
    { "binding": "QUOTE_ABUSE_METRICS", "dataset": "quote_abuse" }
  ]
  ```

  ```ts
  env.QUOTE_ABUSE_METRICS.writeDataPoint({
    blobs: [ipHash, cookieBucket, turnstileResult, "quote"],
    doubles: [rateLimitRemaining, latencyMs],
    indexes: [todayUTC()], // sampling key
  });
  ```

  Queried via Cloudflare's SQL API
  ([Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/get-started/)),
  non-blocking writes (no request-latency cost). A Cron Trigger (Workers already has one
  registered daily at `0 3 * * *`; add a second, tighter one — e.g. `*/10 * * * *` — for
  this purpose specifically) queries "rate-limit-trip rate over the last 10 minutes" and
  "Turnstile failure rate over the last 10 minutes"; crossing a hand-set anomaly threshold
  sends one Resend email to ops (Resend is already a stack dependency, no new vendor).
  This is a deliberate stop-gap for Phase 4 — Phase 8's Sentry + Logpush + uptime-check
  stack (GSD-LAUNCH §Phase 8.5) is the real monitoring layer; this is what exists before
  that phase lands.

## 7. WAF managed rules — which matter, and the false-positive risk

Requires the zone on **Pro or above** (§1.1 — Free has no CRS at all). Once available:

- **Cloudflare Managed Ruleset** — general, low-noise, safe to run at default
  sensitivity/action for the whole zone including `/api/quote`.
- **OWASP Core Ruleset** — the one that matters for a JSON POST endpoint (SQLi/XSS/RCE
  signature families). [OWASP Core Ruleset](https://developers.cloudflare.com/waf/managed-rules/reference/owasp-core-ruleset/)

**False-positive risk on this endpoint specifically:** the request body carries freeform
customer text — a flight number (`LX318`), a name that may contain an apostrophe
(O'Brien) or be transliterated German/French/Arabic, and (once the booking flow, not just
quote, is built) a free-text note field. Apostrophes and SQL-keyword-shaped substrings in
names are the classic CRS SQLi-family false-positive source; freeform notes are the
highest-risk field of all once that field exists on a WAF-inspected route. Cloudflare's
own best-practice guidance for a new rate/WAF rule is to **deploy with the Log action
first, validate against real staging traffic, then promote to Block** — apply that
literally here: bring OWASP CRS onto `/api/quote` at **Sensitivity: Low, Action: Log**
for the first weeks of staging traffic (which will include real Swiss/German/French/Arabic
names and flight numbers from manual QA), and only promote to Block once that traffic
shows zero false positives. Do not run it in `Block` from day one on an endpoint that
handles this shape of input.
[Rate limiting best practices](https://developers.cloudflare.com/waf/rate-limiting-rules/best-practices/)
(same log-first pattern documented there for rate-limiting rules generally applies to WAF
managed rules).

WAF Attack Score (the ML-based alternative that reduces this false-positive class to
~1/100,000) exists but "Attack Score Lite" is gated to Business-plan customers and full
Attack Score is Enterprise-oriented — not recommended to chase for this project's size; the
Log-first CRS rollout above is the right-sized answer at Pro.
[Attack Score](https://developers.cloudflare.com/waf/detections/attack-score)

Bot Fight Mode (Free, on by default) vs Super Bot Fight Mode (Pro+) — enable Super Bot
Fight Mode once on Pro; it's a zero-cost, zero-code addition that challenges/blocks
known-bad bot categories before they even reach the rate-limiting layers above, and is a
sensible complement to (not a replacement for) everything in §1–§4.

## RECOMMENDATION

**Move the `vamostaxi.eu` zone to Cloudflare Pro** (this is a genuine new cost line not
currently in the GSD-LAUNCH budget — flag to the owner alongside the other Phase 0 account
costs; do not silently absorb it). That unlocks the second WAF rate-limiting rule slot and
the OWASP Core Ruleset, which Free cannot provide at all. Do **not** go to Business for
`cf.unique_visitor_id` — solve the CGNAT/IP-weakness problem at the Worker layer instead,
which is cheaper and already budgeted.

Ship `/api/quote` behind **three concrete, already-specified layers**, in this order of
execution per request: (1) the zone-level Rate Limiting Rule §1.2 (`ip.src`, 30/60s,
`managed_challenge`) as the free outer backstop that survives a Turnstile outage; (2) the
Worker-native `ratelimits` binding §2 keyed on `ip + vamos_qs cookie` (8/60s cookie'd, 4/60s
bare-IP fallback) as the real per-visitor gate; (3) invisible-mode Turnstile §3, verified
but **not enforced** for a visitor's first two requests in-window and **enforced** from the
third, with the documented idempotent-retry `siteverify` call and the edge-`managed_challenge`
fallback (not a hard block) if `siteverify` itself is unreachable. Layer these with the
input-shape defences in §4.1 (bogus-geometry rejection, strict zod schema) ahead of any
Mapbox call, and the §4.3 daily KV spend breaker as the catch for low-and-slow distributed
abuse that no per-visitor counter can see. Bring OWASP CRS onto the route at
`Sensitivity: Low, Action: Log` once Pro is live, and do not promote to `Block` until
staging traffic with real multilingual names/flight numbers shows it clean (§7). For
observability before Logpush lands, wire the Analytics Engine dataset in §6 with a 10-minute
Cron sweep alerting ops by Resend — this is the mechanism by which an attack is actually
noticed while Phase 8's full monitoring stack doesn't exist yet.

Flagged for a later check rather than guessed: the exact `DAILY_MAPBOX_QUOTE_BUDGET`
number (§4.3, depends on the Mapbox plan chosen in Phase 0, not yet provisioned) and the
Cloudflare zone plan decision itself (this brief's §0/§6 recommendation, pending owner
sign-off on the new cost line).

Sources cited inline throughout; primary ones: [Rate Limiting Rules](https://developers.cloudflare.com/waf/rate-limiting-rules/) · [Rate limiting parameters](https://developers.cloudflare.com/waf/rate-limiting-rules/parameters/) · [Workers Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) · [Turnstile widget modes](https://developers.cloudflare.com/turnstile/concepts/widget/) · [Turnstile server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/) · [WAF managed rules availability](https://developers.cloudflare.com/waf/managed-rules/) · [OWASP Core Ruleset](https://developers.cloudflare.com/waf/managed-rules/reference/owasp-core-ruleset/) · [KV write limits](https://developers.cloudflare.com/kv/api/write-key-value-pairs/) · [Workers Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/get-started/) · [Workers Logs retention](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) · [Rate limiting best practices](https://developers.cloudflare.com/waf/rate-limiting-rules/best-practices/).

Files read for grounding (read-only, none modified): `/Users/koss/Developer/VamosTaxi.eu/docs/build/GSD-LAUNCH.md`, `/Users/koss/Developer/VamosTaxi.eu/docs/build/CLOUDFLARE-RESOURCES.md`, `/Users/koss/Developer/VamosTaxi.eu/.planning/phases/02-data-schema-rls-staff-auth-foundations/02-RESEARCH.md`, `/Users/koss/Developer/VamosTaxi.eu/.planning/phases/02-data-schema-rls-staff-auth-foundations/research/price-snapshot.md`, `/Users/koss/Developer/VamosTaxi.eu/apps/web/wrangler.jsonc`.
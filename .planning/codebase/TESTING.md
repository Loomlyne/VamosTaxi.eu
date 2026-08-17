# Testing Patterns

**Analysis Date:** 2026-08-17

## Current State

**This is a design-phase codebase (Phase 0–1 of build).** There are no test files, no test framework, and no CI automation yet. The production app does not exist; design mocks in `app/` are the specification.

The **real quality gate today** is the manual verification process defined in `HANDOFF-CLAUDE-CODE.md §9` "Definition of done, per route" — a checklist every new surface must pass before considered complete. Automated testing is **planned for Phase 1 and beyond** but does not run today.

## Definition of Done (per route) — Manual Verification

Every page or component shipped must pass this checklist before moving on. This is the binding quality standard until test automation is in place.

### Visual Verification

1. **Visual diff against the mock approved at 1440, 1024, 768, 390 px**
   - Open the mock next to the built route at each breakpoint
   - Verify: spacing, alignment, typography, colours, shadow/elevation, states (hover, focus, disabled, loading)
   - No "improvements" to layout or spacing without a design decision
   - No visual changes that are not explicitly approved

2. **Responsive correctness**
   - Nothing scrolls sideways at 390 px
   - Booking widget stacks first on mobile
   - Touch targets ≥ 44 px (54 px for booking-widget fields and primary CTAs)
   - German text at 1080 px (grows ~30%; surfaces must still fit)
   - Arabic text at 1080 px with `dir="rtl"` (logical properties, no LTR leakage, text readable)

### Localisation Verification

3. **Read in German at 1080 px**
   - Every visible string must exist in `vamos-i18n-dict.js` with a `de` translation
   - Run `VamosLocale.coverage(root)` — must return empty (no untranslated strings)
   - Verify layouts still work with German's ~30% longer strings (especially field labels, buttons, headings)

4. **Read in Arabic with `dir="rtl"`**
   - Every visible string must exist in `vamos-i18n-dict.js` with an `ar` translation
   - Run `VamosLocale.coverage(root)` — must return empty
   - Verify RTL layout: no `left`/`right` in logical places, use `margin-inline-start`, `inset-inline-end`, `padding-inline`
   - Check that lozenge characters and code (e.g., flight numbers, CHF figures) stay LTR (use `.vt-dir-keep` if needed)

### Platform Laws Compliance

5. **The four laws hold**
   - **No glow:** `--vt-shadow-accent: none` set in `:root`; `.vt-input--focus { box-shadow: none }` set in `<helmet>`; hover is colour change or `translateY(1px)`, focus is `--vt-ring`
   - **No tinted yellow:** `--vt-yellow-50…300` and `-600/-700` never used as backgrounds/text; full-strength yellow only for accent; if a kit component defaults tinted, use `tone="inverse"` or charcoal instead
   - **`CHF 000` / `data-tok` intact:** all placeholder amounts read `CHF 000` (never invented figures); every pending value is a labelled `data-tok` pill (grep: `grep -r 'data-tok' app/` + `grep -r 'CHF [0-9]' app/` should show zeros and pills only)
   - **Four languages present:** English + German + French + Arabic in the same pass; `placeholder`, `aria-label`, `title`, `alt` all translated; concatenated strings in `patterns`

### Functional & Interaction Verification

6. **Real data through Hyperdrive (production only; mocks use localStorage)**
   - No mock data shipped to prod
   - Queries via Hyperdrive + SQL (not localStorage)
   - All reads are RLS-scoped where applicable

7. **Lenis running**
   - One instance per page, started by `assets/lenis-boot.js`
   - No page reloads on link clicks (route transitions)
   - `data-lenis-prevent` on nested scrollers (tables, the ops board)
   - No `scroll-behavior: smooth` elsewhere
   - Smooth scroll works with `prefers-reduced-motion` (disables easing, stays native)

8. **Keyboard focus visible everywhere**
   - Tab through all interactive elements
   - Focus ring visible on buttons, inputs, links, cards, rows
   - Focus order is logical (top-to-bottom, left-to-right)
   - No elements trapped in a focus loop

9. **Touch targets ≥ 44 px**
   - Measure every tappable element (buttons, links, form fields, radio buttons, checkboxes)
   - Booking-widget fields and primary CTAs: 54 px
   - Standard controls: 44 px minimum
   - Adjust spacing if targets are too small

### Feature Checklist

10. **The matching 🔴 items in `docs/MISSING-FEATURES.md` for that surface are closed**
    - Every route has a "must have" feature list in the gap audit
    - Cross-check that all 🔴 (red, hard blocker) items are implemented
    - 🟡 (yellow, should have) items can be deferred to a later phase
    - ⚪ (white, nice to have) items are out of scope for V1

---

## Planned Testing Tools (Phase 1+)

The production app will use the following test frameworks and practices. These are **not in place today** but are committed in the build plan (`docs/build/GSD-LAUNCH.md`).

### Phase 1 · Scaffold

**None yet** — focus is on getting Next.js + Workers + Supabase schema in place.

### Phase 2 · Supabase Database & RLS

**Framework:** `supabase test db` (built-in test runner for Postgres + RLS policies)

**What to test:**
- RLS policies work correctly: customers see only their own bookings, staff role-gated access via JWT claim `role`
- Public read access for published `reviews`, `content_strings`, pricing tables
- Staff write policies for ops tables
- Data constraints and unique indexes

**Run:**
```bash
supabase test db --local
```

### Phase 3 · Data Access (Hyperdrive)

**Framework:** Integration tests in the app test suite (Phase 5+)

**What to test:**
- SQL queries through Hyperdrive return expected results
- Connection pooling (`max: 5`) works under load
- No "too many connections" errors under `wrk`/`k6` smoke test

**Smoke test (Phase 3):**
```bash
# Check p50 query round-trip from staging Worker < 30 ms
# Load test: no "too many connections" under concurrent requests
```

### Phase 4 · Pricing Engine & Quote API

**Framework:** Load testing with `k6`

**What to test:**
- `/api/quote` returns a real, lockable quote in < 800 ms warm
- Handles 200 rps quote traffic with p95 < 1.5 s
- Rate limiting works (Cloudflare rule: 20/min/IP after N anonymous quotes)
- Turnstile on widget after N quotes (prevents bot abuse)
- Graceful degradation when flight API is down (manual time entry)

**Run (Phase 4):**
```bash
k6 run scripts/quote-load-test.js
```

### Phase 5 · Checkout, Payments, Lifecycle

**Framework:** End-to-end testing with Stripe test mode

**What to test:**
- Full booking lifecycle in Stripe test mode:
  1. Quote created (status: `quote`)
  2. Payment Intent created
  3. `payment_intent.succeeded` webhook received
  4. Booking status: `pending` → `paid` → `confirmed`
  5. Confirmation email sent (EN/DE/FR/AR)
  6. Manage link works (`manage-booking?token=…`)
  7. ICS calendar attachment in email
- Cancellation/refund: customer self-serve (within policy window) vs request approval (ops)
- Every step writes a `booking_event` (timeline in ops detail + audit trail)
- Webhook is replay-safe (duplicate events idempotent via `stripe_events` table)

**Test mode credentials:** Use Stripe test-mode secret and publishable keys. Cards: `4242 4242 4242 4242` (success), `4000 0000 0000 0002` (require auth), etc.

**Done when:** E2E green (book → pay → confirm → assign → complete; cancel → refund). Every email renders in all four languages.

### Phase 6 · Port All Surfaces

**Framework:** Visual regression + accessibility (planned, not active yet)

**Tooling:** Likely `Cypress` or `Playwright` for browser automation (TBD at Phase 6 planning)

**What to test:**
- Route-by-route visual diff vs mocks at 1440/1024/768/390
- In German and Arabic (RTL)
- Ops board updates live when a test booking pays (Realtime subscriptions)
- Form submissions (contact, partner signup) → Turnstile validation → Resend email + DB row

### Phase 8 · Hardening for 10k Concurrent

**Framework:** Load testing with `k6`

**What to test:**
- 10k VUs browse cached content (home, marketing, legal)
- 500 VUs quoting (average p50 < 500 ms, p95 < 1.5 s)
- 50 VUs booking (payment flow)
- No database connection errors; Hyperdrive pooling works
- Cache headers correct (ISR/edge-cached for static, 60 s for public reads)
- WAF rules and rate limits working
- Turnstile challenge rate acceptable

**Script pattern:**
```javascript
// k6 load test example (not active yet)
import http from 'k3/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp up to 100 VUs
    { duration: '5m', target: 10000 }, // Ramp up to 10k
    { duration: '2m', target: 0 },     // Ramp down
  ],
};

export default function() {
  let res = http.get('https://staging.vamostaxi.eu/');
  check(res, { 'status was 200': (r) => r.status == 200 });
}
```

---

## Verification Practice: `VamosLocale.coverage(root)`

The single most important verification tool available today.

### What It Does

```javascript
VamosLocale.coverage(root)
```

Returns an **array of strings under the DOM node `root` that do not have translations** in the active language (de, fr, ar).

### When to Run

- **Before calling any surface "done"** — it is the definition of localisation completeness
- On every new page/component before merging (manual gate today, automated gate in Phase 6+)
- In development, before switching to German or Arabic (you will see the list of gaps immediately)

### Example Output

```javascript
> VamosLocale.coverage(document.querySelector('[data-page="checkout"]'))
[
  "Secure checkout with Stripe",
  "Apply coupon code",
  "I agree to the terms"
]
```

→ All three strings need entries in `vamos-i18n-dict.js` with `de`, `fr`, `ar` keys.

### How to Fix

1. Identify the untranslated strings from `coverage()` output
2. Add them to `app/vamos-i18n-dict.js`:
   ```javascript
   Object.assign(VamosI18nDict.de, {
     'Secure checkout with Stripe': 'Sichere Kasse mit Stripe',
     'Apply coupon code': 'Coupon-Code anwenden',
     'I agree to the terms': 'Ich stimme den Bedingungen zu'
   });
   ```
3. Repeat for `fr` and `ar`
4. Re-run `coverage()` — should return `[]`

---

## Test File Organization (Production — Phase 5+)

When the production Next.js app is built, tests will follow this structure:

```
apps/web/
├── __tests__/
│   ├── api/                    # API route tests
│   │   ├── quote.test.ts       # Quote engine
│   │   ├── stripe-webhook.test.ts
│   │   └── flight.test.ts
│   ├── middleware.test.ts      # Auth, locale, RLS
│   └── pages/                  # Route tests
│       ├── home.test.tsx
│       ├── checkout.test.tsx
│       └── [locale]/
├── jest.config.ts             # Jest config
└── .env.test                  # Test env vars (never commit secrets)
```

**Pattern:**
- Test file next to the code it tests (co-located) or in `__tests__/` mirror
- Naming: `*.test.ts` or `*.spec.ts`
- Supabase RLS: use `supabase test db`
- API routes: mock Hyperdrive + Stripe test keys
- Pages: Playwright/Cypress (TBD at Phase 6)

---

## Mocking Patterns (Production)

### Stripe (test mode)

```typescript
// Don't import the live secret; use test-mode in tests
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);

// Test card numbers: 4242 4242 4242 4242 (success), 4000 0000 0000 0002 (auth required)
// Test: webhook events, refunds, disputes
```

### Supabase (local + test DB)

```typescript
// Use supabase CLI for local testing
// supabase start  # Spins up local Postgres + Auth
// supabase test db  # Runs RLS policy tests

// In tests: use `supabase-js` with test service role (for setup)
// Queries: Hyperdrive via @supabase/ssr middleware
```

### Mapbox (KV cache + fallback)

```typescript
// Geocoding + Directions cached in Cloudflare KV by place-id pair (24 h TTL)
// When API is down, render "Try again" (don't invent a route)
// Load test: mock responses or use test API key
```

---

## Coverage Goals (Phase 6+, not active today)

### Target Coverage

- **API routes:** ≥ 80 % (quote, payments, webhooks are critical)
- **RLS policies:** 100 % (every rule path tested)
- **Localisation:** 100 % (`VamosLocale.coverage()` must return `[]`)
- **Routes:** visual regression (layout, typography, colour at 1440/1024/768/390)

### Not Covered

- **Unit tests for React components** — design system components are trusted (they are vendored and ship pre-tested); app pages are integration-tested via E2E
- **Snapshot tests** — banned (they hide changes, create merge conflicts, and encourage ignoring diffs)
- **Mocking internals** — prefer integration tests over unit tests that mock half the app

---

## CI/CD Testing (Phase 1+)

**GitHub Actions workflow (planned, not active yet):**

```yaml
name: CI

on:
  push:
    branches: [main, staging]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      
      # Type check
      - run: npm run typecheck
      
      # Lint
      - run: npm run lint
      
      # Build (catches compile errors)
      - run: npm run build
      
      # Unit + integration tests
      - run: npm test
      
      # E2E (Playwright/Cypress) — Phase 6+
      # - run: npm run test:e2e
      
      # Load test on staging (nightly, Phase 8+)
      # - run: npm run test:load
```

**Per-PR checks:**
- Typecheck passes
- Linting passes (ESLint, Prettier)
- Build succeeds
- Tests pass
- No secrets leaked (git-secrets)
- `CHANGELOG.md` updated (manual gate)
- Design review approved (manual gate)

**Per-merge to `main`:**
- Deploy to staging
- Smoke tests pass
- Deploy to prod if all green + owner approval

---

## Observability & Monitoring (Phase 8+, planned)

**Sentry (error tracking):**
```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.captureException(error, {
  tags: { route: '/checkout', phase: 'payment' }
});
```

**Workers Logs + Logpush:**
- All Worker request/response logs shipped to external log ingestion
- Alert on error rate > 1 %, latency p95 > 2 s

**Stripe / Supabase dashboards:**
- Monitor webhook delays, failed events
- Track database connection pool usage
- Alert on quota overage

**Uptime checks:**
```bash
GET https://vamostaxi.eu/          # Home page
GET https://vamostaxi.eu/api/health   # DB + Stripe + Mapbox health
```

---

## Test Environment Variables

**Never commit:**
- `.env` (use `.env.local` locally, secrets manager in CI)
- `.env.test` (if it contains real keys)
- Stripe secret keys, Supabase service role, Mapbox tokens

**Safe to commit (for reference):**
```bash
# .env.example (template only, no values)
STRIPE_PUBLIC_KEY=pk_test_...     # Test key prefix, no value
SUPABASE_URL=https://xxx.supabase.co
MAPBOX_PUBLIC_TOKEN=pk.eyJ...     # Masked
```

**In CI (GitHub Secrets):**
```bash
STRIPE_SECRET_KEY_TEST=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_SERVICE_ROLE=eyJ...
MAPBOX_TOKEN=sk.eyJ...
```

---

*Testing analysis: 2026-08-17*

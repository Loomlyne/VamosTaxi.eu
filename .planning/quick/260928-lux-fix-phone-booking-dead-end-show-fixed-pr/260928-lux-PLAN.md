---
phase: quick-260928-lux
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/home/home.dc.html
  - apps/web/tests/visual/home-phone-show-prices.spec.ts
autonomous: true
requirements: [QUICK-260928-LUX]

must_haves:
  truths:
    - "At 390px, tapping SHOW FIXED PRICES with a complete trip saves the trip (vehicle '') and lands on /checkout/trip once /api/quote returns lock + quote_id"
    - "At 390px, a failed quote (network error, ok:false, missing fields, hourly) never navigates later"
    - "At 390px, a second tap with a live locked quote and unchanged inputs navigates immediately, without a new POST /api/quote"
    - "At >=700px (tablet/desktop), SHOW FIXED PRICES still only closes the sheet and quotes; the class strip is used; no navigation"
    - "No new visible strings; announcements reuse getting / savedGo / needTrip in en/de/fr/ar"
  artifacts:
    - path: "app/home/home.dc.html"
      provides: "Phone continue-to-trip flag honoured by applyLive, cleared on every failure path"
      contains: "_goTripFree"
    - path: "apps/web/tests/visual/home-phone-show-prices.spec.ts"
      provides: "Playwright proof at component-390 (navigates) and component-1440 (does not)"
  key_links:
    - from: "goQuote / applySheet (tier 0 only)"
      to: "goTripOpen()"
      via: "this._goTripFree flag consumed in applyLive after lock + quote_id"
      pattern: "_goTripFree"
---

<objective>
Fix the phone booking dead end on the home page. Under 700px the class cards (`[data-hide-narrow]`, hidden by line 239 `@media (max-width:699px)`) are the only way into `/checkout/trip`, so a phone user who taps SHOW FIXED PRICES gets a live quote and no visible change. On phone (`tier === 0`, which `TIER()` at ~line 1470 maps exactly to `(max-width:699px)` — the same query as the strip-hide rule), SHOW FIXED PRICES must continue to `/checkout/trip` through the existing `goTripOpen()`. Desktop/tablet behaviour stays byte-for-byte the same.

Purpose: Core value is quote → pay → confirmation. Phone users currently cannot book at all on https://vamostaxi.site.
Output: patched `app/home/home.dc.html`, synced into `apps/web/public/app/`, a new Playwright spec, one local commit on main. No push. No deploy.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@./CLAUDE.local.md
@app/home/home.dc.html

Confirmed during planning (do not re-investigate):
- `/` in production is the synced mock, not a React port: `apps/web/middleware.ts` line ~28 `const DC_HOME = "/app/home/home.html"` and `DC_PAGES["/"] = DC_HOME`; `apps/web/app/[locale]/page.tsx` renders `null`. There is NO second port to fix.
- `/checkout/trip` is a Next route (middleware comment: "/checkout/trip|/details|/payment are Next"). It reads the saved trip; with no trip it redirects to `/`.
- Both SHOW FIXED PRICES buttons must get the phone behaviour: line ~438 `onClick="{{ goQuote }}"` (widget) and line ~685 `onClick="{{ applySheet }}"` (sticky CTA inside the phone sheet, `[data-sheetonly="cta"]`). On phone the user is normally in the sheet, so `applySheet` is the one actually tapped.

<interfaces>
From app/home/home.dc.html (current code, line numbers approximate):

TIER(): 0 when matchMedia('(max-width:699px)'), 1 when '(max-width:1079px)', else 2. State key `tier` kept current by `_onResize`.

goQuote  = () => { if (this.flightMissing()) { this.askFlight(); return; } this.closeSheet(); this.q(); };   // ~2419
applySheet = () => { if (this.flightMissing()) { this.askFlight(); return; } this.closeSheet(); this.q(); }; // ~2420

q = () => { clearTimeout(this._deb); this._deb = setTimeout(this.fireQuote, 300); };  // ~1794
fireQuote (~1795) paths:
  - `if (!r.ok) { ... if (this._goTripKey) { this._goTripKey = null; patch.announce = this.t().needTrip; } else if (msg) {...} ... return; }`
  - `const failAll = () => { if (id !== this.reqSeq) return; if (this._goTripKey) this._goTripKey = null; ... }`  (used by hourly, missing place, fetch catch)
  - flightMissing early return (sets quote empty + flightAsk, returns)
  - `.then((j) => { if (id !== this.reqSeq) return; if (!j || j.ok !== true) { ...quoteFail:true, announce: note...; return; } ... applyLive(res, { lock: j.lock, quote_id: j.quote_id, expires_at, fleetOffer, noRoad }); })`
  - applyLive (~1825) setState callback: `this.revealAll(); if (this._goTripKey && this.state.fixedKey === this._goTripKey && patch.lock && patch.quote_id) { this._goTripKey = null; this.goTripOpen(); } else if (this._goTripKey) { this._goTripKey = null; this.setState({ announce: this.t().needTrip }); }` then the capacity-move logic, then a final `this.setState({ announce: routeStr + ... })`.

goFixedDest(key) (~2633): the existing "live + lock + quote_id → goTripOpen() now, else set flag + announce getting + quote" pattern. Mirror it.
goTripOpen() (~2644): guards `!s.quote.lock || !s.quote.quote_id` → announce needTrip; else saveTrip({... vehicle: '', classes: priced, classOffers ...}), announce savedGo, `setTimeout(() => location.href = prefix + '/checkout/trip', REDUCED ? 120 : 420)`. Prefix is '/de' | '/fr' | '/ar' | ''.

i18n keys already in all four languages in the component's own table: `getting`, `savedGo`, `needTrip`.
saveTrip writes localStorage key `vamosTrip` and sessionStorage `vamosQuoteLock`.
</interfaces>

Test harness (from apps/web/tests/visual/home-fleet-availability.spec.ts and home-one-way.spec.ts):
- `import { serveMock, waitForMockReady } from "../support/mock-harness";` — `serveMock("app/home/home.dc.html")` serves the repo-root source file (no sync needed for tests).
- Mock the quote with `page.route("**/api/quote", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, quote_id: "test-quote", lock: "test-lock", expires_at: "2099-01-01T00:00:00.000Z", classes: [{ slug: "business", eligible: true, total_rappen: 13000 }, { slug: "van", eligible: true, total_rappen: 15000 }] }) }))`. Rappen values stay inside the test only; they are never rendered to a reviewer as a real price.
- Field fill pattern: combobox "Pickup" fill "Zurich Airport" → option /Zurich Airport \(ZRH\), Terminal 2/; combobox "Destination" fill "Bahnhofstrasse" → option /Zurich, Bahnhofstrasse 1/; button "Select date & time" → button "5" exact.
- Phone open: `openBookingIfNarrow` in home-one-way.spec.ts clicks `[data-upto-wide] button[aria-haspopup="dialog"]` and waits for `[data-shell][data-open="1"]`. Cookie banner: `dismissCookies`.
- Projects: `component-390` (390x900) and `component-1440` (1440x900). Run from apps/web: `npx playwright test <spec> --project=component-390 --project=component-1440`.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Phone SHOW FIXED PRICES continues to /checkout/trip via goTripOpen()</name>
  <files>app/home/home.dc.html, apps/web/tests/visual/home-phone-show-prices.spec.ts</files>
  <behavior>
    - 390px, complete trip, quote mock returns lock + quote_id: tapping the sheet's SHOW FIXED PRICES leads to a URL ending `/checkout/trip`; `localStorage.vamosTrip` has `quote_id: "test-quote"`, `lock: "test-lock"`, `vehicle: ""`, non-empty `classes`.
    - 390px, quote mock returns `{ ok: false, error: "route_unavailable" }`: after tapping and waiting ~1.5s, URL is still the home mock and no `vamosTrip` with `quote_id` is saved.
    - 390px, quote mock aborts (`route.abort()`): same — no navigation.
    - 1440px, same happy-path mock: clicking SHOW FIXED PRICES does NOT navigate (URL unchanged after ~1.5s), `[data-fleet-card]` cards are visible, `vamosTrip` is not saved with `vehicle: ""`.
  </behavior>
  <action>
    Step A — write the spec first (RED): create `apps/web/tests/visual/home-phone-show-prices.spec.ts` tagged `@customer`, using the harness and fill pattern in the context block. Intercept `**/checkout/trip**` with `route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>trip</body></html>" })` so the static harness does not 404, and assert with `page.waitForURL(/\/checkout\/trip/)`. Gate phone tests with `test.skip(testInfo.project.name !== "component-390")` and the desktop test with `test.skip(testInfo.project.name !== "component-1440")`. At 390 open the sheet first (copy `openBookingIfNarrow` + `dismissCookies` locally), fill fields inside the sheet, then click the SHOW FIXED PRICES button that is visible (name regex `/show fixed prices/i`, use `.filter({ visible: true }).first()` or scope to `[data-sheetonly="cta"]`). If the chosen tab requires a flight number (flightMissing → askFlight), fill the flight field with `LX 54` — mirror whatever the fleet-availability spec does for the default tab; do not change the default tab. Run the phone happy-path test and confirm it FAILS on the current code (no navigation).

    Step B — implement (GREEN) in `app/home/home.dc.html`, logic block only, no markup/CSS changes:
    1. Add a method `quoteSig = () => ...` returning a string built from the inputs that change a quote: `mode`, pickup (`pickupLoc && pickupLoc.mapbox_id` or `pickupText`), dropoff (same with `dropLoc`/`dropText`), `dayY`, `dayM`, `day`, `time`, `pax`, `bags`, trimmed `flight`, `cur`, `hours`. Join with `|`.
    2. In `applyLive`, inside the setState callback, record `this._liveSig = this.quoteSig()` when `patch.lock && patch.quote_id` (before the flag checks). Then, after the existing `_goTripKey` if/else-if block, add a separate branch for the new free-route flag: if `this._goTripFree` is set → clear it; if `patch.lock && patch.quote_id` → call `this.goTripOpen()` and `return` from the callback (so the trailing route announce does not overwrite `savedGo`); else `this.setState({ announce: this.t().needTrip })`. The `_goTripKey` branch must keep precedence and remain unchanged.
    3. Clear `this._goTripFree = null` on every failure path in `fireQuote`: the `!r.ok` branch (announce `needTrip` when the flag was set and no flight message applies, mirroring the `_goTripKey` handling; keep the flight message when `msg` is set), inside `failAll` (next to the `_goTripKey` clear), the `flightMissing()` early return, and the `!j || j.ok !== true` branch. Also set `this._liveSig = null` in the `!j.ok`/failAll paths so a stale signature can never short-circuit.
    4. Add a helper `phoneToTrip = () => { ... }` used only when `this.state.tier === 0`: if `s.quote.status === 'live' && !s.quote.inflight && s.quote.lock && s.quote.quote_id && this._liveSig && this._liveSig === this.quoteSig()` → `this.goTripOpen()` immediately (no new quote, like `goFixedDest`); otherwise set `this._goTripFree = true`, `this.setState({ announce: this.t().getting })`, and `this.q()`.
    5. Change `goQuote` and `applySheet` to: flight check unchanged → `this.closeSheet()` → if `this.state.tier === 0` call `this.phoneToTrip()`, else `this.q()` exactly as today. Tier ≥ 1 path must be character-identical in effect.
    6. Do not touch `goFixedDest`, `goTripOpen`, `_goTripKey` semantics, the `[data-hide-narrow]` CSS, or any string table. No new visible copy: reuse `getting`, `savedGo`, `needTrip` (already in en/de/fr/ar). No colours, shadows, or styles added (four platform laws unchanged).
    Re-run the spec at both projects until green.

    Step C — sync: from repo root run `node scripts/sync-dc-mock-to-public.mjs` so `apps/web/public/app/home/` carries the change (gitignored; source of truth is `app/home/home.dc.html`).
  </action>
  <verify>
    <automated>cd /Users/koss/Developer/VamosTaxi.eu/apps/web && npx playwright test tests/visual/home-phone-show-prices.spec.ts tests/visual/home-fleet-availability.spec.ts tests/visual/home-one-way.spec.ts --project=component-390 --project=component-1440 --reporter=line 2>&1 | tail -25</automated>
  </verify>
  <done>New spec passes at component-390 (navigates on success, no navigation on ok:false and abort) and component-1440 (no navigation, fleet cards shown). Existing home-fleet-availability and home-one-way specs still pass. `grep -c "_goTripFree" app/home/home.dc.html` ≥ 6. `grep -n "_goTripFree" apps/web/public/app/home/*.html` finds the synced copy.</done>
</task>

<task type="auto">
  <name>Task 2: Guard checks and local commit (no push, no deploy)</name>
  <files>app/home/home.dc.html</files>
  <action>
    1. Law checks on the diff only: `git diff app/home/home.dc.html` must add no `box-shadow`, no `--vt-yellow-`, no hex colour, no `CHF` literal, no new quoted English UI string (only the existing `this.t().getting|savedGo|needTrip` references). If any appear, remove them.
    2. Confirm there is no React port of the home widget to patch: `grep -rln "goQuote\|tShowPrices" apps/web/app apps/web/components 2>/dev/null` returns nothing (planning already confirmed `/` → `DC_HOME` in middleware and `[locale]/page.tsx` returns null). If this grep unexpectedly returns a file, stop and report it instead of committing.
    3. Run the unit suite touching home fixtures: `cd apps/web && npx vitest run tests/unit/home-flight-fixtures.test.ts`.
    4. Commit on local `main` only the two tracked files (`app/home/home.dc.html`, `apps/web/tests/visual/home-phone-show-prices.spec.ts`) plus this quick-task directory's plan/summary. Do NOT stage the untracked `.claude/rules/`, `.hermes/`, `CLAUDE.local.md`, or `archive/` paths. Message: `fix(home): phone "Show fixed prices" continues to /checkout/trip` with a short body (class strip is hidden under 700px; tier 0 now reuses goTripOpen after a locked quote; desktop unchanged) and the Co-Authored-By trailer. Do NOT push. Do NOT run wrangler deploy. Report that local main is now ahead of origin by this commit and that deploy to Worker `vamos` waits for Koss's explicit approval.
  </action>
  <verify>
    <automated>cd /Users/koss/Developer/VamosTaxi.eu && git diff HEAD~1 -- app/home/home.dc.html | grep '^+' | grep -Eic 'box-shadow|--vt-yellow-|#[0-9a-f]{6}|CHF' ; git log -1 --stat | head -12; git status -sb | head -3</automated>
  </verify>
  <done>First count prints 0. Last commit is the fix with only the intended files. `git status -sb` shows `main...origin/main [ahead N]`; nothing pushed, nothing deployed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser → /api/quote | Quote stays server-authoritative; the client only forwards lock + quote_id it received |
| home → /checkout/trip | Trip handed over via localStorage `vamosTrip`; /checkout/trip re-validates the lock server-side |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-260928-01 | Tampering | vamosTrip in localStorage | accept | Unchanged from goFixedDest path; checkout re-checks lock/quote_id server-side, price never taken from client |
| T-260928-02 | Denial of service | repeated taps firing /api/quote | mitigate | Reuse live locked quote when quoteSig() is unchanged; `q()` debounce (300ms) still coalesces taps; existing Turnstile/WAF unchanged |
| T-260928-03 | Spoofing (stale navigation) | late quote response after failure | mitigate | `_goTripFree` cleared on !r.ok, failAll, flightMissing, ok:false; reqSeq guard drops stale responses |
</threat_model>

<verification>
- Playwright: new spec green at 390 and 1440; existing home-fleet-availability + home-one-way green.
- Synced public copy contains the change.
- No new strings, colours, or styles; four laws intact.
- Local commit on main; not pushed; not deployed.
</verification>

<success_criteria>
A phone user at 390px who completes the widget and taps SHOW FIXED PRICES reaches /checkout/trip with the locked quote and class list saved; failures never navigate; desktop and tablet behave exactly as before.
</success_criteria>

<output>
Create `.planning/quick/260928-lux-fix-phone-booking-dead-end-show-fixed-pr/260928-lux-SUMMARY.md` when done.
</output>

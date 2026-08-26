# Research Brief — QUOTE-08 Flight Autofill (Phase 4)

**Lane:** flight-autofill · **Phase:** 4 (Quote & Pricing Engine)
**Requirement:** `REQUIREMENTS.md:68` — "Entering a flight number fills in the landing time."
**Reads on:** `docs/build/GSD-LAUNCH.md:119-120` (`GET /api/flight/:no` behind KV, degrade to manual time), `docs/build/GSD-LAUNCH.md:220` (`FLIGHT_API_KEY` secret), `app/home/home.dc.html:557-748` (the mock's already-normalized AeroDataBox contract — this is not a blank slate, it is a spec), `REQUIREMENTS.md:149` (`LATER-01`: live tracking is explicitly deferred past autofill+delay).

---

## 0. What the repo already commits us to

The mock at `app/home/home.dc.html` is not a placeholder — its comments (`:557-563`, `:714-748`) describe **AeroDataBox's actual response shape** (`scheduledTime`, `revisedTime`, `runwayTime`, `terminal`, `gate`, `baggageBelt`, host `aerodatabox.p.rapidapi.com`, headers `X-RapidAPI-Key`/`X-RapidAPI-Host`) with enough precision that whoever built the mock had already read AeroDataBox's docs. I verified every one of these field names against AeroDataBox's own OpenAPI-generated client docs (below) — they match exactly. This brief treats the mock as the UX contract and fills in the provider, caching and degradation contract GSD-LAUNCH left open ("AeroDataBox **or** FlightAware").

---

## 1. Provider: AeroDataBox — confirmed, not re-litigated as a coin-flip

| | **AeroDataBox** | **FlightAware AeroAPI** |
|---|---|---|
| Entry price | Free "Basic" tier, 600 API units/month; **Pro $5.35/mo**; Ultra $32/mo; Mega $160/mo [[pricing]](https://thunderbit.com/blog/best-flight-api-with-free-tiers) | **$200/month minimum** (Standard), 5 result-sets/sec; Personal tier only gives $5 of query credit |
| Rate limit | 1 req/sec on Basic + a 1,000 req/hour RapidAPI ceiling; higher on paid tiers [[pricing]](https://thunderbit.com/blog/best-flight-api-with-free-tiers) | 5–100 result-sets/sec depending on tier |
| Auth | `X-RapidAPI-Key` + `X-RapidAPI-Host` header pair (RapidAPI marketplace) or a direct `apikey` header via api.market — matches the mock's existing code exactly | API key header, own portal (`flightaware.com/aeroapi/portal`) |
| Flight-number lookup | `GET /flights/number/{number}/{date}` — confirmed shape (see §2) | `GET /flights/{ident}` — returns `scheduled_out/off/on/in`, `estimated_*`, `actual_*` per leg |
| Data returned | Departure/arrival each carry `scheduledTime`, `revisedTime` (estimate), `runwayTime` (actual), `terminal`, `gate`, `baggageBelt` (arrival only), plus a data-quality `quality[]` array telling you which of those are actually populated for this record — AeroDataBox is explicit that terminal/gate/belt are **"sometimes", not guaranteed** [[Dart client docs generated from AeroDataBox's OpenAPI spec]](https://pub.dev/documentation/aerodatabox/latest/openapi.api/AirportFlightContractArrival-class.html) | Similar granularity, ADS-B-backed |
| Fit for this product | A once-per-booking convenience lookup, low volume (one lookup per customer who types a flight number, not a per-second tracking feed) | Built and priced for high-frequency operational tracking (airport ops boards, logistics) |

**Decision: AeroDataBox.** The cost model is the deciding fact, not a preference: this product needs *one lookup per customer who bothers to type a flight number*, at pre-booking volume (dozens to low hundreds a day at launch, not a tracking feed). FlightAware's $200/month floor prices a per-second ADS-B tracking product that we do not need — LIFE-06 (flight-delay pickup shift) is Phase 9 and even that is a scheduled poll on *confirmed, paid* bookings only, not live GPS. AeroDataBox's Pro tier ($5.35/mo) or Ultra ($32/mo) — whichever the real launch volume needs, see UNCERTAIN-3 — is priced for exactly this shape of usage, and the mock was already built against its response format.

**UNCERTAIN-1 (settle before go-live).** Confirm the exact unit cost of the `/flights/number/{number}/{date}` endpoint (search results say "Tier 1–3, 1–6 units" but which tier this specific endpoint falls in wasn't independently confirmed against a paid RapidAPI dashboard — the marketplace pricing page is client-rendered and didn't return real content to fetch tools in this pass). **Check:** once a RapidAPI account exists (Phase 0 owner action, not yet provisioned per the brief you gave me), open `https://rapidapi.com/aedbx-aedbx/api/aerodatabox/pricing` while logged in and read the per-endpoint unit cost table directly; size the tier from `(expected daily flight-number entries) × (unit cost) × 30`.

---

## 2. The lookup contract

### 2.1 What the customer types, and when the lookup fires

Matching the mock exactly (`app/home/home.dc.html:1289-1341`, `fmtFlightInput`/`setFlight`/`lookupFlight`):

- Free-text field, uppercased, non-alphanumerics stripped as typed (`LX 318` → normalized to `LX318` for the API call, displayed as `LX 318`).
- Debounced 900ms after the last keystroke, **and only once the normalized string matches `^[A-Z0-9]{2}\d{1,4}$`** (a two-letter/digit IATA/ICAO airline code plus 1–4 digit flight number). Anything that doesn't match this shape after the debounce is a **malformed input** error, not a provider call — never spend a paid API unit on a string that cannot be a flight number.
- The date defaults to **today, Europe/Zurich civil calendar date** with an explicit "today / tomorrow" toggle exposed to the customer (mirroring `flightDateChoice` in the mock) — because at the point of typing a flight number the customer may not yet have picked a pickup date (that is frequently what the lookup is *for*, on the arrival side).

### 2.2 Ambiguity resolution

Two distinct ambiguities, resolved two different ways:

1. **"A number flies daily."** AeroDataBox's endpoint takes an explicit date path segment — `GET /flights/number/LX318/2026-08-22` — so this is resolved by construction: we are never asking "which day," we are always asking "this day," because the customer told us which day via the today/tomorrow toggle (or an explicit date, once the widget has one).
2. **Codeshares.** A single physical flight can be sold under several flight numbers (e.g. Swiss `LX318` and a Star Alliance partner's shared number). AeroDataBox resolves this per-record with a `codeshareStatus` field (`IsCodeshare`/`Operator`/`Unknown`) [[Dart client docs]](https://pub.dev/documentation/aerodatabox/latest/openapi.api/CodeshareStatus-class.html) — whichever of the codeshare numbers the customer types, the API returns *that record's* operating times, which is the number that matters (the driver watches whichever number the boarding pass says, per the mock's own copy at `manage-booking.dc.html:289`: "Airline code and number, as printed on your boarding pass"). We do not need to dedupe codeshares against each other; we only need the record for the number typed.

**UNCERTAIN-2 (overnight edge case).** AeroDataBox added a `dateLocalRole` query parameter (`Departure`/`Arrival`/`Both`) specifically because a flight departing late and landing past midnight can appear under either local date and the endpoint can return **more than one record** for a single number+date query [[AeroDataBox changelog: "Flight History … Improved Date Control"]](https://aerodatabox.com/flight-history/). The mock's own code takes `Array.isArray(j) ? j[0] : …` — first result, unconditionally (`home.dc.html:737`). **That shortcut is not safe for production** for an overnight flight. Production behaviour: if the response array has more than one entry, do not guess — surface both as a small disambiguation choice ("Departs 23:40 today" vs "Arrives 00:15 tomorrow"), the same UI pattern the mock already uses for its flight-search suggestions list (`fsug`). **Check:** once a key exists, look up a known late-departure/early-arrival flight (e.g. a red-eye) on both the departure date and the day after, with and without `dateLocalRole`, and confirm whether omitting the parameter still returns multiple rows or whether the API already disambiguates by role today.

### 2.3 What gets written into the booking, and the buffer question — resolved

The task asked where a "landing plus a buffer" figure lives. **It does not exist as a separate value, and it must not be invented.** Read closely, the mock's own copy already resolves this (`home.dc.html:792`, ported verbatim into `booking_legs.scheduled_at` reasoning):

> "Flight delayed, bags last off the belt, passport queue — your driver waits an hour on every airport pickup at no extra cost, and we track the flight so the pickup time moves with it."

The pickup time written to the booking **is the landing time itself** (`bestT(f.arr)` — actual, else estimated, else scheduled, in that precedence, `home.dc.html:604-605`), not landing-plus-some-minutes. The allowance for disembarking, baggage and passport control is not a scheduling buffer added *before* the pickup time; it is the **waiting allowance** that applies *after* it — i.e. `settings.airport_waiting_minutes`, which Phase 2 (ADR-002) already deliberately seeded **NULL**, not 60. That decision stands and this lane does not reopen it: until the owner confirms the waiting-allowance number, any UI copy describing "your driver waits N minutes" must render the Law-04 TBC pill, exactly like every other surface ADR-002 lists (`app/home/home.dc.html:759,791`, `app/pages/account.dc.html:255`, etc.) — flight autofill does not get a private exemption. This lane introduces **zero new settings values** and invents **zero minutes**.

Precedence rule, ported from the mock's `bestT`/`bestSrc` (`home.dc.html:602-603`) — this is the one piece of business logic worth stating precisely because it decides which of three timestamps wins:

```
landing_time = arr.runwayTime ?? arr.revisedTime ?? arr.scheduledTime   // actual › estimated › scheduled
landing_time_source = arr.runwayTime ? 'actual' : arr.revisedTime ? 'estimated' : 'sched'
```

A field the provider has no value for stays `null` and nothing is rendered for it (mock's own comment, `home.dc.html:563`) — never invent a gate, terminal or belt.

### 2.4 Schema note (not a Phase 2 edit — flagged for whoever writes the Phase 4 migration)

`booking_legs.flight_no text` (02-SCHEMA-DRAFT.md:889) already carries the flight number; nothing else does. Two nullable, additive columns answer the "why does this booking read 13:20" question the same way `price_snapshots` answers "why does this booking cost what it costs" — small, but worth carrying forward as a Phase 4 migration (`packages/db/migrations/00xx_flight_lookup.sql`), not a Phase 2 edit:

```sql
alter table public.booking_legs
  add column flight_checked_at  timestamptz,             -- when the lookup last resolved a time
  add column flight_time_source text                     -- which reading fed scheduled_at
    check (flight_time_source in ('scheduled','estimated','actual'));
```

And one addition to `booking_events.kind`'s CHECK list (02-SCHEMA-DRAFT.md:1513-1515 is a `text check (kind in (…))`, not a closed enum, so this is a plain migration, not a Phase-2 rewrite):

```sql
-- extend the existing CHECK to also allow:
'flight.autofilled'   -- customer applied a looked-up flight to the booking (distinct from
                       -- Phase 9's 'flight.delayed', which is a post-payment shift)
```

---

## 3. KV caching

**Key shape** — flight number + date only, never a customer/booking identifier, per the KV-jurisdiction rule you already gave me ("keys are place-id pairs and flight numbers, never `customer_id`/`booking_id`/email, so the cache never holds personal data regardless of which PoP replicates it"):

```
flight:{NORMALIZED_NUMBER}:{YYYY-MM-DD}      e.g.  flight:LX318:2026-08-22
```

**TTL, tiered by how far out the date is** — the reason a same-day flight cannot share a future flight's TTL is that a same-day record's `revisedTime`/`runwayTime` change as the flight actually moves (gate assignment, delay revision, touchdown), while a flight three weeks out only changes on the rare schedule change:

```ts
// apps/web equivalent — shown here for the contract, not written by this lane
function ttlFor(dateIso: string): number {
  const daysOut = Math.floor((Date.parse(dateIso) - todayZurichMidnightUtcMs()) / 86_400_000);
  if (daysOut >= 2) return 21_600;   // 6h — schedule-change risk only, not worth refreshing hourly
  if (daysOut === 1) return 1_800;   // 30 min — next-day, moderate churn
  return 90;                          // same day — floor is Cloudflare's KV minimum (60s); 90s
                                       // gives headroom above it while still feeling "live" to
                                       // someone re-typing the same number a minute later
}
```

Cloudflare's KV `put()` **hard-refuses any `expirationTtl` under 60 seconds** ("Expiration targets that are less than 60 seconds into the future are not supported") [[Cloudflare Workers KV — Write key-value pairs]](https://developers.cloudflare.com/kv/api/write-key-value-pairs/) — so same-day cannot go below that floor regardless of how live we want it to feel; 90s is the chosen value, not 60, to leave margin.

```ts
// lib/flight/lookup.ts — the shape of the cached call
async function lookupFlight(env: Env, number: string, dateIso: string) {
  const key = `flight:${number}:${dateIso}`;
  const cached = await env.QUOTE_CACHE.get(key, 'json');
  if (cached) return { ...cached, cacheHit: true };

  const record = await fetchFromAeroDataBox(env, number, dateIso); // may throw
  if (record) {
    await env.QUOTE_CACHE.put(key, JSON.stringify(record), { expirationTtl: ttlFor(dateIso) });
  }
  return record ? { ...record, cacheHit: false } : null;
}
```

**No background polling.** The mock's `startPoll`/`refreshFlight`/`mergeFlight` (`home.dc.html:1416-1470`) re-checks the flight every 45s while the booking widget stays open, pushing updated times/gates into the still-unpaid form. **This is deliberately not ported to Phase 4.** `REQUIREMENTS.md:149` already names this precisely: `LATER-01 — Live flight tracking on the ops board, beyond autofill and delay-aware pickup`. QUOTE-08 is "entering a flight number fills in the landing time" — a one-shot lookup triggered by the customer's own action (typing, or explicitly re-checking). A recurring poll before payment is the first step toward the live-tracking product this project has explicitly ruled out (`.claude/CLAUDE.md`: "explicitly not on-demand ride-hailing: no live GPS … no 'arriving in 3 minutes'"), and it multiplies paid-API cost for a feature nobody asked for pre-payment. If a customer wants a fresher read, they re-open the flight card or re-enter the number — same one-shot lookup path, same cache.

---

## 4. Degradation: provider down

The stack rule is explicit: "flight autofill API down → prompt for manual time." Two distinct failure shapes need two distinct messages, because conflating them breaks the project's own error-copy rule ("instructions, not blame"):

| Failure | Cause | Customer sees |
|---|---|---|
| **Malformed number** | Typed text never matched `^[A-Z0-9]{2}\d{1,4}$` | *"Check the flight number"* — reuses the mock's existing `flightErr` string verbatim (`home.dc.html:753`) |
| **Genuinely not found** | AeroDataBox returned 200 with no matching record for that number+date | *"No flight on that number today"* — reuses the mock's existing `flightMiss`/`noFeed` string (`home.dc.html:753,784`), which already offers "we drive Zurich, Geneva and Basel — pick one of these, or set the pickup yourself" |
| **Provider unavailable** *(new — this lane's addition)* | Timeout, 5xx, or RapidAPI 429 (rate/quota exceeded) | A **new**, blame-free string: *"We can't check flights right now — enter your pickup time."* The flight-number field stays usable and is still saved on the booking (the driver still gets told which flight to watch, per `manage-booking.dc.html:289`) — only the *autofill* is unavailable, not the field itself |

```ts
// route.ts — apps/web equivalent, shown for the contract only
export async function GET(req: Request, { params }: { params: { no: string } }) {
  const date = new URL(req.url).searchParams.get('date');
  if (!/^[A-Z0-9]{2}\d{1,4}$/.test(params.no)) {
    return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
  }
  try {
    const record = await lookupFlight(env, params.no, date);
    return record
      ? Response.json({ ok: true, flight: record })
      : Response.json({ ok: false, reason: 'not_found' }, { status: 404 });
  } catch (err) {
    // Timeout / 5xx / 429 from AeroDataBox — never surface the provider's error to the
    // customer, never blame the flight number for an outage that isn't about the number.
    return Response.json({ ok: false, reason: 'provider_unavailable' }, { status: 503 });
  }
}
```

The client distinguishes `reason: 'provider_unavailable'` from `'not_found'`/`'malformed'` and renders the third message above instead of either existing one — the booking flow itself never blocks: pickup date/time remain freely editable manual fields regardless of which of the three states fired.

---

## 5. Four-language requirement

Additions to `app/vamos-i18n-dict.js` (the two strings genuinely new to this lane — `flightErr`/`flightMiss`/`flightHint` etc. already exist in all four languages in the mock and are reused unchanged):

```js
// en
flightUnavailable: "We can't check flights right now — enter your pickup time.",
flightRecheck: 'Check again',

// de (Swiss German — "ss" not "ß")
flightUnavailable: 'Wir können Flüge gerade nicht prüfen — geben Sie Ihre Abholzeit ein.',
flightRecheck: 'Erneut prüfen',

// fr
flightUnavailable: 'Impossible de vérifier les vols pour le moment — indiquez votre heure de prise en charge.',
flightRecheck: 'Vérifier à nouveau',

// ar
flightUnavailable: 'يتعذّر علينا التحقق من الرحلات حاليًا — أدخل وقت الاستلام بنفسك.',
flightRecheck: 'إعادة التحقق',
```

These follow the existing dict's exact shape (flat keys under each `lang` block, `home.dc.html:751-940`) and the voice rules already in force: present tense, second person, instruction not blame, no invented figures. `flightNo`/times in the flight card need `.vt-dir-keep` in Arabic (already the mock's convention for codes/times — `CLAUDE.md` "Arabic-Specific": *"references, times, flight numbers, CHF figures, codes like `VT-4821`"* stay LTR inside RTL text) — this is not new, just carried forward for whatever renders the flight card.

---

## 6. What this does not do (scope line, stated precisely)

- **No live GPS, no polling loop, no "your flight is now 12 minutes later" push before payment.** One lookup, on customer action, cached. `LATER-01` owns anything beyond that.
- **No delay-aware pickup shift on a confirmed booking.** That is `LIFE-06`, Phase 9, and it is a fundamentally different mechanism: a scheduled Cron sweep over *paid, confirmed* legs with a flight number, re-checking status close to departure, and — if the landing time moved — running the exact same `DEFERRABLE INITIALLY IMMEDIATE` exclusion-constraint dance the schema already forward-designed for it (02-SCHEMA-DRAFT.md:965, "LIFE-06's flight-delay shift, which moves `scheduled_at` into a later assignment's window and must report a conflict, not hard-fail the delay handler mid-way"). Phase 4 does not build that sweep, that Cron trigger, or the customer/ops notification it fires. It only needs to leave the door open, which the `flight_no`/`flight_checked_at`/`flight_time_source` columns above already do.
- **No terminal/gate/belt promise.** AeroDataBox itself flags these "sometimes" available; the UI renders whatever is present and nothing where it is null — never a placeholder gate number.

---

## RECOMMENDATION

**Use AeroDataBox** (already the mock's de-facto contract), behind a single Worker route `GET /api/flight/:no?date=YYYY-MM-DD` that:

1. Rejects malformed input before spending a paid API call (`^[A-Z0-9]{2}\d{1,4}$`).
2. Looks up `GET https://aerodatabox.p.rapidapi.com/flights/number/{number}/{date}?withAircraftImage=false&withLocation=false` through a KV cache keyed `flight:{number}:{date}` (no customer/booking identifiers in the key), TTL tiered 90s (same-day) / 30min (next-day) / 6h (further out) — never below Cloudflare's 60s KV floor.
3. Resolves the landing time actual › estimated › scheduled and writes **that value directly** into `booking_legs.scheduled_at` — no invented buffer; the post-landing allowance is the existing, deliberately-NULL `settings.airport_waiting_minutes` from ADR-002, and this lane does not give it a private value.
4. On a >1-row response (overnight-flight ambiguity) or a provider outage, never guesses: surfaces a disambiguation choice or falls back to the manual-time path respectively, with the three distinct, blame-free, four-language error states in §4–5.
5. Does **not** port the mock's background re-poll (`startPoll`/`refreshFlight`) — that crosses into the live-tracking territory `REQUIREMENTS.md` explicitly defers to `LATER-01`, and costs real AeroDataBox units for a feature nobody has asked for pre-payment.
6. Ships `FLIGHT_API_KEY` via `wrangler secret put` (already named in `GSD-LAUNCH.md:220`), proxied server-side only — the RapidAPI key never reaches the browser, matching both the mock's own stated rationale (`home.dc.html:718`: "a key in the page is a key anyone can copy") and this project's data-residency discipline.

Two items are load-bearing and unverifiable without a provisioned RapidAPI account (UNCERTAIN-1, exact per-endpoint unit cost to size the tier) and without a live key against a real overnight flight (UNCERTAIN-2, `dateLocalRole` default behaviour) — both are named above with the exact check that settles them, and neither blocks writing the route now: default to the conservative, disambiguation-surfacing behaviour until verified.

Sources: [AeroDataBox pricing summary](https://thunderbit.com/blog/best-flight-api-with-free-tiers) · [AeroDataBox arrival-leg field reference (generated from its OpenAPI spec)](https://pub.dev/documentation/aerodatabox/latest/openapi.api/AirportFlightContractArrival-class.html) · [AeroDataBox codeshare status field](https://pub.dev/documentation/aerodatabox/latest/openapi.api/CodeshareStatus-class.html) · [AeroDataBox `dateLocalRole` / overnight-flight disambiguation changelog](https://aerodatabox.com/flight-history/) · [Cloudflare Workers KV — write key-value pairs, 60s TTL floor](https://developers.cloudflare.com/kv/api/write-key-value-pairs/) · [FlightAware AeroAPI pricing (comparison)](https://thunderbit.com/blog/best-flight-api-with-free-tiers).
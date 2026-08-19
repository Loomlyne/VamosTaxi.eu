# ADR-010 — Correct the privacy and cookie pages' subprocessor list: Vercel out, Cloudflare in, AeroDataBox added

**Status:** Accepted 2026-08-19, recording an owner decision already taken — Q21 in
`docs/build/OPEN-QUESTIONS.md`, answered 2026-08-17. This is not a fresh proposal; it is the
written record of a settled answer whose mock edit is still outstanding.
**Phase:** Pre-Phase 1 (mock-copy correction). `.planning/PROJECT.md` states "the mocks are the
spec and they are final" — Phase 1 ports `app/` as-is, so a wrong subprocessor name has to be
fixed in the mock source before Phase 1 treats it as the spec, not after.

## Context

**The question and its answer.** `docs/build/OPEN-QUESTIONS.md:272–283`, Q21: the privacy page
names Vercel as a subprocessor, but `{VERCEL_REGION}` maps to nothing in this stack. Answered
2026-08-17: rename to `legal.privacy.cloudflareRegion` and restate the subprocessor list as
Cloudflare, Supabase (eu-central Frankfurt), Stripe, Resend, Mapbox, AeroDataBox and Sentry.
"Naming Vercel is a false subprocessor disclosure, so it is a correctness fix rather than a copy
preference. Final wording still needs the owner's legal review before the page goes live." That
sentence is the reason this ADR's status is *accepted*, not *proposed*: the decision itself was
made on 2026-08-17; only the mock edit and the legal sign-off on final wording remain open.

**Authorities for the ban itself.** `.planning/PROJECT.md:81` lists "Vercel, anywhere, for
anything — hosting or preview deploys" among what this project explicitly excludes.
`docs/build/GSD-LAUNCH.md:1` titles the whole execution file "GSD — Vamos Taxi V1 on Cloudflare +
Supabase (no Vercel)" and line 11 restates it: "Cloudflare **Queues, KV, R2, Turnstile, WAF**. No
Vercel anywhere." `.planning/quick/260818-wxa-stream-1-blocker-reconciliation-mark-eve/260818-wxa-SUMMARY.md:40`
records that the rename was deliberately deferred in that pass — "flagged for a rename … but not
rewritten in this docs-only pass — the rename lands with the mock edit pass in §I so doc and code
move together" — which is exactly the pass this ADR now authorises.

**The four occurrences, read from the live tree on 2026-08-19, not carried over from any earlier
count:**

1. `app/pages/privacy.dc.html:233` — the §04 processor table, subprocessor row:
   `<div data-dl-r="1"><span data-dl-k="1">Vercel</span><span data-dl-v="1">Website hosting and
   delivery · <span data-vt-no-i18n="1" data-tok="1" …>Vercel region</span></span></div>`.
2. `app/pages/cookies.dc.html:223` — the "Strictly necessary" table, Hosting cookie row, Provider
   cell: `<td data-l="Provider">Vercel</td>`.
3. `app/pages/CookieBanner.dc.html:105` — the "Strictly necessary" category meta line:
   `<span>Vamos Taxi · Stripe · Supabase · Vercel</span>`.
4. `app/home/CookieBanner.dc.html:105` — the identical meta line in the per-folder duplicate of
   the same component. The two `CookieBanner.dc.html` files (`app/pages/` and `app/home/`) are
   copies of one component that must move in lockstep — the pattern this repository already
   follows for `support.js`. Fixing one and not the other would leave the cookie banner, the
   first legal surface a visitor sees on either entry point, still wrong on whichever copy was
   missed.

**The dictionary needs no edit for the swap.** `grep -c 'Vercel' app/vamos-i18n-dict.js` returns
`0` — the provider name never appears there; it is a bare proper noun in markup at all four
sites. The two English description strings that surround the privacy-page occurrence are already
translated: `app/vamos-i18n-dict.js:1424` ("Booking database and sign-in ·" — de/fr/ar) and
`:1425` ("Website hosting and delivery ·" — de/fr/ar). Swapping the proper noun inside an already
translated sentence changes nothing the dictionary owns; the German, French and Arabic surfaces
correct themselves the moment the markup changes.

**What the swap does not change, and why.** The `Vercel region` / `Supabase region` /
`Resend region` / `Sentry region` `data-tok` pills stay exactly as they are — a `data-tok` gap,
not a filled-in value. Workers execute at the edge and `.planning/ADR-007` (data residency /
Worker region pinning) leaves the question open with counsel; writing any region here, including
"Cloudflare edge" as if it were a settled answer, would be inventing a value this ADR has no
authority to invent. On the cookies table's Hosting cookie row, only the Provider cell changes
(`Vercel` → `Cloudflare`); the cookie name and duration stay `data-tok` — Cloudflare's edge
routing does set real cookies, but which ones is a function of features (WAF rules, cache
behaviour) not yet enabled, so naming a specific cookie now would also be invented.

**Second finding: a real subprocessor is missing, not just a wrong one named.**
`app/pages/privacy.dc.html:198` states, in the "When you book" list: "Flight number, where you
gave one, and the arrival time we read from it." That is personal data once tied to a named
booking, and it is processed by the aviation-data provider (AeroDataBox, per
`.planning/PROJECT.md:117` and `docs/build/GSD-LAUNCH.md:119`) — a party absent from §04's
processor table entirely. The Q21 answer already names AeroDataBox in its restated subprocessor
list; this ADR is the first place that traces *why* it belongs there, not just that it does.
Unlike the swap, adding this row is new customer-facing prose, so it needs its description in
German, French and Arabic in the same pass, under Law 03 (`CLAUDE.md`) — it cannot ship
English-only the way a bare proper-noun swap can. Turnstile, KV, R2, Queues and Hyperdrive are
Cloudflare products used under the same Cloudflare processing relationship already listed, not
separate legal entities — they get no additional row.

## Decision

**Swap `Vercel` for `Cloudflare` at all four cited sites, and add AeroDataBox as a new
subprocessor row on the privacy page, with its description translated in the same pass.** The
region pills stay open gaps; the cookie name and duration on the Hosting cookie row stay open
gaps; no dictionary edit is required for the swap itself.

**What this ADR escalates rather than decides:**

- **Final legal wording of the processor list** — the Q21 answer itself reserves this for the
  owner's legal review before the page goes live; this ADR fixes the *identity* of the processors
  named, not the sign-off on the sentence that names them.
- **The region** — open with counsel per `.planning/ADR-007` and the "Data residency /
  Worker region-pinning" blocker in `.planning/STATE.md`.
- **Sentry's consent classification** — carried in `.planning/PROJECT.md` as a revisit, not
  settled here.

## Consequences

**Cost of being wrong, both directions:**

- **Swap made, and it turns out to matter less than this ADR argues.** Low cost. The stack is
  contractually fixed (`PROJECT.md`, `GSD-LAUNCH.md`) — Vercel will never be used regardless of
  what the privacy page says, so the swap can only ever bring the page closer to what is actually
  true. There is no scenario where making this edit is itself a mistake.
- **Nothing done, and the page ships naming Vercel while omitting AeroDataBox.** High cost. A
  privacy notice that names a party that processes nothing while failing to name a party that
  processes personal data (flight numbers tied to a booking) is a factual misdisclosure in both
  directions at once, under nFADP and GDPR alike. That is not a copy-editing issue counsel signs
  off on quietly after launch — it is the kind of finding that forces a public notice to be
  reissued, and it sits on the two legal surfaces (privacy, cookies) and the consent banner that
  every visitor sees before anything else on the site.

## What this implies for the mock-copy pass

- `app/pages/privacy.dc.html:233` — replace `Vercel` with `Cloudflare` in the subprocessor row;
  leave the `Vercel region` pill as a `data-tok` gap (retitle its label to match the new name,
  e.g. "Cloudflare region", still TBC).
- `app/pages/cookies.dc.html:223` — replace `Vercel` with `Cloudflare` in the Hosting cookie row's
  Provider cell; leave the cookie name and duration pills open.
- `app/pages/CookieBanner.dc.html:105` — replace `Vercel` with `Cloudflare` in the strictly-necessary
  category meta line.
- `app/home/CookieBanner.dc.html:105` — the same edit, in lockstep, in the per-folder duplicate.
- `app/pages/privacy.dc.html` §04 — add a new subprocessor row for AeroDataBox (flight-number
  processing for delay-aware pickup), with its description string added to
  `app/vamos-i18n-dict.js` in `de`, `fr` and `ar` in the same pass — this one edit does need a
  dictionary entry, unlike the four swaps above.
- No edit is required in `app/vamos-i18n-dict.js` for the four `Vercel` → `Cloudflare` swaps —
  confirmed zero occurrences of "Vercel" in that file.

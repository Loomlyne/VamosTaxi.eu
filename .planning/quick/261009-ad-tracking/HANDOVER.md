# Hand-over: Meta events and Google tag (job `261009-ad-tracking`)

Work session, branch `gsd/ad-tracking` (cut from `origin/main` `80c173e9`, main had not moved at 01:26 +04, 2026-10-09). Worktree `.claude/worktrees/ad-tracking`. Nothing pushed, nothing deployed, no live database, Stripe, Meta or Google console touched. Plan: `PLAN.md` here; owner's adopted wording: `.planning/decisions/2026-10-09-ad-tracking-wording.md`.

## Commits (oldest first)

| Commit | Job | What |
|---|---|---|
| `a31e1030` | 0 | the map, the plan, the adopted wording |
| `28815330` | 1 | the owner's texts byte for byte in the mock (`app/vamos-meta-texts.js`), the four message files, both banners, `/cookies`, `/privacy` (mock and Next), ADR-010 note, seed regenerated, `owner-texts.test.ts` compares every section with the decision files |
| `d4307deb` | 2+3 | `service` in both allow-list twins, D5 verified Meta referrers, `VamosMeta.track` (ViewContent / Lead / Contact), ViewContent on the price button, Lead after the contact form, one delegated click listener for tel / mailto / wa.me |
| `bf4f1f14` | 4 | InitiateCheckout (`POST /api/track`) and AddPaymentInfo (inside `/api/checkout/intent`) sent from the server; `order_id` = reference on Purchase and AddPaymentInfo; wider-events flag |
| `35d58386` | 6 | Google conversion call on the confirmation page (pure decision in `lib/checkout/confirmation-conversion.ts`) |
| `58875f56` | 5 | `app/vamos-google.js`, per-address policy, `lib/google/*`, layout script, banner script tags, `next.config.ts` rows |
| `e7c5b13c`, `1be36ae4` | 5 | tests for the `next.config.ts` policy rows |

## Flags: all CLOSED in this branch (the controller opens them in the proof job)

| Flag | Where | Committed value | Effect while closed |
|---|---|---|---|
| `META_EVENTS_OPEN` | `apps/web/lib/meta/legal-gate.ts`; `EVENTS_ON` in `app/vamos-meta.js` (a test pins the two equal) | false | no ViewContent / Lead / Contact in the browser; `/api/track` answers 204 and does nothing; no AddPaymentInfo; the Purchase carries no `order_id`. Live behaviour is exactly today's |
| `GOOGLE_TAG_OPEN` | `apps/web/lib/google/flag.ts`; `GOOGLE_ON` in `app/vamos-google.js` (pinned equal) | false | the loader does nothing, not even a local consent default; no Google host in any policy; no `next.config.ts` policy rows |

The two things that are open and change live behaviour the moment this ships, with the flags closed: the **new texts** on the banner, `/cookies` and `/privacy` (adopted by the owner), and the **D5 referrer rule plus the `service` key** (Meta page views from Facebook / Instagram ads and `/?service=...` start counting; they are PageViews the existing text already covers).

Opening order: ship with both flags closed and the version unchanged is not enough on its own: the new texts are live and the consent version must move **in the same ship** (below). Then flip both flags (one line each plus the pinned test lines) as a second small commit after the proof.

## Consent version (controller, 2026-10-09 14:55 +04)

Ship day is 2026-10-09. `CONSENT_POLICY_VERSION` is `"2026-10-09"`. The same string is re-pinned in `legal-gate.test.ts`, `banner-meta-clear.test.ts` (3 stubs), `meta-click-ids.e2e.mjs`, `packages/db/supabase/tests/meta_purchase.test.sql` (every consent-row and claim literal), and `packages/db/test/local/{refund-lock-order,meta-purchase-lock-order,meta-purchase}.test.ts`. No migration. `owner-texts.test.ts` unchanged. Flags stay closed.

## Opening the flags (after the proof job, controller)

- `legal-gate.ts`: `META_EVENTS_OPEN = true`; `app/vamos-meta.js`: `var EVENTS_ON = true;`; update the test "the wider-events flag ... is closed" to expect `true` (and the one-assignment scan stays).
- `lib/google/flag.ts`: `GOOGLE_TAG_OPEN = true`; `app/vamos-google.js`: `var GOOGLE_ON = true;`; update `google.test.ts` ("is closed in the committed state"), `next-config-headers.test.ts` and the "flag closed" case in `policy by address` accordingly.
- `META_TEST_EVENT_CODE`: the owner sets it in his terminal; never in chat. Until it is set, a test-mode payment or Pay press sends nothing to Meta (`no_test_code`, logged by name only). Stripe on the staging Worker now has a `pk_live_` publishable key (main `6a5f274e`): in live mode the code is not used and events go to the real pixel.

## Evidence (times from the clock, +04, 2026-10-09)

Verified, by me, in this worktree:
- `pnpm typecheck`, `pnpm lint` (0 errors, 6 old warnings), `lint:css`, `i18n:check` (2687 keys), `db:seed:check` (no drift; header 2695 keys, 103 no-param), `check:legal-claims`, `check:numbers`, `check:db-fences`, `test:scripts` all pass at 01:2x.
- `pnpm build` passes (Next + `/api/track` route present).
- Web unit tests: 5732 passed, 1 failed. The one failure is `lib/pricing/public-chf.test.ts` "staging Stripe publishable stays pk_test_": `apps/web/wrangler.jsonc` has a `pk_live_` key since `6a5f274e` (#70). Not touched by this job; it fails on `origin/main` too. Owner or controller decide that test.
- Browser, with Meta's real `fbevents.js` and setup file (downloaded with one plain GET, every Meta request intercepted, nothing sent): `meta-pixel-28-real.spec.ts` a, b, c and the new `d` pass. `d` shows exactly `PageView, Contact(phone), Contact(email), Contact(whatsapp), Lead`, each with only `cd[content_category]` or nothing, no user data, no automatic event, none of the typed name / e-mail / number / text in any request.
- Browser, Meta stand-in: `meta-pixel-28.spec.ts` (8) and the new `meta-events-0610.spec.ts` (6) pass: Contact only the kind; nothing without Accept; Lead once with nothing in it; `/?service=airport#book` counts; a Facebook redirect referrer with its long address counts and a look-alike host does not; after a withdraw later clicks send nothing.
- Browser, Google's real `gtag.js` (one plain GET, every Google request intercepted, nothing sent): `google-tag.spec.ts` A-E pass. A: nothing requested before Accept, only the local denied default. B: after Accept the tag loads, cookies set are exactly `_gcl_au` and `_gcl_aw` (matches the adopted cookies row), the page address Google sees has no query (token, gclid-bearing search, search terms never appear), every host reached (`www.googletagmanager.com`, `www.google.com`, `www.googleadservices.com`, `ad.doubleclick.net`) is in the policy, no policy violation logged. C: the conversion is one request carrying `value=99.79`, `currency_code=CHF`, `oid=VT-26-07331`, the Stripe session id is nowhere; a reload sends no second conversion. D: withdraw deletes both cookies and stops every request. E: a pay link gets no Google at all.
- Unit tables: allow-list parity (browser twin vs server twin, one shared table), referrer cases (look-alikes, `@`, reference, escapes, port, credentials, http), `track()` fixed list, Google loader (vm), funnel events and `/api/track` route (consent, flags, origin, rate limit, test code, never a body), policy builder and `next.config.ts` rows with the flag open and closed, conversion decision.
- Screenshots read: `/privacy` and `/cookies` (en, ar) at 390 and 1440, and the banner text in en and ar. Layout holds; Arabic reads right to left.

Not verified:
- The ViewContent press in a real browser: it needs a valid trip with Mapbox suggestions; covered by the unit pin (call sits after the valid-trip check and before `location.assign`) and by the real-script test of the same `track()` path, not by pressing the live button. If Meta's script has not loaded yet when the page navigates away the event is lost (a normal limit of a fire-and-forget beacon); the loader queues it only until the pixel starts.
- InitiateCheckout and AddPaymentInfo to Meta's real endpoint: no real Graph call was made (needs the token and `META_TEST_EVENT_CODE`). Unit tests use a fake fetch. Open risk, same as the live Purchase: Meta may reject server events that carry no `client_user_agent` or IP (the owner's text forbids more). The Test events check will show it; if rejected, stop and ask him.
- The Google conversion on the real Next `/confirmation/<ref>` page in a browser (the harness cannot serve the Next page): the page effect and decision are unit-tested; the loader path is proven on a mock page served at a confirmation address.
- The `next.config.ts` rows in a real build with the Google flag open, and the `Content-Security-Policy` that the Worker sends on `/checkout` and `/confirmation/<ref>`: tested through `headers()`, not on a deployed Worker. Check after the flag is opened.
- Visual snapshot specs (`tests/visual/*`): not re-run. The banner's Marketing row and the privacy / cookies pages are longer; snapshots of those will need a re-baseline (controller, with the owner's eye).
- Linux CI; a 4242 payment; the owner's Events Manager and Google Tag Assistant checks.

Failed: nothing in this job. One pre-existing red test (above).

## Things the owner should know (findings, not changed)

1. **Google also receives a page path ping.** With real `gtag.js`, after Accept, Google's tag sends a `page_view` ping to `www.google.com/ccm/collect` with the page path (never a query or hash, Google drops them) even with `send_page_view: false`; on the confirmation page that path holds the booking reference. This matches his decision that Google gets the reference, but his adopted Google line (3b) describes only the conversion message plus IP and browser details. If he wants the line to name the page path, that is his text to change; the build does not change either way.
2. **`/cookies` still says "No ads."** (section "Cookieless analytics", key `cookies.no-ads`) and the old "No ads" in `banner-body` / `necessary-only-standfirst` copy: after Google and Meta advert measurement that sentence is no longer true as a statement about the site. It was not part of his adopted lines, so I left it. Ask him whether it goes.
3. **No unpaid conversion.** "Paid or not" in the agency's text: a booking reaches `confirmed` only after payment in this product, and the conversion fires only for confirmed / assigned / paid bookings, on the visit that follows the payment (the return from Stripe, or a booking paid within the last hour), so an old confirmation link opened on another device does not report a second one. Google also de-duplicates on the reference.
4. **InitiateCheckout value** comes from the browser (the class price shown), bounded 1 to CHF 20,000, and is consent- and origin-checked. It cannot be verified server-side without a second quote read; it is an advert signal, not money.
5. **AddPaymentInfo dedup** is by an event id made from the booking id (no claim table, no migration): a second Pay press for the same booking is one event in Meta's 48-hour window.
6. **Meta `eid` / `eventID`:** the agency's `eventID:'purchase_'+reference` is not used (there is no browser Purchase to de-duplicate against; the server Purchase keeps its UUID `event_id`, plus `order_id` = the reference).
7. No migration was needed: the Purchase's reference comes from the settle row (`row.reference`) already in the queue handler.

## Open owner steps (numbered, his terminal)

1. Read the three live-text changes on a phone once the ship is up (banner, `/cookies` row, `/privacy` lines) in one language he knows.
2. Set `META_TEST_EVENT_CODE` as a Worker var for staging (his value, in his terminal).
3. After the controller opens the flags: Events Manager, Test events: PageView, ViewContent, Contact, Lead, InitiateCheckout, AddPaymentInfo, Purchase (4242 payment) each once. Google Ads: Tag Assistant shows the tag, consent states, one conversion with value and transaction id.
4. Decide finding 2 above.

## Files touched (so the controller can read the diff)

`app/vamos-meta.js`, `app/vamos-meta-texts.js`, `app/vamos-google.js` (new), `app/home/home.dc.html`, `app/pages/{contact,cookies,privacy,CookieBanner}.dc.html`, `app/home/CookieBanner.dc.html`, `apps/web/i18n/messages/{en,de,fr,ar}.json`, `packages/db/supabase/seed.sql` (generated), `packages/db/supabase/tests/seed_idempotent.test.sql` (pins), `apps/web/app/[locale]/{layout,privacy/page,cookies/page}.tsx`, `apps/web/app/[locale]/checkout/CheckoutPage.tsx`, `apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx`, `apps/web/app/api/track/route.ts` (new), `apps/web/app/api/checkout/intent/route.ts`, `apps/web/components/consent/CookieBanner.tsx`, `apps/web/lib/{meta,google,checkout,security,abuse}/*`, `apps/web/next.config.ts`, tests and Playwright specs, `.planning/**`.

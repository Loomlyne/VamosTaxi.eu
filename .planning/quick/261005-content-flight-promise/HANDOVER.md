# Hand-over — content-flight-promise (work session, 2026-10-05)

Branch `fix/content-flight-promise`, cut from `origin/main` `328b133c`, merged with `origin/main` `9d0c8bf7` (merge `7737613c`). No commit on `main`, no push of `main`, no deploy, no migration, no write to the live database or Cloudflare. Owner answers 6, 7, 8 of `.planning/decisions/2026-10-05-repo-investigation-answers.md`.

## Order of commits and what may ship when

| Commit | What | New customer wording? |
|---|---|---|
| `71ba3cea` flight: remove the provider completely, keep the flight number field | item 1 | no |
| `84069302` content: hide the /about founder image box; drop the /imprint 09 internal note | items 3, 4 (owner answers 7, 8) | no, two removals |
| `083e278f` content: "Last updated" date of terms, cancellation and imprint is the day their text last changed | item 5 | no, one date |
| `7737613c` Merge origin/main | | no |
| docs commit | this file and the pictures | no |
| **`content: flight lines — NEEDS OWNER APPROVAL`** (last commit, the tip) | item 2 | **yes, the owner approves the lines first** |

The tip's parent (`HEAD~1`) is shippable on its own. The last commit only touches the lines in the tables below, their dictionary and message entries, the pages that render them, `seed.sql` and two tests.

## Items, one line each

1. **Flight provider removed completely.** AeroDataBox client, fixtures, tests, `GET /api/flight/[no]`, `FLIGHT_API_KEY`, the flight rate counter (namespaces 1009/1010), the checkout lookup card and day buttons, and all unreachable lookup, autofill, revert and poll code in `home.dc.html` (it had no caller since the old widget markup left; ~430 lines) are gone. The flight number field stays: same place (Flight → From → To → When → Travellers), same shape check, same value handed to checkout and saved on the booking. `apps/web/lib/flight/no-provider.test.ts` pins both halves.
2. **Flight lines drafted** in en/de/fr/ar (tables below), one final commit.
3. **/about** founder box hidden: the dashed "Image slot — the founder" box and its English brief no longer render; the story section uses one column (`data-solo`) so the text keeps its 62ch measure; the box markup sits in a comment with a restore line (`app/pages/about.dc.html`, like Why Vamos on home).
4. **/imprint 09** note "Credit only where the agencies agree — otherwise the rows come out." removed in every language (page, dictionary, message files, key map, the unserved Next page); the two Loomlyne credit rows stay.
5. **"Last updated"** (`app/vamos-legal-updated.js`): `LEGAL_UPDATED` 2026-09-30 → **2026-10-03**, the day the text of terms, cancellation and imprint last changed on main (`3cac1fc5`, the owner-approved de/fr/ar lines; checked from the git history of each page's visible text and of the dictionary lines its strings use). `CONSENT_UPDATED` stays **2026-10-01**: it is pinned to `CONSENT_POLICY_VERSION` and a test holds them equal, and moving it re-asks every visitor for consent. /privacy and /cookies show that date, and both pages changed on **2026-10-04** (`5a027e71`, `bce75750`). **Decision for the controller or the owner:** bump the consent version to 2026-10-04 (every visitor sees the banner again) or leave the date.
   - **The flight lines change it again when they ship.** terms (06, 08), cancellation (04) and privacy (02) change, and the /imprint note removal changes imprint. Set `LEGAL_UPDATED` to the ship day then; privacy follows the consent-date decision above.

## Proof

- **Booking flow at 1440 and 390, headless Chrome for Testing** (`playwright-core` 1.62.1, sandbox off, the served mocks from `apps/web/public` with `/api/*` stubbed, checkout stood in): 16/16 steps pass on `origin/main` and 16/16 on this branch. Steps: the flight field slides in before From after an airport pick (laptop box and phone sheet); order Flight → From → To → When; an empty flight on an airport pickup is refused ("Enter the flight number"); "ZZ" is refused ("Check the flight number"); typing upper-cases; SEE PRICES / See prices hands `flight=LX 318` (laptop) and `flight=LX318` (phone) to `/checkout`; a non-airport pickup offers "Add a flight number" and the field opens marked Optional; zero `/api/flight` requests; no "looking up" text; no script errors. The checkout page itself (Next, `FlightField`) is not in that run (needs the Worker); it is covered by the next bullet, `audit-26-2-u06-components.test.ts`, typecheck and `no-provider.test.ts`.
- **The repo's own funnel spec on this branch** (`tests/integration/checkout-hosted.spec.ts`, project `component-1440`, `next dev`, route fixtures): home box with a flight number at 390 and 1440 → SEE PRICES → `/checkout` (the flight field arrives filled with `LX 318`, plain field, no lookup card) → class, contact, child seat, voucher → PAY → Stripe stand-in → Booked; Back from Stripe; a status that never confirms. **As the spec stands it fails at the voucher step** (`[data-co-voucher-applied]` never shows, "Try again" in the summary): the spec does not stub `POST /api/quote/reprice`, which the voucher goes through since the 26.2 audit (`eec7951f`), and no database runs here. I did not touch that route, `CheckoutForm.tsx` or `voucher-lock.ts` (`git diff origin/main` is empty for them), and the spec's only change from me is the removed `/api/flight/**` stub. With one extra stub for `/api/quote/reprice` in a throw-away copy of the spec (deleted, not committed) **4/4 pass** (57 s). The Linux e2e job runs this spec with a database; on a Mac without one the stock spec stays red at the voucher until someone stubs that route (the checks job may add the stub).
- **`VamosLocale.coverage` in de, fr, ar** on the changed pages (home, faq, terms, cancellation, privacy, imprint, about): 0 gaps on faq, terms, cancellation, privacy, imprint, about. Home shows the same 4 gaps as `origin/main` (kicker, h1, sub, reviews line: the home script's own table, not the dictionary). The new lines also render at 390 in de, fr and ar (RTL checked), no sideways scroll.
- Pictures (bare crops), `.planning/quick/261005-content-flight-promise/screens/`:
  - `before/` and `after/`: `about-{en,ar}-{1440,390}.png`, `imprint-{en,ar}-{1440,390}.png` (section 09), `booking-1440-flight.png`, `booking-390-flight.png` (the flight field after an airport pick; after shows the drafted hint and "Waiting time included").
  - `after/booking-390-flight-{de,fr,ar}.png`.

## Freed or removed for the checks job (nothing edited in their files)

- `package.json`, lockfile, `pnpm-workspace.yaml`, `.github/**`: **nothing freed**. The client used plain `fetch`; no dependency or workflow named the provider.
- `apps/web/wrangler.jsonc` (flight-only, mine to edit): removed `FLIGHT_RATE_LIMITER` and `FLIGHT_RATE_LIMITER_BARE` (ratelimit namespaces 1009 and 1010) in both envs, and the word AeroDataBox from a comment. There was no flight KV: the cache used the shared `GEO_CACHE`, which stays. Namespaces 1009 and 1010 are config only; nothing to delete in Cloudflare. `FLIGHT_API_KEY` was never set on live (audit M4).
- `scripts/public-env-allowlist.json` (not on the off-limits list): `FLIGHT_API_KEY` dropped from the forbidden-name list.
- Visual baselines I did not run (Mac-only `next dev` specs): the Darwin PNGs for the React pages may drift: `legal-cancellation-imprint` (imprint note, cancellation 04), `legal-terms`, `legal-privacy-cookies`, `about`. The last commit (wording) moves terms, cancellation, privacy and about further.
- `lib/security/public-no-internal-ids.test.ts` "served dashboard screens are stripped" took 6.2 s here with other jobs running and tripped its 5 s default timeout; it passes with `--testTimeout=60000`. Load flake, not this change.
- `seed.sql` regenerated (3 times) and re-pinned in `seed_idempotent.test.sql`: header `content_strings=2692`. If another job adds or removes message keys, run `pnpm db:seed:gen` after merging and re-pin.

## Left alone on purpose

- **Quote code and database** (off limits): `apps/web/lib/quote/errors.ts` still has `provider_unavailable` → `quote.flight.unavailable` and `not_found` → `quote.flight.not_found` (those two message keys stay, plus `malformed`, `label`, `placeholder`); `QuoteFlowGallery.tsx` (dev gallery, 404 on live) shows "found" and "unavailable" tiles; the lock, intent and booking columns `landing_source`, `flight_checked_at`, `flight_time_source` and the `flight_no` plumbing. None can be reached from a provider now; the quote job may drop `provider_unavailable` and the three columns.
- Docs that describe the old feature (`docs/build/GSD-LAUNCH.md`, `OPEN-QUESTIONS.md`, `OWNER-ANSWERS.md`, `LEGAL-PLACEHOLDER-CHECKLIST.md`, `CLOUDFLARE-RESOURCES.md`): history. `SPEC-home-flight-autofill.md` got a "Superseded" line; `.claude/CLAUDE.md` no longer lists the provider.
- Reviewed and kept (no tracking claim): Services card "To and from Zurich, Geneva and Basel airports, timed to your flight." and its Next twin; /cancellation 06 "Airport pickups: 60 minutes from the actual landing time."; /cancellation 04 "Flight cancelled or diverted: tell us as soon as you know and we treat it under section 07, not as a late cancellation."; the h1 "Land in Zurich. Your driver is waiting."; /about "there is no app watching a car crawl towards you" (true, no live GPS); the sample question "My flight lands two hours later than booked. Does the pickup move automatically?" in the React `ContactForm` preview fixture (a customer's question, not shown to visitors).

## The drafted flight lines (owner approval pending)

What is true and what the lines say: we take your flight number and keep it with the booking (the assigned chauffeur is mailed it when it changes); the driver waits per the existing waiting policy (60 minutes at an airport, 30 elsewhere, per commenced hour beyond); we do not look the flight up or follow it, so a delay has to be told to us. No new waiting time, price or promise: the 60 and 30 minutes are the values already in /terms 08 and /cancellation 06. The "tell us" model and the "allowance counts from the new landing time" clause come from the old vamostaxi.eu terms (list A: "kindly inform us promptly using the contact number provided in the Confirmation", "the free time is extended to accommodate the new landing time"). Swiss German, "ss".

### Lines a customer sees today (served mocks and the live /checkout)

| # | Where | Before (EN) | After (EN) |
|---|---|---|---|
| 1 | Booking field hint (home box for screen readers, phone sheet, /checkout trip editor, checkout mock) | We track it and move the pickup if you land late | So your driver knows which flight to meet |
| 2 | Home trust line next to the booking box (laptop box and phone bar) | Flight tracked | Waiting time included |
| 3 | "At the airport" card, step 1 title (home and pages) | We track your flight | We take your flight number |
| 4 | "At the airport" card, step 1 text | Your pickup time moves with the real arrival. Nothing to change if you land early or late. | Give it when you book, so your driver knows which flight to meet. |
| 5 | FAQ "What if my flight is late?" answer (home and /faq) | We track your flight. The pickup time moves with the real arrival, at no extra cost. | Tell us as soon as you know, on the number in your confirmation. The waiting time then counts from the new landing time, at no extra cost. |
| 6 | FAQ "cancel early" answer, last sentence (home and /faq) | Cancel early and you get the most back; the closer to pickup, the less, because a driver is already committed to your journey. Flight delays are handled separately and cost you nothing when we have your flight number. | Cancel early and you get the most back; the closer to pickup, the less, because a driver is already committed to your journey. Flight delays are handled separately: tell us as soon as you know. |
| 7 | /terms 06 Your obligations | Tell us the flight number for an airport pickup, so a delay is visible to us. | Tell us the flight number for an airport pickup, so your driver knows which flight to meet. |
| 8 | /terms 08 Waiting time, airport bullet | Airport pickups: 60 minutes after landing, counted from the actual landing time we see against your flight number. | Airport pickups: 60 minutes after landing. |
| 9 | /terms 08 Waiting time, closing sentence | If your flight is delayed, the allowance moves with the flight — you do not need to call us. | If your flight is delayed, tell us as soon as you know and the allowance counts from the new landing time. |
| 10 | /cancellation 04 Flight delays, opening paragraph | Give us the flight number and a delay costs you nothing. We track the flight and the driver arrives for the actual landing time; the included waiting allowance starts from then, not from the time you booked. | Give us the flight number for an airport pickup. The included waiting allowance counts from the landing time, not from the time you booked. |
| 11 | /cancellation 04 Flight delays, bullet 1 | Delay within the same day: the pickup moves automatically. No call needed. | Delay within the same day: tell us as soon as you know, on the number in your confirmation. The allowance counts from the new landing time. |
| 12 | /privacy 02 What we collect, "When you book" list | Flight number, where you gave one, and the arrival time we read from it. | Flight number, where you gave one. |
| 13 | /manage-booking and /booking-detail, hint under the flight field | Airline code and number, as printed on your boarding pass. Your driver watches this flight, so a change of flight matters more than a change of time. | Airline code and number, as printed on your boarding pass. Your driver meets this flight, so keep it up to date. |

Removed with no replacement: /cancellation 04 bullet 3, "No flight number on the booking: we cannot see the delay, so the ordinary waiting rules in the terms apply." (without tracking there is no "we can see" case).

### Lines on pages that are not served (Next /about, React How it works)

| # | Where | Before (EN) | After (EN) |
|---|---|---|---|
| 14 | Next /about "four things we hold to" (page not served; messages about.*) | We watch your flight | Your driver waits for you after you land. |
| 15 | Next HowItWorks step 1 title (not served; the old key stays for the BookingCard placeholder) | Route or flight number | Route and flight number |
| 16 | Next HowItWorks step 1 text (not served; messages home.*) | Type a flight number and the pickup point and time come from the arrival. Nothing to look up yourself. | Enter your pickup, drop-off and time. For an airport pickup, add your flight number. |
| 17 | Next HowItWorks step 3 text (not served; messages home.*) | Your pickup is set from the arrival, not from a guess. If the flight moves, the pickup moves with it. | Your driver is in arrivals at the time you booked. If your flight is delayed, tell us as soon as you know. |

### de / fr / ar for every line above (same numbers)

| # | DE | FR | AR |
|---|---|---|---|
| 1 | Damit Ihr Fahrer weiss, auf welchen Flug er wartet | Pour que votre chauffeur sache quel vol attendre | ليعرف سائقك أي رحلة سيستقبلها |
| 2 | Wartezeit inklusive | Temps d’attente inclus | وقت الانتظار مشمول |
| 3 | Wir notieren Ihre Flugnummer | Nous notons votre numéro de vol | نسجّل رقم رحلتك |
| 4 | Geben Sie sie bei der Buchung an, damit Ihr Fahrer weiss, auf welchen Flug er wartet. | Indiquez-le à la réservation, pour que votre chauffeur sache quel vol attendre. | أدخله عند الحجز ليعرف سائقك أي رحلة سيستقبلها. |
| 5 | Sagen Sie uns Bescheid, sobald Sie es wissen, unter der Nummer in Ihrer Bestätigung. Die Wartezeit zählt dann ab der neuen Landezeit, ohne Aufpreis. | Prévenez-nous dès que vous le savez, au numéro indiqué dans votre confirmation. Le temps d’attente est alors compté à partir de la nouvelle heure d’atterrissage, sans supplément. | أخبرنا فور علمك على الرقم الموجود في تأكيد حجزك. تُحتسب مدة الانتظار حينها من وقت الهبوط الجديد، دون أي تكلفة إضافية. |
| 6 | Früh stornieren bringt am meisten zurück; je näher an der Abholung, desto weniger, weil bereits ein Fahrer für Ihre Fahrt gebunden ist. Flugverspätungen werden separat behandelt: Sagen Sie uns Bescheid, sobald Sie es wissen. | Annulez tôt et vous récupérez le plus ; plus on approche de la prise en charge, moins il reste, car un chauffeur est déjà engagé sur votre trajet. Les retards de vol sont traités à part : prévenez-nous dès que vous le savez. | الإلغاء المبكر يعيد لك القدر الأكبر، وكلما اقترب موعد الاستقبال قلّ المبلغ لأن سائقًا صار مرتبطًا برحلتك. أما تأخّر الرحلات الجوية فيُعالَج على حدة: أخبرنا فور علمك. |
| 7 | Nennen Sie uns bei einer Flughafenabholung die Flugnummer, damit Ihr Fahrer weiss, auf welchen Flug er wartet. | Indiquez-nous le numéro de vol pour une prise en charge à l’aéroport, afin que votre chauffeur sache quel vol attendre. | أخبرنا برقم الرحلة الجوية عند الاستقبال في المطار، ليعرف سائقك أي رحلة سيستقبلها. |
| 8 | Abholung am Flughafen: 60 Minuten nach der Landung. | Prises en charge à l’aéroport : 60 minutes après l’atterrissage. | الاستقبال في المطار: 60 دقيقة بعد الهبوط. |
| 9 | Bei einer Flugverspätung sagen Sie uns Bescheid, sobald Sie es wissen; das Kontingent zählt dann ab der neuen Landezeit. | Si votre vol est retardé, prévenez-nous dès que vous le savez : le forfait est alors compté à partir de la nouvelle heure d’atterrissage. | وإذا تأخّرت رحلتك الجوية، فأخبرنا فور علمك؛ وتُحتسب المدة حينها من وقت الهبوط الجديد. |
| 10 | Geben Sie uns bei einer Flughafenabholung die Flugnummer. Das inbegriffene Wartekontingent zählt ab der Landezeit, nicht ab der gebuchten Zeit. | Donnez-nous le numéro de vol pour une prise en charge à l’aéroport. Le forfait d’attente inclus est compté à partir de l’atterrissage, pas à partir de l’heure réservée. | أعطنا رقم الرحلة الجوية عند الاستقبال في المطار. تُحتسب مدة الانتظار المشمولة من وقت الهبوط، لا من الوقت المحجوز. |
| 11 | Verspätung am selben Tag: Sagen Sie uns Bescheid, sobald Sie es wissen, unter der Nummer in Ihrer Bestätigung. Das Kontingent zählt ab der neuen Landezeit. | Retard le jour même : prévenez-nous dès que vous le savez, au numéro indiqué dans votre confirmation. Le forfait est compté à partir de la nouvelle heure d’atterrissage. | تأخير في اليوم نفسه: أخبرنا فور علمك على الرقم الموجود في تأكيد حجزك. تُحتسب المدة من وقت الهبوط الجديد. |
| 12 | Flugnummer, sofern angegeben. | Numéro de vol, si vous en avez donné un. | رقم الرحلة الجوية، إن ذكرته. |
| 13 | Code der Fluggesellschaft und Nummer, wie auf Ihrer Bordkarte. Ihr Fahrer wartet auf diesen Flug, halten Sie ihn deshalb aktuell. | Code de la compagnie et numéro, tels qu’imprimés sur votre carte d’embarquement. Votre chauffeur attend ce vol : gardez-le à jour. | رمز شركة الطيران والرقم كما يظهران على بطاقة الصعود. يستقبل سائقك هذه الرحلة الجوية، فحافظ على تحديثه. |
| 14 | Ihr Fahrer wartet nach der Landung auf Sie. | Votre chauffeur vous attend après l’atterrissage. | ينتظرك سائقك بعد هبوط رحلتك. |
| 15 | Route und Flugnummer | Trajet et numéro de vol | المسار ورقم الرحلة |
| 16 | Geben Sie Abholort, Ziel und Zeit ein. Bei einer Flughafenabholung ergänzen Sie Ihre Flugnummer. | Indiquez votre départ, votre destination et l’heure. Pour une prise en charge à l’aéroport, ajoutez votre numéro de vol. | أدخل مكان الاستقبال والوجهة والوقت. وعند الاستقبال في المطار أضف رقم رحلتك. |
| 17 | Ihr Fahrer ist zur gebuchten Zeit in der Ankunft. Bei einer Flugverspätung sagen Sie uns Bescheid, sobald Sie es wissen. | Votre chauffeur est aux arrivées à l’heure réservée. Si votre vol est retardé, prévenez-nous dès que vous le savez. | يكون سائقك في صالة الوصول في الوقت المحجوز. وإذا تأخّرت رحلتك فأخبرنا فور علمك. |

### Dead lines deleted (nothing rendered them; dictionary and message files)

"We watch your flight" (dictionary; the Next /about line is #14), "Give us the flight number and the pickup follows the actual landing time. A delay does not need a phone call and does not cost you anything. Your driver meets you in arrivals with a name sign.", "Zurich and Geneva, with meet & greet in arrivals and flight tracking on every booking that carries a flight number.", "Your driver waits in the arrivals hall … We watch the flight, so a delay moves the pickup without you doing anything. Available at …" (two forms), "Your driver tracks this flight and waits for it, delayed or early.", "We track the flight and hold the driver if you land late" (checkout mock; the mock now shows #1), the fragments ", counted from the actual landing time we see against your flight number." and ". If your flight is delayed, the allowance moves with the flight — you do not need to call us.", and the dictionary copies of "Type a flight number and the pickup point and time come from the arrival…", "Your flight lands" and "Your pickup is set from the arrival, not from a guess…" (the React How it works keeps its own keys, see #15 to #17). Eight message keys are gone (net -7 with the new `home.route-and-flight-number`); `seed.sql` count 2692.

### Decisions for the owner

1. **Delays.** Drafted: tell us, and the waiting allowance counts from the new landing time (#5, #9, #11). If he does not want to promise the extension, the shorter forms are: #5 "Tell us as soon as you know, on the number in your confirmation." (drop the second sentence), #9 "If your flight is delayed, tell us as soon as you know.", #11 "Delay within the same day: tell us as soon as you know, on the number in your confirmation." #10 only says the allowance counts from the landing time, which the policy already said.
2. **Trust line next to the booking box** (#2): "Waiting time included" replaces "Flight tracked". He may prefer to delete the line (two notes left) or name another true line.
3. **/terms 08 first sentence** "Waiting is included, measured from the pickup time in your confirmation." sits next to the airport bullet "60 minutes after landing" (unchanged in meaning from before; the old bullet resolved it with "counted from the actual landing time we see"). Left as it was; the owner may want one rule for how the 60 minutes are counted without a feed.
4. The legal lines #7 to #12 replace de, fr and ar translations he approved on 2026-10-03 (`3cac1fc5`).

## Checks and results (final tree, run after the restart, before the last commit)

| Check | Result |
|---|---|
| `pnpm i18n:check` | passed: 2684 keys, 1046 literal call sites, 41 non-literal skipped (all pre-existing) |
| `pnpm check:numbers` | ok |
| `pnpm check:legal-claims` | all 3 checks passed |
| `pnpm check:public-env` | pass (the allowlist no longer names `FLIGHT_API_KEY`) |
| `pnpm check:db-fences` | all 8 checks passed |
| `pnpm db:seed:check` | no drift |
| `pnpm typecheck` | pass (db, emails, isolation-probe, web) |
| `pnpm lint` | 0 errors, 6 warnings (unused eslint-disable directives, none in a file of this branch) |
| touched vitest files (list below) | 176 files passed, 4 skipped; 2416 tests passed, 9 skipped; 24 s |
| funnel spec | see Proof: 4/4 with the reprice stub, red at the voucher without it |

Tests run (touched plus the ones that read the changed pages): `lib/flight`, `lib/abuse`, `lib/auth/callback-redirect`, `lib/ops/edit-request`, `lib/checkout`, `lib/consent`, `lib/legal*`, `lib/meta`, `lib/pricing`, `lib/live-no-tbc`, `lib/about-imprint-content`, `lib/flight-lines`, `lib/dc-mock-urls`, `lib/contact-button`, `lib/audit-26-2-u08`, `lib/arabic-design-g23`, `tests/unit/home-*`, `tests/unit/van-luxury-12-mocks`, `tests/unit/audit-26-2-u06-components`: all pass with `--testTimeout=60000` (the one load flake above). Not run: the full `test:unit`, the build, Playwright visual and Worker specs, the database suites (no migration touched).

New tests (fail before, pass after): `lib/flight/no-provider.test.ts` (provider, route, key, counter, lookup client named nowhere; the number field stays), `lib/about-imprint-content.test.ts` (box hidden with a restore line, note gone in four languages, credits stay), `lib/flight-lines.test.ts` (no promise shape in the mocks, dictionary, messages or Next pages in en/de/fr/ar; each drafted line has de/fr/ar and no eszett; the 60 and 30 minute values stay). Changed to follow the code: `tests/unit/audit-26-2-u06-components.test.ts`, `tests/unit/home-flight-fixtures.test.ts`, `lib/pricing/home-fleet-from-quote.test.ts`, `lib/checkout/manage-pages-i18n.test.ts`, `lib/abuse/rate-counters.test.ts`, `lib/auth/callback-redirect.test.ts`, `lib/ops/edit-request.test.ts`.

## Notes

- Commit trailer is `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (the model that wrote them; the brief asked for Opus 5.5).
- Chrome for Testing in this cache is `chromium-1243`, not `1234`.
- Local working files (harness, before-tree) were in the session scratchpad, not in the repo.

# Phase 32: Automatic translator — Context

**Gathered:** 2026-10-12 (owner decisions from the question form, ~19:20 +04; relayed by the controller, T3 thread 0fbbf0c1)
**Status:** Discuss input signed. Research and UI-SPEC drafted. Plan not started.
**Branch / worktree:** `phase-32-auto-translate`. Phases 30 and 31 also touch ROADMAP, STATE and `app/vamos-i18n-dict.js` on their own branches, so edits here stay small and append-only.

<domain>
## Phase Boundary

Every text that has a language reaches the reader in English, German, French and Arabic, with no human check:

- gaps in the site dictionary (`app/vamos-i18n-dict.js`), the Next messages and `content_strings`, and the email messages;
- text Koss types on the dashboard (extra names today; any content he edits);
- customer messages to him (contact form, inbound email): he reads them in his dashboard language, with the original underneath;
- his replies to customers: they go out in the customer's language.

Out of scope: legal pages and owner-approved legal wording (never machine-translated), new sending infrastructure for e-mail (replies keep going through his mail app unless he says otherwise, see Q1), anything that changes prices or the booking flow.
</domain>

<decisions>
## Implementation Decisions (owner, signed 2026-10-12)

### D-01 Scope: everything that has a language
All pages, all e-mails, anywhere in the app: site text, dashboard-typed content (extras, notes, FAQ, any content he edits), customer messages to him and his replies, gaps in de/fr/ar. His words: "we have already 4 languages so I don't want anytime to check the translation, I want it to be automatic and fast and work across all pages and emails and anywhere".

### D-02 Fully automatic, his correction wins
Every translation goes live at once in en/de/fr/ar; nothing waits for him. The dashboard marks machine text so he can correct any line whenever he likes. A correction he makes always wins over the machine and is never overwritten by a later machine run (same rule as the extras translator, D-44: `extra_labels.machine_langs`).

### D-03 Engine: Gemma 4 on Workers AI
`@cf/google/gemma-4-26b-a4b-it` through the Worker `AI` binding (already bound in `env.staging` and `env.production`, `apps/web/wrangler.jsonc` lines 90 and 304). No outside API key. Price on the model page (checked 2026-10-12): $0.10 per M input tokens, $0.30 per M output tokens. The extras translator moves from `@cf/meta/m2m100-1.2b` to the same model and the same house rules, so there is one translator.

### D-04 Privacy: confirmed from Cloudflare's own terms
Customer messages may be translated with no new policy line. Confirmed 2026-10-12 from Cloudflare's published pages (the exact sentences are in `32-RESEARCH.md` § Privacy):
- Workers AI "Data usage" page (last updated Apr 21, 2026): Cloudflare does not use Customer Content to train models or improve services; content is stored only if we use a storage service with it.
- Service-Specific Terms (last updated Sep 28, 2026), Workers AI section: "Unless otherwise agreed, Cloudflare does not use any Customer Content to train generative AI tools."
Cloudflare is already a named subprocessor (ADR-010). Consequence: calls go straight through the `AI` binding, **never through AI Gateway** (its logs keep prompts by default). The translation cache we keep ourselves is in Supabase (Frankfurt), the existing processor.
Inference region is not pinned by Cloudflare (nothing published for Workers AI). This is the same open edge-residency point as ADR-007, not a new one.

### Fixed rules (not up for change)
- **F-01** Legal pages (`app/pages/{terms,privacy,cookies,imprint,cancellation}.dc.html`, `data-vt-legal`), owner-approved legal lines (`.planning/decisions/*` wording, the three Meta texts, cookie texts, the cancellation policy line), `$meta.noParamKeys` entries citing a decision, and `content_strings.non_translatable` rows are NEVER machine-translated. They stay word for word as approved. A missing language there stays missing (shows the approved source), never filled by machine.
- **F-02** Never invent prices, rates or amounts. Amounts, `CHF`, references (`VT-26-0753`), flight numbers, `ZRH`, the class names Economy Sedan / Economy Van / Luxury Van, "Vamos Taxi" stay untranslated (Latin in every language, Arabic included). "Ride with class" is set artwork.
- **F-03** Swiss German: "ss", never "ß" (deterministic post-step, not only a prompt line). Arabic is RTL; numbers and codes stay LTR (`vt-dir-keep`).
- **F-04** No vendor or model name on any public page or customer e-mail (memory: no internal ids in public). The "machine" mark lives only in the dashboard.
- **F-05** Existing hand-checked translations in `app/vamos-i18n-dict.js`, `apps/web/i18n/messages/*.json`, `packages/emails/src/messages/*.json` and `content_strings` stay as they are. The machine fills gaps and new content and never overwrites a human string.
- **F-06** Cache every translation, keyed by source text + target language (+ house-rule version), so the same text is translated once. No model call in the request path of a public page view.
- **F-07** Failure never blanks a page or blocks a save or a send: if the model is down or its answer fails the checks, the reader sees the source language.

### Jev, automation (advisory, owner chose fully automatic)
- Jev gates nothing. At most, each translation row stores a check score (placeholder/term/length checks, optionally a Jev confidence) so the dashboard can sort "worth a look" lines first. Proposal only; added on his word.
- Unattended automation proposed: a nightly sweep (existing 03:00 cron) that machine-fills any missing de/fr/ar line in `content_strings`, extra labels and e-mail strings and mails him a one-line count only when something failed. Proposal only; added on his word.

### Claude's Discretion (defaults taken, listed in the hand-over)
- Cache in Postgres (one table), not KV; read paths that must be fast get a generated overlay (see RESEARCH).
- Background work on the existing queue pattern (new queue) plus the existing crons; a save or an incoming message enqueues, the page never waits.
- Customer message language detected by the same model call (returns the language with the translation), stored on the message row.
- Dashboard language = `staff.lang` (his profile language) for reading customer messages.
</decisions>

<canonical_refs>
## Canonical References

- `apps/web/lib/ops/extra-label-translate.ts` — D-44 precedent: translate on save, staff edits win, failure never blocks the save, `ß`→`ss`.
- `packages/db/supabase/migrations/20260930140000_extra_labels.sql` — `machine_langs text[]` pattern (note: Worker pg client has no arrays; see memory worker-pg-client-no-arrays).
- `apps/web/wrangler.jsonc` — `AI` binding (90, 304), `STRIPE_EVENTS` queue + DLQ pattern (95–134), crons `0 * * * *` / `0 3 * * *` (141, 352).
- `apps/web/worker.ts` — queue consumer routing by queue name; cron gating to Europe/Zurich.
- `app/vamos-locale.js` — `t()`, `lookup()` 257–279, `observe()`, `coverage()`; today no server fetch of strings.
- `apps/web/lib/content/messages.ts` — `CONTENT_SOURCE` json/db switch; NULL omitted.
- `packages/emails/src/lib/t.ts` — flat lookup with `?? FLAT.en` fallback.
- `apps/web/lib/ops/ticket-inbound.ts`, `apps/web/lib/ops/ticket-mail.ts`, `apps/web/lib/ops/tickets-map.ts`, `app/ops/OpsSupportTicket.dc.html` — support thread, read-only, "Answer by e-mail" opens his mail app (mailto / Gmail compose).
- `app/ops/OpsContent.dc.html` — Pages and Legal show "Coming soon"; `/api/staff/content/[key]` still exists.
- ADR-007 (edge residency), ADR-010 (Cloudflare subprocessor), ADR-011 (data-tok labels stay English), ADR-012 (product names Latin).
- `.planning/decisions/2026-09-30-meta-wording.md` and every other decisions file with approved wording — F-01.
</canonical_refs>

<code_context>
## Place map (Explore, 2026-10-12; counts approximate)

Marks: **fill** = machine-fill gaps · **write** = translate on write · **display** = translate for display (original kept) · **never** = never machine (legal / internal / names).

| # | Place | Where | Today | Size / gaps | Writer | Mark |
|---|---|---|---|---|---|---|
| 1 | Mock dictionary strings | `app/vamos-i18n-dict.js` `DICT.strings` + appended `S[...]` | en key → {de,fr,ar} | ~1,990 entries; ~3 de, ~10 fr, ~10 ar missing | developer (git) | fill |
| 2 | Mock dictionary patterns | `app/vamos-i18n-dict.js` `DICT.patterns` | regex templates | ~100 | developer | never (hand only: regex groups) |
| 3 | Next messages | `apps/web/i18n/messages/{en,de,fr,ar}.json` | JSON per locale, parity gate `check-i18n-coverage.mjs` | ~2,700 leaves each | developer | fill |
| 4 | `$meta` lists | same files, `$meta` | flags, reasons | small | developer | never |
| 5 | Content strings (DB) | `content_strings` key/en/de/fr/ar/non_translatable/no_param_reason | 4 columns, NULL = missing | live: 1,546 rows, 0 gaps (read 2026-10-12) | seed + `/api/staff/content/[key]` | fill (skip non_translatable) |
| 6 | E-mail strings | `packages/emails/src/messages/{en,de,fr,ar}.json`, inline tables in `messages.ts` | 4 JSON, fallback en | ~131 per locale | developer | fill |
| 7 | E-mail recipient language | `bookings.locale`, `contact_submissions.locale`, `booking_notifications.locale` | en/de/fr/ar | — | customer | (used to pick target) |
| 8 | Extra names | `extra_labels.label_{en,de,fr,ar}`, `machine_langs` | translate on save with m2m100 (D-44) | live: 0 rows | owner | write (move to Gemma) |
| 9 | Surcharge / class names | `surcharges.code`, `vehicle_classes.name` / `content_strings vehicle.class.*` | codes; class names Latin | ~8 / 3 | owner | never (product names, F-02) |
| 10 | Customer messages | `support_messages.body_text` (`direction` inbound_form / inbound_email), `contact_submissions.message` | customer's own language | live: 0 rows | customer | display (original kept) |
| 11 | His replies | written in his mail app from the ticket's mailto / Gmail link (`ticket-mail.ts`, `OpsSupportTicket`) | not translated | — | Koss | write (into the customer's language, see Q1) |
| 12 | Reviews | `reviews.body`, `author_role`, `route_label` | no language column; shown on home | live: 5 rows (rv-1…rv-5 are test rows to be removed, Phase 30) | import / owner | display (cached, no public mark) |
| 13 | Booking note | `bookings.note`, `booking_legs.note` | customer's language | — | customer | display in dashboard only (original kept) |
| 14 | Internal notes | `customers.note`, `coupons.note`, `chauffeurs.note`, `vehicles.note`, `booking_events.actor_label`, `booking_refunds.reason` | his own text | — | Koss | never (internal, he wrote it) |
| 15 | FAQ | `app/home/FAQ.dc.html`, `app/pages/faq.dc.html`, `FaqCard.tsx` via dictionary | dictionary | ~12 items | developer | fill (no FAQ table exists; editing FAQ is not a dashboard feature today) |
| 16 | Legal pages + approved lines | `app/pages/{terms,privacy,cookies,imprint,cancellation}.dc.html`, decisions wording, cookie banner, Meta texts | verbatim | ~50 flagged lines | owner | **never** (F-01) |
| 17 | Visitor language | cookie `NEXT_LOCALE`, `localStorage vamosLang`, `staff.lang` | — | — | visitor | (used to pick target) |

Live counts read-only via the Supabase connector, 2026-10-12: 2 bookings in total, 0 support messages, 1,546 content strings (no gaps), 0 extra labels, 5 reviews.

### Integration points
- One server module (`apps/web/lib/translate/`) used by every path: house rules, checks, cache lookup, model call.
- Read side: Next pages and e-mails read `content_strings` / message JSON with the machine overlay merged under human values; DC mock pages get a generated overlay file instead of a model call.
- Dashboard: Content › Pages (now "Coming soon") becomes the list of translations; Pricing extras show the mark per language; the support ticket shows the translation with the original under it and prepares his reply in the customer's language.
</code_context>

<specifics>
## Owner questions still open (asked by the controller, not here)
- **Q1 (reply path):** see the hand-over; recommended: keep his mail app, the dashboard puts the translated reply into the mail it opens.
- Migration numbers: the controller asks the owner; file names are listed in the hand-over, none written.
</specifics>

<deferred>
## Deferred
- Translating free text inside legal pages: never (F-01).
- Re-opening the CMS editor for page copy beyond translations: not in this phase.
</deferred>

---
*Phase: 32-auto-translate · Context gathered 2026-10-12*

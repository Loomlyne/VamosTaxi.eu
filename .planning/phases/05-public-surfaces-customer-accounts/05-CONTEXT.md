# Phase 5: Public Surfaces & Customer Accounts - Context

**Gathered:** 2026-09-04 (re-discuss after no-mock close bar)
**Status:** Ready for planning
**Prior:** 2026-08-24 CONTEXT + 05-01…26 executed. This file is the remaining-work contract. Older D-02…D-31 stay in force unless marked superseded below.

<domain>
## Phase Boundary

Every public surface that does **not** depend on a paid booking is a live route on staging
(`vamostaxi.site`) talking to the real Worker + Supabase. No fixture lists. No invented legal
or CHF. DC mocks are the product — do not React-rewrite public pages.

**Already live (do not rebuild):** `/` shell + geo + quote board, `/about` `/faq` `/contact`
`/sign-in` `/account` `/reset-password` `/cookies` `/privacy` `/terms` `/imprint`
`/cancellation` `/coming-soon`, four locales, cookie **banner UI**, Auth
(email/password/magic/passkey), Send Email Hook, contact Turnstile+DB+outbox.

**Remaining this phase:**
1. 05-27 staging contact UAT (first remaining gate — do not re-submit the form).
2. Home reviews hydrate from `public.reviews` (hide the block if 0 published).
3. Flight field: no local samples; honest empty/copy while AeroDataBox is 503.
4. Become-a-partner **removed entirely** (page already 404; drop leftover table/copy/plan).
5. Record 05-24 facts in `05-OWNER-CHECKS.md`. Do **not** re-click dashboards.
6. Per-URL staging connection table on the close bar — mock leftover fails the phase.

**Out of this phase:** `/checkout` `/confirmation` (7). `/bookings` `/manage-booking`
`/booking-detail` (8/9). Ops board (6 done / 8 for live bookings). Cookie **write** to
`consent_log` (10). Quote/`pricing_live`/CHF (4/11). Live DNS (11). Phone-verify / Google /
Apple. Become-a-driver.

</domain>

<decisions>
## Implementation Decisions

### Still in force (do not re-litigate)
- **D-02 / D-03:** `@supabase/ssr` cookie mutation + `getUser()` not `getSession()`.
- **D-04 / D-05 / D-06 / D-07:** customers link trigger; guest claim UI is Phase 8.
- **D-08 / D-09:** Send Email Hook + `user_metadata.locale`. **Send path is Cloudflare Email
  (`env.EMAIL`), not Resend.** From `Vamos Taxi <noreply@vamostaxi.site>`.
- **D-12:** Imprint bilingual `en de` — do not claim four languages.
- **D-14 / Law 04:** One vendored photo or labelled gap. Legal TBC stays TBC.
- **D-15:** SiteHeader signed-in branch is Phase 5 (already live).
- **D-17:** Currency mark-only on these pages. Chargeable number is Phase 7.
- **D-18:** Phone/WhatsApp `+41 79 626 70 82` / `wa.me/41796267082`.
- **D-19:** `PhoneVerify.dc.html` not ported.
- **D-22 / D-23:** Contact Turnstile always-on; writes via `asAnon`, never `publicSql`.
- **D-27 / D-28 live facts (2026-08-31 / 2026-09-04):** Confirm email ON hosted. Hook URI
  `https://vamostaxi.site/api/auth/email-hook`. GET 405, unsigned POST 401 empty. Do not
  `supabase config push` (local `enable_confirmations = false` would clobber hosted).
- **D-29…D-31:** reset-form nonce / invite test harness (2026-09-02 repair).

### Superseded
- **D-01 (old):** become-a-partner was in; `/account` was Phase 8. **Dead.** Partner is out of
  V1. `/account` stays Phase 5 (already live). `/bookings` stays 8.
- **D-11 (old):** home FAQ from `content_strings` now. **FAQ/about stay DC + `vamos-i18n-dict.js`
  until CONTENT_SOURCE=db (not this phase).** Reviews half of D-11 is replaced by D-32.
- **D-16 (old):** booking widget as a stub. Widget is the live DC board; quote contract is
  Phase 4. Phase 5 does not change `/api/quote`.
- **D-20 (old):** cookie banner not in Phase 5. **Banner UI is in 5 (already). `consent_log`
  write is Phase 10.**
- **D-21 (old):** `partner_applications` table as a Phase 5 deliverable. **Drop it.**
- **D-24 (old):** Turnstile per-action for partner. Contact-only. Partner action gone.
- **05-24 plan:** skip as a dashboard re-run (D-35).

### Remaining work (this sitting)

- **D-32:** Home reviews. Public GET of **published** rows only from `public.reviews` into
  `Reviews.dc.html`. No staff fields. No fixtures. **If 0 published: hide the whole reviews
  block.** Do not keep an empty carousel shell. Four languages from DB columns in the same pass.
- **D-33:** Flight field. **No local samples** (no LX1234 list). Empty field + honest copy
  while `/api/flights/lookup` is 503 `provider_unavailable`. Never a fake time/status.
- **D-34:** Become-a-partner **removed entirely.** Page already 404. No DC file, no
  `/api/partner-application`. Drop `public.partner_applications`, leftover i18n
  (`Become a partner`), nav/copy, and do **not** execute 05-19.
- **D-35:** Skip 05-24 owner dashboard clicks. Update `05-OWNER-CHECKS.md` to the 2026-09-04
  facts. Inbox proof of one branded signup is **not** a Phase 5 gate (`stage: sent` ≠ inbox
  stays a known limit).
- **D-36:** `/account` is Phase 5. Profile Save already POSTs `/api/auth` `update-profile`.
  Do not move it to Phase 8.
- **D-37:** 05-27 contact UAT remains the first remaining contact gate. Agent does not
  re-submit the live form. 05-28 deploy stays gated on `CONTACT_BINDINGS_READY` after that UAT.
- **D-38:** DC is the product. No React rewrite of public pages this phase.
- **D-39:** Close bar is a per-URL staging connection table. Any mock leftover on a Phase 5
  URL fails the phase. Honest TBC / `CHF 000` / empty fleet are not mocks.
- **D-40:** Staff `/api/staff/reviews` stays 401 for the public. Add a published-only public
  read. Planner picks the path (`/api/reviews` is fine).
- **D-43:** V1 sign-in is email + password + magic link + passkey. LinkedIn / Google / Apple /
  phone stay off.

### Claude's Discretion
- Public reviews route path and cache headers.
- How the reviews block is hidden (unmount vs `hidden`) — must be gone from layout, not an
  empty carousel.
- Exact honest copy for the flight field in en/de/fr/ar (no invented airline/status).
- Partner drop: additive migration `DROP TABLE` + grant cleanup; i18n key deletion vs leaving
  unused keys (prefer delete keys that are only partner).

</decisions>

<specifics>
## Specific Ideas

- Wire target until Phase 11: `https://vamostaxi.site` + `https://dashboard.vamostaxi.site`.
  Same Worker `vamos`. Same Supabase `yaumjzvylngfjhtuffqs`. Front and ops share infra, **not**
  bookings (that join is Phase 7→8).
- Do not POST `/api/quote` to probe. Do not re-submit `/contact`.
- `05-OWNER-CHECKS.md` dated 2026-08-30 is stale (hook “not registered”, Turnstile deferred).
  Live: hook on, Turnstile on contact, Resend domain `vamostaxi.site` verified (contact, not
  auth mail).
- Phone/WhatsApp: `+41 79 626 70 82`, `https://wa.me/41796267082`.
- 5 published `public.reviews` rows exist today — carousel should show those, not fixtures.
- `partner_applications` still in hosted Postgres as of 2026-09-04.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### This phase
- `.planning/ROADMAP.md` § Phase 5 — no-mock close bar, per-URL connection table
- `.planning/phases/05-public-surfaces-customer-accounts/05-OWNER-CHECKS.md` — update in place
- `.planning/phases/05-public-surfaces-customer-accounts/05-27-PLAN.md` — contact UAT gate
- `.planning/phases/05-public-surfaces-customer-accounts/05-RESEARCH.md` — historical; treat
  D-01/D-11/D-16/D-20/D-21/D-24 as superseded by this CONTEXT

### Cross-phase
- `.planning/phases/03-hyperdrive-data-access-wiring/03-CONTEXT.md` — `publicSql` allowlist
  includes `reviews`; `asAnon` for writes
- `.planning/phases/04-quote-pricing-engine/04-CONTEXT.md` — quote contract; Phase 5 does not
  modify `/api/quote`
- `.planning/REQUIREMENTS.md` — SITE-01/02/04/05/06/07/09, AUTH-01/02/03/04, I18N-08
- `.planning/ADR-014-owner-sitting-2026-08-22.md` — Qurova, imprint TBC, guest claim

### Product / code
- `CLAUDE.md` — four laws, no invented CHF/legal, DC as spec
- `app/home/Reviews.dc.html` — current fixture carousel to replace
- `app/home/home.dc.html` — reviews section mount; hide when empty
- `apps/web/app/[locale]/(ops)/api/staff/reviews/route.ts` — staff-only; do not reuse for public
- `apps/web/app/api/auth/email-hook/route.ts` — live hook
- `packages/db/supabase/migrations/20260828000002_contact_forms.sql` — `partner_applications`
  to drop
- `app/vamos-i18n-dict.js` — leftover `Become a partner`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `publicSql` / `reviews` table — published read for D-32
- DC `Reviews.dc.html` — keep layout, swap data source
- Contact Turnstile + `/api/contact` — already the SITE-04 path
- Auth `/api/auth` + email-hook — done

### Established Patterns
- Public site is `serveDc` of `app/**/*.dc.html`, not Next page ports
- Staff APIs 401 logged-out; public reads need their own route
- Honest degrade > fake data (quote `CHF 000`, legal TBC, flight 503)

### Integration Points
- Home reviews: new public GET → `Reviews.dc.html` fetch
- Flight field: home booking widget JS; strip sample list
- Partner: drop table + i18n + any remaining links; keep 404
- 05-27: UAT only, no code until owner signs

</code_context>

<deferred>
## Deferred Ideas

- Cookie **write** / `consent_log` — Phase 10. Banner UI already in 5.
- `/checkout` `/confirmation` / Stripe test — Phase 7.
- Ops board live bookings / `emptyBookings` — Phase 8.
- `/manage-booking` token + `/booking-detail` 200 — Phase 9.
- AeroDataBox live flight status — later; Phase 5 only honest empty.
- `pricing_live` / real CHF / live DNS `vamostaxi.eu` — Phase 11.
- AUTH-06 guest-claim UI — Phase 8.
- Qurova licence, imprint street/postcode — owner; TBC pills stay.
- Inbox proof of one branded signup mail — not a Phase 5 gate (D-35).
- CONTENT_SOURCE=db for FAQ/about — not this phase.

</deferred>

---

*Phase: 05-public-surfaces-customer-accounts*
*Context gathered: 2026-09-04*

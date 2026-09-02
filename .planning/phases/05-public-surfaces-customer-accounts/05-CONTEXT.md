# Phase 5: Public Surfaces & Customer Accounts - Context

**Gathered:** 2026-08-24
**Status:** Ready for planning
**Source:** Research express path (05-RESEARCH.md, ADR-014, Phase 2/3/4 CONTEXT)

<domain>
## Phase Boundary

Every public mock that carries no live booking state becomes a real, server-rendered route
under Phase 1's `[locale]` tree, and a customer can create, access and sign out of a real
Supabase Auth account. Phase 5 is where Phase 1's own documented stub — the `SiteHeader`
signed-in branch — finally gets built, and where the schema gap Phase 2 left on purpose
(`customers.user_id` nullable, no linking trigger) gets closed.

Requirements covered: SITE-01, SITE-02, SITE-04, SITE-05, SITE-06, SITE-07, SITE-09, AUTH-01,
AUTH-02, AUTH-03, AUTH-04, I18N-08.

**Scope ruling (research D-01, corroborated line-for-line by REQUIREMENTS.md's own phase
table):** the eleven no-live-booking-state content mocks — `about`, `become-a-partner`,
`cancellation`, `contact`, `cookies`, `faq`, `imprint`, `privacy`, `terms`, `sign-in`,
`reset-password` — plus the home page shell. Explicitly **not** this phase:
- `account.dc.html`, `bookings.dc.html`, `booking-detail.dc.html` (SITE-03) → **Phase 8**.
- `manage-booking.dc.html`'s functional lookup half (LIFE-04) → **Phase 9**.
- `checkout.dc.html`, `confirmation.dc.html` (PAY-*) → **Phase 7**.
- The ops console (OPS-06..10) → **Phase 6**.
- The booking widget's pricing/quote logic and `/api/quote` → **Phase 4** (parallel track;
  Phase 5 hosts the widget's shell only, see D-16 below).

**In scope:**
- SSR pages for the eleven content mocks + home, reading through Phase 3's `publicSql`
  (`content_strings`, `reviews`) — no Next.js ISR infrastructure.
- Real Supabase Auth via `@supabase/ssr`: sign-up (password + email OTP), sign-in, password
  reset, session persistence across refresh, sign-out.
- The additive `auth.users`→`public.customers` linking trigger (`SECURITY DEFINER`), closing
  the gap Phase 2's committed migrations (`0001`–`0007`) left open on purpose.
- The Supabase Send Email Hook replacing Supabase's own single-template auth email, so
  signup/recovery/OTP emails render from a four-language template.
- The `SiteHeader` signed-in branch (avatar, account menu, sign-out) — Phase 1's own header
  comment names this a deliberate, unbuilt stub.
- Contact and become-a-partner forms: a new additive migration, Turnstile gating, `asAnon`
  writes, a Resend notification email.
- Extending Phase 1's existing `hreflang`/sitemap scaffold (`apps/web/lib/metadata.ts`) for
  every real page this phase adds — not a second mechanism.

**Out of scope:**
- No CHF price matrix — irrelevant to every page in this phase; the one connection point (the
  home page's booking widget) is Phase 4's concern, untouched here.
- No pricing/quote logic, no `/api/quote` modification.
- No `account`/`bookings`/`booking-detail`/`manage-booking` functional pages, no checkout, no
  ops console.
- No Next.js ISR (R2 + Durable Object queue + D1 tag cache) — none of the required bindings
  exist in `wrangler.jsonc` and Hyperdrive's own 60 s cache on `publicSql`'s table set already
  covers this phase's read volume.
- No `PhoneVerify.dc.html` port (V2/LATER-03) and no `CookieBanner.dc.html` build (SITE-08 is
  Phase 10; `consent_log`'s vocabulary is purpose-built for that banner, not for these forms).

**Dependency posture:** Phase 5 depends on Phase 3 (`publicSql`/`asAnon`, committed and
already `05-CONTEXT`-cited below) and, for the home page's live pricing only, Phase 4 — both
tracked in ROADMAP as executing in parallel with Phase 5, and both currently at the planning
stage (Phase 2 is mid-flight at Wave 4/10, Phase 3 and Phase 4 are planned but owner-gated on
live Supabase/Cloudflare credentials for their final waves). What is locally buildable
regardless of that gating: every content page against `publicSql`, the `@supabase/ssr`
plumbing and the `customers` trigger against a local `supabase start`, the Send Email
Hook's route code and templates (logging instead of sending until Resend exists), and the
contact/partner forms against Cloudflare's documented always-pass Turnstile test keys. What
is blocked on the owner regardless of Phase 5's own code: end-to-end proof of AUTH-01/02
against a live Supabase Auth dashboard, and a live Resend/Turnstile account (see
`<deferred>`).

</domain>

<decisions>
## Implementation Decisions

Every bullet cites its originating research decision (`research D-nn`) or uncertainty
(`research U-nn`) in parentheses for traceability back to `05-RESEARCH.md`.

### Phase scope
- **D-01:** (research D-01) Phase 5 ports the 11 no-live-booking-state content pages (about,
  become-a-partner, cancellation, contact, cookies, faq, imprint, privacy, terms, sign-in,
  reset-password) plus home — not all 18 `PUBLIC_ROUTES` entries. The goal sentence itself is
  the filter; account/bookings/booking-detail, manage-booking's functional half and
  checkout/confirmation stay out. — SITE-01/02/04/05/07.

### Supabase Auth session plumbing (AUTH-03)
- **D-02:** (research D-02) `@supabase/ssr` cookie mutation in middleware is always
  `NextResponse.next({ request })` followed by `.cookies.set()` on that same instance — never
  a freshly constructed `NextResponse(body)`. `opennextjs-cloudflare` folded multiple
  `Set-Cookie` headers when a fresh response was constructed (issue #498/#501, fixed by PR
  #497 before this repo's pinned `1.20.2`); the safe pattern costs nothing to keep following
  defensively. — AUTH-03, every session-bearing request.
- **D-03:** (research D-03) Server-side session checks always call `supabase.auth.getUser()`,
  never `getSession()` — `getSession()` trusts an unverified cookie value; `getUser()`
  round-trips and verifies the JWT signature. — AUTH-03, the SiteHeader signed-in branch,
  every RLS-adjacent read.

### `customers` row creation & signup verification (AUTH-01)
- **D-04:** (research D-04) An additive `SECURITY DEFINER` trigger (`AFTER INSERT on
  auth.users`) upserts `public.customers` by email — never an app-code upsert in a Route
  Handler called after `signUp()` resolves client-side. The trigger runs inside GoTrue's own
  transaction and can't be skipped by a dropped request; app-code upsert would leave
  `auth.users` rows with no matching `customers` row, breaking every RLS policy that joins
  through `customers.user_id`. `customers.email` is already `citext`, unique where `erased_at
  is null` (Phase 2) — the `on conflict` target needs no new index. — AUTH-01, every later
  customer-scoped RLS read.
- **D-05:** (research D-05) `customers.full_name` (`not null`, no default) is supplied in the
  same trigger statement from `raw_user_meta_data->>'full_name'`, set via `signUp()`'s
  `options.data` — not left blank or deferred to a later profile step. — D-04.
- **D-06:** (research D-06) A brand-new password signup stays unverified until the
  confirmation email/link is completed; sign-in and OTP/magic-link are self-verifying. Matches
  the mock's own `AuthForm.dc.html` state machine (`verified = mode==='signin' ||
  method==='magic'`) exactly — a port, not a new invention. — AUTH-01.
- **D-07:** (research D-09) ADR-014 §2's guest-booking→account linking flow is satisfied for
  free by D-04's trigger (it upserts by email regardless of whether a `customers` row
  pre-existed from a guest checkout) — Phase 5 does **not** need to build AUTH-06's claim-flow
  UI/logic now. That UI ("we found bookings under this email") is Phase 8's job; only the data
  linking happens here. — AUTH-06 (inherited for free, owned by Phase 8).

### Locale-correct auth email (AUTH-01, AUTH-02)
- **D-08:** (research D-07) Multi-language auth email is Supabase's **Send Email Hook** — a
  full replacement of Supabase's own send — never Custom SMTP pointed at Resend. Custom SMTP
  is one Go-templated HTML file per project with no native per-locale branching; it cannot
  satisfy CLAUDE.md's four-language law. The hook fully replaces the send and lets Phase 5's
  own code choose the locale-correct `packages/emails` template. — AUTH-01, AUTH-02.
- **D-09:** (research D-08) Locale reaches the hook via `user_metadata.locale`, set at
  `signUp()`/`signInWithOtp()` time from the `[locale]` segment the form was submitted from —
  the hook has no request-time access to the visitor's browser locale, only what was stored on
  the user at signup. Lock this exact key name (`user_metadata.locale`) so the trigger (D-04)
  and the hook agree. — D-08.

### Content pages & the two-source window (SITE-01)
- **D-10:** (research D-12) Content pages are plain dynamic SSR reading through Phase 3's
  `publicSql` (`HYPERDRIVE`, 60 s cache) — no Next.js ISR. None of ISR's required bindings
  (R2, DO queue, D1/DO tag cache) exist in `wrangler.jsonc`, and Hyperdrive's own query cache
  already covers this phase's read volume; true ISR is deferrable to Phase 10 if LAUNCH-01's
  10k-concurrent target needs it. — SITE-01, SITE-07.
- **D-11:** (research D-13) The home page's FAQ and reviews sections read directly from
  `content_strings`/`reviews` via `publicSql` **now**, in Phase 5 — not waiting for Phase 6's
  platform-wide `t()`-loader swap (I18N-07). The rest of the site's copy legitimately stays on
  the JSON `t()` loader during this window; this is a deliberate two-source design, not a bug.
  — SITE-01.

### Legal-page correctness (SITE-05, I18N-08)
- **D-12:** (research D-16) Imprint's language-completeness marker is ported as `en de`, not
  `en de fr ar`. Verified directly: `app/pages/imprint.dc.html:124` carries
  `data-vt-legal="en de fr ar"` while the page's own content is bilingual-only ("Deutsch ist
  die verbindliche Fassung") via a `data-lang="de"|"en"|"both"` toggle with no French/Arabic
  branch. Carrying the mock's claim forward unchanged would ship a false four-language claim —
  exactly what I18N-08 forbids. — SITE-05, I18N-08.
- **D-13:** (research D-17) `images.binding = "IMAGES"` is added to `apps/web/wrangler.jsonc`
  before any Phase 5 marketing page ships real photography — Phase 1's own research already
  found `/_next/image` returns 200 with the original, unresized file without this binding. —
  About/become-a-partner/contact hero images.
- **D-14:** (owner blocker #3) Only one reference photograph is vendored
  (`hero-arrivals.jpg`, already proven working with `next/image` in Phase 1 Plan 05 Task 3).
  Any Phase 5 page that would otherwise want a second hero image uses that one photograph or a
  labelled placeholder — never invented stock imagery. — About/become-a-partner/contact.

### SiteHeader, currency, and the booking-widget boundary (SITE-02)
- **D-15:** (research D-14) The `SiteHeader` signed-in branch (avatar disc, account menu,
  notification bell, sign-out) is built in Phase 5, driven by a real session (`getUser()` read
  server-side, sign-out via a Server Action) — not left as Phase 1's stub. Phase 1's own header
  comment documents this as a deliberate, named Phase 5 stub, not optional scope; it is where
  AUTH-04 is actually satisfied. — SITE-02, AUTH-04.
- **D-16:** (research D-19; corroborated by Phase 4 CONTEXT `<domain>` "No booking-widget
  React port — Phase 5. Phase 4 ships the contract the widget consumes.") The home page's
  booking widget stays exactly what Phase 1 shipped — a stub — until Phase 4 supplies the real
  interactive board (per-class cards, 30-minute countdown) it plugs into. Phase 5 builds no
  quote/pricing logic; its own scope on the home page is the shell, hero, sections and
  Reviews/FAQ wiring (D-11). Because Phase 4 and Phase 5 both touch this seam, confirm the
  exact hand-off point (does Phase 5 render the widget's static shell that Phase 4's client
  logic mounts into, or does Phase 4 ship the whole component) at Phase 5 planning time. —
  SITE-01.
- **D-17:** (research D-15) Currency display on Phase 5's own pages stays a pure client-state,
  mark-only swap (Phase 1 D-16 / ADR-001) — ADR-014 §1's "Stripe FX changes the number"
  correction is scoped to Checkout (Phase 7); no page in this phase renders a live, chargeable
  price. Defensive scope clarification only.
- **D-18:** (research D-20) The contact page reuses the exact phone constant already
  established in `apps/web/components/shell/SiteHeader.tsx` (`PHONE_HREF`), and adds a
  `WHATSAPP_HREF` following the same pattern — one source of truth for a number that appears
  on both header and contact page. — SITE-09.
- **D-19:** (research D-21) `PhoneVerify.dc.html` is not ported in Phase 5, despite sitting in
  the same `app/pages/` folder as `AuthForm`/`ResetForm` — LATER-03 explicitly defers phone
  verification/social sign-in to V2; porting it now would be building V2 scope inside a V1
  phase.
- **D-20:** (research D-22) `CookieBanner.dc.html` is not built in Phase 5, even though this
  phase already touches consent-adjacent territory (contact-form submissions). SITE-08 is
  explicitly Phase 10 in REQUIREMENTS.md's own traceability table, and `consent_log`'s method
  vocabulary (Phase 2 §11) is purpose-built for the banner's four categories, not a generic
  form-consent mechanism Phase 5's forms should reuse.

### Contact & become-a-partner forms (SITE-04, SITE-09)
- **D-21:** (research D-10) A new additive migration creates `contact_submissions` and
  `partner_applications` — neither table exists in Phase 2's committed migrations, and
  SITE-04's own success criterion requires the submission to reach both inbox and database
  even though the ops review-queue UI is deferred (LATER-05).
- **D-22:** (research D-11) Each form gets one always-on managed/invisible Turnstile widget,
  verified server-side with a form-specific `idempotency_key` — not Phase 4's three-layer
  escalating abuse system (Rate Limiting + `ratelimits` + invisible-then-enforced Turnstile).
  That system is sized for an API hit repeatedly within seconds; a contact form submitted once
  per visitor doesn't need per-IP rate escalation infrastructure.
- **D-23:** (research U-01, Pitfall 3) Contact/become-a-partner writes go through `asAnon`
  (Phase 3's anonymous wrapper, `HYPERDRIVE_NOCACHE`) — **never** `publicSql`, which is
  branded read-only to a five-table content allowlist (Phase 3 D-11) and sits on the
  cacheable `HYPERDRIVE` binding; a write routed through it either fails on the missing grant
  or risks being masked by the 60 s cache on a same-session confirmation read. Before writing
  the migration, read Phase 3's committed `identity.ts`/grant surface to confirm whether
  `asAnon`'s underlying role already has broad enough `INSERT` rights or whether this
  migration must add the grant explicitly for `contact_submissions`/`partner_applications` —
  assume the latter unless proven otherwise.
- **D-24:** (research U-04, U-07) One Cloudflare Turnstile site key/secret pair serves both
  the contact form and the become-a-partner form, distinguished by a Turnstile `action`
  parameter (cheap, added regardless of whether it turns out to be required). Once Turnstile
  is provisioned, configure the one widget with two `action` values and check the dashboard's
  per-action breakdown; if Cloudflare's reporting genuinely can't distinguish the two
  meaningfully, provision a second `TURNSTILE_SITE_KEY`/`_SECRET` pair instead. — SITE-04.

### Isolation & CI coverage carried from Phase 3
- **D-25:** (research D-18, citing Phase 3's own deferred U-31/ISOL-08) Phase 3's deferred
  item — re-pointing the isolation harness at "the real product route" — is **not**
  automatically resolved by Phase 5 just because Phase 5 ships identity-touching writes.
  Phase 5's actual candidates (the `customers` trigger, `asAnon` form writes) don't obviously
  match Phase 3's own stated example target (`/api/account/bookings`, a `withIdentity`-gated
  read, itself Phase 8 scope). Verify explicitly during Phase 5 planning which route (if any)
  qualifies, rather than silently claiming the item closed.
- **D-26:** (research U-08) Confirm whether Phase 3's `force-dynamic` CI grep — scoped to
  every file importing one of the five named identity wrappers (`asCustomer`/`asStaff`/
  `asGuest`/`asAnon`/`asQuote`) — already covers Phase 5's `asAnon`-importing form routes
  (likely yes, `asAnon` is in that list) and separately whether it needs extending to cover
  `publicSql` imports on the new content pages (`publicSql` is not one of the five named
  wrappers, so it may not be covered). Extend the grep in the same plan that first imports
  `publicSql` if it isn't already covered. — D-25, SITE-01/SITE-04 routes.

### Owner-dashboard-gated verification checks (run once reachable, not blocking code)
- **D-27:** (research U-02) Once Supabase's Auth dashboard is reachable, register the Send
  Email Hook against the deployed staging Worker URL and send one real test signup, timing the
  round trip against the dashboard's own stated hook-timeout figure. If `*.workers.dev` proves
  unreachable or too slow from Supabase's infrastructure, this escalates the `vamostaxi.eu`
  DNS/zone blocker (below) rather than being solved in application code. — AUTH-01/AUTH-02
  email delivery.
- **D-28:** (research U-03) Once Auth settings are reachable, check the "Confirm email" toggle
  explicitly (its default has changed across Supabase product versions) and write a
  Playwright/integration assertion that a fresh password signup does **not** yield a usable
  session until the confirmation link/OTP is exercised — do not assume the default matches
  D-06's requirement. — AUTH-01.
- **D-29:** (research U-06) Run a scripted key-coverage audit (extending
  `scripts/check-i18n-coverage.mjs`'s pattern) scoped to each of terms/privacy/cookies/
  cancellation's own key namespace before trusting their inherited `data-vt-legal="en de fr
  ar"` claim at face value. The bilingual-span check that caught imprint (D-12) only catches
  that one page's specific broken mechanism — it does not positively prove full key coverage
  for these four larger pages (380–445 lines each). — SITE-05, I18N-08.

### Claude's Discretion
- Route shape for sign-up: one `/sign-in?mode=signup` route (mirroring `AuthForm.dc.html`'s
  own `mode` prop) vs. a dedicated `/sign-up` route for cleaner `hreflang`/analytics
  separation — either is compatible with everything else in this research (research Open
  Question 1). `apps/web/lib/metadata.ts`'s `PUBLIC_ROUTES` list currently has no `/sign-up`
  entry; extending it or not is the concrete decision point.
- Whether `packages/emails`' full React Email toolchain is stood up now (Phase 5, the first
  phase needing any transactional email) or Phase 5 ships plain template-string HTML and
  Phase 7's confirmation/voucher email builds the real toolchain (research U-05) — a
  sequencing choice, not an unknown fact. No external check settles this.
- Whether the mock's own distinguishing "this email already has an account" signup error
  (an intentional UX choice in `AuthForm.dc.html`) ships as-is or is softened toward
  Supabase's generally-recommended non-distinguishing response, given the email-enumeration
  tradeoff the research's Security Domain section flags but does not resolve.
- `coming-soon.dc.html` (research Open Question 2): not referenced by any REQUIREMENTS.md ID
  and not in Phase 5's success criteria. Flag for the owner rather than silently building or
  dropping it — costs nothing to leave unbuilt until asked for.
- Plan-to-file mapping beyond the research's proposed 8-plan split below — merging plans or
  splitting one further is the planner's call as long as P1 stays the auth-foundation soft
  gate for P2/P3/P4 and P8 stays the hard cross-cutting gate run last.
- Test file granularity (one spec per page vs. grouped specs) beyond the Wave-0 gap list the
  research names — splitting or combining within a lane is fine, matching Phase 2/3's own
  discretion on this point.

### Proposed plan split `[informational]`
Reproduced verbatim from 05-RESEARCH.md's "Proposed Phase 5 plan split" — a recommendation the
planner may adopt, adapt or replace; not a locked decision. The coverage gate should not treat
this table or the wave diagram as D-NN items.

| # | Plan | Goal (one line) | File scope | Depends on | Parallel with |
|---|---|---|---|---|---|
| **P1** | **Supabase Auth foundation** | Client factories, the `@supabase/ssr` middleware session-refresh composed with next-intl's existing routing, the sign-out Server Action, and the additive `customers`-linking trigger migration + pgTAP (D-02/D-03/D-04/D-05) | `apps/web/lib/supabase/{server,client,middleware}.ts`, `apps/web/middleware.ts` (extended), `packages/db/supabase/migrations/<ts>_customers_auth_link.sql`, `packages/db/supabase/tests/customers_link_trigger.test.sql` | Phase 2 (`customers` table), Phase 3 (`@supabase/ssr` peers only — no Hyperdrive call in this plan) | P5, P6, P7 |
| **P2** | **Auth pages & flows** | Sign-in/sign-up/reset-password routes; `AuthForm`/`ResetForm` ports covering password + OTP + magic-link + forgot-password; the mock's own verification-state logic (D-06); Playwright coverage for AUTH-01/02/03/04's happy paths | `apps/web/app/[locale]/{sign-in,reset-password}/page.tsx` (+ `sign-up` if the planner splits it), `apps/web/components/auth/{AuthForm,ResetForm}.tsx`, `apps/web/tests/integration/auth-*.spec.ts` | P1 | P3, P4 |
| **P3** | **Locale-correct auth email** | The Send Email Hook route, `standardwebhooks` signature verification, `packages/emails` template scaffold in four languages, locale stashed at signup (D-08/D-09) | `apps/web/app/api/auth/email-hook/route.ts`, `packages/emails/templates/auth-*.{en,de,fr,ar}.*` | P1 (needs `signUp()`/`signInWithOtp()` calls to exist so `user_metadata.locale` has somewhere to be set) | P2, P4 |
| **P4** | **SiteHeader signed-in branch** | Avatar disc, account menu, "verify your email" notice (the booking-attached notice stays deferred — no bookings exist until Phase 7+), sign-out wiring, extended component screenshot baselines | `apps/web/components/shell/SiteHeader.tsx` (extended), `apps/web/tests/visual/shell.spec.ts` (extended) | P1 | P2, P3 |
| **P5** | **Content pages** | About/FAQ/terms/privacy/cookies/cancellation/imprint ported to SSR, i18n keys added, imprint's `data-vt-legal` corrected to `en de` (D-12), responsive audit at 1440/1024/768/390 | `apps/web/app/[locale]/{about,faq,terms,privacy,cookies,cancellation,imprint}/page.tsx`, `apps/web/i18n/messages/*.json` (extended), `apps/web/tests/visual/legal.spec.ts` | Phase 1 (shell, i18n runtime) — no Phase 5-internal dependency | P1, P6, P7 |
| **P6** | **Home DB wiring** | Reviews + FAQ sections reading via `publicSql` (D-11), hero/sections layout port, booking-widget shell left untouched (D-16) | `apps/web/app/[locale]/page.tsx` (extended), `apps/web/components/home/{Reviews,FAQ}.tsx` (new), `apps/web/tests/integration/home-content.spec.ts` | Phase 2 (`reviews`/`content_strings` tables), Phase 3 (`publicSql`) — no Phase 5-internal dependency | P1, P5, P7 |
| **P7** | **Contact & become-a-partner** | New additive migration (`contact_submissions`, `partner_applications`), Turnstile verify helper + widget wiring, `asAnon` write path, Resend notification email, phone/WhatsApp links (D-21/D-22/D-18) | `apps/web/app/[locale]/{contact,become-a-partner}/page.tsx`, `apps/web/app/api/{contact,partner-application}/route.ts`, `packages/db/supabase/migrations/<ts>_contact_forms.sql`, `apps/web/lib/turnstile.ts` | Phase 3 (`asAnon`) — no Phase 5-internal dependency | P1, P5, P6 |
| **P8** | **SEO, metadata & cross-cutting gate** | Extend `PUBLIC_ROUTES`/`buildAlternates`/`sitemap.ts` for every real page P2/P5/P6/P7 landed, `images.binding = "IMAGES"` wrangler fix (D-13), `scripts/check-legal-language-claims.mjs` (I18N-08, D-29), full four-viewport Playwright sweep, `pnpm i18n:check` green | `apps/web/lib/metadata.ts` (extended), `apps/web/app/sitemap.ts` (extended), `apps/web/wrangler.jsonc`, `scripts/check-legal-language-claims.mjs` | P2, P4, P5, P6, P7 (needs every real page to exist) | — |

```
P1 ──┬── P2 ──┐
     ├── P3 ──┼── P8
     └── P4 ──┤
P5 ───────────┤
P6 ───────────┤
P7 ───────────┘
```

Wave 1: **P1**, **P5**, **P6**, **P7** in parallel — P1 is the auth-foundation gate for Wave
2's auth plans, but has no dependency on P5/P6/P7 and they have none on it, so all four start
together.
Wave 2: **P2**, **P3**, **P4** in parallel — each depends only on P1's client factories, and
are otherwise file-disjoint (auth pages, the email hook, the header).
Wave 3: **P8** alone — deliberately last and not parallelised, mirroring Phase 2's own P6
reasoning: a cross-cutting pass over every route needs every route to exist first, or it
either misses a page or has to be re-run.

### 2026-09-02 account-auth repair addendum
- **D-29:** The password-reset page must not discard values typed before its asynchronous
  `/api/auth/session` bootstrap completes. `reset-password.dc.html` increments the child's
  `nonce` when the signed-in session resolves, and `ResetForm.dc.html` currently clears both
  fields for a nonce-only update even when the stage remains `form`. Keep field reset tied to a
  genuine stage change only; preserve form state for the same-stage session bootstrap update.
  The existing AUTH-02 browser flow is the red regression seam and must prove the full recovery
  link → password update → password sign-in path.
- **D-30:** Keep the `opsInviteRedirectUrl` behavior tests, but replace direct mutation of
  readonly `process.env.NODE_ENV` with Vitest's supported environment stubbing and cleanup.
  The typecheck failure is test-harness-only; no production environment logic changes.
- **D-31:** This repair stays limited to reset-form state retention, its real browser proof, and
  the invite test's environment setup. It does not alter hosted Supabase Auth configuration,
  hosted redirects, account-save semantics, price/legal content, or Phase 7.

</decisions>

<specifics>
## Specific Ideas

- The five new npm dependencies, exact versions confirmed live 2026-08-24, all slopcheck
  `[OK]`: `@supabase/ssr@0.12.4`, `@supabase/supabase-js@2.112.3`, `resend@6.22.0`,
  `zod@4.4.3`, `standardwebhooks@1.0.0`. Install: `pnpm --filter web add @supabase/ssr
  @supabase/supabase-js resend zod standardwebhooks`. Re-verify versions at Wave 0 regardless.
- The linking trigger, by name: `public.tg_link_customer_on_signup()` (function,
  `language plpgsql security definer set search_path = ''`), trigger
  `link_customer_on_signup` `after insert on auth.users`. `on conflict (email) where erased_at
  is null do update set user_id = excluded.user_id where public.customers.user_id is null` —
  never re-targets an already-linked row.
- The Send Email Hook route: `apps/web/app/api/auth/email-hook/route.ts`, verified with
  `new Webhook(process.env.SEND_EMAIL_HOOK_SECRET!)` from `standardwebhooks` (the
  `v1,whsec_...` value comes from the Supabase dashboard), sending via
  `new Resend(process.env.RESEND_API_KEY!)`.
- Phone/WhatsApp constants: reuse `PHONE_HREF` (`tel:+41796267082`) from
  `apps/web/components/shell/SiteHeader.tsx`; new `WHATSAPP_HREF =
  "https://wa.me/41796267082"` (no leading `+` or spaces in the `wa.me` path).
- New tables from the Phase 5 migration: `contact_submissions`, `partner_applications` — both
  additive, following Phase 4's precedent of additive-only migrations after Phase 2's
  baseline.
- Cloudflare's documented always-pass Turnstile test keys for local dev:
  `1x00000000000000000000AA` (sitekey) / `1x0000000000000000000000000000AA` (secret).
- `packages/emails/templates/auth-*.{en,de,fr,ar}.*` — the four-language auth email template
  set (exact toolchain choice is Claude's discretion, see above).
- Test commands this phase's Wave-0 gap list is built around: `pnpm --filter web exec
  playwright test tests/integration/{home-content,contact-form,auth-*}.spec.ts`,
  `pnpm --filter web exec playwright test tests/visual/legal.spec.ts`,
  `pnpm --filter @vamos/db run test:db packages/db/supabase/tests/customers_link_trigger.test.sql`,
  `node scripts/check-legal-language-claims.mjs` (new). Full suite:
  `pnpm test:visual` + `pnpm db:test` + `pnpm i18n:check`.
- Vitest is not yet installed repo-wide as of this research; check whether a parallel Phase 4
  plan already added it before performing a second install.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase research (primary source for this CONTEXT)
- `.planning/phases/05-public-surfaces-customer-accounts/05-RESEARCH.md` — the full D-01–D-22
  decision table, the U-01–U-08 uncertainty table with checks, the owner-blocker list, the
  8-plan/3-wave split reproduced above, the Architectural Responsibility Map, Standard Stack,
  Package Legitimacy Audit, Architecture Patterns (§ middleware session refresh, § Send Email
  Hook, § `customers` linking trigger), Common Pitfalls 1–4, Validation Architecture, Security
  Domain, and the Assumptions Log (A1–A4).

### Cross-phase contracts this phase binds to
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-CONTEXT.md` — the `customers`
  table shape (D-04 there: nullable `user_id`, `citext` email unique-where-not-erased), the
  manage-token RLS/RPC split (D-15/D-16), and the append-only/audit posture Phase 5's new
  tables must not violate.
- `.planning/phases/03-hyperdrive-data-access-wiring/03-CONTEXT.md` — **D-11** (`publicSql`'s
  exact five-table read-only allowlist: `content_strings`, `reviews`, `vehicle_classes`,
  `service_zones`, `settings_public`), **D-08** (the five named wrappers including `asAnon`,
  all on `HYPERDRIVE_NOCACHE`), **D-10** (a forgotten wrapper is `42501`, never a stale row),
  and its own `<deferred>` section naming Phase 5 as the owner of re-pointing the isolation
  harness (D-25 above).
- `.planning/phases/04-quote-pricing-engine/04-CONTEXT.md` — `<domain>` "No booking-widget
  React port — Phase 5. Phase 4 ships the contract the widget consumes." (D-16 above) and its
  own out-of-scope line "No CHF price matrix... every amount renders `CHF 000`" (irrelevant to
  every Phase 5 page except the home widget seam).

### Architecture decisions that bind this phase
- `.planning/ADR-014-owner-sitting-2026-08-22.md` — §2 "Guest booking → account (extends Q2)"
  (the flow D-07 satisfies for free), §4 Accounts (Supabase/Resend/Turnstile "owner creates
  when asked" — still not created, the live-service half of the owner blocker below), §7
  Qurova licence (still open, no new Phase 5 decision needed) and imprint street/postcode
  (still TBC).
- `.planning/ADR-001` (Phase 1's currency mark-swap decision) — D-17's basis; ADR-014 §1 only
  overrides it for Checkout.

### Requirements and roadmap
- `.planning/ROADMAP.md` § Phase 5 — goal, the five success criteria, requirement list, and
  the "Depends on: Phase 3 (the home page's booking widget also requires Phase 4)" line.
- `.planning/REQUIREMENTS.md` — SITE-01/02/04/05/06/07/09, AUTH-01/02/03/04, I18N-08 in full
  (lines 37, 52–55, 96–104), status table lines 197–246 (all `Phase 5 | Pending`).

### Runtime contract this phase extends
- `apps/web/components/shell/SiteHeader.tsx` — the header's own comment confirming the
  signed-in branch was deliberately not ported in Phase 1; the source of `PHONE_HREF`.
- `apps/web/lib/metadata.ts` — the existing `PUBLIC_ROUTES`/`buildAlternates()` scaffold
  (Phase 1 D-19) that P8 extends rather than rebuilds.
- `app/pages/imprint.dc.html` (line 124) — the verified `data-vt-legal="en de fr ar"`
  discrepancy (D-12); `app/pages/AuthForm.dc.html` — the `mode`/verification state machine
  D-06 ports.

### Project rules
- `CLAUDE.md` — Law 04 (a pending value is a labelled gap: the imprint street/postcode
  `data-tok` pill ports unchanged) and the four-languages-same-pass rule every new string in
  this phase (auth forms, contact forms, email templates) must satisfy.
- `.claude/CLAUDE.md` — the fixed stack (`@supabase/ssr`, Resend, Turnstile, Cloudflare
  Workers via `@opennextjs/cloudflare`), the security posture (RLS, no secrets in the repo,
  TOTP MFA for staff — not customer-facing here, but the `getUser()`-not-`getSession()`
  discipline is the customer-side analogue).

</canonical_refs>

<deferred>
## Deferred Ideas

Owner-only or later-phase items the research raised that are not Phase 5 engineering
decisions — each needs a person or a later phase, not a migration or a route, to close. None
of these block Phase 5's own code from being written.

- **Live Supabase Auth, Resend and Cloudflare Turnstile dashboards** — Phase 2 D-37 confirms
  the Postgres half of the Supabase project exists (ref `yaumjzvylngfjhtuffqs`, Zurich
  region), but the DB password and dashboard are owner-held, and no prior phase has touched
  Auth-specific settings. Phase 5 is the first phase that genuinely needs the "Confirm email"
  toggle, Send Email Hook registration, a live Resend account/API key, and a live Turnstile
  site key/secret pair. None of these block writing the code (local `supabase start` and
  Cloudflare's test keys unblock implementation); AUTH-01/AUTH-02/SITE-04 cannot be verified
  **end-to-end** until all three exist. Tracked as D-27/D-28 above for the checks to run once
  reachable.
- **Qurova webfont licence** — still open per ADR-014 §7 ("keep this item open until the
  purchase lands"). Every Phase 5 page renders Qurova exactly as every other ported page does;
  no new decision needed this phase.
- **`vamostaxi.eu` DNS / Cloudflare zone** — staging still deploys to `*.workers.dev` (Phase
  1's recorded deviation); no zone exists yet. Directly touches D-27 (Send Email Hook
  reachability) — if the hook needs a stable, non-`*.workers.dev` hostname, this blocker
  becomes load-bearing. `SITE_URL` in `apps/web/lib/metadata.ts` already hardcodes the
  eventual production domain regardless of what's currently live.
- **Imprint street/postcode and other legal TBCs** — already carried as `data-tok` pills in
  the mock (ADR-014 §7: "Stays TBC"). Phase 5 ports the pill mechanism exactly as it exists;
  this is Law 04 continuing to apply, not new work.
- **CHF price matrix** — irrelevant to every one of Phase 5's own pages; the one connection
  point (the home page's booking widget) is Phase 4's concern (D-16), untouched here. Owned by
  Phase 4/11.
- **AUTH-06's guest-booking claim-flow UI** ("we found bookings under this email") — the data
  linking is free from D-04/D-07; the UI itself is explicitly Phase 8's job.
- **`coming-soon.dc.html`** — not referenced by any requirement ID, not in Phase 5's success
  criteria. Flag for the owner (Claude's Discretion above) rather than building or dropping it
  silently.

</deferred>

---

*Phase: 05-public-surfaces-customer-accounts*
*Context gathered: 2026-08-24 via research express path*

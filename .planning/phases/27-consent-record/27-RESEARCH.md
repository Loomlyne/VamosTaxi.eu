# Phase 27: Consent record - Research

**Researched:** 2026-09-30
**Domain:** Server-side cookie consent (Postgres definer functions, Next.js 15 route handlers on Workers, DC mock banner), owner legal copy in four languages
**Confidence:** HIGH for code facts (read from this worktree at `305adec3`, main merged at `4e1e49bf`); MEDIUM for the two runtime assumptions flagged in the Assumptions Log

## Summary

This phase adds no library and no new layout. It (1) adds one SECURITY DEFINER reader to `consent_log`, (2) teaches `/api/consent` to write the categories the visitor actually chose, (3) adds a `no-store` GET that tells both banners whether this visitor has a row under the current policy version, (4) makes both banners (mock and Next) post to the server and show on every customer page, (5) places the owner's three Meta texts verbatim, (6) bumps `CONSENT_POLICY_VERSION`, and (7) removes the sign-up confirmation write.

The key design fact: every public mock page reaches the browser through `serveDcHtml` in `apps/web/middleware.ts:111`, and the nine `MARKETING_CACHE_PATHS` get `Cache-Control: public, s-maxage=300, stale-while-revalidate=3600` (`middleware.ts:449-456`). Anything per visitor baked into that HTML can be served to another visitor by any shared cache. So the page must learn its consent state from a separate, uncached request. The recommendation is a new `GET /api/consent/state` (route handlers under `/api` are outside the middleware matcher, `middleware.ts:726`). The same endpoint serves the Next banner, which removes the need for an identity wrapper in the layout, a pattern the db-fence checker is built to catch.

Several existing tests pin Phase 26 behaviour that this phase changes on purpose: `legal-gate.test.ts` (version `2026-09-12`, `marketing: false`, `PendingSlot` slots, banner title), `banner-contract.test.ts` (two buttons, `isHome ? banner : null`), `record.test.ts` (all categories false, signup writer), `live-no-tbc.test.ts` (`.vt-ck-meta:has([data-tok])`), `tests/unit/auth/signup-consent.test.ts`, and the auth e2e check `1b`, which expects at least one `consent_log` row after sign-up. Each must be rewritten in the same plan that changes the behaviour, never deleted blindly.

**Primary recommendation:** Build one migration `20261002100000_consent_choice_reader.sql` holding `public.consent_choice(p_policy_version text, p_as_of timestamptz default null)`. It takes the subject from the GUC, returns one row or none, has no arrays, and grants EXECUTE to `anon` only. Build one `no-store` `GET /api/consent/state` over it, called by a new shared mock runtime `app/vamos-consent.js` and by the rebuilt Next `CookieBanner.tsx`. Keep the owner texts out of the shared dictionary: put them in a new `app/vamos-meta-texts.js` and in new next-intl keys, and prove both byte-for-byte against the decision file.

## User Constraints (from CONTEXT.md)

<user_constraints>

### Locked Decisions

#### Sign-up confirmation (owner, 2026-09-30)
- **D-01:** Confirming the e-mail writes **no** cookie row. Only the banner and Cookie preferences
  write cookie choices. Example: Lena presses Accept, then signs up and confirms; she stays on
  Accept. The consent to open an account is 26.5's own account record, not `consent_log`.
- **D-02:** The existing row id 3 stays. `consent_log` is append-only; no UPDATE, no DELETE.
- **D-03:** Remove the `consent_log` write from `signup-consent.ts` / the callback. Coordinate with
  26.5 (`gsd/phase-26.5-checkout-account`), which owns account consent; do not break its tick box.
  The `signup_consent` metadata flag handling stays harmless (no cookie row).
- **D-03a (owner, 2026-09-30, second question):** the `/sign-up` page gets the same account notice
  and tick box that 26.5 builds for checkout; the tick is saved in 26.5's account record table
  (text version, language, time), never in `consent_log`. Example: Marco signs up on
  vamostaxi.site/sign-up, ticks, and his agreement is recorded there. Built in Phase 27 after 26.5
  has shipped (depends on its table and notice text; reuse, do not fork). Until that lands the
  removed row is not replaced — it never recorded an agreement (it was necessary-only).
- **D-03b:** Row id 3 (2026-09-29, `reject_all`, customer set) must not decide Meta. It is under
  `2026-09-12`, so the new version excludes it; a pgTAP test proves it.

#### Which banner, where (owner, 2026-09-30)
- **D-04:** Today's banner, all three buttons, same look on every customer page: **Accept all**,
  **Necessary only**, **Manage preferences** (four switches). No new layout, no new switch.
- **D-05:** Accept all = marketing on (Meta on). Necessary only = marketing off. In Manage
  preferences the Marketing switch = Meta on or off; Save choices writes a `settings_change` row
  with exactly the switches shown. Functional and Analytics are recorded as chosen (nothing runs
  on them).
- **D-06:** Every choice is saved in `consent_log` through `/api/consent` (the existing route and
  `record_consent`), not only in the browser. The browser copy may stay as a display cache only;
  the server row is the truth.
- **D-07:** The banner shows on every customer page until the visitor chooses: all mock pages that
  import it today, plus sign-in, account and bookings, plus the Next pages `/checkout/*`,
  `/confirmation/*` and the pay link `/checkout/pay/[token]`. Ops and dashboard never show it.
- **D-08:** "Chosen" means the server has a row for this visitor's `consent_subject` under the
  **current** policy version. A row under an older version does not count (Phase 26 D-14).
- **D-09:** The Next pages use the same banner look and copy as the mock (port, do not invent).
  Home stays on the mock banner.
- **D-10:** "Cookie preferences" (footer link, `vamos:cookie-prefs`) opens Manage preferences with
  the visitor's current saved choice, on mock and Next pages, so a later Necessary only is possible
  anywhere.

#### Copy (owner, 2026-09-30)
- **D-11:** Banner body = the owner's banner text, verbatim, four languages
  (`.planning/decisions/2026-09-30-meta-wording.md` §1). It replaces "Strictly necessary cookies
  keep the booking flow working…" on the mock and `banner-body` / `necessary-cookies-only` on Next.
- **D-12:** Under it, a link labelled only **"Cookie policy"** to `/cookies`. No sentence added to
  his text. "Read the cookie policy." goes.
- **D-13:** Manage preferences, Marketing row: description and meta line replaced by the owner's
  cookies-page Meta text (§2), verbatim, four languages. "Nothing in this category is running
  today" and "none / not used" go.
- **D-14:** Cookies page Meta row = §2 text; privacy page Meta line = §3 text. On the mock pages
  customers see (`app/pages/cookies.dc.html`, `app/pages/privacy.dc.html`) and in the Next pages'
  Phase 26 slots (`data-meta-slot`). Verbatim, four languages, bold as in the decision file.
- **D-15:** The banner title "You choose what we measure", kicker, button labels and the other
  three preference rows stay as they are.
- **D-16:** Never reword, shorten, re-translate or add a sentence to §1–§3. Arabic in RTL with
  `_fbp`/`_fbc` kept LTR (`.vt-dir-keep`).
- **D-16a (owner, 2026-09-30, UI-SPEC Q-1):** remove "Reset my choice" and the line "Resetting clears the record and brings the banner back…" from /cookies. Lena changes her mind with "Change preferences" / "Necessary only"; each change is a new record.

#### Banner code: keep our own banner (owner, 2026-09-30)
- **D-21:** Keep our own banner (option A) and add the server call. Do **not** adopt
  vanilla-cookieconsent. Sequence: the owner first answered B in the question form; the control
  session then argued A (every server task remains either way, the library needs a full restyle,
  it breaks D-04/D-09); asked again, the owner chose **A**. This answer replaces the earlier B.
  Library facts checked for the record: MIT, v3.1.0 (2025-02-04), `language.rtl`, no build step,
  `revision` re-ask.
- **D-22:** Scope of A: the mock banner (`app/home` + `app/pages` `CookieBanner.dc.html`) posts to
  `/api/consent` and learns "already chosen" from the server reader (`20261002100000`);
  `localStorage` is at most a display cache. The Next banner shows on every Next customer page
  (first check what `showBanner` in `app/[locale]/layout.tsx` and `SiteShell`'s `isHome` do on
  `/checkout`, `/confirmation`, the pay link, `error.tsx`, `not-found.tsx` — it may be a condition
  to change, not a mount to add). `reset-password.dc.html` gets the banner. `bind.ts` takes the
  categories from the choice; new policy version; owner texts verbatim; sign-up write removed.
- **D-23:** Pixel (Phase 28, recorded so the consent design holds): the pixel is never in HTML for
  a person without an Accept under the current version, and never on the pay link,
  manage-booking, ops/dashboard or any URL carrying a booking reference. Cached marketing HTML
  carries no pixel and no per-visitor state.

#### Policy version
- **D-17:** `CONSENT_POLICY_VERSION` becomes the Zurich date of the day the texts ship (Phase 26
  D-13, D-15). Same string shown as the date on the cookies and privacy pages. The two September
  Accepts and any `2026-09-12` row no longer count; the banner asks again.
- **D-18:** `bind.ts` stops hard-coding `marketing: false`; categories come from the choice. The
  Phase 26 pin "marketing stays false" is replaced by pins for D-05 and D-17.

#### Reading the record
- **D-19:** One narrow `SECURITY DEFINER` reader returns the latest row for a subject under the
  current version (marketing on/off, recorded_at). No table grant to anon/authenticated. Phases 28
  and 29 use it; 27 uses it to decide whether the banner shows. Runs through the Worker's client
  options (`fetch_types: false`); no arrays unless registered in `packages/db/src/pg-types.ts`.
- **D-20:** "A later Necessary only stops future events; Accept after payment does not backfill"
  is proved in 27 at the record level: the reader answers "as of time T". Phase 29 asks as of the
  paid time.

#### Carried forward
- Nothing to Meta before Accept; `META_LEGAL_GATE_OPEN` stays `false` in this phase.
- The pixel never loads on a pay link (Phase 28 enforces; 27 adds nothing that loads it).
- Accept keeps its Turnstile check (`action: consent`), Necessary only does not (existing route).
- No `sk_live_`, no `vamostaxi.eu`, no invented legal copy, no invented CHF, no hashed e-mail or
  phone, no browser Purchase, no middle events. Quote, pay and confirmation logic unchanged
  (the banner is added to those pages; nothing in their flow changes).

### Claude's Discretion
- How the mock learns the server choice (e.g. middleware injects a flag into the served mock HTML,
  or a small no-store GET). A cached marketing page must never carry one visitor's choice to
  another: the marketing cache key or the flag must be per-visitor / uncached.
- How Turnstile renders inside the mock banner (existing site key, `action: consent`).
- Banner placement on phone checkout: must not cover the Pay button; reuse the mock's
  measured body padding.

### Deferred Ideas (OUT OF SCOPE)
- Pixel, `_fbp`/`_fbc`, Events Manager confirmation flag, opening `META_LEGAL_GATE_OPEN` — Phase 28.
- Server Purchase from the settle queue — Phase 29.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| META-03 | Accept logs Meta on. Dismiss logs Meta off. The latest `consent_log` row wins. No new switches. | §Route changes (category mapping), §Reader SQL (latest row under current version, `id desc` tie-break), pgTAP cases R1–R8, vitest route cases |
| META-04 | The banner asks on every customer page until they choose, including a pay link. Ops has no banner. The pixel still never loads on a pay link. | §How the page learns state (GET `/api/consent/state`), §SiteShell change, mock mounts on sign-in/account/bookings/reset-password, SiteShell render test for `/checkout/pay/x`, legal-gate "no fbevents" pin kept |
| META-05 | A later Dismiss stops future PageView and future Purchase. Accepting after payment does not backfill a Purchase. | §Reader `p_as_of` (D-20); pgTAP cases R5–R7 with explicit `recorded_at` fixtures |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Directives the planner must verify each plan against. Sources: `./CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`, `~/.claude/CLAUDE.md`.

- **Design system only.** Compose from `VamosTaxiDesignSystem_245af1.*` (mock) and `@/components/*` (Next). No invented colour, font, radius or shadow.
- **Law 01, no glow.** Keep `--vt-shadow-accent:none` and `.vt-input--focus{box-shadow:none}` in every `.dc.html` helmet.
- **Law 02, no tinted yellow.** The mock banner has two live breaks: `[data-ck-link]:hover{color:var(--vt-yellow-700)}` (line 55) and `[data-tok]::after{…var(--vt-yellow-700)}` (line 48). UI-SPEC requires fixing both.
- **Law 03, four languages in the same pass.** Every new visible string needs en, de, fr and ar, including `aria-label`, `title` and `alt`. `VamosLocale.coverage(root)` must return empty. Arabic RTL uses logical properties; `_fbp`/`_fbc` go in `.vt-dir-keep`.
- **Law 04.** No `data-tok` pill on a live page (owner rule 2026-09-30, `live-no-tbc.test.ts`). Never invent a CHF amount.
- **Responsive.** Check at 1440, 1024, 768 and 390. Nothing scrolls sideways at 390. Touch targets are at least 44px.
- **Lenis.** Never construct a second instance. Put `data-lenis-prevent` on the sheet's scrolling list (`[data-ck-cats]` already scrolls with `overflow:auto`).
- **Shell.** Every public page uses SiteHeader and SiteFooter. Ops uses OpsSidebar and never shows the banner.
- **Security.** RLS on every table. No secrets in the repo. CSRF on cookie-backed POSTs. Consent is logged server-side, not by cookie only.
- **Database.** Never `supabase db push`, never write to the hosted database from this worktree, never wipe. Supabase `yaumjzvylngfjhtuffqs` holds real bookings.
- **Worker pg client.** `fetch_types: false`: no arrays unless registered in `pg-types.ts`. Prove DB behaviour through the Worker's client options, not the test client.
- **One job, one branch.** Work only in `/Users/koss/Developer/vamos-wt/phase-27`. Do not touch ROADMAP.md or STATE.md, other worktrees, or `main`. Do not push, do not deploy. Merge main before hand-over; main wins a conflict unless the owner says otherwise.
- **Gates.** The owner signs discuss, plan, UAT and ship. Every choice goes through the question form: one decision per question, plain words, the page named, one example.
- **Owner-approved legal texts** are used verbatim from `.planning/decisions/2026-09-30-meta-wording.md`, never reworded.
- **Local Supabase.** Use a port-shifted stack. The `54322` stack belongs to another session.
- **GSD.** Edits only inside a GSD execute workflow.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Record a choice (row in `consent_log`) | Database (`record_consent` definer) | API (`POST /api/consent` maps choice to categories, Turnstile, rate limit, CSRF) | The subject comes from a server GUC, so the caller cannot forge it. |
| Decide "latest row under current version as of T" | Database (`consent_choice` definer) | API (`GET /api/consent/state` wraps it, `no-store`) | One definition of "latest" for Phases 27, 28 and 29. |
| Know whether to show the banner | Browser (fetches state after load) | API (state GET) | Cached marketing HTML must carry no per-visitor state (D-23, `MARKETING_CACHE_PATHS`). |
| Banner and preferences sheet UI | Browser (mock DC component; Next client component) | — | Two builds, one look (D-09). |
| Mount rules (which pages) | Frontend server (Next `SiteShell` and layout) / mock page markup | Middleware (which build serves a path, `DC_PAGES`) | Mock pages mount by `dc-import`; Next pages by the SiteShell condition. |
| Turnstile site key for mocks | Middleware (`serveDcHtml` injects the public key meta) | Browser (explicit render, `action:"consent"`) | The key is public and identical for every visitor, so it is safe in cached HTML. |
| Owner texts | Static (mock JS source file, next-intl messages) | — | Verbatim copy; a byte-compare test is the proof. |
| Policy version | API (TS constant `CONSENT_POLICY_VERSION`) | Static (cookies and privacy "Last updated") | One date string (Phase 26 D-15). |

## Standard Stack

No new dependency. Everything is already in the repo [VERIFIED: `apps/web/package.json`, `packages/db/package.json`, root `package.json`].

### Core (existing, reused)
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| next | 15.5.25 | Route handler `GET /api/consent/state`, SiteShell | Already the app |
| next-intl | 4.13.7 | `t.rich` for §1–§3 with `<b>` and `<code>` tags | Already the i18n layer |
| postgres (postgres.js) | 3.4.9 | Worker client, `fetch_types:false` | Existing `withIdentity` door |
| supabase CLI | 2.115.0 (root devDependency) | Local port-shifted stack, `test db`, `gen types` | Existing |
| pgTAP (in Supabase image) | bundled | SQL tests in `packages/db/supabase/tests/*.test.sql` | 73 existing files |
| vitest | 4.1.11 (db), web via workspace | Unit and source-pin tests | Existing |
| Cloudflare Turnstile | `challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` | Accept check | Already allowed by the CSP (`lib/security/headers.ts:20`) and used by `contact.dc.html:31` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Our banner | vanilla-cookieconsent 3.1.0 | **Rejected by the owner (D-21).** Do not research further. |
| GET `/api/consent/state` | Middleware injects a flag into the mock HTML | Forces every marketing page to `private, no-store` for returning visitors and adds a DB round trip to middleware on every page. Rejected. |
| GET `/api/consent/state` | Non-HttpOnly cookie `consent_v=<version>` set by the POST | No DB read, but it is not the server truth (D-06, D-22 say the page "learns from the server reader"). It cannot pre-set the sheet (D-10), and it breaks if the version bumps while the cookie is stale. Rejected. |
| Version as a function argument | SQL constant, or a `settings` row | A SQL constant needs a migration per bump and can drift from the TS constant that writes the rows. A settings row needs an ops write path. Rejected. |

**Installation:** none.

## Package Legitimacy Audit

No external package is installed by this phase. slopcheck was not run: there is nothing to check. If a plan later proposes a package, it must go through the gate and a `checkpoint:human-verify`.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| — | — | — | — | — | — | No new packages |

## Architecture Patterns

### System Architecture Diagram

```
Browser (any customer page)
  │
  ├─ GET /about (mock) ──► Worker ─► middleware.serveDcHtml ─► public/app/pages/about.html
  │                                   (+ inject <meta vt-turnstile-site-key> for ALL mocks: public, same for everyone)
  │                                   applyPublicCacheHeaders → public, s-maxage=300 (NO per-visitor state in body)
  │
  ├─ GET /checkout/details (Next) ──► layout.tsx (banner element always passed, except dashboard)
  │                                   └─ SiteShell: render {banner} wherever {footer} renders (not ops/dev)
  │
  ▼ after mount (both builds)
  GET /api/consent/state   (route handler, force-dynamic, Cache-Control: private, no-store)
     ├─ no/invalid consent_subject cookie ──► {chosen:false}   (no DB call)
     └─ cookie UUID ─► asAnon ─► set_config(request.vamos.consent_subject) ─► public.consent_choice(CONSENT_POLICY_VERSION, null)
                                   └─ 0 rows → {chosen:false} ; 1 row → {chosen:true, choice:{method,functional,analytics,marketing,recordedAt}}
  │
  ├─ chosen:false → banner default state (Accept all · Necessary only · Manage preferences)
  └─ chosen:true  → banner hidden; sheet pre-set from choice (D-10); cookies page panel shows it
  │
  ▼ visitor presses a control
  [Accept all] ─► Turnstile execute (action "consent") ─► token
  [Necessary only] ─────────────────────────────────────┐ (never waits on Turnstile)
  [Save choices {f,a,m}] ─► Turnstile only if m=true ───┤
                                                        ▼
  POST /api/consent {method, locale, functional?, analytics?, marketing?, turnstileToken?, idempotencyKey?}
     csrfForbidden → rate limit (consent:ip, consent:ip:subject) → Turnstile (if row will have marketing=true)
     → asAnon → set_config(subject) → record_consent(necessary=true, f, a, m, method, locale, CONSENT_POLICY_VERSION, …)
     → 200 {ok:true} + Set-Cookie consent_subject (HttpOnly, 1y)
  │
  ▼ client: banner card stops rendering; display cache localStorage.vamosCookieConsent = {v:<version>, …}
            dispatch window event (e.g. 'vamos:consent') so cookies page / other listeners refresh

Phase 29 (later): asSystem ─► set_config(subject from booking) ─► consent_choice(version, paid_at)  → marketing? send Purchase
```

### Recommended file changes

```
packages/db/supabase/migrations/20261002100000_consent_choice_reader.sql   NEW  reader + grants
packages/db/supabase/tests/consent_choice_reader.test.sql                  NEW  pgTAP
packages/db/test/local/consent-reader.test.ts                              NEW  Worker-client proof (VAMOS_LOCAL_DB_PORT)
packages/db/database.types.ts                                              REGEN (Functions gains consent_choice)
packages/db/supabase/seed.sql                                              REGEN (content_strings from messages)
packages/db/supabase/tests/seed_idempotent.test.sql                        counts → generator header
apps/web/app/api/consent/route.ts                                          categories + Turnstile rule
apps/web/app/api/consent/state/route.ts                                    NEW  GET, force-dynamic, no-store
apps/web/lib/consent/bind.ts                                               categories from choice; no version override
apps/web/lib/consent/choice.ts                                             NEW  pure: method+body → categories; readConsentChoice(tx, asOf?)
apps/web/lib/consent/policy.ts                                             version → ship day
apps/web/components/consent/CookieBanner.tsx / .css                        rebuild to mock; sheet; states
apps/web/components/shell/SiteShell.tsx                                    {banner} on every non-ops route
apps/web/components/shell/SiteFooter.tsx                                   CookiePrefsListener → opens sheet (no silent write)
apps/web/app/[locale]/layout.tsx                                           showBanner = !onDashboard (cookie check goes)
apps/web/app/[locale]/cookies/page.tsx, privacy/page.tsx                   §2/§3 replace PendingSlot Meta slots
apps/web/i18n/messages/{en,de,fr,ar}.json                                  new keys (sorted position), $meta.noParamKeys for §2
apps/web/lib/auth/signup-consent.ts + api/auth/callback/route.ts           remove cookie-row write (D-01)
apps/web/middleware.ts                                                     inject Turnstile site-key meta for every DC page
app/vamos-consent.js                                                       NEW  shared mock runtime (state GET, post, event)
app/vamos-meta-texts.js                                                    NEW  §1–§3 per language, segment form
app/home/CookieBanner.dc.html, app/pages/CookieBanner.dc.html              server write, states, copy, Law fixes
app/pages/{sign-in,account,bookings,reset-password}.dc.html                add <dc-import name="CookieBanner" hint-size="0,0">
app/pages/cookies.dc.html, privacy.dc.html                                 §2/§3, Reset removed, date, server-read panel
app/vamos-i18n-dict.js                                                     2 new UI strings only (save failed, check failed)
apps/web/tests/e2e-worker/auth-worker.e2e.mjs                              1b expects 0 consent rows
```

### Pattern 1: The reader (migration `20261002100000`)
**What:** One narrow definer function. The subject comes from the same GUC `record_consent` uses, so no caller, including a Data API caller with the publishable key, can read another visitor's choice. The version and as-of time are arguments.
**Example:**
```sql
-- Source: pattern from 20260930200000_reminder_24h_read.sql + 20260823000018_consent_log.sql
create or replace function public.consent_choice(
  p_policy_version pg_catalog.text,
  p_as_of          pg_catalog.timestamptz default null
)
returns table (
  method      pg_catalog.text,
  necessary   pg_catalog.bool,
  functional  pg_catalog.bool,
  analytics   pg_catalog.bool,
  marketing   pg_catalog.bool,
  recorded_at pg_catalog.timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.method, l.necessary, l.functional, l.analytics, l.marketing, l.recorded_at
    from public.consent_log as l
   where l.consent_subject_id =
         pg_catalog.nullif(pg_catalog.current_setting('request.vamos.consent_subject', true), '')::pg_catalog.uuid
     and l.policy_version = p_policy_version
     and (p_as_of is null or l.recorded_at <= p_as_of)
   order by l.recorded_at desc, l.id desc
   limit 1
$$;

revoke all on function public.consent_choice(pg_catalog.text, pg_catalog.timestamptz) from public;
revoke all on function public.consent_choice(pg_catalog.text, pg_catalog.timestamptz) from authenticated;
grant execute on function public.consent_choice(pg_catalog.text, pg_catalog.timestamptz) to anon;
comment on function public.consent_choice(pg_catalog.text, pg_catalog.timestamptz) is
  'Latest consent_log row for the bound consent subject under p_policy_version, as of p_as_of (null = now). 0 or 1 row, no arrays. EXECUTE: anon (GET /api/consent/state via asAnon). Phase 29 adds vamos_system.';
```
Decisions encoded:
- **Roles.** `asAnon` sets role `anon` (`packages/db/src/identity.ts:74-75`). The GET route calls the reader through `asAnon` whether or not the visitor is signed in, because consent hangs on the subject cookie, not on the account. So EXECUTE goes to `anon` only (D-19: "EXECUTE only to the calling role"). Revoke from `public` and `authenticated` explicitly. `vamos_guest`, `vamos_public` and `vamos_system` get nothing now; Phase 29 adds its own grant when it binds the subject inside `asSystem`. [VERIFIED: identity.ts PG_ROLE map]
- **RLS.** `consent_log` has `force row level security` (`20260823000020_rls_enable.sql:191`). The function owner `postgres` has `rolbypassrls = t` (read from a local Supabase stack, same image). [VERIFIED locally] Confirm on hosted with a read-only `select rolbypassrls from pg_roles where rolname='postgres'` before ship; `record_consent` already works there under the same rule, which is strong evidence.
- **No GUC means no rows.** No error, so no oracle. A Data API call gets an empty set.
- **Tie-break** `id desc`: `recorded_at` defaults to `now()` (the transaction start), so two rows in one transaction share a time.
- **Filter before latest.** Only rows under the current version count (D-08, D-03b). A current-version Accept followed by nothing else is the answer even if older-version rows exist.

### Pattern 2: `GET /api/consent/state`
```ts
// Source: shape of apps/web/app/api/consent/route.ts (same file conventions)
export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  const subject = readConsentSubject(request.headers.get("cookie"));
  if (!subject) return Response.json({ ok: true, chosen: false, policyVersion: CONSENT_POLICY_VERSION }, { headers });
  const { env } = getCloudflareContext();
  try {
    const row = await asAnon(env, (tx) => readConsentChoice(tx, subject)); // set_config + consent_choice(CONSENT_POLICY_VERSION, null)
    return Response.json({ ok: true, chosen: !!row, policyVersion: CONSENT_POLICY_VERSION,
      choice: row ? { method: row.method, functional: row.functional, analytics: row.analytics,
                      marketing: row.marketing, recordedAt: row.recorded_at } : null }, { headers });
  } catch {
    return Response.json({ ok: false, code: "unavailable" }, { status: 503, headers });
  }
}
```
Rules:
- The body never contains the subject UUID.
- The GET never mints the cookie. `cookie.test.ts` forbids minting on GET; do not add a mint here.
- Put it in its own folder `app/api/consent/state/`. `app/api/consent/route.ts` keeps `GET → 405`; `record.test.ts:125-131` pins that.
- It must be `force-dynamic`. `check:db-fences` flags a statically rendered route that imports an identity wrapper [CITED: `scripts/check-db-access-fences.mjs` header].
- A read limit is optional. With no cookie there is no DB call. A bot with random UUID cookies costs one indexed read (`consent_log_subject` index) per request. If the planner adds a limit, it needs a new `WriteRateLimitKind` `"consent_read"` keyed by IP, not the write keys (`lib/abuse/rate-limit.ts:124-150`).

### Pattern 3: `/api/consent` POST changes (Q2)
- `accept_all`: `{functional:true, analytics:true, marketing:true}`, ignoring any body categories. The mock's Accept all already sets all three true (`CookieBanner.dc.html:221`).
- `reject_all`: all false, ignoring body categories.
- `settings_change`: requires `functional`, `analytics` and `marketing` as JSON booleans (`typeof === "boolean"`). A missing or non-boolean value returns `400 invalid_input`, never a default. `necessary` is always true.
- **Turnstile rule. Recommend: verify whenever the row to be written has `marketing === true`,** that is `accept_all` and `settings_change` with the Marketing switch on. Necessary only, and Save choices with Marketing off, never wait.
  - Why: without this, `settings_change` + `marketing:true` is a Turnstile-free Accept, a one-line bypass of the one control Phase 10 put on "Meta on". A bot could then create Meta-on rows at the per-IP rate limit only.
  - It does not conflict with D-05: the switch still means Meta on or off. UI-SPEC already says "Save choices shows the Turnstile slot only if `/api/consent` requires a token for that choice", so the UI follows the route.
  - Functional or Analytics on with Marketing off needs no check: nothing runs on them (D-05), so there is nothing to protect.
  - Refusal is never slowed, which keeps withdrawal as easy as giving consent.
  - The `record.test.ts:86-103` pin ("settings_change does not") must be rewritten deliberately to "verify iff marketing will be true".
- Keep CSRF (`csrfForbidden`), the rate limit before the write, `Cache-Control: private, no-store`, and minting the cookie on success only.
- `bind.ts`: take `categories` in `RecordConsentInput`. Delete the `policyVersion` override; its only other user, the signup writer, goes away. Every row then carries `CONSENT_POLICY_VERSION`, and the legal-gate pin can say so.

### Pattern 4: How the mock learns state (Q1). Recommendation: the no-store GET
- New `app/vamos-consent.js` exposes `window.VamosConsent = { state(): Promise, save(method, cats, token?, key?): Promise, onChange(fn), cached() }`. It is loaded in the helmet of both `CookieBanner.dc.html` files and of `cookies.dc.html`. `sync-dc-mock-to-public.mjs` copies all of `app/` (line 89), so a new `app/*.js` needs no sync change [VERIFIED].
- Banner initial `mode` becomes `'unknown'` (renders nothing) until `state()` resolves. That satisfies UI-SPEC "no banner paint before the answer". On a network error or 5xx, **show the banner** (default state). Asking again is harmless: Meta stays off without a known Accept, and META-04 prefers asking. Record this as a planner decision (Open Question 3).
- Keep `localStorage.vamosCookieConsent` as a display cache written with `{v: policyVersion, …}`. It never decides whether the banner shows; the GET does.
- The cookies page drops its 700ms `localStorage` poll (`cookies.dc.html:304`) and subscribes to `VamosConsent.onChange` plus an initial `state()`.
- Middleware: widen the Turnstile meta injection from `/contact` only (`middleware.ts:115-118`) to every DC page. The key is public and identical for every visitor, so cached HTML stays per-visitor free. `contact.dc.html` reads the same meta name, so the two do not conflict.
- Load Turnstile `api.js?render=explicit` lazily from `vamos-consent.js` only while the banner or sheet is visible. Render with `appearance:"interaction-only"`, `execution:"execute"` and `action:"consent"`, following `contact.dc.html:445-470`. If `api.js` is already loaded (contact page), reuse `window.turnstile`.
- `X-Consent-Present` plus `Vary: X-Consent-Present` (`middleware.ts:447-448`) only says whether a cookie is present. It carries no UUID and is harmless; leave it. Note that a Worker's own response is not CDN-cached by default, so `s-maxage` mostly affects downstream shared caches [ASSUMED].

### Pattern 5: Next pages (Q4)
- `layout.tsx:63-73`: delete the cookie-based `hasConsent`. Set `showBanner = !onDashboard`, so the banner element is always passed on the public host. Per UI-SPEC the component renders `null` for the card only and never unmounts (the footer listener and sheet stay mounted).
- `SiteShell.tsx:64`: change `{isHome ? banner : null}` to `{banner}`. The early return at `:55` already excludes ops, dashboard and `/dev`. `isHome` stays for the header only. Covered by construction: `/checkout/*` (nested `checkout/layout.tsx` keeps the shell, per CONTEXT findings), `/confirmation/*`, `/checkout/pay/[token]`, `/review` (Next, `middleware.ts:381` noindex; not in D-07 but a customer page, so the banner showing there is consistent), `error.tsx` and `not-found.tsx`. Both render inside the locale layout (`error.tsx:10-18`, `not-found.tsx:6-12`). A layout-level failure falls to Next's default UI, with no banner, as documented in `error.tsx`.
- `SiteFooter.tsx:18,248-254,287`: `CookiePrefsListener` today **silently POSTs `settings_change` with all categories false** whenever "Cookie preferences" is clicked on a Next page. Under "latest row wins" that switches Meta off without the visitor choosing. It must become "open the sheet" (D-10). The same applies to `CookieSettingsChangeButton` on the Next cookies page (`cookies/page.tsx:157`).
- **Copy sharing (Q4).** The two builds cannot share a runtime file: Next reads `i18n/messages/*.json` through `lib/content/messages.ts` (JSON by default, `CONTENT_SOURCE` absent from `wrangler.jsonc`), and the mock reads `vamos-i18n-dict.js` and page JS. Share the **source of truth** instead: both are byte-compared in a vitest against `.planning/decisions/2026-09-30-meta-wording.md` §1–§3.
  - Mock: `app/vamos-meta-texts.js` holds `{ banner:{en,de,fr,ar}, cookiesRow:{…}, privacyLine:{…} }`. Each value is a segment array, e.g. `[{b:'Meta'},' (Meta Platforms Ireland Ltd). Cookies ',{code:'_fbp'},' and ',{code:'_fbc'},'. Set only…']`. Render inside a `data-vt-no-i18n` wrapper and re-render on `VamosLocale.onChange`.
  - Next: `cookies.meta-banner`, `cookies.meta-row` and `legal.meta-privacy-line` use `<b>…</b>` and `<code>…</code>` tags through `t.rich`. The cookies and privacy Next pages use namespaces `cookies` and `legal` (`cookies/page.tsx:51-53`, `privacy/page.tsx:48`). The `privacy` namespace has 0 keys.
  - The test converts `<b>`, `**`, `{b:…}`, `<code>`, backticks and `{code:…}` into one canonical form and compares all four languages for each of the three texts.
- Strings the Next sheet needs that are missing from the messages (checked in en.json): "Your choice is stored in this browser until you change it.", the row meta lines ("Vamos Taxi · Stripe · Supabase · Cloudflare", "session / refresh as issued by Supabase Auth", "until you change language or clear recent places", "Cloudflare Web Analytics (cookieless) · Sentry", "not used"), and "save failed". Port their de, fr and ar from `app/vamos-i18n-dict.js`; do not translate anew. Present already: `accept-all`, `necessary-only`, `manage-preferences`, `save-choices`, `you-choose-what-we-measure`, `choose-your-categories`, `always-on`, the three row descriptions, `common.cookie-preferences`, `common.cookie-policy`, `common.form-challenge-failed`. [VERIFIED by key scan]

### Pattern 6: Policy version bump (Q5)
- `lib/consent/policy.ts:5` changes from `"2026-09-12"` to the ship day (Zurich). The value is not known at plan time. Make the bump the **last task**, with a test tying all dates together so a slipped ship date cannot desync them:
  - `CONSENT_POLICY_VERSION === <cookies page date ISO>`.
  - Privacy "Last updated" today reads `LEGAL_UPDATED` in `app/vamos-legal-updated.js:6`, a single constant shared with terms, cancellation and imprint (owner decision 14). The cookies page has a **hard-coded** "1 September 2026" (`cookies.dc.html:142`), and the file header says "The cookie policy keeps its own date". D-17 and Phase 26 D-15 require cookies date = privacy date = version. See Open Question 1.
  - Recommended mechanics: add `var CONSENT_UPDATED = 'YYYY-MM-DD'` and `VamosLegalUpdated.consentLabel(lang)` to `app/vamos-legal-updated.js`. `cookies.dc.html` renders it. A new vitest asserts `CONSENT_UPDATED === CONSENT_POLICY_VERSION` and, at ship, `LEGAL_UPDATED === CONSENT_POLICY_VERSION`. The label format follows the existing `Intl.DateTimeFormat` pattern, so de, fr and ar come for free; no dict entries for a date string.
- Tests that pin the old state and must be rewritten in the same plan:
  - `legal-gate.test.ts`: "necessary-cookies-only remains" (:81-94) → banner title `you-choose-what-we-measure`; "policy version unchanged" (:96-108) → pins the new date and still exactly one assignment; "marketing stays false" (:157-165) → D-05/D-18 pins (categories from the choice, no `marketing: false` literal as a constant, version is the constant with no override); "slots exist" (:167-199) and "no sentence" (:200-217) → owner texts present, no `PendingSlot` Meta labels. Keep "no fbevents.js" and "flag off" unchanged; they are the "nothing to Meta" proof.
  - `banner-contract.test.ts`: all of it (Accept/Dismiss only, no switches, no "Manage preferences", `isHome ? banner : null`) → the new contract: three controls, sheet with four switches, banner on every non-ops shell route.
  - `record.test.ts`: "always records … marketing false" (:53-59) → the mapping table; Turnstile block (:86-103) → rule "iff marketing"; "signup consent row" (:135-166) → an inverse pin that `signup-consent.ts` no longer imports `recordConsent` and the callback does not write `consent_log`.
  - `live-no-tbc.test.ts:35-38` pins `.vt-ck-meta:has([data-tok]){display:none}`, which UI-SPEC deletes. Replace it with "the banner has no `.vt-ck-meta` and no `PendingSlot`". This is a control-session test from main: say so in the hand-over.
  - `legal-updated.test.ts`: extend it; do not break the four-page loop.

### Pattern 7: Removing the sign-up write (Q6)
- Callers: `app/api/auth/callback/route.ts:17,88`, the only runtime caller.
- Unit test: `tests/unit/auth/signup-consent.test.ts` expects a row and `updateUser({signup_consent:"2026-09-12"})`. Rewrite it: the callback must not call `asCustomer`/`recordConsent` for consent.
- Source pins: `record.test.ts:135-166`.
- Auth e2e: `tests/e2e-worker/auth-worker.e2e.mjs:100-102`, check `1b` requires `Number(cons) >= 1`. It must become `=== 0` (D-01). The runbook `docs/runbook/auth-worker-e2e.md` has no consent line.
- Keep `SIGNUP_CONSENT_METADATA_KEY` "pending" in `lib/auth/run.ts:108,132` (D-03 "stays harmless"); `run.test.ts:95` still expects it.
- Simplest safe shape: delete `recordSignupConsentOnConfirm` and its import and call, and leave the metadata flag as is (nothing reads it). The alternative, keeping the function but making it only clear the flag, adds a Supabase `updateUser` call per confirm for no benefit.
- 26.5 coordination: 26.5 is **not on main yet** (`git log origin/main` shows only docs). Its D-19 names table `account_agreement_records` and `public.record_account_agreement(p_surface, …)`, with EXECUTE `vamos_checkout` only and "Phase 27 adds the sign-up role's grant by migration" [VERIFIED: `git show gsd/phase-26.5-checkout-account:…/26.5-CONTEXT.md:70`]. D-03a therefore belongs in a separate, last plan gated on 26.5 landing, and must use a migration number in `20261002110000`–`20261002190000`.

### Anti-Patterns to Avoid
- **Per-visitor data in `serveDcHtml` output.** It gets cached for everyone on the nine marketing paths.
- **Owner texts as dictionary fragments.** " and " would become a global key and break the Arabic word order (UI-SPEC).
- **Reading consent in `layout.tsx` with `asAnon`.** It adds an identity wrapper to a layout the db-fence gate watches, and duplicates the GET.
- **Raw `select … from consent_log` inside any identity wrapper.** 42501 on live: anon, authenticated and vamos_system have no table grant (memory `customer-column-grants`).
- **Returning arrays from the reader.** Breaks under `fetch_types:false`.
- **Running `pnpm db:types:check`, `db:reset`, `db:test`, `db:local-roles` or `db:mutation-gate` as-is.** They target the `54322` stack, which belongs to another session.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Writing a consent row | Direct INSERT or a new write fn | `public.record_consent` via `recordConsent(tx, …)` | Subject from GUC, customer from JWT, already granted and tested (`consent_write.test.sql`) |
| Bot check | Custom captcha, honeypot | `verifyTurnstile(secret, token, {action:"consent", idempotencyKey, allowedHostnames, remoteip})` (`lib/turnstile.ts`) | Existing, hostname-pinned, idempotent |
| CSRF | Token scheme | `csrfForbidden(request)` (`lib/security/origin.ts:41`) | Origin allowlist, already on the route |
| Rate limit | KV counters | `checkWriteRateLimit({kind:"consent"…})` | Existing binding `QUOTE_RATE_LIMITER_BARE` |
| Subject cookie | New cookie | `readConsentSubject`, `mintConsentSubject`, `consentSubjectSetCookie` | UUID-validated, HttpOnly, 1 year |
| IP handling | Raw IP | `truncateClientIp(cfConnectingIp(headers))` | Last octet or /64 zeroed |
| Date labels | Hand-written de/fr/ar dates | `Intl.DateTimeFormat` as in `vamos-legal-updated.js` | Locale-correct, no dict entries |
| Local DB isolation | Resetting 54322 | Port-shifted stack (below) | Other sessions own 54322, 55322, 56322, 57322, 58322, 60322 |

**Key insight:** The only genuinely new server code is one SQL function and one GET. Everything else is rewiring existing, tested pieces.

## Runtime State Inventory

Not a rename phase, but the version bump and the sign-up removal change stored and runtime state.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Live `consent_log`: 3 rows (ids 1–2 `accept_all` marketing false `2026-09-12`; id 3 `reject_all` customer set, 2026-09-29) (CONTEXT findings, read-only query). Browser `localStorage.vamosCookieConsent` on visitors' devices (old shape, no `v`). | None in the DB (append-only, D-02; the new version excludes old rows by construction). Client: treat a cache without `v === current version` as absent. |
| Live service config | Supabase Auth user metadata `signup_consent` = `"pending"` or `"2026-09-12"` on confirmed users | None. Nothing reads it after D-01; it is harmless (D-03). |
| OS-registered state | None: no cron, queue or scheduled job reads consent (checked `worker.ts` handlers) | None |
| Secrets/env vars | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `CONTACT_TURNSTILE_ALLOWED_HOSTNAMES` already on Worker `vamos` (used by contact and consent) | None new. The mock needs the site key injected (middleware code change only). |
| Build artifacts | `apps/web/public/app/` and `apps/web/public/assets/` are gitignored copies made by `sync-dc-mock-to-public.mjs` | Re-run sync before any test that reads `public/` (`pnpm --filter web test` does it). |

## Common Pitfalls

### Pitfall 1: pgTAP rows all share one `recorded_at`
**What goes wrong:** Every pgTAP file runs inside `begin; … rollback;`. `record_consent` inserts `recorded_at = now()`, the transaction start, so all rows get the same time and "as of T" cases cannot be built.
**How to avoid:** For the as-of cases (D-20), insert fixture rows as `postgres` directly into `consent_log` with explicit `recorded_at` values (the append-only trigger only blocks UPDATE/DELETE/TRUNCATE, `20260823000019_append_only.sql:117,154`). Keep one case through `record_consent` for the end-to-end path. Tie-break cases prove `id desc`.

### Pitfall 2: `seed_idempotent.test.sql` counts are likely already stale on main
**What goes wrong:** The test asserts `content_strings = 2600 + 26` and `no_param_reason = 75` (lines 112, 115). The generated seed header says `content_strings=2634` and `no_param_reason=94` (`seed.sql:4-5`). `seed:check` passes (no drift), so the test file, not the seed, is behind after the legal ships.
**How to avoid:** Run the full pgTAP suite on the fresh port-shifted stack **before any change** to get a baseline. Then set the counts from the regenerated seed header after adding keys (26.3-22 did the same). Record the baseline red, if any, in the hand-over as "red on main before 27".

### Pitfall 3: `i18n:check` parameterisation gate trips on the owner's "90"
**What goes wrong:** Check 3 of `scripts/check-i18n-coverage.mjs` fails any English message with a bare digit run and no ICU placeholder. §2 contains "90 days".
**How to avoid:** Add `en.json` `$meta.noParamKeys["cookies.meta-row"] = "owner legal text verbatim, .planning/decisions/2026-09-30-meta-wording.md §2"`. Do not turn 90 into `{days}`: that changes the stored source and complicates the verbatim proof. The seed's `no_param_reason` count goes up by one.

### Pitfall 4: ICU and rich tags in the owner texts
**What goes wrong:** next-intl uses ICU MessageFormat. Braces or a `'` before a brace would be parsed. The fr and ar texts contain ASCII `'` ("jusqu'à", "qu'une", "s'ils") but no braces [VERIFIED by reading §1–§3], so they are safe. Markdown `**` and backticks must become `<b>` and `<code>` tags.
**How to avoid:** Render with `t.rich(key, { b: (c) => <strong>{c}</strong>, code: (c) => <code className="vt-dir-keep">{c}</code> })`. The byte-compare test normalises tags back to markdown.

### Pitfall 5: The legal hygiene test may flag owner text
**What goes wrong:** `lib/legal-text-hygiene.test.ts` flags doubled words and repeated 2+ word phrases within 8 words on legal pages (cookies, privacy). A quick read of §2/§3 in four languages found no violation ("ni votre" has a 2-letter word), but the test is the authority [ASSUMED pass].
**How to avoid:** If it fires, add a `REVIEWED_REPEATS` entry with a reason. Never edit the owner's words.

### Pitfall 6: Stack collision and hard-coded 54322
**What goes wrong:** `pnpm db:*`, `local-role-passwords.mjs`, `mutation-gate.mjs`, `probe-now-frozen.mjs`, `test/local/*` fixtures and `pull-content-strings.mjs` hard-code `54322`. Six stacks are running now: 54322, 55322, 56322, 57322, 58322, 60322 [VERIFIED `docker ps`].
**How to avoid:** Use a 59xxx stack (below). For role passwords, run the two `alter role` statements with `psql` against 59322 (the script refuses other ports), or use a scratch copy with the port sed-ed (memory `isolated-local-supabase`).

### Pitfall 7: The worktree has no `node_modules`
**What goes wrong:** `node_modules` is absent at the root, in `apps/web` and in `packages/db` [VERIFIED], and the supabase CLI is only available as `node_modules/.bin/supabase` (not on PATH).
**How to avoid:** Wave 0 runs `pnpm install --frozen-lockfile` in `/Users/koss/Developer/vamos-wt/phase-27`.

### Pitfall 8: Visual and integration specs now meet a banner on checkout
**What goes wrong:** Checkout, confirmation and pay-link Playwright specs (`tests/visual/checkout-page.spec.ts`, integration `checkout-*`, `pay-link-page`, `confirmation*`) will see a banner at 390px covering controls or changing screenshots.
**How to avoid:** Add a shared helper that routes `**/api/consent/state` to `{ok:true, chosen:true, …}` for existing specs, and dedicated new specs for the banner. Do not rebaseline existing screenshots to include the banner by accident.

### Pitfall 9: A footer click writing a row
**What goes wrong:** The Next `CookiePrefsListener` writes today (see Pattern 5). Leaving any "write on open" path makes "latest row wins" pick a choice the visitor never made.
**How to avoid:** Add a test that the `vamos:cookie-prefs` handler in both builds only opens the sheet (source pin: no `fetch`/`postConsentRecord` in the listener).

### Pitfall 10: `db:types:check` needs regeneration
**What goes wrong:** `database.types.ts` lists public Functions. The new function changes it, and CI runs `pnpm db:types:check` (`pr.yml:180`).
**How to avoid:** Regenerate against the 59322 stack and commit.

## Code Examples

### pgTAP layout for the reader (follows `consent_write.test.sql`, `system_role_narrow_reads.test.sql`)
```sql
-- packages/db/supabase/tests/consent_choice_reader.test.sql
begin;
select plan(N);
-- fixtures (as postgres): subject A rows with explicit recorded_at
insert into public.consent_log (consent_subject_id, policy_version, method, necessary, functional, analytics, marketing, locale, recorded_at)
values ('a0000000-0000-0000-0000-00000000000a','2026-09-12','accept_all',true,false,false,false,'en','2026-09-12 10:00+00'),
       ('a0000000-0000-0000-0000-00000000000a','9999-01-01','accept_all',true,true,true,true,'en','2026-10-02 10:00+00'),   -- t1 Accept
       ('a0000000-0000-0000-0000-00000000000a','9999-01-01','reject_all',true,false,false,false,'en','2026-10-02 12:00+00'); -- t3 Necessary only
set local role anon;
select set_config('request.vamos.consent_subject','a0000000-0000-0000-0000-00000000000a', true);
select is((select marketing from public.consent_choice('9999-01-01')), false, 'R3 later Necessary only wins');
select is((select marketing from public.consent_choice('9999-01-01','2026-10-02 11:00+00')), true, 'R5 as of paid time between: Accept counted');
select is((select count(*)::int from public.consent_choice('9999-01-01','2026-10-02 09:00+00')), 0, 'R6 Accept after T is not backfilled');
select is((select count(*)::int from public.consent_choice('2026-10-03')), 0, 'R2 older version rows do not count (D-03b)');
reset role;
-- grants: function_privs_are anon EXECUTE; authenticated/vamos_guest/vamos_public/vamos_system none;
-- prosecdef and proconfig = {search_path=""}; anon select on consent_log still 42501; no GUC → 0 rows
select * from finish();
rollback;
```
Use the real `consent_log` column list (`20260823000018_consent_log.sql:10-31`). Pass the versions as literals; the test does not depend on the TS constant. Add R1 (single Accept → marketing true), R4 (settings_change marketing true after reject → true), R7 (tie at the same `recorded_at` → higher id wins), R8 (another subject's rows invisible).

### Worker-client proof (follows `test/local/worker-arrays.test.ts`)
Drive `withIdentity(…, "anon", …)` with the Worker's own `client()` options (`fetch_types:false`, `types: pgArrayTypes`) on `VAMOS_LOCAL_DB_PORT=59322`, inside one rolled-back transaction. Assert `typeof row.marketing === "boolean"` and `row.recorded_at instanceof Date` (or a string, whatever the wrapper normalises to; pin it). This proves the D-19 "runs through the Worker's client options" clause.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Mock banner stores choice in `localStorage` only | Server row via `/api/consent`, `localStorage` as display cache | This phase | First real consent records from the live banner |
| Next banner mounted on home only (never reached) | Banner on every Next customer route | This phase | Checkout, confirmation and pay link ask |
| `bind.ts` constant categories, all false | Categories from the choice | This phase | Accept means Meta on |
| Sign-up confirm writes a `reject_all`/`settings_change` row | No cookie row on sign-up | This phase | An earlier Accept survives sign-up |
| Policy `2026-09-12` | Ship day (Zurich) | This phase | Everyone is asked again |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Hosted `postgres` role has `rolbypassrls` like the local image, so the definer reader sees `consent_log` under forced RLS | Pattern 1 | Reader returns 0 rows on live, and the banner always asks. Mitigate with a read-only `pg_roles` check before ship (`record_consent` inserting on live is supporting evidence). |
| A2 | postgres.js with `fetch_types:false` still parses `bool` and `timestamptz` (built-in types) | Pattern 1 / Code Examples | Strings instead of booleans. The Worker-client test catches it. |
| A3 | A Worker's own response is not cached by the Cloudflare edge by default, so `s-maxage` mostly affects downstream caches | Pattern 4 | None for the recommendation: the GET is `no-store` either way. |
| A4 | Owner texts pass `legal-text-hygiene.test.ts` without a reviewed-repeat entry | Pitfall 5 | One allowlist entry; the text is never edited. |
| A5 | Showing the banner when the state GET fails is acceptable | Pattern 4 / Open Q3 | Repeat asks during an outage; no Meta effect. |

## Open Questions (owner or control session; one decision per question)

1. **Privacy and cookies "Last updated" versus the shared `LEGAL_UPDATED`.**
   - What we know: D-17 and Phase 26 D-15 require cookies date = privacy date = policy version. Privacy reads `LEGAL_UPDATED`, which also dates terms, cancellation and imprint (owner decision 14). Cookies is hard-coded to 1 September 2026.
   - What's unclear: whether moving `LEGAL_UPDATED` to the ship day (so terms, cancellation and imprint also show the new date) is acceptable, or whether privacy should read the consent date instead.
   - Recommendation: ask the owner via the question form, naming vamostaxi.site/terms and one example. Default: set `LEGAL_UPDATED` to the ship day (the control session sets it on ship day anyway) and add `CONSENT_UPDATED` for cookies.
2. **PS-1 and PS-2 from UI-SPEC** (cookies §06 lead and caption; the stale `vamos:cookie-prefs` row). Still open. PS-2 needs owner wording. Leave the row untouched until he answers.
3. **Behaviour when the state GET fails or is rate-limited:** show the banner (recommended) or keep it hidden.
4. **D-03a timing:** 26.5 is not on main. Plan it as a separate final plan, blocked until 26.5 lands, or split it to a follow-up. Owner or control decides.
5. **`/coming-soon` mock** is a public DC page (`DC_PAGES`) not listed in D-07 and not importing the banner. Include it or leave it?
6. **Hosted grant drift check:** before ship, run read-only `has_function_privilege('anon','public.consent_choice(text,timestamptz)','EXECUTE')` after the control session applies the migration. Recorded for the ship checklist, not a plan question.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | all | yes | v26.7.0 | — |
| pnpm | all | yes | 11.7.0 | — |
| node_modules (worktree) | tests, build, supabase CLI | **no** | — | `pnpm install --frozen-lockfile` (Wave 0) |
| supabase CLI | local stack, pgTAP, types | after install | 2.115.0 (`node_modules/.bin/supabase`) | — |
| Docker | local Supabase | yes | 29.7.2 | — |
| Free port block 5932x | own stack | yes (59xxx unused; 5432x, 5532x, 5632x, 5732x, 5832x, 6032x taken) | — | 61xxx |
| wrangler (auth e2e) | `tests/e2e-worker/run.sh` | after install | workspace | — |
| psql | role passwords | via `docker exec supabase_db_vamos-taxi-270 psql` | — | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** `node_modules`, installed in Wave 0.

### Local DB steps (Q7), exact
1. `pnpm install --frozen-lockfile` (in `/Users/koss/Developer/vamos-wt/phase-27`).
2. Create `scripts/local-stack-27.sh` as a copy of `scripts/local-stack-263.sh` with: `SCRATCH=${VAMOS_SB27:-/tmp/vamos-sb27}`, `project_id = "vamos-taxi-270"`, sed `543`→`593` (all ports, including `shadow_port`, `54327` and the `127.0.0.1:543xx`/`localhost:543xx` URLs), `inspector_port = 8083`→`8283` (check it is free first), `DB_URL=postgres://postgres:postgres@127.0.0.1:59322/postgres`, and a guard refusing any `543[0-9]{2}` left in the scratch config. Alternatively keep it outside the repo in the scratchpad; the planner decides whether it is committed.
3. `bash scripts/local-stack-27.sh start` then `reset` (from-zero replay: all migrations plus seed).
4. Role passwords: `docker exec supabase_db_vamos-taxi-270 psql -U postgres -c "alter role vamos_edge password 'vamos_edge'; alter role vamos_public password 'vamos_public';"` (the same two statements `local-role-passwords.mjs` runs; that script refuses non-54322).
5. `bash scripts/local-stack-27.sh test` (pgTAP) and `bash scripts/local-stack-27.sh types` (regenerate types).
6. Worker-client test: `VAMOS_LOCAL_DB_PORT=59322 pnpm --filter @vamos/db exec vitest run test/local/consent-reader.test.ts`.
7. Auth e2e (D-01): build, then `apps/web/tests/e2e-worker/run.sh /Users/koss/Developer/vamos-wt/phase-27 /tmp/vamos-sb27 <hook-secret-file> p27`. `run.sh` reads `supabase status --workdir`, so it follows the 59xxx stack. It needs `[auth.hook.send_email]` in the scratch config per `docs/runbook/auth-worker-e2e.md`.
8. `bash scripts/local-stack-27.sh stop` at the end. Never touch the other stacks.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (web: `apps/web/vitest.config.ts`, includes `lib/**/*.test.ts`, `tests/unit/**/*.test.ts`, `components/consent/**/*.test.ts`); pgTAP via `supabase test db`; vitest `packages/db/test/local` for the Worker client; Playwright (`apps/web/playwright.config.ts`) for local banner specs |
| Config file | `apps/web/vitest.config.ts`, `packages/db/vitest.config.ts`, `packages/db/supabase/config.toml` (scratch copy with 5932x) |
| Quick run command | `pnpm --filter web exec vitest run lib/consent lib/meta components/consent lib/live-no-tbc.test.ts lib/legal-updated.test.ts tests/unit/auth` |
| Full suite command | `pnpm test:unit` + `bash scripts/local-stack-27.sh test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| META-03 | Accept → row all categories true; Necessary only → all false; Save choices → exactly the switches; invalid booleans → 400 | unit (route handler with mocked `asAnon`, `verifyTurnstile`) | `pnpm --filter web exec vitest run tests/unit/consent/route.test.ts` | Wave 0 (new) |
| META-03 | Turnstile verified iff the row will have marketing=true; Necessary only never verifies | unit + source pin | same file + `lib/consent/record.test.ts` | record.test.ts exists (rewrite) |
| META-03 | Latest row under the current version wins; tie by id; older version ignored (D-03b); other subject invisible | pgTAP | `bash scripts/local-stack-27.sh test` (`consent_choice_reader.test.sql`) | Wave 0 (new) |
| META-03 | Reader grants: anon EXECUTE only, definer, `search_path=''`, no table SELECT for anon | pgTAP | same | Wave 0 |
| META-03 | Reader through the Worker client (`fetch_types:false`) returns booleans and a timestamp, no arrays | local vitest | `VAMOS_LOCAL_DB_PORT=59322 pnpm --filter @vamos/db exec vitest run test/local/consent-reader.test.ts` | Wave 0 (new) |
| META-03 | Sign-up confirm writes no `consent_log` row (D-01) | unit + worker e2e | `pnpm --filter web exec vitest run tests/unit/auth/signup-consent.test.ts`; e2e check 1b (`=== 0`) | exists (rewrite) |
| META-03 | Footer "Cookie preferences" only opens the sheet (no write), both builds | source pin | `pnpm --filter web exec vitest run components/consent/banner-contract.test.ts` | exists (rewrite) |
| META-04 | GET `/api/consent/state`: no cookie → chosen false with no DB call; row → chosen true; `private, no-store`; no UUID in body; never sets a cookie | unit | `pnpm --filter web exec vitest run tests/unit/consent/state-route.test.ts` | Wave 0 (new) |
| META-04 | SiteShell renders the banner on `/checkout/details`, `/confirmation/X`, `/checkout/pay/abc`, a 404 path; not on `/ops`, dashboard host, `/dev` | unit (react-dom/server, mocked `usePathname`) | `pnpm --filter web exec vitest run components/consent/banner-hosts.test.ts` | Wave 0 (new) |
| META-04 | Mock mounts: every page in D-07 (incl. sign-in, account, bookings, reset-password) has `dc-import name="CookieBanner"` | source pin | `pnpm --filter web exec vitest run lib/consent/mock-mounts.test.ts` | Wave 0 (new) |
| META-04 | Cached marketing HTML carries no per-visitor state (serveDcHtml injects only the site key) | source pin on middleware | `pnpm --filter web exec vitest run lib/consent/mock-mounts.test.ts` | Wave 0 |
| META-04 | Nothing to Meta: no fbevents, pixel id or graph.facebook anywhere; gate false | source pin | `pnpm --filter web exec vitest run lib/meta/legal-gate.test.ts` ("no fbevents.js", "flag off" kept) | exists |
| META-04 | Banner visible above PAY at 390×844 on `/checkout/details` and the pay link (en, de) | Playwright, local only | `pnpm --filter web exec playwright test tests/integration/consent-banner-27.spec.ts` | Wave 0 (new) |
| META-05 | Accept t1, Necessary only t3: as of now → off; as of t2 → on (a later Dismiss stops only future events) | pgTAP | `consent_choice_reader.test.sql` R3, R5 | Wave 0 |
| META-05 | Necessary only t1, paid t2, Accept t3: as of t2 → off (no backfill) | pgTAP | R6 | Wave 0 |
| D-11..D-16 | §1–§3 byte-equal to the decision file in en, de, fr and ar, in the mock source and the Next messages | unit | `pnpm --filter web exec vitest run lib/consent/owner-texts.test.ts` | Wave 0 (new) |
| D-17 | Version = cookies date = privacy date; exactly one assignment | unit | `pnpm --filter web exec vitest run lib/meta/legal-gate.test.ts lib/legal-updated.test.ts` | exists (rewrite and extend) |

### Sampling Rate
- **Per task commit:** the quick run command (under 30 s).
- **Per wave merge:** `pnpm test:unit`, `bash scripts/local-stack-27.sh test`, `pnpm typecheck`, `pnpm i18n:check`.
- **Phase gate (hand-over list, Q8), each exact:**
  1. `pnpm install --frozen-lockfile`
  2. `pnpm test:unit`
  3. `bash scripts/local-stack-27.sh reset` (from-zero replay)
  4. `bash scripts/local-stack-27.sh test` (pgTAP, full)
  5. `VAMOS_LOCAL_DB_PORT=59322 pnpm --filter @vamos/db exec vitest run test/local/consent-reader.test.ts`
  6. `pnpm typecheck`
  7. `pnpm lint`
  8. `pnpm lint:css`
  9. `pnpm check:numbers`
  10. `pnpm check:legal-claims`
  11. `pnpm check:public-env`
  12. `pnpm check:db-fences`
  13. `pnpm i18n:check`
  14. `pnpm db:seed:check` (pure node, no DB; safe)
  15. types: `node_modules/.bin/supabase gen types typescript --local --schema public --workdir /tmp/vamos-sb27 | diff -q - packages/db/database.types.ts` (**not** `pnpm db:types:check`, which reads the 54322 stack)
  16. `pnpm build` and `pnpm --filter web exec opennextjs-cloudflare build` (CI parity, `pr.yml:90-93`)
  17. Auth e2e: `apps/web/tests/e2e-worker/run.sh …` (step 7 of the local DB steps)
  - Manual (owner UAT in Hermes): banner on each surface at 1440, 1024, 768 and 390 in en, de and ar; a real Accept then a Necessary only on staging after the control session deploys; read `consent_log` read-only.

### Wave 0 Gaps
- [ ] `pnpm install --frozen-lockfile` in the worktree
- [ ] `scripts/local-stack-27.sh` (5932x) and a baseline pgTAP run on unchanged code (catch the stale `seed_idempotent` counts first)
- [ ] `packages/db/supabase/tests/consent_choice_reader.test.sql`
- [ ] `packages/db/test/local/consent-reader.test.ts`
- [ ] `apps/web/tests/unit/consent/route.test.ts`, `state-route.test.ts`
- [ ] `apps/web/components/consent/banner-hosts.test.ts` (**note:** vitest `include` only covers `components/consent/**/*.test.ts` and `components/checkout/**/*.test.tsx`; a `.tsx` render test under `components/consent` needs the include widened, or keep it `.ts` using `React.createElement`)
- [ ] `apps/web/lib/consent/owner-texts.test.ts`, `mock-mounts.test.ts`
- [ ] Playwright helper to stub `/api/consent/state` for existing checkout, confirmation and pay-link specs

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Consent is anonymous, keyed on a subject cookie |
| V3 Session Management | yes | `consent_subject` HttpOnly, Secure, SameSite=Lax, 1 year, minted only on a successful POST (`lib/consent/cookie.ts`) |
| V4 Access Control | yes | Definer reader with the subject from the GUC; EXECUTE to anon only; no table grant; pgTAP grant tests |
| V5 Input Validation | yes | Strict JSON booleans for `settings_change`; method allowlist; locale allowlist (`route.ts:24-41`) |
| V6 Cryptography | no | No new crypto (UUID from `crypto.randomUUID`) |
| V11 Business logic / anti-automation | yes | Turnstile when marketing=true; rate limit per IP and per subject |
| V13 API | yes | CSRF origin check on POST; GET is safe and `no-store` |
| V14 Config | yes | No secret added; site key is public; `META_LEGAL_GATE_OPEN` stays false |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cached page carries visitor A's consent state to visitor B | Information disclosure / Tampering | State only from `no-store` GET; `serveDcHtml` injects public data only; source pin test |
| Bot writes Meta-on rows without Turnstile via `settings_change` | Spoofing | Turnstile iff marketing will be true |
| Forged consent for another person | Spoofing / Repudiation | Subject from a server-minted HttpOnly UUID; customer_id from the JWT inside the definer; no subject argument |
| Reading someone else's choice via the Data API | Information disclosure | Reader takes the subject only from a GUC the Data API cannot set; no GUC → 0 rows |
| Footer click silently flips Meta off | Tampering (integrity of the record) | The listener only opens the sheet; pin test |
| Cross-site POST | Tampering (CSRF) | `csrfForbidden` Origin allowlist (existing) |
| DB read amplification via GET with random cookies | DoS | Indexed single-row read; optional IP read limit |
| Old Accept counted after new texts | Repudiation / compliance | Version filter in the reader; version bump; pgTAP D-03b |

## Shared-File Strategy (Q10)

- **`app/vamos-i18n-dict.js`** (shared, 2185 lines): add only the two plain UI strings (save failed, check failed with the four translations from UI-SPEC). Insert them next to the existing cookie-banner entries, not at the file end, where every session appends. Owner texts never go here; they go in new `app/vamos-meta-texts.js`, which has no conflict risk. Delete unused strings ("Reset my choice", the old banner body) only in a final task, after re-grepping `app/` and `apps/web/`, by exact line. Skipping the deletion is acceptable: unused entries are harmless.
- **`apps/web/i18n/messages/{en,de,fr,ar}.json`**: the namespaces are alphabetically sorted [VERIFIED for `cookies`]. Insert each new key at its sorted position. Never reformat the file.
- **`packages/db/supabase/seed.sql`**: never hand-merge. After every merge of main, run `pnpm db:seed:gen`, then set the `seed_idempotent.test.sql` counts from the new header.
- **`cookies.dc.html`, `privacy.dc.html`, `CookieBanner.dc.html`**: make small, local edits. Merge `origin/main` into the branch right before hand-over. Main wins conflicts except on the owner texts and the D-16a removal.
- **Tests owned by the control session on main** (`live-no-tbc.test.ts`, `legal-updated.test.ts`): change them deliberately and list them in the hand-over as "changed on purpose".

## Sources

### Primary (HIGH confidence, read in this worktree)
- `apps/web/middleware.ts` (DC_PAGES :32-51, MARKETING_CACHE_PATHS :54-64, serveDcHtml :111-132, applyPublicCacheHeaders :423-458, matcher :726)
- `apps/web/app/api/consent/route.ts`; `apps/web/lib/consent/{bind,cookie,ip,policy}.ts`; `record.test.ts`, `cookie.test.ts`
- `apps/web/app/[locale]/layout.tsx`, `components/shell/SiteShell.tsx`, `SiteFooter.tsx`, `components/consent/CookieBanner.tsx`, `banner-contract.test.ts`
- `apps/web/lib/meta/legal-gate.ts` and `.test.ts`, `lib/live-no-tbc.test.ts`, `lib/legal-updated.test.ts`, `lib/legal-text-hygiene.test.ts`, `app/vamos-legal-updated.js`
- `apps/web/lib/auth/signup-consent.ts`, `app/api/auth/callback/route.ts`, `tests/unit/auth/signup-consent.test.ts`, `tests/e2e-worker/auth-worker.e2e.mjs`, `run.sh`
- `packages/db/src/identity.ts` (PG_ROLE, client options), `apps/web/lib/db/identity.ts` (NOCACHE binding), `packages/db/src/pg-types.ts`
- `packages/db/supabase/migrations/20260823000018_consent_log.sql`, `…019_append_only.sql`, `…020_rls_enable.sql`, `20260930200000_reminder_24h_read.sql`
- `packages/db/supabase/tests/consent_write.test.sql`, `seed_idempotent.test.sql`, `system_role_narrow_reads.test.sql`; `packages/db/seed/generate-seed.mjs`; `packages/db/supabase/seed.sql` header
- `scripts/local-stack-263.sh`, `scripts/sync-dc-mock-to-public.mjs`, `scripts/check-i18n-coverage.mjs`, `scripts/check-no-invented-numbers.mjs`, `scripts/check-db-access-fences.mjs`, root and package `package.json`, `.github/workflows/pr.yml`
- `app/pages/CookieBanner.dc.html`, `app/pages/cookies.dc.html`, `app/pages/contact.dc.html` (Turnstile pattern), `app/vamos-locale.js`
- `git show gsd/phase-26.5-checkout-account:.planning/phases/26.5-checkout-guest-account/26.5-CONTEXT.md` (D-19 account agreement table)
- Local Docker: `pg_roles` (postgres `rolbypassrls=t`), running stack ports

### Secondary (MEDIUM)
- Memory notes: `worker-pg-client-no-arrays`, `customer-column-grants`, `isolated-local-supabase`, `live-home-is-dc-mock`, `live-cookie-banner-is-mock`, `supabase-hook-json-and-worker-auth-e2e`

### Tertiary (LOW)
- Cloudflare Worker response caching behaviour (A3); not load-bearing.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. No new package; versions read from package.json.
- Architecture: HIGH. Every seam is read with line numbers; the GET-state recommendation follows directly from the cache headers.
- Pitfalls: HIGH for the stale seed counts, the i18n digit gate, the ports and node_modules (all observed); MEDIUM for the hygiene test (A4).

**Research date:** 2026-09-30
**Valid until:** until the next merge of main that touches `middleware.ts`, `consent/*`, the messages or 26.5 landing, at most 7 days.

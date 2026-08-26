# Phase 5: Public Surfaces & Customer Accounts - Research

**Researched:** 2026-08-24
**Domain:** Next.js 15 App Router public-page porting (SSR/hreflang) + Supabase Auth (`@supabase/ssr`) on Cloudflare Workers via OpenNext + Resend transactional email + Cloudflare Turnstile
**Confidence:** MEDIUM-HIGH — the porting/i18n/RLS half is HIGH (built on Phase 1–3's already-verified foundations); the Supabase Auth email-hook and OpenNext cookie-handling half is MEDIUM (correct per official docs, not yet proven against this repo's own deployed Worker)

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SITE-01 | Home page renders with the booking widget prominent; sections (reviews, FAQ) read from the database | §Decisions D-13, D-19; §Architecture Patterns "Two content sources during the Phase 5/6 window" |
| SITE-02 | Every public page carries the shared header and footer, never a hand-rolled one | §Decisions D-14 (SiteHeader signed-in branch); Phase 1 already structurally enforces the shell via `app/[locale]/layout.tsx` |
| SITE-04 | About, FAQ, contact, become-a-partner render; contact/driver-application forms are challenge-protected and reach inbox + database | §Decisions D-10, D-11; §Package Legitimacy Audit; §Code Examples "Turnstile-gated form route" |
| SITE-05 | Terms, privacy, cookies, cancellation, imprint render with real numbers or labelled TBC pills | §Decisions D-16 (imprint `data-vt-legal` correction); §Common Pitfalls "Legal-page language claims" |
| SITE-06 | Every page holds layout at 1440/1024/768/390 with nothing scrolling sideways | §Validation Architecture (reuses Phase 1's `playwright.config.ts` viewport matrix) |
| SITE-07 | Public pages are server-rendered with correct language alternates for search engines | §Decisions D-12; `apps/web/lib/metadata.ts` (already built, Phase 1 D-19) — extend, don't rebuild |
| SITE-09 | A customer can reach support by phone, WhatsApp and the contact form | §Decisions D-20; §Code Examples "WhatsApp deep link" |
| AUTH-01 | Create an account with email/password or an emailed one-time code | §Decisions D-04 through D-09; §Architecture Patterns "Auth flow state machine" |
| AUTH-02 | Reset a forgotten password from an emailed link | §Decisions D-06, D-07; same Send Email Hook as AUTH-01 |
| AUTH-03 | Session survives a browser refresh and expires safely | §Decisions D-02, D-03; §Common Pitfalls "Cookie folding" |
| AUTH-04 | Sign out from any page | §Decisions D-14; §Code Examples "Sign-out Server Action" |
| I18N-08 | A legal page in fewer than four languages says so, not pretending to be translated | §Decisions D-16; §Common Pitfalls "Legal-page language claims" (imprint.dc.html verified wrong today) |

</phase_requirements>

## Summary

Phase 5 ports the eleven public-content mocks that carry no live booking state (about, become-a-partner, cancellation, contact, cookies, faq, imprint, privacy, terms, sign-in, reset-password) plus the home page shell, onto real routes under the `[locale]` tree Phase 1 already built — and wires real Supabase Auth (`@supabase/ssr`) for account creation, password reset, session persistence and sign-out. It explicitly does **not** touch `account.dc.html`, `bookings.dc.html`, `booking-detail.dc.html` (SITE-03, Phase 8), `manage-booking.dc.html`'s functional lookup (LIFE-04, Phase 9), or `checkout.dc.html`/`confirmation.dc.html` (Phase 7) — the phase's own goal sentence ("every public mock that doesn't depend on live booking state") is the filter, and it is corroborated line-for-line by `REQUIREMENTS.md`'s phase-assignment table.

Three findings drive the shape of this phase more than anything in the original brief. First, `apps/web/components/shell/SiteHeader.tsx`'s own header comment records that Phase 1 deliberately **did not port the signed-in branch** (avatar disc, account menu, notification bell, sign-out button) because it read a mock-only `vamosAuth` storage key — that branch is unbuilt, and Phase 5 is where it gets built, against a real session read via `getUser()`. Second, no migration in Phase 2's already-committed set (`0001`–`0007`) creates a `customers` row when someone signs up through Supabase Auth — the schema has `customers.user_id` nullable and unique-indexed on `email`, clearly designed for a linking trigger, but that trigger does not exist yet and is Phase 5's to write as an additive migration. Third, CLAUDE.md's four-language law cannot be satisfied by Supabase's default auth-email system (one template per project, Go-templated, no per-locale branching without a workaround) — the correct mechanism is Supabase's **Send Email Hook**, which fully replaces Supabase's own SMTP send and lets Phase 5's own code pick the locale-correct template and call Resend directly.

**Primary recommendation:** build the eleven content pages as plain dynamic SSR reading through Phase 3's `publicSql`/`asAnon` (no Next.js ISR infrastructure — Cloudflare/OpenNext's ISR needs R2 + a Durable Object queue + D1/DO tag cache that nothing in this project currently provisions, and Hyperdrive's own 60s query cache on the `HYPERDRIVE` binding already covers the read volume this phase needs); wire Supabase Auth through `@supabase/ssr`'s documented middleware-refresh pattern; and replace Supabase's default auth emails with a Send Email Hook that renders four-language templates from `packages/emails` and sends via `resend`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Marketing/legal page content (about, faq, contact, legal pages) | Frontend Server (SSR) | CDN/Static (edge cache, later) | Content-only, no auth; must SSR for hreflang/SEO (SITE-07); safe to edge-cache once Cache Rules land in Phase 10 |
| Home page shell (hero, sections) | Frontend Server (SSR) | Browser/Client (booking-widget interactivity) | SSR for SEO; the widget's own interactivity is sessionStorage-backed client state per Phase 1 D-15, untouched here |
| Reviews / FAQ content read | API/Backend (`publicSql`) | Frontend Server (SSR) | Reads `content_strings`/`reviews` through Phase 3's cacheable `vamos_public` binding — never a client-side `fetch` to a public API route for content that changes rarely |
| Sign-up / sign-in / password reset forms | Browser/Client (form state) | Frontend Server (SSR, `@supabase/ssr`) | Form interactivity is client; the cookie exchange that actually creates the session happens server-side in middleware/Route Handlers, never trusted from the browser |
| Session persistence across refresh | Frontend Server (SSR middleware) | Browser (httpOnly cookie) | `@supabase/ssr`'s refresh-in-middleware pattern; the browser only ever carries the cookie, never reads or writes its claims |
| Sign out | Browser/Client (button) | Frontend Server (Server Action / Route Handler) | The click is client; clearing the session cookie must happen server-side through the same `@supabase/ssr` client that set it |
| `customers` row creation/link on signup | Database (Postgres trigger, `SECURITY DEFINER`) | — | Matches Phase 2's own identity-boundary pattern (grants + triggers, not app-code trust); runs inside GoTrue's own transaction, not through Hyperdrive |
| Contact / become-a-partner submission | API/Backend (Route Handler) | Database (`asAnon` write) | Turnstile verification and the INSERT both happen server-side; the Resend call is a second server-side effect in the same handler |
| Auth transactional email (confirm / reset / OTP) | API/Backend (Send Email Hook → Resend) | — | Server-to-server: Supabase calls the hook, the hook calls Resend's HTTPS API — no client involvement at any point |
| `hreflang` / sitemap | Frontend Server (SSR, `generateMetadata`) | CDN/Static (`sitemap.ts`) | Already scaffolded in Phase 1 (`apps/web/lib/metadata.ts`); Phase 5 extends the existing `PUBLIC_ROUTES` list's real pages rather than building a second mechanism |
| Legal page language-completeness notice | Frontend Server (SSR, per-page constant) | — | Rendered server-side from a literal per-page value, not detected at runtime — a runtime detector could not tell "translated" from "coincidentally identical" |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/ssr` | 0.12.4 (npm, published 2026-07-28) [VERIFIED: npm registry + official Supabase docs] | Cookie-based Supabase Auth session in Next.js middleware / Server Components / Route Handlers | Purpose-built successor to the deprecated `@supabase/auth-helpers-nextjs`; already the project's own `STACK.md` research choice (HIGH confidence there); the *only* documented pattern for SSR auth cookies in App Router |
| `@supabase/supabase-js` | 2.112.3 (npm, published 2026-08-12) [VERIFIED: npm registry + official Supabase docs] | Underlying Auth/Storage/Realtime client `@supabase/ssr` wraps; also used directly for the Admin/service-role calls the Send Email Hook's verification code needs | Required peer of `@supabase/ssr`; already scoped in `.claude/CLAUDE.md` to "Auth token verification, Storage, and Realtime only" — never row-level app queries, which stay on Hyperdrive |
| `resend` | 6.22.0 (npm, published 2026-08-21) [VERIFIED: npm registry + official docs, `resend.com/docs/send-with-nextjs`] | Transactional email HTTP API — both the contact/partner-application notification and the Send Email Hook's actual delivery | Official Node SDK, `fetch`-based (no raw sockets), confirmed Workers-compatible; already named in `.claude/CLAUDE.md`'s fixed stack |
| `zod` | 4.4.3 (npm, published 2026-08-20) [VERIFIED: npm registry; reused from the project's own `STACK.md`/Phase 4 research, HIGH there] | Runtime validation of contact/partner-application payloads and the Send Email Hook's inbound JSON shape | Already the project's chosen validator (Phase 4); reusing it here avoids a second validation library for the same kind of untrusted-input problem |
| `standardwebhooks` | 1.0.0 (npm, published 2024-03-04) [VERIFIED: npm registry + official docs, `supabase.com/docs/guides/auth/auth-hooks`] | Verifies the Standard Webhooks signature (`webhook-id`/`webhook-timestamp`/`webhook-signature` headers) Supabase attaches to every HTTP Auth Hook call | Supabase's HTTP Hooks explicitly follow the Standard Webhooks Specification; hand-rolling HMAC-with-timestamp-tolerance verification is exactly the kind of primitive this project already avoids hand-rolling elsewhere (Phase 4's HMAC quote lock uses a bespoke scheme *because* no off-the-shelf library fit its exact pin shape — the auth-hook signature has no such constraint) |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React Email (`@react-email/components` + `@react-email/render`) | latest 0.x/4.x (verify at install time — not yet checked against the registry in this pass) | Author the four-language auth-email and contact-notification templates as JSX, matching `.claude/CLAUDE.md`'s stated `packages/emails` architecture | Only if the planner decides Phase 5 stands up `packages/emails`' real toolchain now (see Uncertain U-05) rather than shipping Phase 5's auth emails as plain template-string HTML and deferring React Email to Phase 7's confirmation/voucher email, which is the first email with real layout complexity (price table, calendar attachment) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Supabase Send Email Hook | Supabase Custom SMTP (dashboard SMTP settings pointed at `smtp.resend.com:465`) | Far less code — no hook endpoint, no signature verification — but the template system is one Go-templated HTML file per project with no native per-locale branching (confirmed via `resend.com/docs/send-with-supabase-smtp` and `supabase.com/docs/guides/auth/auth-smtp`: the docs do not describe multi-language support, and the well-known workaround is stashing a language string in `user_metadata` and branching inside the single Go template with `{{ if eq .Data.lang "de" }}` — fragile, hard to review, and still can't send a fully separate HTML document per language). Rejected: CLAUDE.md's four-language law is non-negotiable and the Hook is the only mechanism that cleanly satisfies it. |
| Additive `auth.users` trigger for `customers` linking | App-code upsert immediately after `signUp()`/`verifyOtp()` resolves client-side, calling a Route Handler that writes the row | The trigger runs inside GoTrue's own transaction and cannot be skipped by a client that never calls the follow-up endpoint (e.g., a network drop right after signup); app-code upsert is simpler to test locally but leaves a real gap — an account that exists in `auth.users` with no matching `customers` row, breaking every RLS policy that joins through `customers.user_id`. Rejected in favor of the trigger. |
| One always-on Turnstile widget per form | Reuse Phase 4's three-layer escalating abuse system (Rate Limiting + Workers `ratelimits` + invisible-then-enforced Turnstile) verbatim | Phase 4's system is sized for an API hit repeatedly within seconds (`/api/quote`); a contact form submitted once per visitor doesn't need per-IP request-rate escalation. A single managed/invisible Turnstile challenge per submission is the documented low-friction pattern for this shape of form and avoids building 3-tier abuse infrastructure for a form nobody is going to spam at API volume. |
| Building Next.js ISR (R2 + Durable Object queue + D1 tag cache) for the eleven content pages | Plain dynamic SSR reading through `publicSql` | OpenNext's ISR on Cloudflare needs `NEXT_INC_CACHE_R2_BUCKET`, `NEXT_CACHE_DO_QUEUE`, and `NEXT_TAG_CACHE_D1`/`NEXT_TAG_CACHE_DO_SHARDED` bindings — none of which exist in `apps/web/wrangler.jsonc` today, and none of which Phase 1's D-34 "declare every binding the Worker will ever touch" list anticipated for this phase. Given Phase 3 already ships a 60-second Hyperdrive query cache on the exact table set (`content_strings`, `reviews`, `vehicle_classes`, `service_zones`, `settings_public`) this phase reads, adding a second caching layer for the same content is unjustified infrastructure ahead of LAUNCH-01's actual 10k-concurrent test (Phase 10). |

**Installation:**
```bash
pnpm --filter web add @supabase/ssr @supabase/supabase-js resend zod standardwebhooks
```

**Version verification:** confirmed live against the npm registry on 2026-08-24 (see table above); re-run `npm view <package> version` immediately before the plan's Wave 0 task, since this phase may execute weeks after this research was written.

## Package Legitimacy Audit

`slopcheck` (v0.6.1, already present on this machine) was run against all five candidate packages in an isolated scratch directory (never inside this repo, per the constraint against modifying `apps/web/package.json` from a research pass, and never installing anything into the actual project).

**Method (for reproducibility/audit trail):** `pip3 install slopcheck --break-system-packages` (already satisfied), then, from a `mktemp -d` scratch directory with only a throwaway `package.json`, `python3 -m slopcheck install <pkg...> --ecosystem npm`. slopcheck's `install` subcommand does perform a real `npm install` after the registry check passes — isolating it in a scratch directory (created and destroyed by this research pass, never touching the repo) was the deliberate way to get a real legitimacy signal without installing anything into `apps/web` or committing a lockfile change. All five checks below completed with exit 0 and a `[OK]` verdict; the scratch directories were deleted immediately after.

| Package | Registry | Age | Downloads (last 7d) | Source Repo | slopcheck | Disposition |
|---------|----------|-----|----------------------|-------------|-----------|-------------|
| `@supabase/ssr` | npm | ~3 yrs (first published 2023-09-06) | 7,094,940 | github.com/supabase/ssr | [OK] | Approved |
| `@supabase/supabase-js` | npm | ~6.5 yrs (first published 2020-01-17) | 24,702,997 | github.com/supabase/supabase-js | [OK] | Approved |
| `resend` | npm | current line since 2022-12 (name has an orphaned unrelated `0.1.1` from 2017 — see note) | 9,963,635 | github.com/resend/resend-node | [OK] | Approved |
| `zod` | npm | ~6.4 yrs (first published 2020-03-07) | 265,228,577 | github.com/colinhacks/zod | [OK] | Approved |
| `standardwebhooks` | npm | ~2.5 yrs (first published 2024-03-04) | 18,826,250 | github.com/standard-webhooks/standard-webhooks | [OK] | Approved |

**Postinstall-script check (Node.js phases, per protocol Step 4):** `npm view <pkg> scripts.postinstall` returned empty for all five packages — no postinstall script on any of them, no elevated-risk signal beyond the ordinary registry check.

**Note on `resend`'s publish history:** `npm view resend time` shows a `0.1.1` published 2017-02-25, then a five-year gap to `0.1.2` in December 2022 — the package name was orphaned/transferred, not slopsquatted. December 2022 aligns with Resend the company's actual founding and launch; the current active line (6.x, weekly releases, 9.96M downloads/week, `github.com/resend/resend-node`) is the official SDK, confirmed against `resend.com/docs/send-with-nextjs`'s own install command (`npm install resend`). Recorded here so a future reviewer doesn't independently flag the 2017 date as suspicious without this context.

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

Every package above passed slopcheck **and** is confirmed via official documentation (Supabase docs, Resend docs, or this project's own prior `STACK.md` research citing official sources) — all five are tagged `[VERIFIED: npm registry]` under the provenance rule, not `[ASSUMED]`. **No package in this research requires a `checkpoint:human-verify` gate before install** on legitimacy grounds; the planner should still gate the actual `wrangler secret put` steps for the live services these packages talk to (Resend, Turnstile, Supabase) behind the owner-provisioning blockers listed below, which is a provisioning gate, not a package-trust gate.

## Architecture Patterns

### System Architecture Diagram

```
Browser (any [locale])
   │
   │  GET /about, /contact, /faq, /terms, ...            GET /sign-in, /reset-password
   ▼                                                       ▼
apps/web/middleware.ts (next-intl routing + noindex)  ──► @supabase/ssr session refresh
   │  (existing, Phase 1)                                  (new: getUser() re-mint, cookie write)
   ▼                                                       │
Server Component page (force-dynamic or plain SSR)         ▼
   │                                                    Route Handler / Server Action
   ├─► content pages: publicSql(env) ─► HYPERDRIVE      │  supabase.auth.signUp() /
   │      (vamos_public role, cacheable, 60s)            │  signInWithPassword() /
   │      reads: content_strings, reviews                │  signInWithOtp() / verifyOtp() /
   │                                                      │  resetPasswordForEmail()
   ├─► SiteHeader signed-in branch: getUser() via         ▼
   │      the same @supabase/ssr server client         Supabase Auth (GoTrue, same project
   │      (no Hyperdrive call for this)                 as Phase 2's Postgres — ref
   │                                                     yaumjzvylngfjhtuffqs)
   └─► contact / become-a-partner form                    │
          │  1. Turnstile widget token (client)            │  AFTER INSERT on auth.users
          ▼                                                 ▼
       POST /api/contact, /api/partner-application     SECURITY DEFINER trigger
          │  1. verify token: challenges.cloudflare.com  (new, additive Phase 5 migration)
          │     /turnstile/v0/siteverify                 upserts public.customers by email
          │  2. zod-validate body                             │
          │  3. asAnon(env, fn) → INSERT (Hyperdrive,          │
          │     HYPERDRIVE_NOCACHE, vamos_edge)                ▼
          │  4. resend.emails.send(...)                  public.customers row now carries
          ▼                                               user_id — RLS (customers_select_own)
       Resend HTTPS API → owner inbox                     now resolves for this signed-in user
                                                                 │
                                                                 │  (async, server-to-server,
Supabase Auth Hooks (dashboard-configured)                      │   independent of the request
   │  signup / recovery / email_otp / magic_link                │   above)
   ▼
Send Email Hook → POST apps/web/app/api/auth/email-hook
   │  1. verify Standard Webhooks signature (standardwebhooks)
   │  2. read locale from email_data / user_metadata
   │  3. render packages/emails template for that locale
   ▼
resend.emails.send(...) → customer inbox (confirm / reset / OTP)
```

### Recommended Project Structure

```
apps/web/
├── app/[locale]/
│   ├── about/page.tsx                  # SITE-04 — SSR, publicSql content
│   ├── faq/page.tsx                    # SITE-04 — SSR, publicSql content
│   ├── contact/page.tsx                # SITE-04/SITE-09 — form + Turnstile
│   ├── become-a-partner/page.tsx       # SITE-04 — form + Turnstile
│   ├── (legal)/
│   │   ├── terms/page.tsx              # SITE-05
│   │   ├── privacy/page.tsx            # SITE-05
│   │   ├── cookies/page.tsx            # SITE-05
│   │   ├── cancellation/page.tsx       # SITE-05
│   │   └── imprint/page.tsx            # SITE-05, I18N-08 (data-vt-legal="en de")
│   ├── sign-in/page.tsx                # AUTH-01/03
│   ├── sign-up/page.tsx                # AUTH-01 (or a `mode` param on sign-in — see D-01a)
│   └── reset-password/page.tsx         # AUTH-02
├── app/api/
│   ├── auth/
│   │   ├── callback/route.ts           # magic-link / OTP verification landing route
│   │   ├── sign-out/route.ts           # AUTH-04, or a Server Action instead
│   │   └── email-hook/route.ts         # Supabase Send Email Hook target
│   ├── contact/route.ts                # SITE-04
│   └── partner-application/route.ts    # SITE-04
├── components/auth/                    # AuthForm/ResetForm ports (new — not in Phase 1's 33)
├── components/shell/SiteHeader.tsx     # extended: signed-in branch added here
├── lib/supabase/
│   ├── server.ts                       # createServerClient() factory (Server Components/Actions)
│   ├── middleware.ts                   # session-refresh helper called from middleware.ts
│   └── client.ts                       # createBrowserClient() for the form's client bits
└── lib/metadata.ts                     # extended, not rebuilt (Phase 1 D-19)

packages/db/supabase/migrations/
└── <ts>_customers_auth_link.sql        # SECURITY DEFINER trigger on auth.users (new, D-04)
└── <ts>_contact_forms.sql              # contact_submissions, partner_applications (new, D-10)

packages/emails/
└── templates/{auth-confirm,auth-reset,auth-otp}.{en,de,fr,ar}.tsx   # if React Email (U-05)
```

### Pattern 1: `@supabase/ssr` middleware session refresh

**What:** Server Components cannot write cookies. A refreshed session token is minted in middleware (which can) and mirrored onto both the outgoing request (so the Server Component sees the fresh token) and the response (so the browser stores it).
**When to use:** Every request, before any Server Component that might read `auth.getUser()`.
**Example:**
```typescript
// Source: supabase.com/docs/guides/auth/server-side/nextjs (official pattern, adapted for
// this project's existing next-intl middleware — the two must compose, not replace each
// other; next-intl's handleI18nRouting() already runs first in apps/web/middleware.ts).
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export function updateSession(request: NextRequest, response: NextResponse) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // MUST be getUser(), never getSession(), server-side — getSession() trusts an
  // unverified cookie value; getUser() round-trips to Supabase and verifies the JWT.
  return supabase.auth.getUser().then(() => response);
}
```
**Critical:** never build the mutated response with `new NextResponse(body)` inside this path on this platform — `opennextjs-cloudflare` issue #501 (fixed by PR #497, merged 2025-03-25, long before this repo's pinned `1.20.2`) folded multiple `Set-Cookie` headers into one when a *fresh* `NextResponse` was constructed; `NextResponse.next({ request })` followed by `response.cookies.set(...)` (the pattern above) was and remains the safe shape. [CITED: github.com/opennextjs/opennextjs-cloudflare#498, #501]

### Pattern 2: Supabase Send Email Hook — locale-correct auth emails

**What:** An HTTP endpoint Supabase calls instead of sending its own auth email; the endpoint is fully responsible for delivery.
**When to use:** signup confirmation, password recovery, magic link, email OTP — every AUTH-01/AUTH-02 email.
**Example:**
```typescript
// Source: supabase.com/docs/guides/auth/auth-hooks/send-email-hook (pattern), adapted to
// this project's Resend + packages/emails stack. apps/web/app/api/auth/email-hook/route.ts
import { Webhook } from "standardwebhooks";
import { Resend } from "resend";

const wh = new Webhook(process.env.SEND_EMAIL_HOOK_SECRET!); // v1,whsec_... from the
                                                               // Supabase dashboard
const resend = new Resend(process.env.RESEND_API_KEY!);

export async function POST(request: Request) {
  const payload = await request.text();
  const headers = Object.fromEntries(request.headers);

  let event: {
    user: { email: string; user_metadata?: { locale?: string; full_name?: string } };
    email_data: {
      token: string;            // the 6-digit code (AUTH-01's "one-time code")
      token_hash: string;
      redirect_to: string;      // magic-link target
      email_action_type: "signup" | "recovery" | "magiclink" | "email_change" | "email_otp" | "invite";
      site_url: string;
    };
  };
  try {
    event = wh.verify(payload, headers) as typeof event; // throws on bad signature
  } catch {
    return new Response("invalid signature", { status: 401 });
  }

  const locale = event.user.user_metadata?.locale ?? "en"; // D-08: set at signUp() time
  const { subject, html } = renderAuthEmail(event.email_data.email_action_type, locale, event.email_data);

  const { error } = await resend.emails.send({
    from: "Vamos Taxi <no-reply@vamostaxi.eu>",
    to: event.user.email,
    subject,
    html,
  });
  if (error) return new Response(String(error), { status: 500 });
  return new Response(null, { status: 200 });
}
```

### Pattern 3: `customers` row created/linked at signup, not by app code

**What:** A `SECURITY DEFINER` trigger on `auth.users`, upserting `public.customers` keyed by email — mirrors ADR-014 §2's "guest email becomes a customer record" flow for free.
**When to use:** Additive Phase 5 migration, following Phase 4's precedent of additive-only migrations after Phase 2's baseline.
**Example:**
```sql
-- Source: pattern derived from Phase 2's own 0006_customers_and_staff.sql (which defines
-- public.customers with user_id nullable/unique, email citext unique-where-not-erased, and
-- an erasure guard trigger, but no auth.users-linking trigger — this fills that gap).
create or replace function public.tg_link_customer_on_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.customers (user_id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (email) where erased_at is null
  do update set user_id = excluded.user_id
  where public.customers.user_id is null;  -- never steal an already-claimed row
  return new;
end $$;

create trigger link_customer_on_signup
  after insert on auth.users
  for each row execute function public.tg_link_customer_on_signup();
```
**Note:** `customers.email` is `citext` (case-insensitive) and unique where `erased_at is null` — the `on conflict` target already matches Phase 2's index exactly, no new index needed.

### Anti-Patterns to Avoid

- **Trusting `getSession()` in a Server Component or Route Handler:** it reads the cookie's claims without verifying the JWT signature against Supabase's keys. Always `getUser()` on the server; `getSession()` is fine only in client components that already trust the browser's own cookie jar.
- **Building the auth-email content inside a Postgres function or the mock's own English strings:** the four-language law applies to these emails exactly as it applies to everything else — render from `packages/emails`/i18n messages, never a hardcoded English `subject`.
- **Wrapping the eleven content pages in Next.js `unstable_cache` or a hand-rolled in-memory cache:** Phase 3's D-06/D-10 rule (module-scope state is a silent Workers hazard, and the isolation gate's CI grep already watches for module-scope `Map`/`Set`/`cache`/`memo`/`store`) applies here too, even though these are public, non-identity reads.
- **Reusing Phase 4's `vamos_qs`-keyed abuse-layer Turnstile secret/site-key pair as-is without checking whether one Turnstile widget can validly serve two different pages with two different `action` values:** confirm during planning (Uncertain U-04), don't assume.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session cookie refresh/verification | A custom JWT-in-cookie parser and refresh scheduler | `@supabase/ssr`'s `createServerClient`/`createBrowserClient` | Handles refresh-token rotation, cookie chunking for large JWTs, and the exact `getUser()` verification path Supabase's own security guidance requires |
| Webhook signature verification for the Send Email Hook | Manual HMAC + timestamp-tolerance comparison | `standardwebhooks` | Timing-safe comparison and replay-window handling are exactly the class of primitive worth not re-implementing; Supabase's hook already follows this spec, so there is no format mismatch to work around |
| Password strength / email format validation | Regex written by hand for each form | `zod` schemas (already the project's chosen validator) | Consistent error-shape with Phase 4's own `/api/quote` validation; one library, one set of edge-case bugs already found elsewhere in the codebase |
| Cross-locale i18n key coverage checking | A new eyeballed audit per legal page | The existing `scripts/check-i18n-coverage.mjs` (Phase 1, D-17) | Already blocking in CI (`pnpm i18n:check`); extend its `$meta` exclusions rather than building a parallel checker |
| hreflang alternates / sitemap | Per-page `generateMetadata` hand-writing `alternates.languages` | `apps/web/lib/metadata.ts`'s `buildAlternates()` (Phase 1, D-19) | One shared helper, already proven against `I18N-03`'s SSR-locale test; a second mechanism is exactly the "18 pages, 18 places to forget one" problem D-19 exists to prevent |
| Turnstile response verification | A hand-rolled `fetch` to `siteverify` scattered per route | One shared `verifyTurnstile(token, opts)` helper (new in Phase 5, mirroring Phase 4's own abuse-layer helper if it lands first) | Keeps the `idempotency_key`/`remoteip`/error-code handling in one place for both contact and become-a-partner |

**Key insight:** every "don't hand-roll" item above already has a designed answer somewhere in this repo's own prior phases (Phase 1's i18n/metadata tooling, Phase 4's zod/Turnstile pattern) — the discipline this phase needs is *reuse*, not invention. The one genuinely new primitive (Send Email Hook signature verification) has an official spec and an official library, so even that isn't a from-scratch build.

## Common Pitfalls

### Pitfall 1: Cookie folding under `opennextjs-cloudflare` when constructing a fresh `NextResponse`
**What goes wrong:** Multiple `Set-Cookie` headers collapse into one comma-joined header, which browsers do not parse as multiple cookies — the second (and any later) cookie silently never gets set.
**Why it happens:** Cloudflare Workers' `Headers` implementation folds `Set-Cookie` unless the response object is the *same* `NextResponse` instance middleware started from (`NextResponse.next({ request })`), not a newly constructed one.
**How to avoid:** Always start from `NextResponse.next({ request })` in the auth-refresh middleware path (Pattern 1 above) and only ever `.cookies.set()` onto it — never `new NextResponse(...)` in that code path.
**Warning signs:** a user who signs in successfully (200, redirect fires) is signed out again on the very next page load; only one of two expected cookies shows up in DevTools' Application tab. [CITED: github.com/opennextjs/opennextjs-cloudflare#498/#501, fixed by PR #497 well before this repo's pinned `1.20.2`, but the *pattern* that avoids the bug class should still be followed defensively]

### Pitfall 2: Legal pages that claim four-language coverage they don't have
**What goes wrong:** `app/pages/imprint.dc.html`'s `<main data-vt-legal="en de fr ar">` claims full coverage, but the page's own content is explicitly bilingual-only — it reads "Deutsch ist die verbindliche Fassung" ("the German version is the binding one") and implements its labels through a `data-lang="de"|"en"|"both"` CSS toggle (`app/pages/imprint.dc.html:98-104,121`) that has no French or Arabic branch at all. Porting the `data-vt-legal` attribute value verbatim would ship a false claim — exactly what I18N-08 exists to prevent.
**Why it happens:** the mock's own metadata was never updated after the bilingual-only decision was made for this one page (the other four legal pages — terms, privacy, cookies, cancellation — use ordinary dictionary keys with no such toggle, and a scan found zero `lang="de"`/`lang="fr"`/`lang="ar"` inline spans in any of them, so their `"en de fr ar"` claim is not falsified by this same check).
**How to avoid:** port `imprint`'s language-completeness marker as `en de` (or whatever the Phase 5 runtime's equivalent constant is named), not `en de fr ar`; verify the other four pages' claim is actually true (not merely "not disproven by this one check") with a scripted key-coverage audit before trusting it.
**Warning signs:** an Arabic-reading visitor on `/ar/imprint` sees a page whose labels silently render in German or English with no visible notice.

### Pitfall 3: A form that writes to `contact_submissions`/`partner_applications` through the wrong Hyperdrive binding
**What goes wrong:** Phase 3's `publicSql` is deliberately branded to a **read-only** table allowlist (`content_strings`, `reviews`, `vehicle_classes`, `service_zones`, `settings_public` — Phase 3 D-11) on the cacheable `HYPERDRIVE` binding. A contact-form INSERT routed through `publicSql` either fails outright (no grant on the new table) or, if a future migration accidentally grants `vamos_public` write access to make it "work", risks that write being masked by the 60-second query cache on a subsequent read-your-own-write check.
**Why it happens:** `publicSql` and `asAnon` both run without identity claims, so it is easy to reach for whichever one is already imported on a page rather than checking which binding it sits on.
**How to avoid:** contact/partner-application writes go through `asAnon(env, fn)` (Phase 3's existing anonymous wrapper, on `HYPERDRIVE_NOCACHE`), never `publicSql`.
**Warning signs:** a form's "success" toast fires but the row briefly doesn't show up in a same-session confirmation read, or a migration needs to widen `vamos_public`'s grants beyond Phase 2's originally-designed five-table content set.

### Pitfall 4: Assuming a new Supabase project has email confirmation required by default
**What goes wrong:** if "Confirm email" is off, `signUp()` with a password returns an already-authenticated session with no verification step at all — silently contradicting the mock's own `AuthForm.dc.html` logic (`verified = mode === 'signin' || method === 'magic'`, i.e. a brand-new password signup is the *one* path that must stay unverified until proven).
**Why it happens:** the setting lives in the Supabase dashboard, is owner-gated (ADR-014 §4: "Supabase: owner creates when asked"), and its default has changed across Supabase product versions.
**How to avoid:** confirm the toggle explicitly once the project's Auth settings are reachable, and write a pgTAP-adjacent or Playwright assertion that a fresh password signup does *not* yield a usable session until the confirmation link/OTP is exercised.
**Warning signs:** an integration test "passes" because it never actually checks the intermediate unverified state.

## Code Examples

### WhatsApp deep link (SITE-09)

```typescript
// Source: pattern already established for the phone affordance in
// apps/web/components/shell/SiteHeader.tsx (PHONE_HREF = "tel:+41796267082");
// WhatsApp's own deep-link scheme is documented at faq.whatsapp.com/general/chats/how-to-use-click-to-chat
export const WHATSAPP_HREF = "https://wa.me/41796267082"; // no leading + or spaces in the wa.me path
```

### Sign-out Server Action (AUTH-04)

```typescript
// Source: supabase.com/docs/guides/auth/server-side/nextjs (sign-out pattern), wired to
// this project's shared server client factory.
"use server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signOut() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/"); // locale-relative via next-intl's own navigation helpers, not a bare string
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `app/vamos-locale.js` DOM-walking translation, mock `localStorage.vamosAuth` | `t()`/`useT()` render-time i18n (Phase 1) + real Supabase Auth session (Phase 5) | Phase 1 (2026-08) settled i18n; Phase 5 settles auth | The mock's signed-in header branch and its storage-key auth model are both structurally impossible to port as-is under SSR — Phase 5 replaces the mechanism, keeps the visual contract |
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` | Deprecated by Supabase before this project started | Already correctly avoided — nothing in this repo references the old package |
| Cookie folding on `opennextjs-cloudflare` | Fixed upstream (PR #497, March 2025) | Well before this repo's pinned `1.20.2` (current, per `apps/web/package.json`) | The historical bug is not expected to reproduce, but the *safe pattern* (`NextResponse.next({request})`, never a fresh `NextResponse`) costs nothing to keep following defensively |

**Deprecated/outdated:**
- Supabase's `getSession()` for server-side auth checks — superseded by `getClaims()`/`getUser()` per Supabase's own current security guidance (already correctly called out in this project's `STACK.md`).

## Decisions taken here

| # | Decision | Chosen | Rejected | Why | Depended on by |
|---|---|---|---|---|---|
| D-01 | Phase 5 route scope | The 11 no-live-booking-state content pages (about, become-a-partner, cancellation, contact, cookies, faq, imprint, privacy, terms, sign-in, reset-password) + home — not all 18 `PUBLIC_ROUTES` entries | Porting all 18 pages now, including account/bookings/booking-detail/manage-booking/checkout/confirmation | The goal sentence itself ("every public mock that doesn't depend on live booking state") is the filter, corroborated line-for-line by `REQUIREMENTS.md`'s own phase table (SITE-03→Phase 8, LIFE-04→Phase 9, PAY-*→Phase 7) | Every later decision's page inventory; the plan split below |
| D-02 | `@supabase/ssr` cookie-mutation shape in middleware | `NextResponse.next({ request })`, then `.cookies.set()` on the same instance | Constructing a fresh `NextResponse(body)` inside the auth-refresh path | `opennextjs-cloudflare` folded multiple `Set-Cookie` headers when a fresh response was constructed (issue #498/#501); the safe pattern is also Supabase's own documented shape, so following it costs nothing even though the specific bug is already fixed upstream | AUTH-03, every session-bearing request |
| D-03 | Server-side session check | `supabase.auth.getUser()` | `supabase.auth.getSession()` | `getSession()` server-side trusts an unverified cookie value; `getUser()` round-trips and verifies the JWT signature — already this project's own `STACK.md` position, reaffirmed here | AUTH-03, SiteHeader's signed-in branch, every RLS-adjacent read |
| D-04 | `customers` row creation at signup | An additive `SECURITY DEFINER` trigger on `auth.users` (`AFTER INSERT`), upserting `public.customers` by email | App-code upsert in a Route Handler called after `signUp()` resolves client-side | The trigger runs inside GoTrue's own transaction and can't be skipped by a dropped network request; app-code upsert would leave `auth.users` rows with no matching `customers` row, breaking every RLS policy that joins through `customers.user_id` | AUTH-01, every later phase's customer-scoped RLS reads |
| D-05 | `customers.full_name` source at signup | `raw_user_meta_data->>'full_name'`, set via `signUp()`'s `options.data` | Leaving it blank / a later profile-completion step | `customers.full_name` is `not null` with no default — the trigger must supply it in the same statement | D-04 |
| D-06 | Password-signup verification requirement | A brand-new password signup stays unverified until the confirmation email/link is completed; sign-in and OTP/magic-link are self-verifying | Treating every successful `signUp()`/`signInWithOtp()` call as equally "verified" | Matches the mock's own `AuthForm.dc.html` state machine (`verified = mode==='signin' \|\| method==='magic'`) exactly — a port of an existing decision, not a new invention | AUTH-01, Pitfall 4 |
| D-07 | Multi-language auth email mechanism | Supabase's **Send Email Hook** (full replacement of Supabase's own send) | Supabase Custom SMTP + Go-templated dashboard email (pointed at Resend's SMTP relay) | Custom SMTP is one template per project with no native per-locale branching — cannot satisfy CLAUDE.md's four-language law; the Hook fully replaces the send and lets Phase 5's own code choose the locale-correct template | AUTH-01, AUTH-02 |
| D-08 | Locale carried to the Send Email Hook | `user_metadata.locale`, set at `signUp()`/`signInWithOtp()` time from the `[locale]` segment the form was submitted from | Detecting locale inside the hook (e.g. from `email_data.site_url` or `Accept-Language`) | The hook has no request-time access to the visitor's browser locale — only what was stored on the user at signup; storing it explicitly once removes any guessing | D-07; Open Question 3 |
| D-09 | Guest-booking → account linking (ADR-014 §2) | Satisfied for free by D-04's trigger (upsert by email) — no separate claim-flow code needed in Phase 5 | Building AUTH-06's UI/claim logic now | AUTH-06's *UI* ("we found bookings under this email") is Phase 8; the *data linking* already happens at signup because the trigger upserts by email regardless of whether a `customers` row pre-existed from a guest checkout | Phase 8 (AUTH-06), inherited for free |
| D-10 | Contact/become-a-partner submission storage | A new additive Phase 5 migration creating `contact_submissions` and `partner_applications` | Reusing an existing table, or skipping DB storage and only emailing | Neither table exists in Phase 2's 7 committed migrations; SITE-04's own success criterion requires the submission to "reach both the inbox and the database" even though LATER-05 defers the ops review-queue UI | SITE-04 |
| D-11 | Turnstile mode for these two forms | One always-on managed/invisible widget per form, verified server-side with a form-specific `idempotency_key` | Reusing Phase 4's three-layer escalating abuse system verbatim | Phase 4's system is sized for a pricing API hit repeatedly within seconds; a form submitted once per visitor doesn't need per-IP rate escalation infrastructure | SITE-04 |
| D-12 | Caching strategy for the content pages | Plain dynamic SSR reading through `publicSql` (Phase 3's 60s-cached `HYPERDRIVE` binding); no Next.js ISR | Building OpenNext's ISR (R2 + Durable Object queue + D1/DO tag cache) | None of the required ISR bindings exist in `wrangler.jsonc` today; Hyperdrive's own query cache already covers this phase's read volume; true ISR is deferrable to Phase 10 if LAUNCH-01's 10k-concurrent target needs it | SITE-01, SITE-07 |
| D-13 | FAQ + reviews data source on the home page | Read directly from `content_strings`/`reviews` via `publicSql`, now, in Phase 5 | Waiting for Phase 6's `t()`-loader swap (I18N-07) to reach these two sections | SITE-01 requires DB-backed FAQ/reviews now; Phase 6's swap is platform-wide and not a Phase 5 dependency — the rest of the site's copy legitimately stays on the JSON `t()` loader during this window, which is a deliberate two-source design, not a bug | SITE-01 |
| D-14 | SiteHeader signed-in branch | Built in Phase 5, driven by a real session (`getUser()` read server-side, passed down; sign-out via a Server Action) | Leaving it as Phase 1's stub | Phase 1's own header comment documents this as a deliberate, named Phase 5 stub — it is not optional scope, it is where AUTH-04 ("sign out from any page") is actually satisfied | SITE-02, AUTH-04 |
| D-15 | Currency display on Phase 5's own pages | Stays a pure client-state, mark-only swap (Phase 1 D-16 / ADR-001) | Applying ADR-014 §1's "Stripe FX changes the number" correction here | ADR-014 §1's correction is scoped to Checkout (Phase 7); none of Phase 5's pages render a live, chargeable price | Defensive scope clarification only |
| D-16 | Imprint's language-completeness marker | Port as `en de` (two languages), not `en de fr ar` | Carrying the mock's `data-vt-legal="en de fr ar"` value forward unchanged | The mock's own imprint content is explicitly bilingual-only ("Deutsch ist die verbindliche Fassung") via a `data-lang="de"\|"en"\|"both"` toggle with no French/Arabic branch — carrying the claim forward would ship a false four-language claim, exactly what I18N-08 forbids | SITE-05, I18N-08 |
| D-17 | `next/image` real resizing | Add `images.binding = "IMAGES"` to `apps/web/wrangler.jsonc` before shipping real photography on any Phase 5 marketing page | Leaving it as-is | Phase 1's own research already found `/_next/image` returns 200 with the *original, unresized* file without this binding — a silent, easy-to-miss defect if Phase 5 ships photography without checking it first | About/become-a-partner/contact hero images |
| D-18 | Isolation-probe re-pointing (Phase 3's deferred U31/ISOL-08) | Treated as **not automatically resolved** by Phase 5 — verify explicitly during planning, see Uncertain U-08 | Assuming Phase 5 automatically satisfies Phase 3's deferred item | Phase 5's identity-touching writes (the `customers` trigger, `asAnon` form writes) don't obviously match Phase 3's own stated example target (`/api/account/bookings`, a `withIdentity`-gated read); needs an explicit planning-time check, not an assumption | Phase 3's own deferred item — flagged, not silently claimed |
| D-19 | Booking widget on the home page | Stays exactly what Phase 1 shipped (a stub) until Phase 4 supplies the real widget | Building or modifying quote/pricing logic in Phase 5 | Phase 5's own scope is the page shell, hero, sections and Reviews/FAQ wiring — `/api/quote` and the widget's real interactivity are Phase 4's parallel deliverable, explicitly out of this phase's boundary | SITE-01 |
| D-20 | Phone/WhatsApp constants on the contact page | Reuse the exact constant already established in `apps/web/components/shell/SiteHeader.tsx` (`PHONE_HREF`), and add a `WHATSAPP_HREF` following the same pattern | Re-deriving the phone number/WhatsApp link independently on the contact page | One source of truth for a number that appears on both the header and the contact page avoids the two ever drifting | SITE-09 |
| D-21 | `PhoneVerify.dc.html` | Not ported in Phase 5 | Porting it alongside AuthForm/ResetForm since it sits in the same `app/pages/` folder | LATER-03 explicitly defers phone-number verification/social sign-in — porting the component would be building V2 scope inside a V1 phase | — |
| D-22 | `CookieBanner.dc.html` | Not built in Phase 5 | Building it since Phase 5 already touches consent-adjacent territory (contact-form submissions) | SITE-08 is explicitly Phase 10 in `REQUIREMENTS.md`'s own traceability table; `consent_log`'s method vocabulary (Phase 2 §11) is purpose-built for the banner's four categories, not a generic form-consent mechanism Phase 5's forms should reuse | — |

## UNCERTAIN — must be settled before or during execution

| # | Item | Why uncertain | The check that settles it | Blocks |
|---|---|---|---|---|
| U-01 | Whether contact/partner-application writes should go through `asAnon` (Phase 3's existing anonymous wrapper) or a new `SECURITY DEFINER` RPC, and what grant a brand-new table needs on the `vamos_edge`/anonymous path | Phase 3's `publicSql` table allowlist doesn't include these new tables (confirmed, Pitfall 3); `asAnon`'s own grant surface for a table Phase 3 never anticipated isn't pinned down in Phase 3's own research beyond "the anonymous wrapper on `HYPERDRIVE_NOCACHE`" | Read Phase 3's committed `asAnon` implementation once it exists; if it doesn't already grant broadly, the Phase 5 migration adding `contact_submissions`/`partner_applications` must also add the specific `INSERT` grant for the role `asAnon` runs as | The contact/partner-application Route Handlers |
| U-02 | Whether Supabase's Send Email Hook can reliably target a Route Handler on staging's current `*.workers.dev` URL (no custom domain yet), within Supabase's hook-call timeout | Supabase's dashboard/docs give the hook mechanism but not a stated timeout figure, and this project has no custom domain until Phase 11 | Once a Supabase project's Auth settings are reachable (owner-gated), register the hook against the deployed staging Worker URL and send one real test signup, timing the round trip; read the timeout value from the dashboard's own hook configuration screen | AUTH-01/AUTH-02 email delivery |
| U-03 | Whether the Supabase project's "Confirm email" toggle already defaults correctly (matching D-06's requirement) or needs explicit configuration | The setting lives in the dashboard, is owner-gated, and its default has changed across Supabase product versions | Check the toggle directly once the project's Auth settings are reachable; write a Playwright/integration assertion that a fresh password signup does *not* yield a usable session until confirmed | AUTH-01 |
| U-04 | Whether one Turnstile site key/secret pair can validly serve both the contact form and the become-a-partner form | Cloudflare's dashboard analytics/reporting model for multiple `action` values on one widget isn't confirmed against this project's own needs | Once Turnstile is provisioned (owner-gated), configure one widget with two `action` values and check the dashboard's per-action breakdown before deciding whether a second widget is needed | SITE-04 |
| U-05 | Whether `packages/emails`' full React Email toolchain should be stood up in Phase 5 (first phase needing any transactional email) or deferred to Phase 7 | `.claude/CLAUDE.md` names the architecture but the package is currently an empty scaffold; sequencing is a planner call, not a technical constraint | Planner decision at Phase 5 planning time — no external check settles this, it is a scope/sequencing choice, not an unknown fact | Auth email templates now vs. Phase 7's confirmation/voucher email |
| U-06 | Whether terms/privacy/cookies/cancellation's `data-vt-legal="en de fr ar"` claim is actually true in the dictionary, not merely "not disproven by the bilingual-span check that caught imprint" | The bilingual-span check (grep for `lang="de"`/`lang="fr"`/`lang="ar"`) only catches imprint's specific broken mechanism; it does not positively prove full key coverage for the other four, much larger pages (380–445 lines each) | Run a scripted key-coverage audit (extending `scripts/check-i18n-coverage.mjs`'s pattern) scoped to each legal page's own key namespace before trusting the claim at face value | SITE-05, I18N-08 |
| U-07 | Whether Turnstile's `action` parameter is required (vs merely convenient) to distinguish the contact form's submissions from become-a-partner's in Cloudflare's own analytics | Cheap to add, not confirmed as required by anything this phase must pass | Read Cloudflare's Turnstile analytics dashboard once provisioned; add the parameter regardless since it is zero-cost | SITE-04, tied to U-04 |
| U-08 | Whether Phase 3's `force-dynamic` CI grep (built for identity-wrapper imports) already covers files importing `publicSql`/`asAnon`, and whether any of Phase 5's own routes are "the real product route" Phase 3's deferred U31/ISOL-08 item meant | Phase 3's grep is scoped to "every file importing an identity wrapper" against its own five-name list (`asCustomer`/`asStaff`/`asGuest`/`asAnon`/`asQuote`) — `asAnon` is in that list, so it likely already covers Phase 5's form routes; `publicSql` is not one of the five named wrappers, so content pages using it may need the grep extended | Read Phase 3's actual committed grep pattern once it lands; if `publicSql` imports aren't covered, extend the grep in the same Phase 5 plan that first imports it | D-18, SITE-01/SITE-04 routes; the isolation-harness re-pointing decision |

## Owner blockers that touch this phase

### 1. Supabase Auth, Resend and Cloudflare Turnstile as live, dashboard-configurable services — open

Phase 2 D-37 confirms the **Postgres half** of the Supabase project already exists (ref `yaumjzvylngfjhtuffqs`, Zurich region), but the DB password and dashboard access are owner-held, and no prior phase has touched Auth-specific settings at all. Phase 5 is the **first** phase that genuinely needs: the "Confirm email" toggle (U-03), the Send Email Hook registration (U-02), a live Resend account and API key (ADR-014 §4: "owner creates when asked" — not yet created), and a live Cloudflare Turnstile site key/secret pair (U-04). None of these block *writing* the code — local `supabase start` and Cloudflare's documented always-pass Turnstile test keys unblock implementation — but AUTH-01/AUTH-02/SITE-04 cannot be verified **end-to-end** until all three exist.

### 2. Qurova webfont licence — open (ADR-014 §7)

Still open ("keep this item open until the purchase lands"). Every Phase 5 page renders Qurova display type exactly as every other ported page does; Phase 1's fallback-comparison mechanism applies unchanged. No new decision needed in this phase.

### 3. Vehicle and destination photography — open

`about.dc.html`/`become-a-partner.dc.html`/`contact.dc.html` may use hero photography. Only one reference photograph is vendored (`hero-arrivals.jpg`, proven working with `next/image` in Phase 1 Plan 05 Task 3 — see D-17). Phase 5 must use that one photograph or a labelled placeholder, never invented stock imagery, on any page that would otherwise want a second image.

### 4. `vamostaxi.eu` DNS / Cloudflare zone — open

Staging still deploys to `*.workers.dev` (Phase 1's recorded deviation); no zone exists yet. This directly touches U-02 (Send Email Hook reachability) — if the hook needs a stable, non-`*.workers.dev` hostname to register reliably, this blocker becomes load-bearing rather than cosmetic. `apps/web/lib/metadata.ts`'s `SITE_URL` constant already hardcodes the eventual production domain regardless of what's currently live, which is correct to keep unchanged.

### 5. Imprint street/postcode and other legal TBCs — open (ADR-014 §7: "Imprint street/postcode — Stays TBC")

Already carried as `data-tok` pills in the mock (`app/pages/imprint.dc.html`). Phase 5 ports the pill mechanism exactly as it exists; this is not new work, it is the Law 04 discipline continuing to apply.

### 6. CHF price matrix — not blocking this phase

Irrelevant to every one of Phase 5's own pages (no pricing renders on legal/about/contact/auth pages). The one connection point — the home page's booking widget — is explicitly Phase 4's concern (D-19); Phase 5 does not touch it.

## Proposed Phase 5 plan split

Eight plans across three waves. **P1 is a soft gate for the auth-flow plans** (P2/P3/P4 all read the same client factories P1 creates) but **not** for the content-only plans (P5/P6/P7), which touch none of Auth and can start immediately. **P8 is a hard gate in the other direction** — it is the cross-cutting SEO/metadata/validation pass and needs every other plan's real pages to exist first, mirroring how Phase 2's `P6` (RLS) had to run after every table existed.

| # | Plan | Goal (one line) | File scope | Depends on | Parallel with |
|---|---|---|---|---|---|
| **P1** | **Supabase Auth foundation** | Client factories, the `@supabase/ssr` middleware session-refresh composed with next-intl's existing routing, the sign-out Server Action, and the additive `customers`-linking trigger migration + pgTAP (D-02/D-03/D-04/D-05) | `apps/web/lib/supabase/{server,client,middleware}.ts`, `apps/web/middleware.ts` (extended), `packages/db/supabase/migrations/<ts>_customers_auth_link.sql`, `packages/db/supabase/tests/customers_link_trigger.test.sql` | Phase 2 (`customers` table), Phase 3 (`@supabase/ssr` peers only — no Hyperdrive call in this plan) | P5, P6, P7 |
| **P2** | **Auth pages & flows** | Sign-in/sign-up/reset-password routes; `AuthForm`/`ResetForm` ports covering password + OTP + magic-link + forgot-password; the mock's own verification-state logic (D-06); Playwright coverage for AUTH-01/02/03/04's happy paths | `apps/web/app/[locale]/{sign-in,reset-password}/page.tsx` (+ `sign-up` if the planner splits it — Open Question 1), `apps/web/components/auth/{AuthForm,ResetForm}.tsx`, `apps/web/tests/integration/auth-*.spec.ts` | P1 | P3, P4 |
| **P3** | **Locale-correct auth email** | The Send Email Hook route, `standardwebhooks` signature verification, `packages/emails` template scaffold in four languages, locale stashed at signup (D-07/D-08) | `apps/web/app/api/auth/email-hook/route.ts`, `packages/emails/templates/auth-*.{en,de,fr,ar}.*` | P1 (needs `signUp()`/`signInWithOtp()` calls to exist so `user_metadata.locale` has somewhere to be set) | P2, P4 |
| **P4** | **SiteHeader signed-in branch** | Avatar disc, account menu, "verify your email" notice (the booking-attached notice stays deferred — no bookings exist until Phase 7+), sign-out wiring, extended component screenshot baselines | `apps/web/components/shell/SiteHeader.tsx` (extended), `apps/web/tests/visual/shell.spec.ts` (extended) | P1 | P2, P3 |
| **P5** | **Content pages** | About/FAQ/terms/privacy/cookies/cancellation/imprint ported to SSR, i18n keys added, imprint's `data-vt-legal` corrected to `en de` (D-16), responsive audit at 1440/1024/768/390 | `apps/web/app/[locale]/{about,faq,terms,privacy,cookies,cancellation,imprint}/page.tsx`, `apps/web/i18n/messages/*.json` (extended), `apps/web/tests/visual/legal.spec.ts` | Phase 1 (shell, i18n runtime) — no Phase 5-internal dependency | P1, P6, P7 |
| **P6** | **Home DB wiring** | Reviews + FAQ sections reading via `publicSql` (D-13), hero/sections layout port, booking-widget shell left untouched (D-19) | `apps/web/app/[locale]/page.tsx` (extended), `apps/web/components/home/{Reviews,FAQ}.tsx` (new), `apps/web/tests/integration/home-content.spec.ts` | Phase 2 (`reviews`/`content_strings` tables), Phase 3 (`publicSql`) — no Phase 5-internal dependency | P1, P5, P7 |
| **P7** | **Contact & become-a-partner** | New additive migration (`contact_submissions`, `partner_applications`), Turnstile verify helper + widget wiring, `asAnon` write path, Resend notification email, phone/WhatsApp links (D-10/D-11/D-20) | `apps/web/app/[locale]/{contact,become-a-partner}/page.tsx`, `apps/web/app/api/{contact,partner-application}/route.ts`, `packages/db/supabase/migrations/<ts>_contact_forms.sql`, `apps/web/lib/turnstile.ts` | Phase 3 (`asAnon`) — no Phase 5-internal dependency | P1, P5, P6 |
| **P8** | **SEO, metadata & cross-cutting gate** | Extend `PUBLIC_ROUTES`/`buildAlternates`/`sitemap.ts` for every real page P2/P5/P6/P7 landed, `images.binding = "IMAGES"` wrangler fix (D-17), `scripts/check-legal-language-claims.mjs` (I18N-08, U-06), full four-viewport Playwright sweep, `pnpm i18n:check` green | `apps/web/lib/metadata.ts` (extended), `apps/web/app/sitemap.ts` (extended), `apps/web/wrangler.jsonc`, `scripts/check-legal-language-claims.mjs` | P2, P4, P5, P6, P7 (needs every real page to exist) | — |

```
P1 ──┬── P2 ──┐
     ├── P3 ──┼── P8
     └── P4 ──┤
P5 ───────────┤
P6 ───────────┤
P7 ───────────┘
```

Wave 1: **P1**, **P5**, **P6**, **P7** in parallel — P1 is the auth-foundation gate for Wave 2's auth plans, but has no dependency on P5/P6/P7 and they have none on it, so all four start together.
Wave 2: **P2**, **P3**, **P4** in parallel — each depends only on P1's client factories, and are otherwise file-disjoint (auth pages, the email hook, the header).
Wave 3: **P8** alone — deliberately last and not parallelised, mirroring Phase 2's own P6 reasoning: a cross-cutting pass over every route needs every route to exist first, or it either misses a page or has to be re-run.

## Open Questions

1. **Does Phase 5 build a `sign-up` route, or does `sign-in.dc.html`'s `AuthForm` handle all three modes (`signin`/`signup`/`forgot`) behind one route with a `mode` query param, matching the mock's own `data-props` (`mode: 'signin'|'signup'|'forgot'`)?**
   - What we know: the mock is one component (`AuthForm.dc.html`) with a `mode` prop, embedded identically in both `sign-in.dc.html` and (for the forgot-password case) `reset-password.dc.html`.
   - What's unclear: whether the production route tree should mirror that (one `/sign-in?mode=signup` route) or split into `/sign-in` + `/sign-up` + `/reset-password` for cleaner `hreflang`/analytics separation.
   - Recommendation: the planner decides route shape; either is compatible with everything else in this research. `apps/web/lib/metadata.ts`'s `PUBLIC_ROUTES` list already only has `/reset-password` and `/sign-in`, no `/sign-up` — extending that array (or not) is the concrete decision point.

2. **What happens to `coming-soon.dc.html`?**
   - What we know: it exists in `app/pages/`, is not referenced by any REQUIREMENTS.md ID, and is not in the ROADMAP's Phase 5 success criteria.
   - What's unclear: whether it was a design-phase placeholder that should simply not be ported, or whether the owner wants a maintenance/holding page kept in reserve.
   - Recommendation: flag for the owner rather than silently building or dropping it; it costs nothing to leave unbuilt until asked for.

3. **Exact shape of the `mode`/locale value stored at signup for the Send Email Hook to read.**
   - What we know: Supabase's `signUp()`/`signInWithOtp()` accept `options.data` which lands in `raw_user_meta_data`/`user_metadata`, readable by the hook.
   - What's unclear: whether to store the full `Locale` type (`'en'|'de'|'fr'|'ar'`) or reuse next-intl's own locale cookie value directly — they should be identical, but the plan should name the exact key (`user_metadata.locale`) once, so the trigger (D-04) and the hook (D-07) agree.
   - Recommendation: lock this as a plan-time decision, not left implicit.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Supabase's Send Email Hook can be pointed at an `apps/web/app/api/auth/email-hook` Route Handler served from staging's current `*.workers.dev` URL (no custom domain yet), and Supabase's hook-call timeout is generous enough for a cold Worker + Resend round trip | §UNCERTAIN U-02 | If the timeout is too tight or `*.workers.dev` is unreachable/blocked from Supabase's infrastructure, AUTH-01/02's emails silently never send — must be tested against a real deployed staging Worker before trusting the design |
| A2 | A new Supabase project's "Confirm email" setting needs to be explicitly turned on (matching the mock's password-signup verification requirement) rather than defaulting to on already | §Common Pitfalls, Pitfall 4; §UNCERTAIN U-03 | If it already defaults correctly, this is a no-op confirmation; if not confirmed, password signup could silently skip verification |
| A3 | One Cloudflare Turnstile site key/secret pair can safely serve both the contact form and the become-a-partner form (distinguished only by an `action` parameter), without needing two separate Turnstile widgets | §UNCERTAIN U-04, U-07 | If Cloudflare's dashboard/analytics genuinely require one widget per distinct page for meaningful reporting, Phase 5 needs a second `TURNSTILE_SITE_KEY`/`_SECRET` pair, a small but real scope addition |
| A4 | `packages/emails` should be stood up with its full React Email toolchain in Phase 5 (as the first phase that needs any transactional email at all), rather than Phase 5 shipping plain-string HTML and Phase 7 building the real toolchain | §UNCERTAIN U-05 | If the planner instead defers the toolchain, Phase 5's auth emails ship as unstyled HTML strings now and get re-templated in Phase 7 — extra rework, but not a correctness risk |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Everything | ✓ | v26.7.0 (>=22 required) | — |
| pnpm | Everything | ✓ | 11.7.0 (matches `packageManager` pin) | — |
| Supabase CLI | Local `supabase start`, migrations, pgTAP | ✓ | 2.109.1 | — |
| Wrangler | `opennextjs-cloudflare preview`/deploy | ✓ (via `pnpm --filter web exec wrangler`) | pinned `4.124.0` in `apps/web/package.json` | — |
| Supabase project (Postgres + Auth) | AUTH-01..04, `customers` linking trigger | Partial — project exists (ref `yaumjzvylngfjhtuffqs`, Zurich region, Phase 2 D-37) but the DB password/dashboard are owner-held (STATE.md blocker) and Auth-specific settings (Confirm email, Send Email Hook config, SMTP fallback) have not been reachable by any prior phase | — | None for full end-to-end verification; local `supabase start` (a fresh local instance) can still prove the migration/trigger logic and `@supabase/ssr` wiring against a local GoTrue, deferring only the *hosted* Auth-dashboard configuration (hook registration, email confirm toggle) the same way Phase 3 deferred its staging Hyperdrive measurement |
| Resend | Send Email Hook delivery, contact/partner notification | ✗ (not yet created — ADR-014 §4 "owner creates when asked") | — | Local dev: log the rendered email instead of sending; the hook/route code and templates are still fully buildable and testable without a live Resend account |
| Cloudflare Turnstile | Contact/become-a-partner form gating | ✗ (no site key/secret provisioned yet; Phase 4 may provision one first) | — | Local dev: Cloudflare's own documented Turnstile test keys (`1x00000000000000000000AA` sitekey / `1x0000000000000000000000000000AA` secret, always-pass) unblock local development without a real account |
| `vamostaxi.eu` DNS / Cloudflare zone | Real hostname for the Send Email Hook target, production `hreflang` canonical | ✗ (staging deploys to `*.workers.dev` per Phase 1's recorded deviation) | — | `SITE_URL` in `apps/web/lib/metadata.ts` already hardcodes the eventual production domain regardless of what's currently live — correct to keep; the Send Email Hook's own reachability (A1 above) is the actual open risk, not the canonical-URL metadata |

**Missing dependencies with no fallback:**
- A live, dashboard-configurable Supabase Auth (Confirm-email toggle, Send Email Hook registration) — blocks *end-to-end* verification of AUTH-01/02, though local `supabase start` unblocks *implementation*.

**Missing dependencies with fallback:**
- Resend (log-instead-of-send locally).
- Turnstile (Cloudflare's documented always-pass test keys locally).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Playwright `1.62.1` (visual + integration, existing) + pgTAP via `supabase test db` (existing) + no unit-test runner installed yet (Vitest absent repo-wide as of this research date — Phase 4's own research already flagged this and scheduled a Wave 0 install if Phase 4 lands its kernel first; Phase 5 either reuses that install or performs its own) |
| Config file | `apps/web/playwright.config.ts` (existing, four-viewport matrix 1440/1024/768/390 already defined); `packages/db/supabase/config.toml` (existing) |
| Quick run command | `pnpm --filter web exec playwright test tests/visual/<new-spec>.spec.ts` (single page) / `pnpm --filter @vamos/db run test:db <path>` (single pgTAP file) |
| Full suite command | `pnpm test:visual` (repo root) + `pnpm db:test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|--------------------|-------------|
| SITE-01 | Home renders with reviews/FAQ from DB | integration | `pnpm --filter web exec playwright test tests/integration/home-content.spec.ts` | ❌ Wave 0 |
| SITE-02 | Every page carries SiteHeader/SiteFooter | visual | extends existing `tests/visual/shell.spec.ts` | Partially — file exists, needs new page assertions |
| SITE-04 | Contact/partner forms reach inbox + DB | integration | `pnpm --filter web exec playwright test tests/integration/contact-form.spec.ts` (mock Resend + a real local Postgres insert check) | ❌ Wave 0 |
| SITE-05 | Legal pages render with `data-tok`/`data-vt-legal` correct | visual + a scripted grep | `pnpm --filter web exec playwright test tests/visual/legal.spec.ts` + `node scripts/check-legal-language-claims.mjs` (new) | ❌ Wave 0 |
| SITE-06 | No horizontal scroll at 390px on any new page | visual | reuses `playwright.config.ts`'s existing four-viewport `toHaveScreenshot` pattern | Framework exists, specs new |
| SITE-07 | SSR + hreflang correct | integration | extends existing `tests/integration/ssr-locale.spec.ts` pattern (Phase 1) | Pattern exists, needs new page coverage |
| SITE-09 | Phone/WhatsApp/contact reachable | visual | part of `tests/visual/shell.spec.ts` or a dedicated `contact.spec.ts` | ❌ Wave 0 |
| AUTH-01 | Sign up (password + OTP) creates session + `customers` row | integration + pgTAP | Playwright against local `supabase start`; pgTAP `customers_link_trigger.test.sql` | ❌ Wave 0 (both) |
| AUTH-02 | Password reset from emailed link | integration | Playwright driving `resetPasswordForEmail()` + a logged/mocked email capture | ❌ Wave 0 |
| AUTH-03 | Session survives refresh | integration | Playwright: sign in, reload, assert still authenticated | ❌ Wave 0 |
| AUTH-04 | Sign out from any page | integration | Playwright: sign in, navigate to an arbitrary page, sign out, assert redirected/cleared | ❌ Wave 0 |
| I18N-08 | Legal page under-coverage is declared, not hidden | pgTAP/script | `node scripts/check-legal-language-claims.mjs` asserting `imprint` ≠ `"en de fr ar"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the single relevant Playwright spec or pgTAP file (`pnpm --filter web exec playwright test <file>` / `pnpm db:test <file>`).
- **Per wave merge:** `pnpm test:visual` + `pnpm db:test` + `pnpm i18n:check` (existing, blocking, Phase 1 D-39).
- **Phase gate:** full suite green (including the existing 373-baseline component diff suite, which must stay green — Phase 5 must not regress Phase 1's port) before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `apps/web/tests/integration/home-content.spec.ts` — covers SITE-01
- [ ] `apps/web/tests/integration/contact-form.spec.ts` — covers SITE-04
- [ ] `apps/web/tests/visual/legal.spec.ts` — covers SITE-05, SITE-06
- [ ] `apps/web/tests/integration/auth-*.spec.ts` (signup, reset, refresh, sign-out) — covers AUTH-01..04
- [ ] `packages/db/supabase/tests/customers_link_trigger.test.sql` — covers the new D-04 trigger
- [ ] `scripts/check-legal-language-claims.mjs` — covers I18N-08, extends the Phase 1 i18n-coverage-check pattern
- [ ] Vitest install — only if not already landed by a parallel Phase 4 plan; check before adding a second install

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Supabase Auth (GoTrue) — password + email OTP, `@supabase/ssr` for session handling; never hand-rolled credential storage |
| V3 Session Management | yes | httpOnly, `SameSite`-scoped Supabase session cookies via `@supabase/ssr`; server-side `getUser()` verification, never trusting `getSession()` alone |
| V4 Access Control | yes | RLS policies already shipped in Phase 2 (`customers_select_own`, `customers_update_own`) gate what a signed-in customer can read/write; Phase 5 adds no new table without an equivalent policy |
| V5 Input Validation | yes | `zod` schemas on contact/partner-application payloads and the Send Email Hook's inbound JSON |
| V6 Cryptography | yes | Never hand-rolled — `standardwebhooks` for hook-signature verification (HMAC via the Standard Webhooks library), Supabase's own bcrypt/argon2 for password hashing (never touched by app code), SHA-256 manage-token hashing (Phase 2, unrelated to this phase but the same discipline) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Session-cookie forgery / replay | Spoofing | `getUser()` server-side JWT verification on every privileged read; never trust a cookie's claims without it |
| Cookie-folding silently dropping a `Set-Cookie` (Pitfall 1) | Denial of Service (session never actually establishes) | `NextResponse.next({request})` pattern, never a fresh `NextResponse` in the auth-refresh path |
| Forged Send Email Hook calls (an attacker POSTing directly to `/api/auth/email-hook` to trigger arbitrary sends or probe user existence) | Spoofing, Information Disclosure | Mandatory `standardwebhooks` signature verification before any branch reads the payload; reject unsigned/mis-signed requests with a generic 401 |
| Turnstile-bypass spam on contact/partner forms | Denial of Service, Elevation of Privilege (spam reaching the owner's inbox and the DB) | Server-side `siteverify` call before any write — never trust a client-supplied "verified" flag |
| Email enumeration via differing error messages on sign-up ("this email already exists" vs generic) | Information Disclosure | Match the mock's own `AuthForm.dc.html` pattern: a distinguishing "this email already has an account" banner is a deliberate mock UX choice (not a generic-error default) — confirm with the planner whether this is an accepted tradeoff (better UX) or should be softened for launch, since Supabase's own guidance generally favors non-distinguishing responses for `signUp()` |
| `customers` row hijack via the linking trigger's `ON CONFLICT` (an attacker signing up with a victim's already-guest-booked email to claim their bookings) | Spoofing, Elevation of Privilege | The trigger only updates `user_id` `where customers.user_id is null` — a second signup attempt against an already-linked email cannot re-target it; the real proof-of-ownership gate is Supabase's own email-verification step (Pitfall 4) happening *before* the session (and thus the trigger's effect) is usable |

## Sources

### Primary (HIGH confidence)
- `supabase.com/docs/guides/auth/server-side/nextjs` — `@supabase/ssr` middleware cookie pattern, `getUser()` vs `getSession()`.
- `supabase.com/docs/guides/auth/auth-hooks/send-email-hook` — Send Email Hook trigger events, payload shape, full-replacement behavior, localization example.
- `supabase.com/docs/guides/auth/auth-hooks` — Standard Webhooks signature spec, header names, secret format.
- `resend.com/docs/send-with-nextjs` — official `resend` npm package name and install command.
- `resend.com/docs/send-with-supabase-smtp` — Custom SMTP configuration and its lack of native localization (informs the Alternatives Considered rejection).
- `opennext.js.org/cloudflare/bindings`, `opennext.js.org/cloudflare/caching` — `getCloudflareContext()` usage, ISR binding requirements (R2/DO/D1), confirming Phase 5 does not need to build ISR infrastructure.
- `github.com/opennextjs/opennextjs-cloudflare` issues #498/#501 (via GitHub API, unauthenticated) — the cookie-folding bug, its root cause, and fix PR #497 (merged 2025-03-25, predating this repo's pinned adapter version).
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-SCHEMA-DRAFT.md` §5, §8, §14a — `customers` table shape, manage-token RLS/RPC split, customer RLS policies (all already-designed, read directly, not re-derived).
- `.planning/phases/03-hyperdrive-data-access-wiring/03-CONTEXT.md` — `publicSql`'s exact table allowlist, `asAnon`/`asCustomer` wrapper shapes, and the explicit deferred item naming Phase 5 as the owner of re-pointing the isolation harness at a real product route.
- `apps/web/components/shell/SiteHeader.tsx`, `.planning/phases/01-.../01-13-SUMMARY.md` — direct confirmation that the signed-in header branch is an unported, documented Phase 5 stub.
- `apps/web/lib/metadata.ts` — the existing `PUBLIC_ROUTES`/`buildAlternates` scaffold Phase 5 extends.
- `app/pages/imprint.dc.html`, `app/pages/AuthForm.dc.html` — direct file reads confirming the `data-vt-legal` discrepancy and the auth-mode/verification state machine.
- npm registry (`npm view`, `curl api.npmjs.org/downloads`) — all five package versions/download counts, 2026-08-24.

### Secondary (MEDIUM confidence)
- WebSearch results on `signInWithOtp`/`verifyOtp` (magic link and OTP share one mechanism, template-controlled) — cross-referenced against `supabase.com/docs/reference/javascript/auth-signinwithotp` in the search summary, not independently WebFetched in full.
- `developers.cloudflare.com/turnstile/get-started/server-side-validation/` — siteverify contract, fetched but did not cover React/Next.js widget rendering specifics or secret-rotation guidance (flagged as a coverage gap in the fetch itself).

### Tertiary (LOW confidence)
- The "current active `resend` npm line begins Dec 2022" dating is inferred from `npm view resend time` output, not an official Resend company-history page — flagged in the Package Legitimacy Audit note rather than stated as verified history.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package version-verified live against the npm registry and cross-checked against official docs; slopcheck clean on all five.
- Architecture: MEDIUM-HIGH — the RLS/Hyperdrive/binding half is HIGH (built directly on Phase 2/3's already-committed, already-reviewed design); the OpenNext cookie-handling and Send Email Hook half is MEDIUM (correct per official docs, not yet proven against this repo's own deployed staging Worker — see Assumption A1).
- Pitfalls: MEDIUM-HIGH — Pitfalls 1–3 are grounded in direct file reads of this repo plus an authoritative GitHub issue/PR trail; Pitfall 4 is a documented Supabase behavior not yet confirmed against this specific project's dashboard (owner-gated).

**Research date:** 2026-08-24
**Valid until:** ~2026-09-23 (30 days) for the architecture/pattern guidance; the specific package versions in the Standard Stack table should be re-verified at Wave 0 regardless, since this phase may not execute immediately.

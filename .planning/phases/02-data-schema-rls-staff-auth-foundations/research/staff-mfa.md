I now have sufficient material to write the complete brief.

---

# Research Brief: Staff Invitation + TOTP MFA (AUTH-05) — Supabase Auth on Next.js/Cloudflare Workers

**Lane:** staff-mfa · **Phase:** 2 (Data Schema, RLS & Staff Auth Foundations) · **Prepared:** 2026-08-21

## RECOMMENDATION

Use **one Supabase project** (no second project) for both customers and staff. Separate them by a **`role` custom claim populated by a Custom Access Token Hook that reads from an app-owned `staff` table** (never `user_metadata`, never `app_metadata` set client-side). Staff accounts exist **only** via `supabase.auth.admin.inviteUserByEmail()` from a server route protected by the service-role key — public self-signup stays enabled for customers (AUTH-01) and is never touched or disabled globally. Staff MFA is enforced in **three independent layers** that must all agree: (1) a Postgres RLS `RESTRICTIVE` policy requiring `aal2` on every ops table, (2) Next.js middleware checking `role` + `aal` before letting a request reach `/(ops)/ops/*`, and (3) the invite/claim flow itself refuses to mark a staff account "active" until TOTP enrollment completes. Do not trust RLS alone or middleware alone — Cloudflare Workers cookie handling has an open, unfixed multi-cookie folding bug that can silently degrade a session, so the DB-level policy is the backstop of record.

---

## 1. Invite-only for staff, self-serve for customers — same project

**Do not use the dashboard's global "Allow new users to sign up" (email provider) toggle to gate staff.** That toggle is project-wide — disabling it blocks customer self-signup too (violates AUTH-01). Staff and customers are separated by **how the account gets created**, not by a signup switch:

- **Customers**: normal `supabase.auth.signUp()` / OTP flow from the public site, provider signups stay enabled.
- **Staff**: created *exclusively* server-side via the Auth Admin API, which bypasses the public signup form entirely:

```ts
// app/(ops)/ops/api/staff/invite/route.ts — service-role only, never exposed to the browser
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // service_role — server-only secret
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: Request) {
  // TODO: gate this route itself behind an existing admin's aal2 session (see §4)
  const { email, role } = await req.json() // role: 'dispatcher' | 'admin'

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: 'https://vamostaxi.eu/ops/accept-invite',
    data: { invited_role: role }, // user_metadata — DISPLAY ONLY, see §3 warning
  })
  if (error) return Response.json({ error: error.message }, { status: 400 })

  // Authoritative role assignment goes in an app table, never in user_metadata.
  await supabaseAdmin.from('staff').insert({
    user_id: data.user.id,
    role,               // 'dispatcher' | 'admin'
    invited_by: /* current admin's uid */ null,
    mfa_enrolled: false,
  })
  return Response.json({ ok: true })
}
```

`inviteUserByEmail(email, options)` requires the `service_role` key and must run server-side only ([Supabase JS reference](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail)). `options.data` sets `user_metadata` (cosmetic — "invited as dispatcher" for the accept-invite screen copy); it is **not** the authorization source.

**One project vs. two — settled: one project.** A second Supabase project buys nothing here: RLS + a role claim already gives a hard boundary (DATA-04), and a second project would mean two Postgres databases, two Hyperdrive bindings, duplicated migrations, and no way to FK ops tables (`chauffeurs.vehicle_id`, `bookings.assigned_chauffeur_id`) against a shared `auth.users`. Keep one project; the role table + hook is the separation mechanism.

**Optional hardening (not required for launch, cheap to add now):** a `before_user_created` Auth Hook that blocks public self-signup for any address that happens to collide with a domain you reserve for staff, so a staff member can never accidentally create a *customer* account with their work email before being invited. Supabase's documented pattern for this is a `signup_email_domains` allow/deny table:

```sql
create or replace function public.hook_restrict_signup_by_email_domain(event jsonb)
returns jsonb language plpgsql as $$
declare
  domain text := split_part(event->'user'->>'email', '@', 2);
begin
  if exists (select 1 from public.signup_email_domains where type = 'deny' and lower(domain) = lower(domain)) then
    return jsonb_build_object('error', jsonb_build_object(
      'message', 'Signups from this email domain are not allowed.', 'http_code', 403));
  end if;
  return '{}'::jsonb;
end $$;

grant execute on function public.hook_restrict_signup_by_email_domain to supabase_auth_admin;
revoke execute on function public.hook_restrict_signup_by_email_domain from authenticated, anon, public;
```
```toml
# supabase/config.toml
[auth.hook.before_user_created]
enabled = true
uri = "pg-functions://postgres/public/hook_restrict_signup_by_email_domain"
```
This is a nice-to-have, not the invite gate itself — skip it for Phase 2 unless the owner names a staff email domain.

---

## 2. TOTP MFA: enrol → challenge → verify, and AAL before/after

Reference: [Supabase Docs — Multi-Factor Authentication (TOTP)](https://supabase.com/docs/guides/auth/auth-mfa/totp), [Supabase Docs — MFA overview](https://supabase.com/docs/guides/auth/auth-mfa).

```ts
// 1. Enrol (session already at aal1 after invite-accept password set)
const { data: enroll, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
// enroll = { id: factorId, totp: { qr_code, secret, uri } }

// 2. Challenge — issue a challenge for that factor
const { data: challenge } = await supabase.auth.mfa.challenge({ factorId: enroll.id })
// challenge = { id: challengeId, expires_at }

// 3. Verify — user enters the 6-digit code from their authenticator app
const { data: verify, error: verifyErr } = await supabase.auth.mfa.verify({
  factorId: enroll.id,
  challengeId: challenge.id,
  code: userEnteredCode,
})
// On success, verify contains a new session whose JWT has aal:"aal2"
```

Each TOTP code is valid for one 30-second interval plus one interval of clock skew.

**Login flow for an already-enrolled staff member** (every sign-in thereafter):

```ts
// After password/email sign-in, session is aal1
const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
// aal = { currentLevel: 'aal1', nextLevel: 'aal2' }

if (aal.nextLevel === 'aal2' && aal.currentLevel !== aal.nextLevel) {
  const { data: factors } = await supabase.auth.mfa.listFactors()
  const totp = factors.totp[0]
  const { data: challenge } = await supabase.auth.mfa.challenge({ factorId: totp.id })
  // → render TOTP entry screen, then call mfa.verify() as above with the user's code
}
```

**JWT before vs. after the second factor:**

| Claim | aal1 (password only) | aal2 (after TOTP verify) |
|---|---|---|
| `aal` | `"aal1"` | `"aal2"` |
| `amr` | `[{"method":"password","timestamp":...}]` | `[..., {"method":"totp","timestamp":...}]` |
| `role` (custom claim, §3) | present if staff row exists | unchanged — role is independent of aal |
| `session_id` | same session id | same session id (aal upgrade doesn't rotate the session) |

The app and the DB tell `aal1` from `aal2` apart by reading `auth.jwt() ->> 'aal'` in Postgres, or `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` / decoding the JWT's `aal` claim in the app — **never** by checking "does this user have a TOTP factor," because having a factor enrolled and having verified it *this session* are different facts.

**Enrolment must be mandatory, not optional, for staff.** Nothing in Supabase Auth itself blocks an invited user from skipping MFA setup — you must gate it in your own accept-invite flow: after the user sets a password, redirect straight into the enrol → verify sequence above and only then flip `staff.mfa_enrolled = true`. Until that flag is true, treat the account as not-yet-usable for ops (the RLS policy in §4 checks `aal2` regardless, so an unenrolled staff account simply can never reach ops data — the flag is for UX, not security).

---

## 3. The `role` claim — custom access token hook, and what must not be trusted

Reference: [Supabase Docs — Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook), [Supabase Docs — Custom Claims & RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac).

**Tamper-proof mechanism: a Postgres Auth Hook writing into `app_metadata`, sourced from an app-owned table — not `user_metadata`.**

- `user_metadata` is writable by the end user via `supabase.auth.updateUser({ data: {...} })` from the client. **A customer or a compromised staff session could set `user_metadata.role = 'admin'` themselves.** Never read `user_metadata` in any authorization check, RLS policy, or middleware gate — explicit warning, confirmed against docs.
- `app_metadata` is server-only to write directly, but a Custom Access Token Hook is the correct way to *derive* it fresh on every token mint, rather than trusting whatever was last written to `auth.users.raw_app_meta_data` (which is still writable by anyone holding the service-role key, i.e. your own backend bugs). Deriving it from a real `staff` table each time means revoking a staff member is instant — their very next token mint reflects it, no stale claim.

```sql
-- staff table: authoritative role source
create table public.staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('dispatcher', 'admin')),
  invited_by uuid references auth.users(id),
  mfa_enrolled boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.staff enable row level security;
-- no policies granted to authenticated/anon — only supabase_auth_admin (via the hook) and
-- service_role (via the invite route) ever touch this table.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  staff_role text;
begin
  select role into staff_role
  from public.staff
  where user_id = (event->>'user_id')::uuid;

  claims := event->'claims';
  if staff_role is not null then
    claims := jsonb_set(claims, '{app_metadata,role}', to_jsonb(staff_role));
  end if;
  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
-- the hook function must be able to read the staff table as supabase_auth_admin:
grant select on table public.staff to supabase_auth_admin;
```

```toml
# supabase/config.toml — local dev; in prod, enable via Dashboard → Authentication → Hooks
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

Reading the claim, client-side (display only, never authorization) and server-side:

```ts
import { jwtDecode } from 'jwt-decode'
const claims = jwtDecode(session.access_token)
const role = claims.app_metadata?.role   // 'dispatcher' | 'admin' | undefined
```

**UNCERTAIN — check before relying on it:** the exact dashboard path for enabling a Postgres-function hook in production is "Authentication → Hooks (Beta)" per current docs; Beta labeling suggests the UI/toolchain may shift before this project ships — confirm the current dashboard screen when this is actually wired in Phase 2/3 implementation, and pin the Supabase CLI/project config version used.

---

## 4. RLS policy and Next.js middleware — both must check "is staff AND aal2"

### Postgres RLS (the source of truth — DATA-04 + AUTH-05)

Reference: [Supabase Blog — MFA enforcement via RLS](https://supabase.com/blog/mfa-auth-via-rls).

```sql
-- Applied to every ops-only table: chauffeurs, vehicles, vehicle_classes, assignments,
-- distance_rates, fixed_routes, surcharges, coupons, coupon_redemptions, content_strings,
-- settings (write), staff. Customer tables get the DATA-02/DATA-03 policies instead.

create policy "ops_staff_read"
  on public.chauffeurs
  as restrictive
  for select
  to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('dispatcher', 'admin')
    and (auth.jwt() ->> 'aal') = 'aal2'
  );

create policy "ops_admin_write"
  on public.chauffeurs
  as restrictive
  for insert, update, delete
  to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    and (auth.jwt() ->> 'aal') = 'aal2'
  )
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    and (auth.jwt() ->> 'aal') = 'aal2'
  );
```

`as restrictive` is required — Postgres combines multiple `PERMISSIVE` policies with `OR`, so a customer-facing permissive policy elsewhere on the same table could silently satisfy the check. `RESTRICTIVE` policies AND together with every other applicable policy, so this one cannot be bypassed by a more permissive rule added later. This also means: **a customer JWT can never satisfy this policy** — `app_metadata.role` is simply absent for a customer, and `IN (...)`/`=` against a null/missing value is false, closing DATA-04 at the database layer independent of anything the app does.

### Next.js middleware (defense-in-depth, UX-layer redirect — not the security boundary)

```ts
// middleware.ts
import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  if (request.nextUrl.pathname.startsWith('/ops')) {
    // getUser() re-validates against Auth server — never trust getSession() in middleware.
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.redirect(new URL('/ops/sign-in', request.url))

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    const role = user.app_metadata?.role

    if (!role || !['dispatcher', 'admin'].includes(role)) {
      return NextResponse.redirect(new URL('/', request.url)) // not staff at all
    }
    if (aal.currentLevel !== 'aal2') {
      return NextResponse.redirect(new URL('/ops/mfa-challenge', request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/ops/:path*'],
}
```

Two rules from Supabase's own docs, both binding here:
1. **Always call `supabase.auth.getUser()`**, never `getSession()`, in server code — `getSession()` reads the JWT from cookies without re-validating it against the Auth server, so it can be spoofed if cookies are ever tampered with; `getUser()` makes a network round-trip that verifies the token.
2. The middleware's `setAll` callback must build `response` via **`NextResponse.next({ request })`**, never `new NextResponse(...)` with a body — see §5, this exact pattern sidesteps an open Cloudflare-Workers-specific cookie bug.

Middleware is a UX convenience (redirect to sign-in / MFA-challenge before the page even renders) — it is not the authorization boundary. If middleware is ever bypassed, disabled, or misconfigured, the RLS `RESTRICTIVE` policies above still block the query.

---

## 5. Cloudflare Workers + `@supabase/ssr` — what actually breaks under `@opennextjs/cloudflare`

This is the part most likely to bite in Phase 3+ if not designed around now.

**5a. Runtime: use Node.js runtime, not Edge.** `@opennextjs/cloudflare` runs Next.js on the **Node.js runtime** it emulates inside the Worker, not the Edge runtime `@cloudflare/next-on-pages` uses. Do **not** set `export const runtime = 'edge'` anywhere in the ops routes or middleware — it is unsupported/conflicts with the adapter's own runtime handling. `nodejs_compat` flag and `compatibility_date >= 2024-09-23` are required (already fixed by project constraints).

**5b. Standard middleware is supported; Next.js 15.2's newer "Node Middleware" variant is not yet.** Stick to the conventional `middleware.ts` shape shown above (`NextResponse`/`NextRequest` from `next/server`), not the 15.2 Node-runtime-middleware feature.

**5c. Confirmed open bug — multiple `Set-Cookie` headers get folded into one on Cloudflare Workers when middleware constructs a fresh `NextResponse` with a body.** [`opennextjs/opennextjs-cloudflare` issue #501](https://github.com/opennextjs/opennextjs-cloudflare/issues/501), filed against v0.5.12, status **open/unfixed**, reproduces only on Cloudflare deploy (not locally, not on Vercel). Folded `Set-Cookie` headers are invalid per spec and get dropped or mis-parsed by the browser, which silently breaks multi-cookie session writes.

This matters specifically for Supabase because **Supabase's SSR session cookie is chunked**: any cookie value over 3180 bytes is split across multiple `name.0`, `name.1`, ... cookies, each needing its own `Set-Cookie` header. A staff session JWT carrying `app_metadata.role`, `aal`, and `amr` history is measurably larger than a bare customer JWT, so **staff sessions are more likely than customer sessions to cross the chunking threshold and hit this bug.**

The mitigation is exactly what Supabase's own official middleware pattern already does — build the response via `NextResponse.next({ request })`, not `new NextResponse(request, { ... })` with a constructed body:

```ts
// SAFE on Cloudflare per issue #501's workaround — matches Supabase's documented pattern (§4 above)
let response = NextResponse.next({ request })
cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
```

```ts
// UNSAFE on Cloudflare — do not use this shape anywhere in ops middleware
const response = new NextResponse(null, { status: 200 })
response.cookies.set('sb-access-token.0', chunk0)
response.cookies.set('sb-access-token.1', chunk1) // may be folded into one Set-Cookie header
```

**5d. `cookies()` from `next/headers` is Node-only and does not work the same way inside `middleware.ts` on Workers** — use `request.cookies` / `response.cookies` (the `NextRequest`/`NextResponse` cookie APIs), as in the code above, not the `next/headers` `cookies()` function, which belongs in Server Components / Route Handlers (`lib/supabase/server.ts`), a separate client from the middleware one.

**5e. `process.env` can be empty before the April-2025-era compat date if `nodejs_compat_populate_process_env` isn't auto-enabled** — the project's fixed `compatibility_date >= 2024-09-23` requirement should be re-checked against this specific sub-flag when Hyperdrive/env wiring lands in Phase 3; flag it there, not a Phase 2 blocker.

**5f. Adjacent to but outside this lane (flag for Phase 3, DATA-06):** OpenNext/Cloudflare's troubleshooting docs separately document a `"Cannot perform I/O on behalf of a different request"` failure mode tied to objects (DB clients, in this case relevant to postgres.js/Hyperdrive) captured across requests on a reused Worker instance. That is precisely the shape of DATA-06 ("request-scoped auth context cannot leak between requests sharing a pooled connection") — Phase 3 should treat this as a known Cloudflare-Workers-class failure mode to test against explicitly, not a hypothetical.

---

## UNCERTAIN items requiring a settling check before/at implementation

1. **Dashboard path for enabling the Custom Access Token Hook** is documented as "Authentication → Hooks (Beta)" — Beta labeling means UI location may have moved; confirm against the live Supabase dashboard when this is actually implemented.
2. **Whether `opennextjs/opennextjs-cloudflare#501` (cookie folding) is fixed by the version pinned in `apps/web/package.json`** — it was open against v0.5.12 at research time; check the changelog of whatever `@opennextjs/cloudflare` version this repo pins before assuming the `NextResponse.next({ request })` workaround is still necessary (it's good practice regardless, since it matches Supabase's own recommended pattern, but confirm whether the underlying bug is closed).
3. **Exact production behavior of `nodejs_compat_populate_process_env`** relative to this project's `compatibility_date` — verify `process.env.SUPABASE_SERVICE_ROLE_KEY` etc. are actually populated at Worker runtime in a deployed preview before relying on server-side env reads in the invite route.

---

Files read (read-only) as part of this research: `/Users/koss/Developer/VamosTaxi.eu/.planning/phases/02-data-schema-rls-staff-auth-foundations` (empty at time of research — no conflicting lane output present yet).

**Sources cited above:**
- https://supabase.com/docs/guides/auth/auth-mfa/totp
- https://supabase.com/docs/guides/auth/auth-mfa
- https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail
- https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
- https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac
- https://supabase.com/blog/mfa-auth-via-rls
- https://supabase.com/docs/guides/auth/server-side/advanced-guide
- https://supabase.com/docs/guides/auth/server-side/nextjs
- https://opennext.js.org/cloudflare
- https://opennext.js.org/cloudflare/troubleshooting
- https://github.com/opennextjs/opennextjs-cloudflare/issues/501
- https://github.com/supabase/ssr/issues/169 (cookie chunking / size threshold context)
- https://www.rapidevelopers.com/supabase-tutorial/how-to-allow-login-only-for-invited-users-in-supabase
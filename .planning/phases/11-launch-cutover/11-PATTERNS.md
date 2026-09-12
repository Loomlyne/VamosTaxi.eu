# Phase 11: Launch Cutover - Pattern Map

**Mapped:** 2026-09-13
**Files analyzed:** 36 (create / modify / explicitly-unchanged)
**Analogs found:** 36 / 36
**Host this phase:** `vamostaxi.site` (CONTEXT D-01…D-35). Worker **`vamos` only**. No `env.production`. No `.eu` bind. Do not invent CHF or legal text.

CONTEXT overrides ROADMAP hostname. `vamostaxi.eu` is a **content source**, not a live host.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/db/supabase/migrations/<ts>_launch_public_chf_vat.sql` | migration | CRUD | `20260907000002_checkout_company_paylink.sql` (additive `alter … add column if not exists` + `comment on column`) + `20260823000004_settings.sql` (singleton `id=1`) | exact-style |
| `apps/web/middleware.ts` | middleware | request-response | **this file** (`isDashboardHost`, `applyStagingNoindex`, final `DEPLOY_ENV` block) | exact |
| `apps/web/app/sitemap.ts` | route | request-response | **this file** — filter XML only | exact |
| `apps/web/app/robots.ts` | route | request-response | **this file** — optional extra disallows | exact |
| `apps/web/lib/metadata.ts` | utility | transform | **this file** — **DO NOT CHANGE** `PUBLIC_ROUTES` / `buildAlternates` | exact (leave) |
| `apps/web/lib/pricing/priceQuote.ts` | service | transform | **this file** `pricing_live` | exact |
| `apps/web/lib/pricing/rateBook.ts` | utility | transform | **this file** `derivePricingLive` | exact |
| `apps/web/lib/quote/engine.ts` | service | transform | **this file** `preferDraft` + `apps/web/app/api/checkout/extras/route.ts` (`preferDraft: false`) | exact |
| `apps/web/lib/quote/respond.ts` | utility | request-response | **this file** — **NO second `pricing_live` render branch** | exact (leave) |
| `apps/web/lib/db/quote.ts` | service | CRUD | **this file** `loadRateBook` / `asQuote` tagged SQL | exact |
| quote-read RPC (same migration or follow-on) | model | CRUD | `20260906000001_distance_bands.sql` `create or replace function public.quote_rate_book` | role-match |
| `apps/web/app/[locale]/(ops)/ops/pricing/actions.ts` | controller | request-response | **this file** `publishRateVersion` | exact |
| `apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts` | route | request-response | **this file** (DC actually POSTs here) | exact |
| `apps/web/app/api/staff/rate-versions/[id]/publish/route.ts` | route | request-response | **this file** re-export | exact |
| `apps/web/lib/checkout/vat.ts` | utility | transform | **this file** `CH_VAT_RATE_BPS = 81` | exact |
| `apps/web/lib/checkout/intent.ts` | service | request-response | **this file** `payableWithVatRappen` | exact |
| `apps/web/app/[locale]/checkout/CheckoutClient.tsx` | component | request-response | **this file** `vatOnTopRappen` | exact |
| `apps/web/lib/checkout/confirmation-receipt.ts` | utility | transform | **this file** `vatOnTopRappen` | exact |
| `apps/web/components/home/BookingBoard.tsx` | component | request-response | **this file** + `lib/currency.ts` `formatAmount(null)` | exact |
| `apps/web/public/app/ops/OpsPricing.dc.html` **and** `app/ops/OpsPricing.dc.html` | component | request-response | **this file** sticky rail + `app/ops/OpsSettings.dc.html` `Input` + suffix | exact |
| `apps/web/lib/ops/settings.ts` | service | CRUD | **this file** `SettingsRow` / `loadSettings` / `asStaff` | exact |
| `apps/web/app/[locale]/(ops)/api/staff/settings/route.ts` | route | CRUD | **this file** PATCH with current-row fallbacks | exact |
| `apps/web/lib/legal-languages.ts` | config | transform | **this file** `LEGAL_LANGUAGES.imprint` | exact |
| `apps/web/app/[locale]/{imprint,about,faq,contact,terms,privacy}/page.tsx` | route | request-response | **these files** + `PendingSlot` + `contact-channels.ts` | exact |
| `apps/web/i18n/messages/{en,de,fr,ar}.json` | config | transform | **these files** — four languages same pass | exact |
| `apps/web/lib/pricing/public-chf.test.ts` | test | transform | `lib/pricing/rateBook.test.ts` + `lib/quote/engine.test.ts` | role-match |
| `apps/web/lib/ops/publish-public-chf.test.ts` | test | transform | `tests/integration/ops-dc-pricing.spec.ts` (source grep of publish SQL) | role-match |
| `apps/web/lib/seo/indexing.test.ts` | test | transform | `tests/integration/public-routes.spec.ts` + `dev-exclusion.spec.ts` | role-match |
| `apps/web/lib/checkout/vat.test.ts` | test | transform | **this file** — extend, keep 8.1% identities | exact |
| `apps/web/tests/integration/dev-exclusion.spec.ts` | test | request-response | **this file** — invert public noindex | exact |
| `apps/web/tests/integration/public-routes.spec.ts` | test | request-response | **this file** — sitemap ≠ full `PUBLIC_ROUTES` | exact |
| `apps/web/tests/integration/auth-flows.spec.ts` | test | request-response | **this file** sitemap `/sign-up` assertion | exact |
| extract no-invent assertions | test | transform | `lib/react-contact-source.test.ts` + `lib/health/leak-gate.test.ts` | role-match |
| `apps/web/wrangler.jsonc` | config | — | **this file** — **DO NOT** bind `.eu`, **DO NOT** deploy `env.production` | exact (leave) |
| `apps/web/lib/quote/respond.ts` / `lib/metadata.ts` / `lib/contact-channels.ts` / `WhyVamos.tsx` | — | — | themselves — leave | exact (leave) |

---

## Pattern Assignments

### `packages/db/supabase/migrations/<ts>_launch_public_chf_vat.sql` (migration, CRUD)

**Analog:** `packages/db/supabase/migrations/20260907000002_checkout_company_paylink.sql` (additive alter + comments) and `20260823000004_settings.sql` (singleton).

**Do not** add `pricing_live` on `rate_versions`. Comment at `20260823000008_rate_versions.sql:35-36`: live = exactly one `status='live'`. Id 5 already live is **not** the public-CHF flip (D-23).

**Imports / header pattern** (`20260907000002` lines 1-12):

```sql
-- 20260907000002_checkout_company_paylink.sql
--
-- Phase 7 remainder D-34…D-38. Additive billing + pay-link. Charge gate unchanged.
-- Hosted apply is owner-gated. Do not invent CHF.

alter table public.bookings
  add column if not exists billing_kind text not null default 'individual',
  add column if not exists company_name text not null default '',
  …
```

**Core pattern — singleton target** (`20260823000004_settings.sql` lines 10-16, 40):

```sql
create table public.settings (
  id smallint primary key default 1 check (id = 1),
  …
);
comment on table public.settings is 'D-10: operational singleton — contact details, payment and notification toggles, internal dispatch parameters. Never a customer-facing policy promise; those live in settings_versions.';
```

**Error / check pattern** (`20260907000002` lines 14-19 + 258-261):

```sql
alter table public.bookings
  add constraint bookings_billing_kind_check
  check (billing_kind in ('individual', 'company'));

comment on column public.bookings.payer_email is
  'D-37 extra payer. Pay-link email. Not an invoice.';
```

**Copy this shape (planner SQL from RESEARCH, default 81 from code not invented):**

```sql
alter table public.settings
  add column if not exists public_chf boolean not null default false,
  add column if not exists vat_rate_bps integer not null default 81
    check (vat_rate_bps >= 0);

comment on column public.settings.public_chf is
  'D-18/D-19: public CHF display + checkout pricing_live AND. False until OPS Publish-as-flip. Independent of rate_versions.status.';
comment on column public.settings.vat_rate_bps is
  'Swiss VAT on top of net, hundredths of a percent. Default 81 = existing CH_VAT_RATE_BPS. Not an invented rate.';
```

**Auth / apply:** execute **stops**. Owner apply on `yaumjzvylngfjhtuffqs`. Agent does not `apply_migration` / restore.

**Anti-pattern:** do **not** put `public_chf` on `settings_public` (cached HYPERDRIVE surface).

**Analog — curated public view stays narrow** (`20260823000024_rls_public.sql` lines 25-39):

```sql
-- Settings are NOT exposed raw. A curated projection publishes only the customer-facing subset.
create view public.settings_public as
  select phone, email, default_lang, default_currency,
         accepts_card, accepts_twint, accepts_cash
    from public.settings where id = 1;
grant select on public.settings_public to vamos_public, anon, authenticated, vamos_staff;
-- and nothing else: public.settings itself stays revoked from every public role.
```

Quote identity cannot `select` `public.settings` (42501). Flags go through a **definer RPC**, same as the rate book.

---

### Quote-read of `public_chf` / `vat_rate_bps` (service, CRUD)

**Analog:** `apps/web/lib/db/quote.ts` `loadRateBook` — `asQuote` + tagged RPC, never raw `settings`.

**Imports + rules** (`lib/db/quote.ts` lines 1-24, 70-80):

```ts
import { asQuote } from "./identity";
// …
//   1. Every call goes through asQuote, which is on env.HYPERDRIVE_NOCACHE.
//   2. Every argument is a bound parameter through postgres.js's tagged template
export async function loadRateBook(
  env: CloudflareEnv,
  opts: { preferDraft: boolean },
  request?: RequestContext,
): Promise<unknown> {
  const result = await asQuote(env, async (tx) => {
    const rows = await tx`select public.quote_rate_book(${opts.preferDraft}) as result`;
    return rows[0]?.result ?? null;
  });
```

**RPC replace analog** (`20260906000001_distance_bands.sql` line 142): `create or replace function public.quote_rate_book(p_prefer_draft boolean default false)`.

**Planner choice (smallest):** extend `quote_rate_book` JSON with `public_chf` (and optionally `vat_rate_bps`) from `public.settings where id = 1`, **or** add a tiny sibling RPC copied from `quote_lock_deadline` (`lib/db/quote.ts` 97-110). Do not read via `packages/db/src/public.ts` (cached `HYPERDRIVE`).

**Error handling:** rethrow unmodified (`quote.ts` lines 23-24). Call site branches on `err.code`.

---

### `apps/web/middleware.ts` (middleware, request-response)

**Analog:** **this file**. Host-split both noindex sites. Keep `DEPLOY_ENV=staging` on Worker `vamos`.

**Host guard** (lines 157-207):

```ts
function hostnameOf(request: NextRequest): string {
  return (request.headers.get("host") ?? "").split(":")[0]?.toLowerCase() ?? "";
}

function isDashboardHost(request: NextRequest): boolean {
  if (isNamedDashboardHost(request)) return true;
  const host = hostnameOf(request);
  if ((host === "localhost" || host === "127.0.0.1") && isOpsRequest(request.nextUrl.pathname)) {
    return true;
  }
  return false;
}
```

`isNamedDashboardHost` already lists `dashboard.vamostaxi.site` / `dashboard.localhost` / ops-changes previews (lines 193-198).

**Today's noindex (must change both)** (lines 334-338 and 551-562):

```ts
function applyStagingNoindex(response: NextResponse): NextResponse {
  if (process.env.DEPLOY_ENV === "staging" || process.env.DEPLOY_ENV === "ops-changes") {
    response.headers.set("X-Robots-Tag", "noindex");
  }
  return response;
}

  if (process.env.DEPLOY_ENV === "staging") {
    finalResponse.headers.set("X-Robots-Tag", "noindex");
  }
```

**Target behaviour (D-03 / D-04):**

- Always noindex if `isDashboardHost(request)` **or** `DEPLOY_ENV === "ops-changes"`.
- **No** noindex on `vamostaxi.site` / `www.vamostaxi.site` even when `DEPLOY_ENV=staging`.
- Do not use `env.production` / undefined `DEPLOY_ENV` as the index switch (D-08).

**Second host helper (layout, cookie banner only)** (`app/[locale]/layout.tsx` 24-27) — do not treat this as the noindex analog; middleware owns the header.

**Auth unchanged:** staff gate stays `isDashboardHost && isOpsRequest` (lines 538-541).

---

### `apps/web/app/sitemap.ts` (route, request-response)

**Analog:** **this file**. Add `SITEMAP_ROUTES` here only.

**Imports + core** (lines 1-17):

```ts
import type { MetadataRoute } from "next";
import { PUBLIC_ROUTES, SITE_URL } from "@/lib/metadata";

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((path) => {
    const suffix = path === "/" ? "" : path;
    return {
      url: `${SITE_URL}${suffix}` || `${SITE_URL}/`,
    };
  });
}
```

**Do not** walk `PUBLIC_ROUTES` for XML. Allowlist (D-30): `/`, `/about`, `/faq`, `/contact`, `/terms`, `/privacy`, `/imprint`, `/cookies`, `/cancellation`. `/coming-soon` and HTML `/sitemap` stay in `PUBLIC_ROUTES`, **out of XML**.

Type the allowlist as `readonly PublicRoute[]` so a typo fails compile. Never `/de` `/fr` `/ar` in XML (existing comment lines 3-5).

---

### `apps/web/app/robots.ts` (route, request-response)

**Analog:** **this file**. Sitemap is the lock; extra disallows are discretion.

```ts
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/metadata";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/app/", "/dev", "/dev/", "/ops", "/ops/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
```

Recommend appending D-31 paths: `/checkout`, `/confirmation`, `/bookings`, `/account`, `/sign-in`, `/sign-up`, `/manage-booking`, `/reset-password`. Keep `sitemap:` on `SITE_URL`.

---

### `apps/web/lib/metadata.ts` (utility, transform) — **UNCHANGED**

**Analog:** **this file**. Shrinking `PUBLIC_ROUTES` drops hreflang.

**Core** (lines 22, 40-90): `SITE_URL = "https://vamostaxi.site"`; `PUBLIC_ROUTES` includes marketing **and** account/checkout/sign-in/coming-soon/sitemap; `buildAlternates` walks that list and emits unprefixed URLs.

Do not edit this file for sitemap. Comment at lines 36-38 already says do not delete `/coming-soon` to "fix" a 404.

---

### `apps/web/lib/pricing/rateBook.ts` + `priceQuote.ts` + `engine.ts` (service, transform)

**Analog:** these files. AND `settings.public_chf` into the **engine** `pricing_live` that HTTP uses. Kernel `priceQuote.ts:316` (`rateBook.rate_version !== null`) can stay as "a book is loaded"; public flip is `derivePricingLive && public_chf`.

**Core — live token** (`rateBook.ts` 211-220):

```ts
export function derivePricingLive(
  rateVersion: { status: string } | null,
): boolean {
  return rateVersion !== null && rateVersion.status === "live";
}
```

**Core — HTTP flag** (`engine.ts` 150-207):

```ts
  const preferDraft = env.PRICING_PREVIEW === "true";
  const rawBook = await deps.loadRateBook(env, { preferDraft }, request);
  // …
      pricing_live: rateBookMapper.derivePricingLive(book.rate_version),
```

**Host-gate preview (D-18 / runbook):** `preferDraft` only when `PRICING_PREVIEW === "true"` **and** dashboard host. Public `vamostaxi.site` always `preferDraft: false`.

**Analog for public-always-live-book** (`app/api/checkout/extras/route.ts` 11-14):

```ts
    const raw = await loadRateBook(env, { preferDraft: false });
```

`RequestContext` (`lib/logger.ts` 22-33) has `requestId` / `route` / `locale` — **no host**. Copy `isDashboardHost` from middleware (or pass a boolean from the quote route `Host` header). Do **not** put host-gating in `pipeline.ts` (header at lines 10-11: pipeline does not read `PRICING_PREVIEW`).

**Kernel leftover** (`priceQuote.ts` 316-324): leave as book-loaded; engine overwrites the HTTP flag.

**Validation analog** (`rateBook.test.ts` 186-192, `engine.test.ts` 243-265): extend `derivePricingLive` tests with `&& public_chf`; extend preferDraft cases with a host dimension.

---

### `apps/web/lib/quote/respond.ts` (utility, request-response) — **NO BRANCH**

**Analog:** **this file**. Comment is the contract.

```ts
// There is no pricing_live branch anywhere in the rendering path and none
// may be added here. The response carries integer rappen or null; the
// widget renders through formatAmount (D-46).
```

Pass through `quote.pricing_live` (line 97) and integer/null rappen. `Cache-Control: no-store` stays. Widget nulls totals when `!pricing_live`.

**Checkout already refuses** (`lib/quote/intent.ts` 47-50, 190-192):

```ts
    // Refuse on EITHER pricing_live false OR a null chosen-class total.
  if (ids.has("pricing_live")) {
    if (!board.pricing_live || chosen?.total_rappen == null) {
      return refuse("pricing_not_live");
    }
  }
```

Tests already lock this (`lib/quote/intent.test.ts` 170-205). Do not add a third gate.

---

### Publish-as-flip — `actions.ts` **and** staff POST (controller / route, request-response)

DC Publish does **not** call the Next server action. It POSTs the staff route. Flip **both** or the owner click is a no-op.

**DC caller** (`OpsPricing.dc.html` 384-399):

```js
  publish = () => {
    const api = window.VamosOpsApi;
    const id = this.state.draftId;
    if (!api || !id || (this.state.gaps && this.state.gaps.length)) return;
    api.request('POST', '/api/staff/rate-versions/' + id + '/publish').then((json) => {
```

**Auth + completeness + staff tx** (`[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts` 1-55, 70-71):

```ts
import { asStaff } from "@/lib/db/identity";
import { loadCompleteness, type CompletenessGap } from "@/lib/ops/pricing";
import { jsonErr, jsonOk, withAdmin } from "@/lib/ops/staff-json";

    return withAdmin(async (claims) => {
      // …
      const gaps = await loadCompleteness(env, claims, id);
      if (gaps.length > 0) {
        return jsonFail("incomplete", 409, gaps);
      }
      try {
        await asStaff(env, claims, async (tx) => {
          await tx`update public.rate_versions set status = 'live' where id = ${id}`;
          return null;
        });
```

**Same SQL in the unused-by-DC action** (`ops/pricing/actions.ts` 33-50): `requireAdminClaims` → `loadCompleteness` → `asStaff` → `update … status = 'live'` → `mapSqlState` → `revalidatePath`.

**In the same `asStaff` transaction, after/with live:**

```ts
await tx`update public.rate_versions set status = 'live' where id = ${id}`;
await tx`update public.settings set public_chf = true where id = 1`;
```

Completeness still blocks (`lib/ops/pricing.ts` 69-101). `PRICING_PREVIEW` must not set `public_chf`. Dual-mount re-export stays (`app/api/staff/rate-versions/[id]/publish/route.ts`).

**Error envelope analog:** `jsonFail(code, status, gaps)` — never `err.message` (ops-dc-pricing.spec.ts asserts this).

---

### `apps/web/lib/checkout/vat.ts` (+ intent / receipt / CheckoutClient) (utility, transform)

**Analog:** **this file**. Inject bps; default **81**.

```ts
export const CH_VAT_RATE_BPS = 81;
export const CH_VAT_GROSS_BPS = 1081;

export function vatOnTopRappen(netRappen: number): number {
  if (!Number.isFinite(netRappen) || netRappen <= 0) return 0;
  return Math.round((netRappen * CH_VAT_RATE_BPS) / 1000);
}
```

Keep 8.1%-on-top identities in `vat.test.ts` (lines 23-37). Add an injected-bps case. Do not invent 7.7.

**Call sites (pass bps through, do not fork math):**

- `lib/checkout/intent.ts:19,211` — `payableWithVatRappen(netRappen + extraAdd)`
- `CheckoutClient.tsx` ~1029-1046
- `confirmation-receipt.ts:154` — `vatOnTopRappen(fareRappen + extraSum)`

Load `vat_rate_bps` the same way as `public_chf` (quote/checkout definer read), fallback `CH_VAT_RATE_BPS`.

---

### `apps/web/components/home/BookingBoard.tsx` (component, request-response)

**Analog:** **this file** + `lib/currency.ts` + `lib/fx/format.ts`.

**Null → 000** (`currency.ts` 54-63):

```ts
export function formatAmount(
  amount: number | null | undefined,
  currency: CurrencyCode = "CHF",
): string {
  const mark = CURRENCY_MARKS[currency];
  const figure = amount == null ? "000" : formatFigure(amount);
  return `${mark.sym}${mark.space}${figure}`;
}
```

**FX already preserves null** (`fx/format.ts` 20-46): `rappen == null` → `major: null` → `formatAmount` → `CHF 000`.

**Gap:** board ignores `pricing_live` (`BookingBoard.tsx` 1-5, 449-491):

```ts
            const price = eligible
              ? keep(formatChfRappen(entry.total_rappen, currency, fxRates))
              : ineligiblePrice(entry, label);
```

When `!quote.pricing_live`, pass **`null`** into `formatChfRappen` / `chfRappenToDisplay`. Do not hardcode `80/100/130/150`. Do not add a second formatter.

**WhyVamos** (`WhyVamos.tsx` 276-277): decorative idle `CHF 000` with `data-i18n-skip`. RESEARCH: leave 000 after Publish. Do not invent a floor.

---

### OPS Pricing VAT field — `OpsPricing.dc.html` × 2 (component, request-response)

**Analog:** existing sticky rail + Publish chrome in **this file**; `Input` + suffix from `app/ops/OpsSettings.dc.html`. **Do not redesign.** Dual-copy: `app/ops/OpsPricing.dc.html` **must equal** `apps/web/public/app/ops/OpsPricing.dc.html` (`customers-board.test.ts` 83-85).

**Rail / Publish** (`OpsPricing.dc.html` 21-31, 36-52, 96-100):

```html
<div data-price-head-publish="1" style="margin-inline-start:auto;display:flex;flex-direction:column;align-items:flex-end;gap:8px">
  …
  <x-import … Button … onClick="{{ publish }}" …>{{ tPublish }}</x-import>
</div>
…
<div data-price-rail="1" …>
  <nav data-set-rail="1">… PANES routes / distance / surcharges …</nav>
```

`PANES` is three keys only. VAT is **not** a fourth pane. Put a percent field on the rail / head-publish column.

**Input analog** (`OpsSettings.dc.html` 75-78):

```html
<x-import component-from-global-scope="VamosTaxiDesignSystem_245af1.Input"
  size="md" label="{{ tMinAdvance }}" value="{{ vMinAdvance }}"
  onChange="{{ setMinAdvance }}" placeholder="{{ tHours }}" suffix="{{ tHours }}" …>
```

Show **`8.1`**, suffix `%`, `--vt-*` only. Four languages in the existing `T = { en, de, fr, ar }` dict (lines 110+). Playwright analog: `ops-dc-pricing.spec.ts` 59-80 (grep `data-price-head-publish`, en/de/fr/ar Publish strings, no `--vt-yellow-50`, no `err.message`).

**VAT write analog:** `PATCH /api/staff/settings` (`staff/settings/route.ts` 70-80) already fills missing fields from `current`. Add `vat_rate_bps` with an `asTurnaround`-style number parser (`route.ts` 32-38). Do **not** add VAT to OpsSettings page. Completeness loader does not mention VAT (`lib/ops/pricing.ts`) — do not block Publish on VAT.

**SettingsRow analog** (`lib/ops/settings.ts` 22-40, 316-331): extend the select list; `asStaff` `where id = 1`.

---

### Legal / about / FAQ / contact extract (route + i18n, transform)

**Analog:** existing pages + `PendingSlot` + `contact-channels.ts` + four JSON files. Source = `vamostaxi.eu` content only at execute time. If `.eu` lacks a field, **leave TBC**.

**PendingSlot** (`components/legal/PendingSlot.tsx` 1-10):

```tsx
export function PendingSlot({ label }: { label: string }) {
  return (
    <span data-tok="1" data-i18n-skip title="Awaiting a confirmed value from Vamos Taxi">
      {label}
    </span>
  );
}
```

**Imprint UID stays TBC** (`imprint/page.tsx` 7-9, 114-126, 157-167):

```tsx
import { SUPPORT_EMAIL, SUPPORT_EMAIL_HREF } from "@/lib/contact-channels";
// …
          <DlRow term={tLegal("uid-vat-number")}>
            <PendingSlot label="Uid number" />
          </DlRow>
```

Live imprint already uses `info@vamostaxi.site` and `vamostaxi.site`. **Do not copy** `info@vamostaxi.eu`. Street/postcode are still `PendingSlot` in the React page — fill only if `.eu` has the value (RESEARCH: Bleicherstrasse 16, 8953 Dietikon). Licence / dispute / disclaimer stay TBC.

**Contact channels — do not change** (`lib/contact-channels.ts` 6-18): `PHONE_DISPLAY = "+41 79 626 70 82"`, `WHATSAPP_HREF`, `SUPPORT_EMAIL = "info@vamostaxi.site"`.

**Page shells (copy into existing keys, do not new templates):**

- About: `about/page.tsx` — `PageHero` + `Prose` + `getTranslations("about")` + `buildAlternates("/about")`. Do not port become-a-partner. Do not expand into a Europe marketplace.
- FAQ: `faq/page.tsx` — `FaqItem[]` + `questionKey` / `answerKeys`. Do not add PayPal if product does not take it.
- Contact: `contact/page.tsx` — already `PHONE_*` / `SUPPORT_EMAIL` / Turnstile.
- Terms / privacy: `LegalPage` + `LanguageCoverageNotice` + `PendingSlot` (`terms/page.tsx` 1-37). Replace contact facts with D-06/D-07; do not invent clauses; do not port Connecto residue as new law.

**i18n** (`i18n/messages/en.json` namespaces `"about"`, `"faq"`, `"contact"`, `"legal"`). D-27: English from `.eu`, then **de/fr/ar same pass**. No extra legal clauses in translation.

**Imprint fr/ar (D-27 wins over I18N-08)** (`legal-languages.ts` 11-24):

```ts
  imprint: ["en", "de"],
```

After extract+translate, set `imprint: ["en","de","fr","ar"]`. `LanguageCoverageNotice` (`LanguageCoverageNotice.tsx` 32-37) returns null when locale is in the set — no extra UI work.

**No-invent test analog** (`lib/react-contact-source.test.ts` 27-76, `lib/health/leak-gate.test.ts` 60-70):

```ts
      expect(publicSource).not.toContain("info@vamostaxi.eu");
// …
    expect(domain).not.toMatch(/vamostaxi\.eu/);
```

Also assert imprint still has `PendingSlot` / `data-tok` for UID; no become-a-partner route; wrangler still `pk_test_` (D-11). `leak-gate` already forbids `.eu` custom domains — keep it.

---

### Wave 0 / integration tests (test, transform / request-response)

| New or rewrite | Analog | Copy |
|----------------|--------|------|
| `lib/pricing/public-chf.test.ts` | `rateBook.test.ts` `describe("derivePricingLive")` 186-192; `engine.test.ts` `stubLoaders` / `fakeEnv` 169-188 | Vitest `describe/it`; live row + `public_chf=false` ⇒ public not live |
| `lib/ops/publish-public-chf.test.ts` | `ops-dc-pricing.spec.ts` 42-69 (readFileSync of publish route + DC) | Assert both publish paths contain `public_chf = true`; DC still POSTs `/publish`; `PRICING_PREVIEW` string absent from that UPDATE |
| `lib/seo/indexing.test.ts` | `public-routes.spec.ts` `loadPublicRoutes` 25-30; `dev-exclusion.spec.ts` header asserts 133-174 | Host-split noindex unit if extracted; sitemap allowlist vs `PUBLIC_ROUTES` |
| extend `vat.test.ts` | **itself** | Keep 8.1% floors; add injected bps |
| rewrite `dev-exclusion.spec.ts` | **itself** | `/dev` stays noindex; **public** `/` must **not** noindex when `DEPLOY_ENV=staging` (invert lines 166-174 for home, not for `/dev`) |
| rewrite `public-routes.spec.ts` 139-153 | **itself** | Stop equating XML count to `PUBLIC_ROUTES.length`. Assert D-30 present, D-31 absent. Hreflang test on HTML stays on full `PUBLIC_ROUTES` |
| rewrite `auth-flows.spec.ts` 483-488 | **itself** | `/sign-up` **page** still serves; sitemap XML must **not** contain `/sign-up` |
| extract no-invent | `react-contact-source.test.ts` | UID TBC; no `.eu` mailbox; no partner |

`ssr-locale.spec.ts` 122-129 already asserts sitemap has no `/dev/` — keep.

---

## Shared Patterns

### One Worker, host split
**Source:** `apps/web/middleware.ts` `isDashboardHost` + `apps/web/wrangler.jsonc` `env.staging` name `"vamos"` (lines 86-108).
**Apply to:** noindex, `preferDraft`.
Do not deploy `env.production` (`vamos-web-production`). Do not bind `vamostaxi.eu`.

### `asStaff` + admin door for writes
**Source:** `lib/ops/staff-json.ts` `withAdmin` / `jsonOk` / `jsonErr` (lines 23-29, 80+); `asStaff` tagged SQL.
**Apply to:** Publish-as-flip, VAT PATCH.
CSRF: `staffOriginAllowed` dashboard hosts only (lines 31-42).

### `asQuote` + definer RPC for public billing reads
**Source:** `lib/db/quote.ts`.
**Apply to:** `public_chf` / `vat_rate_bps` reads on quote/checkout.
Never `settings_public` for these flags. Never cached `HYPERDRIVE`.

### Null through `formatAmount`
**Source:** `lib/currency.ts` 54-63; `lib/fx/format.ts` 20-46.
**Apply to:** BookingBoard and any public amount until `pricing_live` (live row **AND** `public_chf`).

### Completeness still gates Publish
**Source:** `lib/ops/pricing.ts` `loadCompleteness` + trigger in `20260823000008_rate_versions.sql`.
**Apply to:** do not skip gaps; do not add VAT to the gap list.

### Four languages same pass; TBC not fiction
**Source:** `PendingSlot`; `i18n/messages/{en,de,fr,ar}.json`; OpsPricing `T` dict.
**Apply to:** VAT labels, extracted legal/about/FAQ. No invented UID/CHF/PayPal/gmail.

### Dual DC copy
**Source:** `customers-board.test.ts` 83-85; `ops-dc-pricing.spec.ts`.
**Apply to:** every OpsPricing edit — write `app/ops/` **and** `apps/web/public/app/ops/`.

### Owner apply, never agent apply
**Source:** Phase 12 PATTERNS + `20260907000002` header.
**Apply to:** the launch migration on `yaumjzvylngfjhtuffqs`.

---

## No Analog Found

None for stack. Discretion items without a **live** analog in-repo:

| File / behaviour | Role | Data Flow | Reason |
|------------------|------|-----------|--------|
| www → apex 301 | config | request-response | Middleware has **zero** `www` handling. D-05: only number a Cloudflare DNS click if `curl -I https://www.vamostaxi.site` is not already 301. Do not invent a middleware redirect unless that probe fails. |
| JSON-LD / Search Console / live Stripe / `.eu` DNS | — | — | Out of scope (deferred). |

---

## Do not touch

- `apps/web/wrangler.jsonc` routes / `env.production` / Stripe `pk_test_`
- `apps/web/lib/contact-channels.ts` mailbox / phone
- `apps/web/lib/metadata.ts` `PUBLIC_ROUTES` / `buildAlternates`
- `apps/web/lib/quote/respond.ts` render path
- `WhyVamos.tsx` idle `CHF 000` (leave)
- Preview Workers, `env.production`, become-a-partner, Freshpage 301s
- Restoring onto `yaumjzvylngfjhtuffqs`

---

## Metadata

**Analog search scope:** `packages/db/supabase/migrations/`, `apps/web/middleware.ts`, `apps/web/lib/{pricing,quote,db,checkout,ops,currency,fx,metadata,legal-languages,contact-channels,health}/`, `apps/web/app/{sitemap,robots}.ts`, `apps/web/app/[locale]/**`, `apps/web/public/app/ops/OpsPricing.dc.html`, `app/ops/OpsPricing.dc.html`, `app/ops/OpsSettings.dc.html`, `apps/web/tests/integration/`, `apps/web/i18n/messages/`, `apps/web/wrangler.jsonc`
**Files scanned:** ~60
**Pattern extraction date:** 2026-09-13

## PATTERN MAPPING COMPLETE

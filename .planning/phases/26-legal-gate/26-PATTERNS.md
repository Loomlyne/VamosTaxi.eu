# Phase 26: Legal gate - Pattern Map

**Mapped:** 2026-09-24
**Files analyzed:** 7
**Analogs found:** 7 / 7

Empty Meta TBC slots only. Labels, exact: `Meta banner line`, `Meta cookie row`, `Meta privacy line`. No legal sentence in the slot, the plan, or a test assertion message. Leave `necessary-cookies-only`. Flag stays hard-false. No `fbevents.js`. No Purchase. No quote, pay, or confirmation edits. Do not write or translate legal lines. Do not bump `CONSENT_POLICY_VERSION`. Reuse `PendingSlot`. Do not edit `laws.css`, `PendingSlot.tsx`, `policy.ts`, or `i18n/messages/*.json`. Do not map or create a pixel loader. Pixel ID and `META_CAPI_ACCESS_TOKEN` stay out of product files. Do not read the token. The id, if a test needles it, is the string already recorded in `26-CONTEXT.md` Discretion — copy it from there into the test file only, not into this map's product excerpts.

Line numbers below were read on 2026-09-24. `apps/web/lib/meta/` does not exist. `.vt-ck-meta`, `.vt-legal-blank`, and `.vt-legal-blank--row` have zero matches under `apps/web`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/web/components/consent/CookieBanner.tsx` | component | request-response | self, plus `PendingSlot` call in `apps/web/app/[locale]/cookies/page.tsx` | exact |
| `apps/web/components/consent/CookieBanner.css` | config | transform | `.vt-ck-body` / `.vt-ck-alert` in the same file | role-match |
| `apps/web/app/[locale]/cookies/page.tsx` | route | request-response | self duration `PendingSlot`s | exact |
| `apps/web/app/[locale]/privacy/page.tsx` | route | request-response | self `#cookies` paragraphs, plus imprint `PendingSlot` | role-match |
| `apps/web/components/legal/LegalPage.css` | config | transform | `[data-lg-prose] p` in the same file. Not `.vt-legal-meta` | role-match |
| `apps/web/lib/meta/legal-gate.ts` | utility | transform | `apps/web/lib/supabase/constants.ts` shape, plus `=== true` in `apps/web/lib/db/quote.ts` | role-match |
| `apps/web/lib/meta/legal-gate.test.ts` | test | file-I/O | `apps/web/lib/legal/extract-no-invent.test.ts` | exact |

## Pattern Assignments

### `apps/web/components/consent/CookieBanner.tsx` (component, request-response)

**Analog:** the file itself for the shell. Slot call from `apps/web/app/[locale]/cookies/page.tsx`. Barrel from `apps/web/components/legal/index.ts`.

**Imports pattern** (`CookieBanner.tsx` lines 1-15). Add one named import. Do not add `next/script`. Do not import the flag into this file. Do not add `"use client"` to `PendingSlot.tsx` — the slot module has no server-only API, so the client banner may import it as-is:

```tsx
"use client";

import "./CookieBanner.css";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createNavigation } from "next-intl/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { Button } from "@/components/core";
import { Alert } from "@/components/feedback";
import { TurnstileWidget } from "@/components/forms/TurnstileWidget";
```

Specifier to copy (`cookies/page.tsx` line 9, barrel `index.ts` line 5):

```tsx
import { LanguageCoverageNotice, LegalPage, PendingSlot, type LegalSection } from "@/components/legal";
```

Banner import is only `PendingSlot`. Same `@/components/legal` specifier. Do not deep-import `./PendingSlot` from the banner.

**Auth/guard pattern:** none on the slot. Do not wrap it in Turnstile, Accept, or Dismiss. Those stay on the existing buttons (`CookieBanner.tsx` lines 198-217).

**Core pattern** (`CookieBanner.tsx` lines 166-184). `hidden` already unmounts the whole sheet. The slot leaves with it. Do not keep a slot on screen after Accept or Dismiss. Insert the new `div` as the next sibling after the `h2`, before `p.vt-ck-body`. Not inside the `h2`. Not inside the body. Leave the title expression untouched:

```tsx
  if (hidden) return null;

  return (
    <div
      className="vt-ck-banner"
      data-ck-banner="1"
      role="region"
      aria-label={t("cookie-choices")}
    >
      <div className="vt-ck-sheet" data-ck-sheet="1">
        <p className="vt-ck-kicker">{tCommon("cookies")}</p>
        <h2 className="vt-ck-title">{t("necessary-cookies-only")}</h2>
        <p className="vt-ck-body">
          {t("banner-body")}{" "}
          <Link href="/cookies" className="vt-ck-link">
            {tCommon("cookie-policy")}
          </Link>
          .
        </p>
```

Slot to insert between those two elements. Label is a blank name, not a sentence. No `onClick`. No `tabindex`. No ARIA on the slot. Hook is not ARIA:

```tsx
<div className="vt-ck-meta" data-meta-slot="banner">
  <PendingSlot label="Meta banner line" />
</div>
```

Pill call to copy, not a new component (`cookies/page.tsx` lines 101, 108, 115):

```tsx
duration: <PendingSlot label="Language cookie duration" />,
duration: <PendingSlot label="Session duration" />,
duration: <PendingSlot label="Consent duration" />,
```

**Error handling pattern** (`CookieBanner.tsx` lines 140-163): `try` / `setError` / `resetChallenge` belongs to `submit` only. Do not attach it to the slot. The slot has no fetch.

**Do not copy** the `data-slot` adviser blocks on the privacy page. Those are not `PendingSlot`.

---

### `apps/web/components/consent/CookieBanner.css` (config, transform)

**Analog:** `.vt-ck-body` for type tokens. `.vt-ck-alert` for logical margin. The class `.vt-ck-meta` does not exist. Paste the UI-SPEC rule. Do not invent a second rule. Do not animate the slot.

**File header** (lines 1-2). Keep Law 01 / Law 03. Do not add glow, a Meta colour, or a physical `margin-left` / `margin-right`:

```css
/* Production cookie banner. Visual tokens/layout from CookieBanner.dc.html.
   Two buttons only — do not port the prefs modal. Law 01: no glow. Law 03: logical props. */
```

**Type tokens to reuse, not to clone the shorthand** (lines 41-57). `.vt-ck-title` uses physical `margin: 0 0 8px`. That 8px is already the step above the slot. Do not add a second margin above `.vt-ck-meta`. Do not put `--vt-heading-3` or `--vt-font-display` on the slot:

```css
.vt-ck-title {
  margin: 0 0 8px;
  font-family: var(--vt-font-display);
  font-size: var(--vt-heading-3);
  line-height: var(--vt-heading-leading);
  letter-spacing: var(--vt-heading-tracking);
  font-weight: var(--vt-weight-semibold);
  color: var(--vt-text-primary);
}

.vt-ck-body {
  margin: 0 0 18px;
  font-size: var(--vt-body-sm);
  line-height: var(--vt-body-leading);
  color: var(--vt-text-secondary);
  max-inline-size: 46ch;
}
```

**Logical margin analog** (lines 71-73). New rule follows this, not the title shorthand:

```css
.vt-ck-alert {
  margin-block-end: 12px;
}
```

**The only new rule.** Contract from `26-UI-SPEC.md`. Do not add `:hover`, `transition`, `max-inline-size`, or `overflow`:

```css
.vt-ck-meta {
  display: block;
  margin-block: 0 var(--vt-space-2);
  min-inline-size: 0;
  font-family: var(--vt-font-body);
  font-size: var(--vt-body-sm);
  font-weight: var(--vt-weight-regular);
  line-height: var(--vt-body-leading);
}
```

**Leave these** (lines 101-111). Print already hides the banner. Reduced motion already kills the sheet animation. Do not add a pill rule under either query:

```css
@media print {
  .vt-ck-banner {
    display: none !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .vt-ck-sheet {
    animation: none;
  }
}
```

---

### `apps/web/app/[locale]/cookies/page.tsx` (route, request-response)

**Analog:** the file itself. One pill for the whole Meta row, after the table, still inside `#necessary`. Not a fourth `rows` entry. Not a cell. Not a heading.

**Imports pattern** (lines 1-10). `PendingSlot` is already imported. Do not add a CSS import. `LegalPage.tsx` line 14 already imports `LegalPage.css`:

```tsx
import { CookieSettingsChangeButton } from "@/components/consent/CookieBanner";
import { LanguageCoverageNotice, LegalPage, PendingSlot, type LegalSection } from "@/components/legal";
```

**Core pattern** (lines 84-120). Keep the three duration pills. Keep the `h4`. Insert after the `data-lenis-prevent` wrapper (ends line 119), before the section close (line 120). Class is `vt-legal-blank--row` only. Do not also add `vt-legal-blank`. Do not add `Meta`, `Marketing`, or a duration label:

```tsx
      <section id="necessary">
        <h2>
          <span data-lg-n="1">02</span>
          {tCookies("cookies-we-set")}
        </h2>
        <p>{tCookies("necessary-only-standfirst")}</p>
        <h4>{tCookies("strictly-necessary")}</h4>
        <div data-lenis-prevent>
          <Table
            columns={columns}
            rowKey="slug"
            rows={[
              {
                slug: "locale",
                name: <span data-i18n-skip>NEXT_LOCALE</span>,
                purpose: tCookies("language-cookie-purpose"),
                provider: "Vamos Taxi",
                duration: <PendingSlot label="Language cookie duration" />,
              },
              {
                slug: "session",
                name: <span data-i18n-skip>sb-*-auth-token</span>,
                purpose: tCookies("session-cookie-purpose"),
                provider: "Vamos Taxi · Supabase",
                duration: <PendingSlot label="Session duration" />,
              },
              {
                slug: "consent",
                name: <span data-i18n-skip>consent_subject</span>,
                purpose: tCookies("consent-subject-purpose"),
                provider: "Vamos Taxi",
                duration: <PendingSlot label="Consent duration" />,
              },
            ]}
          />
        </div>
      </section>
```

Insert between the wrapper close and the section close:

```tsx
<div className="vt-legal-blank--row" data-meta-slot="cookies">
  <PendingSlot label="Meta cookie row" />
</div>
```

**Do not copy** table cell padding into a new row. `apps/web/components/data/Table.css` lines 7-8 are why the blank sits outside the table (`padding: 14px 16px` on `td`). The 16px content edge is `--vt-space-4` on the wrapper, not a `Table.tsx` fork. Do not edit `Table.tsx`. Do not move the slot to `#analytics` (lines 122-129) to "fix" classification. Keep `no-ads`.

**Error handling:** none. This page does not fetch Meta.

---

### `apps/web/app/[locale]/privacy/page.tsx` (route, request-response)

**Analog:** the `#cookies` section in this file for placement. Imprint `PendingSlot` for a pill that is not inside a sentence. Do not copy the `data-slot` adviser blocks.

**Imports pattern** (line 7). `PendingSlot` is already imported. No new import:

```tsx
import { LanguageCoverageNotice, LegalPage, PendingSlot, type LegalSection } from "@/components/legal";
```

**Anti-pattern — do not extend** (lines 153-160 and 235-242). These are adviser blanks, not `PendingSlot`. Do not put a Meta sentence in them:

```tsx
        <div data-slot="1" data-i18n-skip>
          <p data-slot-k="1">Client legal text · statutory references</p>
          <p>
            Your adviser adds the article references for each basis under revFADP and, where a
            customer is in the EU, the GDPR. The layout holds one reference line per row without
            changing.
          </p>
        </div>
```

**Keep, do not retitle** (lines 213-219). Analytics pills are not the Meta slot:

```tsx
          <ListRow
            title={<PendingSlot label="Analytics provider" />}
            subtitle={
              <>
                {t("site-analytics-only-with-your-consent")} <PendingSlot label="Analytics region" />
              </>
            }
          />
```

**Core pattern** (lines 353-364). Insert between the two paragraphs, inside `#cookies`. Not inside either `p`. Class is `vt-legal-blank` only. Do not also add `vt-legal-blank--row`. Do not set a font-size; prose already sets 16px / 1.6 (`LegalPage.css` lines 14-18):

```tsx
      <section id="cookies">
        <h2>
          <span data-lg-n="1">08</span>
          {tCommon("cookies-consent")}
        </h2>
        <p>{t("strictly-necessary-cookies-keep-a-booking-workin")}</p>
        <p>
          <Link href="/cookies">{t("read-the-cookie-policy")}</Link>
          {tCommon("or")}{" "}
          <Link href="/cookies">{t("open-your-cookie-preferences")}</Link>.
        </p>
      </section>
```

Insert between those paragraphs:

```tsx
<div className="vt-legal-blank" data-meta-slot="privacy">
  <PendingSlot label="Meta privacy line" />
</div>
```

**Do not fill** hero date pills. They are rendered by `LegalPage.tsx` lines 73-81 from `effectiveDateLabel` / `versionLabel`. Leave `Privacy effective date` and `Privacy version` as pills.

---

### `apps/web/components/legal/LegalPage.css` (config, transform)

**Analog:** `[data-lg-prose] p` for the 14px privacy gap. Not `.vt-legal-meta`. Both new classes are absent. Add only these two rules. Logical properties only.

**Why cookies and privacy pick this file up** (`LegalPage.tsx` line 14). Do not add a CSS import on either page:

```tsx
import "./LegalPage.css";
```

**Spacing analog** (lines 14-18 and 58-73). Privacy slot matches the paragraph's `14px`. Do not round it to 16px. Do not copy `text-wrap: pretty` onto the pill. The last-child rule zeros margin on a trailing `p` or `ul` only. It does not style a `div`, so the privacy wrapper needs its own `margin-block-end`:

```css
[data-lg-prose] {
  max-inline-size: 68ch;
  font-size: var(--vt-body-md);
  line-height: var(--vt-body-leading);
  color: var(--vt-text-secondary);
}
[data-lg-prose] p {
  margin-block-end: 14px;
  text-wrap: pretty;
}
[data-lg-prose] p:last-child,
[data-lg-prose] ul:last-child {
  margin-block-end: 0;
}
```

**Do not reuse** (lines 308-316). Hero date cluster. Inverse type. Not a blank:

```css
.vt-legal-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 28px;
  margin-block-start: 32px;
  padding-block-start: 24px;
  border-block-start: 1px solid var(--vt-border-inverse);
}
```

**The only new rules.** Cookies row uses `--row` only, so the base `14px` must not apply to it. Do not put both classes on one element:

```css
.vt-legal-blank--row {
  display: block;
  margin-block-start: var(--vt-space-2);
  margin-block-end: 0;
  padding-inline-start: var(--vt-space-4);
  min-inline-size: 0;
  font-size: var(--vt-body-sm);
  font-weight: var(--vt-weight-regular);
  line-height: var(--vt-body-leading);
  text-align: start;
}

.vt-legal-blank {
  display: block;
  margin-block-end: 14px;
  min-inline-size: 0;
}
```

**Print analog to leave** (lines 395-399). Do not add a Meta print rule:

```css
  [data-tok] {
    background: #fff !important;
    border-color: #000 !important;
    color: #000 !important;
  }
```

---

### `apps/web/lib/meta/legal-gate.ts` (utility, transform)

**Analog:** `apps/web/lib/supabase/constants.ts` for the file shape. `apps/web/lib/db/quote.ts` lines 164 for `=== true` only. Not `policy.ts`. Not a client component. Not an env var. Not a database row. Not a pill scan.

**File-shape pattern** (`constants.ts` lines 1-7). One export. Header comment says what it is not. No React import:

```ts
// apps/web/lib/supabase/constants.ts
//
// One declaration of the Auth user-metadata locale key (D-09). The signup path
// (plan 05-16) writes it into options.data; the Send Email Hook (plan 05-12)
// reads it off user.user_metadata. Neither retypes the string.

export const AUTH_LOCALE_METADATA_KEY = "locale" as const;
```

**Fail-closed comparison to copy, not the loader** (`quote.ts` lines 127 and 160-165). `loadLaunchFlags` trusts a database boolean after the RPC exists. That is the wrong gate here. Copy only `=== true`. Do not copy `asQuote`, `emit`, or the catch that still returns a closed object after a live read:

```ts
const LAUNCH_FLAGS_CLOSED = { public_chf: false, vat_rate_bps: 81 } as const;
    if (!isRecord(result) || !("public_chf" in result)) {
      return { ...LAUNCH_FLAGS_CLOSED };
    }
    const flags: LaunchFlags = {
      public_chf: result.public_chf === true,
      vat_rate_bps: vatRateBpsFrom(result.vat_rate_bps),
    };
```

**Core pattern.** New file. Hard false. The function returns true only for `=== true`, so a later edit that assigns anything else stays closed. Do not import the pixel id. Do not import React. Do not read `process.env`. Do not mention `PendingSlot`, `fetch(`, `fbevents`, or `fbq`. No TODO that a later agent can finish:

```ts
// apps/web/lib/meta/legal-gate.ts
//
// Fail-closed. Not env, not a pill scan, not Accept.
// Phase 26 leaves this false. Do not import the pixel id. Do not import React.

export const META_LEGAL_GATE_OPEN = false as const;

export function metaMeasurementAllowed(): boolean {
  return META_LEGAL_GATE_OPEN === true;
}
```

**Do not put this constant in** `apps/web/lib/consent/policy.ts`. That file is the version stamp. Editing it invites a bump. Pin it; do not change it (full file, lines 1-5):

```ts
// apps/web/lib/consent/policy.ts
//
// D-04: policy_version is a dated stamp, not legal copy.

export const CONSENT_POLICY_VERSION = "2026-09-12";
```

**Do not wire call sites.** Phase 28 and Phase 29 import `metaMeasurementAllowed()`. This phase does not. Do not edit `SiteShell.tsx`, `settle.ts`, `headers.ts`, or `bind.ts`.

---

### `apps/web/lib/meta/legal-gate.test.ts` (test, file-I/O)

**Analog:** `apps/web/lib/legal/extract-no-invent.test.ts`. Secondary reads: `banner-contract.test.ts` (banner source), `record.test.ts` (marketing false — its version pin is a date shape, not the exact string), `public-chf.test.ts` (one-directory `readdirSync`), `headers.test.ts` (host absence). Not a pixel loader. Not a browser spec. `apps/web/vitest.config.ts` already includes `lib/**/*.test.ts`. Do not edit that config.

**Harness pattern** (`extract-no-invent.test.ts` lines 8-19 and 37-45). `source()` from `webRoot`. Exact `PendingSlot` label string. Forbidden needle stays in the test, not in the page. Do not invent a sentence in an assertion message:

```ts
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");

function source(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

describe("imprint UID stays TBC (D-26 D-28)", () => {
  it("Uid number is a PendingSlot, not an invented CHE number", () => {
    const imprint = source("app/[locale]/imprint/page.tsx");
    const slot = source("components/legal/PendingSlot.tsx");
    expect(imprint).toContain('<PendingSlot label="Uid number" />');
    expect(slot).toMatch(/data-tok/);
    expect(imprint).not.toMatch(/CHE-296\.035\.710/);
    expect(imprint).not.toMatch(/CHE-\d{3}\.\d{3}\.\d{3}/);
  });
});
```

Sibling test path math differs. `banner-contract.test.ts` lines 12-16 climb to the repo root because the test lives under `components/consent/`. The new test lives under `lib/meta/`, so use the `extract-no-invent` climb (`../..` from `lib/legal` is `apps/web`; from `lib/meta` that is the same `webRoot`).

**Banner pin to keep green, and to mirror** (`banner-contract.test.ts` lines 19-34). The new test adds the slot assertions. Do not weaken this file. Do not delete Accept / Dismiss:

```ts
describe("production cookie banner (D-05)", () => {
  it("is Accept and Dismiss only — no fake toggles", () => {
    const src = readRepo("apps/web/components/consent/CookieBanner.tsx");
    expect(src).toMatch(/Accept/);
    expect(src).toMatch(/Dismiss/);
    expect(src).toMatch(/accept_all/);
    expect(src).toMatch(/reject_all/);
    expect(src).not.toMatch(/save_choices/);
```

**Version pin must be tighter than the existing one** (`record.test.ts` lines 53-67). That test allows any `20YY-MM-DD`. The new test pins the exact assignment. Do not edit `record.test.ts` to loosen it:

```ts
  it("always records necessary true and functional/analytics/marketing false (D-03, D-05)", () => {
    const src = readRepo("apps/web/lib/consent/bind.ts");
    expect(src).toMatch(/necessary:\s*true|p_necessary:\s*true|true,\s*false,\s*false,\s*false/);
    expect(src).toMatch(/functional:\s*false|p_functional:\s*false/);
    expect(src).toMatch(/analytics:\s*false|p_analytics:\s*false/);
    expect(src).toMatch(/marketing:\s*false|p_marketing:\s*false/);
  });

  it("policy_version is a dated stamp constant, not legal prose", () => {
    const src = readRepo("apps/web/lib/consent/policy.ts");
    expect(src).toMatch(/CONSENT_POLICY_VERSION/);
    expect(src).toMatch(/20\d{2}-\d{2}-\d{2}/);
```

Exact string the new test asserts, from `policy.ts` line 5: `export const CONSENT_POLICY_VERSION = "2026-09-12";`. Also assert `bind.ts` still has `marketing: false` and `policyVersion = input.policyVersion ?? CONSENT_POLICY_VERSION` (`bind.ts` lines 19-24 and 45). Do not edit `bind.ts`.

**Directory walk analog** (`public-chf.test.ts` lines 9-24 and 138-148). One directory, skip `*.test.ts`, needle a forbidden token, pass the filename as the assertion message. There is no recursive walker. Compose a walk of `app`, `components`, `lib`, and `public` from this shape. Skip `node_modules`, `.next`, `.wrangler`, and the test file itself. Do not open `.dev.vars` or wrangler secret state:

```ts
import { readdirSync, readFileSync } from "node:fs";

function source(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

    const checkoutDir = join(webRoot, "lib/checkout");
    const files = readdirSync(checkoutDir).filter(
      (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
    );
    for (const name of files) {
      const src = source(`lib/checkout/${name}`);
      expect(src, name).not.toMatch(/sk_live_/);
    }
```

**Host-absence analog** (`headers.test.ts` lines 44-55). Needle the host. Do not needle the word `facebook`. Do not needle `Meta` (the labels contain it):

```ts
  it("CSP allowlists Stripe, Turnstile, Mapbox and does not include sentry.io", () => {
    const csp = headerMap().get("Content-Security-Policy") ?? "";
    expect(csp).toMatch(/js\.stripe\.com/);
    expect(csp).toMatch(/challenges\.cloudflare\.com/);
    expect(csp).toMatch(/api\.mapbox\.com/);
    expect(csp).not.toMatch(/sentry\.io/);
    expect(csp).not.toMatch(/vamostaxi\.eu/);
  });
```

**Why `facebook` alone is a false fail** (`SiteFooter.tsx` line 52). Brand URL. Not the pixel. Do not delete it. Do not put `SiteFooter.tsx` in the diff:

```ts
const FACEBOOK = "https://www.facebook.com/VAMOSTAXISWITZERLAND";
```

**Runner trap** (`vitest.config.ts` lines 15-29). Include already covers the new test. `passWithNoTests: true` makes a missing file exit 0. The command starts with `test -f`. Do not add `**/*.spec.ts` to `include`. Do not point verify at `tests/visual/legal-privacy-cookies.spec.ts`:

```ts
    include: [
      "lib/**/*.test.ts",
      "tests/unit/**/*.test.ts",
      "components/consent/**/*.test.ts",
    ],
    exclude: [
      "node_modules/**",
      "tests/visual/**",
      "tests/integration/**",
      "**/*.spec.ts",
    ],
    passWithNoTests: true,
```

**`it()` names to write,** from `26-RESEARCH.md`. A later VALIDATION.md should copy them. Do not invent extra names:

1. `slots exist` — three wrappers, three labels, three `data-meta-slot` hooks. Cookies page has exactly one `Meta cookie row`. Duration pills remain. Privacy still has `Analytics provider` and `Analytics region`. Imprint still has `Uid number` and `Photography credit`.
2. `no sentence` — each wrapper is the `div` plus one `<PendingSlot label="..." />`. Labels contain no `.`, `!`, or `?`. Do not ban `Meta` or `facebook`.
3. `necessary-cookies-only remains` — the `h2` expression stays. The four locale JSON files still have the key. Do not edit those files. English value stays `Necessary cookies only`.
4. `policy version unchanged` — exact `2026-09-12` assignment. No second assignment under `apps/web`.
5. `no fbevents.js` — zero matches in `app`, `components`, `lib`, `public` for `fbevents.js`, `connect.facebook.net`, `fbq(`, `facebook.com/tr`, `graph.facebook.com`, and the pixel id. `headers.ts` has no `connect.facebook.net`. Secret name `META_CAPI_ACCESS_TOKEN` is absent from those trees. Do not assert a token value.
6. `flag off` — import `{ META_LEGAL_GATE_OPEN, metaMeasurementAllowed }` from `./legal-gate`. Both false. Module source has `= false` and does not contain `process.env`, `fetch(`, `PendingSlot`, `fbevents`, `fbq`, or the pixel id. Exactly one assignment of `META_LEGAL_GATE_OPEN`.
7. `marketing stays false` — `bind.ts` still has `marketing: false` and still defaults `policyVersion` to `CONSENT_POLICY_VERSION`.

**Flag import pattern** for test 6 only. Product files in this phase do not import it:

```ts
import { META_LEGAL_GATE_OPEN, metaMeasurementAllowed } from "./legal-gate";
```

## Shared Patterns

### PendingSlot, reuse only

**Source:** `apps/web/components/legal/PendingSlot.tsx` lines 1-11
**Apply to:** banner, cookies page, privacy page
**Do not edit this file.** Do not add props. Do not add `"use client"`. English label. `laws.css` appends ` TBC`. Do not type `TBC` into the label. `{label}` is text, not HTML. Do not use `dangerouslySetInnerHTML`.

```tsx
export function PendingSlot({ label }: { label: string }) {
  return (
    <span data-tok="1" data-i18n-skip title="Awaiting a confirmed value from Vamos Taxi">
      {label}
    </span>
  );
}
```

Imprint block-level call, same shape (`apps/web/app/[locale]/imprint/page.tsx` lines 154-156). Existing non-Meta blanks stay blanks. They do not open the gate and they do not block it:

```tsx
          <DlRow term={tLegal("uid-vat-number")}>
            <PendingSlot label="Uid number" />
          </DlRow>
```

### TBC suffix, do not restyle

**Source:** `apps/web/public/brand/tokens/laws.css` lines 59-65
**Apply to:** all three slots, by leaving this file alone. A change here restyles every pill. Same rule exists in `design-system/tokens/laws.css`. Do not edit either.

```css
[data-tok]{display:inline;padding:1px 7px 2px;border:1px dashed var(--vt-grey-300);border-radius:var(--vt-radius-xs,4px);background:var(--vt-grey-50);color:var(--vt-text-secondary);white-space:nowrap}
[data-tok]::after{content:" TBC";font-size:11px;letter-spacing:var(--vt-label-tracking);text-transform:uppercase;font-weight:var(--vt-weight-semibold);color:var(--vt-text-muted)}
```

### No dictionary key

**Source:** `PendingSlot.tsx` line 7 `data-i18n-skip`
**Apply to:** the three labels. Do not add keys to `en.json`, `de.json`, `fr.json`, or `ar.json`. Do not translate the blank names. The banner title stays `t("necessary-cookies-only")`. That key is not the slot.

### Fail-closed flag

**Source:** new `legal-gate.ts`, comparison shape from `quote.ts` line 164
**Apply to:** the new module only. Later phases import `metaMeasurementAllowed()`. This phase adds no call site. Any value other than `true` is closed. Do not derive the flag from missing pills, from Accept, or from `CONSENT_POLICY_VERSION`.

### Marketing stays false

**Source:** `apps/web/lib/consent/bind.ts` lines 19-24 and 45
**Apply to:** the test pin only. Do not edit `bind.ts`. An old Accept of `2026-09-12` is not a yes. Do not `UPDATE` `consent_log`.

```ts
const CATEGORIES = {
  necessary: true,
  functional: false,
  analytics: false,
  marketing: false,
} as const;

  const policyVersion = input.policyVersion ?? CONSENT_POLICY_VERSION;
```

### Absence needles

**Source:** `extract-no-invent.test.ts` lines 43-44, `headers.test.ts` lines 54-55, `SiteFooter.tsx` line 52
**Apply to:** `legal-gate.test.ts` only. Needles: `fbevents.js`, `connect.facebook.net`, `fbq(`, `facebook.com/tr`, `graph.facebook.com`, the pixel id, and the secret name `META_CAPI_ACCESS_TOKEN`. Do not needle `facebook` alone. Do not needle `Meta` alone. Do not read the token. Do not print it. Do not add a CSP host.

### Vitest vacuous green

**Source:** `apps/web/vitest.config.ts` lines 15-29
**Apply to:** every verify command for this phase. `test -f apps/web/lib/meta/legal-gate.test.ts` before `pnpm --dir apps/web exec vitest run lib/meta/legal-gate.test.ts`. A green full suite is not proof the file exists.

## No Analog Found

Do not build these. RESEARCH.md's Meta snippet is the anti-pattern, not a pattern to copy.

| File | Role | Data Flow | Reason |
|---|---|---|---|
| pixel loader (`pixel.tsx`, `fbevents.js`, `next/script`, `fbq`) | — | — | Out of phase. No loader exists. Do not create one. Absence is the pattern. |
| `gate.ts`, `capi.ts`, `purchase.ts`, `app/api/meta/` | — | — | Phase 28-29 names. Creating them now is how the snippet lands early. |
| Pill scanner that sets the flag | utility | transform | Forbidden. D-03. No analog, because a scanner would open the gate. |
| i18n keys for the three labels | config | — | Not required. `data-i18n-skip` already covers English pills in de, fr, and ar. |
| Edits to `policy.ts`, `PendingSlot.tsx`, `laws.css`, `i18n/messages/*.json` | — | — | Locked. Cite them. Do not plan a diff. |
| Quote, pay, confirmation, `settle.ts`, `SiteShell.tsx`, `headers.ts`, `middleware.ts`, `Table.tsx` | — | — | Out of the file list. Do not plan a diff. |

## Metadata

**Analog search scope:** `apps/web/components/consent/`, `apps/web/components/legal/`, `apps/web/app/[locale]/cookies/`, `apps/web/app/[locale]/privacy/`, `apps/web/app/[locale]/imprint/`, `apps/web/lib/consent/`, `apps/web/lib/legal/`, `apps/web/lib/db/quote.ts`, `apps/web/lib/supabase/constants.ts`, `apps/web/lib/pricing/public-chf.test.ts`, `apps/web/lib/security/headers.test.ts`, `apps/web/public/brand/tokens/laws.css`, `apps/web/components/shell/SiteFooter.tsx`, `apps/web/vitest.config.ts`
**Files scanned:** 18 analogs read, plus absence searches for `fbevents` / `fbq(` / `connect.facebook` (zero matches) and for `.vt-ck-meta` / `.vt-legal-blank` (zero matches)
**Pattern extraction date:** 2026-09-24

## Planner locks

- Product files this phase may touch: `CookieBanner.tsx`, `CookieBanner.css` (`.vt-ck-meta` only), `cookies/page.tsx`, `privacy/page.tsx`, `LegalPage.css` (`.vt-legal-blank` and `.vt-legal-blank--row` only), plus the two new `apps/web/lib/meta/` files.
- Wave 0 creates `legal-gate.test.ts` before any product edit. The test imports `legal-gate.ts`.
- Existing tests that must stay green and must not be weakened: `lib/consent/record.test.ts`, `lib/legal/extract-no-invent.test.ts`, `lib/security/headers.test.ts`, `components/consent/banner-contract.test.ts`.
- Do not deploy. Slots in source are the deliverable. The gate stays closed either way.

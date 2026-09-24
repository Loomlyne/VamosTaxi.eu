# Phase 26: Legal gate - Research

**Researched:** 2026-09-23
**Domain:** Empty Meta TBC slots plus a fail-closed measurement flag. No pixel. No legal sentence.
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### What counts as the lines being in
- **D-01:** The gate opens only when the Meta TBC pills are gone, in en, de, fr, and ar.
- **D-02:** Real data only. Not a pill filling a space, and not a mockup. Existing non-Meta blanks stay blanks: cookie durations, the UID, photo credit. They do not open the gate and they do not block it. Do not invent them.
- **D-03:** Only text Koss pastes opens the gate. A sentence the agent wrote keeps the flag off. Do not write the legal lines. Do not translate them. He asked for that. Refused.
- **D-04:** The current banner line "Necessary cookies only" does not count. He has to replace it before the gate opens. Until then it stays, because it is still true while the pixel is off.
- **D-05:** Chat or a doc is not enough. The lines have to be on the live banner, the live cookies page, and the live privacy page.
- **D-06:** All four languages have to be his text. A translation the agent wrote keeps the flag off.
- **D-07:** If a live line still says TBC, or still says necessary cookies only, the gate stays closed.

### What this phase puts on the pages
- **D-08:** Empty Meta TBC slots on the banner, the cookies page, and the privacy page. No sentence in them. Flag stays off.
- **D-09:** Leave "Necessary cookies only" up. The empty Meta slot sits with it. The gate stays closed.
- **D-10:** This milestone must finish with the pixel working. Do not park Meta for a later milestone. This phase still does not load the script. The Pixel ID and the Worker token are used by later phases in this same milestone, and not before the gate can open.
- **D-11:** Cookies page: one pill for the whole Meta row. No sentence. Not separate pills for name, purpose, and duration.

### When the version changes
- **D-12:** Policy version stays `2026-09-12` while the slots are empty. It changes only when his four-language lines are on the live pages.
- **D-13:** The new version string is the Zurich date that day. He does not pick a number.
- **D-14:** When that date goes live, the banner comes back. An old Accept of `2026-09-12` is not a yes to the new lines.
- **D-15:** The date customers see on the cookies and privacy pages, and the stored version, are the same Zurich date. One string.

### Who places the text
- **D-16:** He sends the exact words. The agent places those words. The agent does not write them.
- **D-17:** Place them in the code only. They stay off the live site until he says deploy.
- **D-18:** If the words still say TBC, or still say necessary cookies only, do not place them. Tell him the gate stays closed.
- **D-19:** Do not place a partial set. Wait until the banner, cookies, and privacy lines are all in his words, in all four languages. Then place that set.

### Claude's Discretion
- The Meta cookie-row duration was asked and not chosen. Do not invent a duration. D-11 already makes it one pill for the whole row, so a duration is part of his later paste, not a separate pill.
- He never selected "You decide".
- Pixel ID `1595596972063765` stays out of the client and out of any script in this phase. Record it here so later phases do not ask again. Do not read or print `META_CAPI_ACCESS_TOKEN`.

### Deferred Ideas (OUT OF SCOPE)
- Phase 27: consent record. The banner coming back on the new version is locked here (D-14). The Accept / Dismiss wiring is that phase.
- Phase 28: PageView. Wire Pixel ID `1595596972063765` only after this gate can open. No `fbevents.js` in phase 26.
- Phase 29: one server Purchase after Stripe says paid. Event id is the booking reference, same as the browser event. Do not send it now.
- He asked to send Purchase now, and to have the agent write the legal lines. Both refused. The token and the Pixel ID stay unused until the gate is open.
- These later phases are in this milestone. They are not a later milestone. They are out of phase 26.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| META-01 | The pixel and the Purchase call stay off until the owner pastes the banner, cookies, and privacy lines in en, de, fr, and ar. Do not draft them. | Empty `PendingSlot`s on the three locked surfaces. New `metaMeasurementAllowed()` hard-false. Source pin that `fbevents.js` is absent. Do not derive the flag from pill text. |
| META-02 | A new consent policy version. An old Accept, from when marketing was stored off, does not turn Meta on. | Do not bump `CONSENT_POLICY_VERSION`. Pin it at `2026-09-12`. Pin `bind.ts` `marketing: false`. Old rows stay identifiable because `consent_log.policy_version` is append-only. The Zurich date and the banner-return are later, after his lines are live. |
</phase_requirements>

## Summary

This phase adds three empty Meta blanks and a measurement flag that cannot open. It does not load the pixel, does not send Purchase, and does not write or translate a legal line. The blanks reuse `PendingSlot`. `laws.css` already appends ` TBC`. No dictionary key is required. `CONSENT_POLICY_VERSION` stays `2026-09-12`. `bind.ts` keeps `marketing: false`, so an Accept stored today cannot turn Meta on.

The fail-closed flag is a new pure module, `apps/web/lib/meta/legal-gate.ts`, exporting `META_LEGAL_GATE_OPEN = false` and `metaMeasurementAllowed()`. It is not an env var, not a database row, not a pill scan, and not a client component. Phase 28 and Phase 29 import that function and treat any value other than `true` as closed. This phase does not add those call sites. It proves the script is absent by a vitest source pin, not by mounting a loader.

Meta's own install docs still tell you to put `https://connect.facebook.net/en_US/fbevents.js` in `<head>` and call `fbq('track', 'PageView')`, and their GDPR page still calls `fbq('consent', 'revoke')` before `init`. That sample is the anti-pattern. Do not follow it. Do not add a package.

**Primary recommendation:** Add the three empty slots exactly where `26-UI-SPEC.md` places them, add `lib/meta/legal-gate.ts` hard-false, and lock both with `lib/meta/legal-gate.test.ts`. Do not edit `policy.ts`, `PendingSlot.tsx`, `laws.css`, or `i18n/messages/*.json`. Do not deploy.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Empty Meta slots | Browser / Client (rendered by existing RSC + client banner) | — | The blanks are markup on three existing surfaces. No API. No new screen. |
| Fail-closed flag | Shared module (`apps/web/lib/meta`) | — | Phase 28 is a client mount. Phase 29 is the Worker queue. A `"use client"` flag cannot be the Worker read. A DB or env flag can flip without the four live lines. |
| Policy version stamp | API / Backend (`record_consent`) | Database (`consent_log.policy_version`) | Already written by `bind.ts`. This phase does not change it. |
| Pixel script | — (must not exist) | CDN / Static must not contain it | `/cookies` and `/privacy` are in `MARKETING_CACHE_PATHS`. A script in those documents would be cached. Do not add one. |
| Purchase | — (must not exist) | Worker queue later | `handleStripeMessage` has no Graph call today. Do not add one. |

## Project Constraints (from HERMES.md)

`./HERMES.md` is absent. Binding stand-ins, same authority for this phase:

- Session `.hermes.md`: Always GSD. Never invent legal copy. Four languages, same pass. No `sk_live_`. No `vamostaxi.eu`. Do not push `main`. This research task does not commit.
- `CLAUDE.md`: A missing legal value is a `data-tok` pill. The stylesheet appends ` TBC`. TBC labels stay English. No glow. No tinted yellow. Logical properties. Do not invent a colour.
- `vamos-gsd-plan`: Do not draft banner, cookies, or privacy sentences. A pill keeps the flag off. Other blanks (UID, photo credit, non-Meta durations) neither open nor block the gate. Automated verify points at `lib/**/*.test.ts`, never `tests/integration/*.spec.ts` or `**/*.spec.ts`.
- `26-UI-SPEC.md` is approved. D-08, D-09, D-11, D-02 win on conflict with any looser milestone note. The milestone `SUMMARY.md` line that says Phase 26 delivers a paste check and a new `policy_version` is overridden by D-12 and D-03. Do not implement that paste check. Do not bump the version.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 15.5.25 | Existing app. Server pages for cookies and privacy. Client banner. | Already the site. Do not bump. [VERIFIED: `apps/web/package.json`] |
| React (existing) | (app lock) | `PendingSlot` and `CookieBanner` | Reuse. Do not add a Meta component. |
| vitest | 4.1.11 | Source pins | Already the unit runner. Include is `lib/**/*.test.ts`. [VERIFIED: `apps/web/package.json`, `apps/web/vitest.config.ts`] |
| `PendingSlot` | in repo | The blank | `data-tok` + `data-i18n-skip`. `laws.css` appends ` TBC`. [VERIFIED: `PendingSlot.tsx`, `apps/web/public/brand/tokens/laws.css:64-65`] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| next-intl | existing | Banner title `t("necessary-cookies-only")` only | Do not add a key for the blank. |
| None added | — | — | No Pixel SDK. No CMP. No tag manager. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hard-false module | Env var / wrangler var | A var flips without the four live lines. Forbidden. |
| Hard-false module | `settings` row, like `public_chf` | Needs SQL. Owner-apply. A row is not "lines on the live pages". Forbidden this phase. |
| Hard-false module | "TBC pills are gone" scanner | Deleting the pills, or an agent-written sentence, would open the gate. D-03 forbids that. |
| Official Pixel snippet | `fbq('consent', 'revoke')` | The file is already downloaded. Forbidden. |
| Reuse `PendingSlot` | New Meta pill component | Restyles nothing and forks Law 04. Forbidden by UI-SPEC. |

**Installation:**

```bash
# none — do not npm install
```

**Version verification:** No new package. Existing pins read from `apps/web/package.json` on 2026-09-23: `next` 15.5.25, `vitest` 4.1.11. Node `v26.7.0`. pnpm `11.7.0`.

## Package Legitimacy Audit

No external package. Gate not run. Do not install one to "prove the pixel is absent."

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `react-facebook-pixel` | npm | not re-checked | — | — | not run | REMOVED — do not install. Milestone STACK already rejected it. |
| `facebook-nodejs-business-sdk` | npm | not re-checked | — | — | not run | REMOVED — do not install. Token would leave the Worker. |
| Zaraz / GTM / a CMP | — | — | — | — | — | REMOVED — loads a script outside this gate. |

**Packages removed due to slopcheck [SLOP] verdict:** none (slopcheck not run; nothing to install)
**Packages flagged as suspicious [SUS]:** none

Do not add `connect.facebook.net` to CSP. Do not add `next/script`. `apps/web` has zero `next/script` imports today. [VERIFIED: content search, 2026-09-23]

## Architecture Patterns

### System Architecture Diagram

```
Owner lines (not sent)
        |
        v
   gate stays closed
        |
        +-- banner h2 "Necessary cookies only"  (keep)
        |         +-- sibling div.vt-ck-meta
        |               +-- PendingSlot "Meta banner line"  -> visible "Meta banner line TBC"
        +-- cookies #necessary, after the table, not inside it
        |         +-- div.vt-legal-blank--row
        |               +-- PendingSlot "Meta cookie row"
        +-- privacy #cookies, between the two existing paragraphs
                  +-- div.vt-legal-blank
                        +-- PendingSlot "Meta privacy line"

metaMeasurementAllowed()  --returns false-->  no script tag
                                              no fbq
                                              no Graph POST
                                              no CSP host added

Later (not this phase):
  Phase 28 loader  --imports metaMeasurementAllowed()--> inject only if true
  Phase 29 settle  --imports the same function--------> fetch Graph only if true
```

The arrow that opens the gate does not exist in this phase. Do not draw a scanner from the pills to the flag.

### Recommended Project Structure

```
apps/web/lib/meta/legal-gate.ts          # NEW. The only new runtime file. Hard false.
apps/web/lib/meta/legal-gate.test.ts     # NEW. Nyquist pins. Not a pixel loader.
apps/web/components/consent/CookieBanner.tsx    # one slot after the h2
apps/web/components/consent/CookieBanner.css    # .vt-ck-meta only
apps/web/app/[locale]/cookies/page.tsx          # one row-level slot after the table
apps/web/app/[locale]/privacy/page.tsx          # one slot in #cookies
apps/web/components/legal/LegalPage.css         # .vt-legal-blank and .vt-legal-blank--row only
```

Do not create `pixel.tsx`, `gate.ts`, `capi.ts`, `purchase.ts`, or `app/api/meta/`. Those names are Phase 28-29. Creating them now is how the snippet lands early.

`apps/web/lib/meta/` does not exist today. [VERIFIED: directory absent, 2026-09-23]

### Pattern 1: Reuse PendingSlot. Do not add a key.

**What:** The blank is `<PendingSlot label="..." />` inside a `div`. English label. `laws.css` appends ` TBC`. `data-i18n-skip` is already on the span.

**When to use:** All three surfaces.

**Why no i18n edit:** Production copy goes through `useTranslations` / `getTranslations`. These labels are not `t()` calls. Existing pills (`Language cookie duration`, `Uid number`) already render in de, fr, and ar with no dictionary key. next-intl does not walk the DOM. There is no test that fails on a new English JSX literal. [VERIFIED: `PendingSlot.tsx`, `cookies/page.tsx:101`, no untranslated-JSX test under `apps/web`]

**Example:** see Code Examples. Source: `26-UI-SPEC.md` Copywriting Contract, checked against live files 2026-09-23.

### Pattern 2: The flag is a constant, not a conclusion

**What:** One boolean, typed `false`, plus a function that returns true only for `=== true`.

**When to use:** This phase creates it. Later phases import it. Nothing else may redeclare it.

**Why this file, not `policy.ts`:** UI-SPEC and the task forbid editing `policy.ts`. The version stamp and the gate are different locks. Putting the flag next to the version invites a bump. [VERIFIED: `policy.ts` is the one assignment of `CONSENT_POLICY_VERSION`]

**Why not `CookieBanner.tsx`:** The file is `"use client"`. Phase 29 reads the flag from `handleStripeMessage` in the Worker (`apps/web/lib/checkout/settle.ts:205`). A client module is the wrong boundary. The banner also returns `null` when `hidden` is true (`CookieBanner.tsx:166`), so a flag that lives only in the mounted banner disappears after Accept.

**Why not `public_chf`'s shape:** `loadLaunchFlags` fail-closes when the RPC is missing, then trusts a database boolean (`apps/web/lib/db/quote.ts:127-164`). That is correct for a fare the owner publishes. It is wrong here. A row can be true while the pages still say TBC.

**Example:**

```typescript
// apps/web/lib/meta/legal-gate.ts
// Fail-closed. Not env, not a pill scan, not Accept.
// Phase 26 leaves this false. Do not import the pixel id. Do not import React.

export const META_LEGAL_GATE_OPEN = false as const;

export function metaMeasurementAllowed(): boolean {
  return META_LEGAL_GATE_OPEN === true;
}
```

### Pattern 3: How a later phase reads it (do not wire it now)

**What:** One import. Any other signal is not the legal gate.

**Phase 28 (PageView), not this phase:** Before creating a script element, call `metaMeasurementAllowed()`. False means return without `document.createElement("script")`, without `next/script`, without an inline `fbq` stub, without a `<noscript>` image. The mount, when it exists, is a sibling of the banner in `SiteShell`, not inside `CookieBanner`. The banner unmounts after a choice; PageView on the next navigation still has to see the flag. `SiteShell.tsx:64` is still `isHome ? banner : null`. Do not change that. Banner-on-every-customer-page is Phase 27.

**Phase 29 (Purchase), not this phase:** Before any `fetch` to `graph.facebook.com`, call the same function. False means skip the send. Do not change the webhook status. `handleStripeMessage` has no Meta call today. [VERIFIED: content search of `apps/web` found no `fbevents`, `fbq(`, or `connect.facebook`]

**Both later phases also need their own gates** (Accept / latest `consent_log` row, route denylist). Those are not substitutes for this flag. An Accept of `2026-09-12` with `marketing: false` is not a yes. Do not flip `bind.ts` in this phase. That flip is Phase 27, and it still must not load the script while this flag is false.

**Open condition, not implemented here:** The constant becomes `true` only in a later change, after his lines are on the live banner, cookies page, and privacy page in en, de, fr, and ar, and `CONSENT_POLICY_VERSION` has moved to that Zurich date. D-05: a line in the repo is not live. D-17: do not deploy this phase to make the slots live. Slots in source are the deliverable. The gate stays closed either way.

### Pattern 4: Placement (UI-SPEC, line numbers checked 2026-09-23)

**Banner.** `CookieBanner.tsx:177` is the h2. `:178` is `p.vt-ck-body`. Insert the slot between them. Not inside the h2. Not inside the body. Import `PendingSlot` from `@/components/legal` (same specifier the cookies page uses at line 9).

**Cookies.** `cookies/page.tsx:119` ends the `data-lenis-prevent` wrapper. `:120` closes `#necessary`. Insert between them, still inside `#necessary`. Do not add a fourth `rows` entry. `Table.tsx` colspan is only the error, loading, and empty state cells. There is no custom colspan row. A Meta row inside the table would sit under the "Strictly necessary" h4 (`cookies/page.tsx:90`). Do not fork `Table.tsx`. Do not add a "Meta" or "Marketing" heading. Do not move the slot to `#analytics` to avoid a classification. UI-SPEC already refused the table row and still placed the blank here, with no heading. Moving it is a contract break.

**Privacy.** `privacy/page.tsx:358` is the strictly-necessary paragraph. `:359` starts the link paragraph. Insert between them, inside `#cookies`. Not in the processors list. Not in the `data-slot` blocks at `:153` and `:235`. Those blocks are not `PendingSlot` and must not gain a Meta sentence. `PendingSlot` is already imported (`privacy/page.tsx:7`).

**CSS.** `LegalPage.tsx:14` imports `LegalPage.css`, so cookies and privacy pick up the new classes with no new import. `.vt-legal-blank` and `.vt-legal-blank--row` do not exist yet. [VERIFIED: content search, 0 matches] `.vt-legal-meta` at `LegalPage.css:308` is the hero date cluster. Do not reuse it. Do not fill `Privacy effective date`, `Privacy version`, `Cookies effective date`, or `Cookies version` (`LegalPage.tsx` hero pills).

**Hooks:** `data-meta-slot="banner"`, `data-meta-slot="cookies"`, `data-meta-slot="privacy"`. Not ARIA. Not a control. Cookies uses `vt-legal-blank--row` only. Privacy uses `vt-legal-blank` only. Do not put both classes on one element. The base rule's `margin-block-end: 14px` must not apply to the cookies row.

### Anti-Patterns to Avoid

- **Follow Meta's base code.** It sets `t.src` to `https://connect.facebook.net/en_US/fbevents.js`, then `fbq('init')` and `fbq('track', 'PageView')`, plus a noscript image at `https://www.facebook.com/tr`. [CITED: https://developers.facebook.com/docs/meta-pixel/get-started, updated 2026-06-30]
- **Follow Meta's GDPR sample.** `fbq('consent', 'revoke')` before `init` assumes `fbq` already exists. [CITED: https://developers.facebook.com/docs/meta-pixel/implementation/gdpr, updated 2023-07-14]
- **Ban the string `facebook`.** The footer already links `https://www.facebook.com/VAMOSTAXISWITZERLAND` (`SiteFooter.tsx:52`). That is not the pixel. Absence needles are the script host, `fbq(`, `fbevents.js`, `facebook.com/tr`, `graph.facebook.com`, and the pixel id.
- **Compute the flag from missing pills.** D-03.
- **Bump `2026-09-12` because SUMMARY.md said this phase delivers a new version.** D-12 overrides that.
- **Edit `laws.css` so the new pill looks more like Meta.** It restyles every pill. UI-SPEC forbids it.
- **Put the pixel id in `legal-gate.ts` or any client file.** Discretion. The id may appear only as a forbidden needle inside `legal-gate.test.ts`, same shape as `CHE-296.035.710` in `extract-no-invent.test.ts`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Empty legal value | A new pill, a yellow badge, a Meta card | `PendingSlot` | Law 04. CSS already appends TBC. A new component restyles the blank. |
| "Is the sentence in?" | A copy scanner that sets the flag | Hard `false` | He has not sent the lines. A scanner the agent wrote is the failure D-03 names. |
| Consent proof | A second cookie, a localStorage flag | Existing `consent_log` (do not write it differently this phase) | `record_consent` is the only write. Marketing is already false. |
| Pixel install | Snippet, `next/script`, GTM, Zaraz, an SDK | Nothing | The script is the thing this phase exists to keep out. |
| Version bump | A Zurich date picked today | Leave `2026-09-12` | D-13 is the date his lines go live. That day is not known. |

**Key insight:** The gate is closed by what is absent (his lines, a true flag, a script tag), not by a clever detector.

## Common Pitfalls

### Pitfall 1: Meta's sample is treated as the spec

**What goes wrong:** `fbevents.js` lands in a layout "behind revoke" and the phase is called done because PageView is paused.
**Why it happens:** Get-started (updated 2026-06-30) says put the base code in `<head>` on every page and leave `PageView` intact. GDPR (updated 2023-07-14) says call `revoke` before `init`.
**How to avoid:** No script element. No `fbq`. No noscript image. No CSP host. Flag function returns false.
**Warning signs:** `connect.facebook.net` in `headers.ts` or any page. A comment that cites `fbq('consent', 'revoke')` as the gate.

### Pitfall 2: The flag is derived from the pills

**What goes wrong:** Removing the three slots, or filling them with an agent sentence, opens measurement.
**Why it happens:** D-01 says the gate opens when the pills are gone. That is the human condition, not a function of the DOM.
**How to avoid:** `META_LEGAL_GATE_OPEN` is the literal `false`. The test fails if the module mentions `process.env`, `fetch(`, or `PendingSlot`.
**Warning signs:** A comment that says "flip this when TBC is gone" next to a scanner.

### Pitfall 3: Version bump smuggled in with the slots

**What goes wrong:** `CONSENT_POLICY_VERSION` changes, the banner is supposed to return (D-14), and Phase 27's wiring is half-done inside Phase 26.
**Why it happens:** Milestone SUMMARY.md says this phase delivers a new `policy_version`. CONTEXT D-12 says it stays `2026-09-12` while the slots are empty.
**How to avoid:** Do not edit `policy.ts`. Pin the exact string in the new test. Do not edit `SiteShell.tsx`.
**Warning signs:** A second date constant. A hero pill filled with a date. `bind.ts` passing anything other than `CONSENT_POLICY_VERSION`.

### Pitfall 4: Absence grep false-fails on the footer

**What goes wrong:** A test bans `facebook` and fails on the existing social link, so someone deletes the footer link or weakens the test until the pixel host also passes.
**Why it happens:** The brand page and the pixel host share the word.
**How to avoid:** Needles are `fbevents.js`, `connect.facebook.net`, `fbq(`, `facebook.com/tr`, `graph.facebook.com`, and the pixel id. Do not needle `facebook` alone. Do not needle `Meta` alone (the labels contain it).
**Warning signs:** `SiteFooter.tsx` in the diff.

### Pitfall 5: Vitest is green when the test file is missing

**What goes wrong:** `pnpm exec vitest run lib/meta/legal-gate.test.ts` exits 0 with "No test files found" because `passWithNoTests: true`.
**Why it happens:** Verified this session. Exit code 0. Filter `lib/meta/legal-gate.test.ts`. Include list did not contain the file.
**How to avoid:** The automated command starts with `test -f`. Wave 0 creates the test file before any product edit. A green full suite is not coverage.
**Warning signs:** Verify output says "No test files found, exiting with code 0".

### Pitfall 6: Slots classified as necessary cookies, or moved to "fix" that

**What goes wrong:** A fourth table row under "Strictly necessary", or a new "Marketing" heading, or the slot moved into `#analytics` next to `no-ads`.
**Why it happens:** The section id is `necessary`. The h4 above the table is strictly necessary. A reader tries to be helpful.
**How to avoid:** One pill after the table, inside `#necessary`, no heading, not a row. UI-SPEC locked that. Existing duration pills stay in the three rows.
**Warning signs:** `rows` length changes. `Table.tsx` is in the diff. A new `h4`.

### Pitfall 7: Cached HTML is used as a reason to inject a script

**What goes wrong:** Someone adds the pixel to `/cookies` or `/privacy` because those pages explain cookies.
**Why it happens:** `MARKETING_CACHE_PATHS` includes `/cookies` and `/privacy` (`middleware.ts:52-61`), with `s-maxage=300` and `stale-while-revalidate=3600` (`middleware.ts:425`).
**How to avoid:** The slots are HTML pills. They may be cached. The script must not be in that HTML. Do not change cache rules this phase.
**Warning signs:** `middleware.ts` in the diff. A script tag in `cookies/page.tsx` or `privacy/page.tsx`.

### Pitfall 8: Quote, pay, or confirmation edited while here

**What goes wrong:** A checkout file changes. v1.3 measures only.
**Why it happens:** The pixel id and the token are already known, so a later phase's work gets pulled forward.
**How to avoid:** File list is the five UI files plus the two new `lib/meta` files. `settle.ts`, `SiteShell.tsx`, `headers.ts`, `bind.ts`, `policy.ts` stay untouched.
**Warning signs:** Any path under `checkout`, `confirmation`, or `api/stripe` in the diff.

## Code Examples

Verified against live files on 2026-09-23. CSS blocks are the UI-SPEC contract. Do not restyle them.

### Banner slot

```tsx
// CookieBanner.tsx — insert after the h2, before p.vt-ck-body.
// Leave: <h2 className="vt-ck-title">{t("necessary-cookies-only")}</h2>
<div className="vt-ck-meta" data-meta-slot="banner">
  <PendingSlot label="Meta banner line" />
</div>
```

```css
/* CookieBanner.css — add this rule only. Do not animate it. */
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

### Cookies slot

```tsx
// cookies/page.tsx — after the data-lenis-prevent wrapper, still inside #necessary.
// Do not add a rows entry. Keep the three duration PendingSlots.
// Class is vt-legal-blank--row only. Do not also add vt-legal-blank.
<div className="vt-legal-blank--row" data-meta-slot="cookies">
  <PendingSlot label="Meta cookie row" />
</div>
```

```css
/* LegalPage.css — these two rules only. Logical properties. No physical left/right. */
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

### Privacy slot

```tsx
// privacy/page.tsx — inside #cookies, after the strictly-necessary paragraph,
// before the link paragraph. Not inside either p.
// Class is vt-legal-blank only.
<div className="vt-legal-blank" data-meta-slot="privacy">
  <PendingSlot label="Meta privacy line" />
</div>
```

### Flag

```typescript
// Source: this research. Not an existing export.
export const META_LEGAL_GATE_OPEN = false as const;

export function metaMeasurementAllowed(): boolean {
  return META_LEGAL_GATE_OPEN === true;
}
```

### What the absence test must not do

Do not `curl` production as the unit proof. Do not open `.dev.vars` or wrangler secret state. Do not print a token. The pixel id is a needle inside the test file only.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Meta base snippet in `<head>` | Do not download `fbevents.js` until a later phase, and not while this flag is false | Meta get-started still says install in `<head>` (page updated 2026-06-30). This repo refuses that. | This phase adds no script. |
| `fbq('consent', 'revoke')` | No `fbq` at all | GDPR page updated 2023-07-14, still the revoke sample | Revoke is not a gate. |
| Draft the legal line to unblock ads | Empty `PendingSlot`. Flag hard-false | Locked 2026-09-23 in `26-CONTEXT.md` | A sentence the agent wrote keeps the flag off. |

**Deprecated/outdated:**

- Milestone `SUMMARY.md` "Phase 26 delivers a paste check and a new policy_version" — overridden by D-03 and D-12. Do not implement it.
- Any plan that treats the footer Facebook link as a pixel. It is a brand URL.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A blank inside `#necessary`, after the table, with no heading, does not classify Meta as a necessary cookie. UI-SPEC placed it there on purpose. | Pattern 4, Pitfall 6 | If counsel later says the section heading classifies it, the slot moves in a later phase. Do not move it in this phase to pre-empt that. `[ASSUMED]` — not a legal opinion. |
| A2 | `metaMeasurementAllowed` is the name later phases will import. It does not exist yet. | Pattern 2 | A second flag name in Phase 28 would bypass this phase's test. The test must assert the export exists once under `apps/web`. |

No other claim is assumed. Stack versions, line numbers, CSP, cache paths, vitest exit code, and the Meta snippet URL were checked this session.

## Open Questions

1. **When does the constant become true?**
   - What we know: Not this phase. D-01, D-05, D-12, D-17. He has not sent the lines.
   - What's unclear: Nothing the planner needs. Do not pick a Zurich date.
   - Recommendation: Leave the constant false. Do not add a TODO that a later agent can finish.

2. **Does this phase deploy the slots?**
   - What we know: D-17 is about his words, not about shipping empty pills. The operating contract does not deploy from research or plan.
   - What's unclear: Nothing.
   - Recommendation: Source only. No `wrangler deploy`. Slots are not on `vamostaxi.site` until he says ship. The gate is closed in either place.

3. **CONTEXT deferred vs ROADMAP on the Phase 29 event id**
   - What we know: CONTEXT deferred says the event id is the booking reference. ROADMAP Phase 29 says it is not. Both are out of Phase 26.
   - What's unclear: Which lock wins in Phase 29. Not this phase's job.
   - Recommendation: Do not resolve it here. Do not send Purchase. Do not put an event id in this phase.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | vitest | yes | v26.7.0 | — |
| pnpm | test script | yes | 11.7.0 | — |
| vitest | Nyquist | yes | 4.1.11 | — |
| `apps/web/lib/meta/` | flag module | no | — | Create the directory with the two new files. Not a blocker. |
| Meta Pixel script | must stay absent | absent | — | Do not fetch it into the repo. |
| `META_CAPI_ACCESS_TOKEN` | out of phase | not read | — | Do not open secret files. |

**Missing dependencies with no fallback:** none

**Missing dependencies with fallback:** the `lib/meta` directory. Create it. Do not install a package instead.

## Validation Architecture

Nyquist is on (`workflow.nyquist_validation: true` in `.planning/config.json`).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.11 |
| Config file | `apps/web/vitest.config.ts` |
| Quick run command | `test -f apps/web/lib/meta/legal-gate.test.ts && pnpm --dir apps/web exec vitest run lib/meta/legal-gate.test.ts` |
| Full suite command | `pnpm --dir apps/web test` |

The `test -f` is required. On 2026-09-23, `pnpm exec vitest run lib/meta/legal-gate.test.ts` with the file missing printed "No test files found, exiting with code 0". `passWithNoTests: true`. A bare vitest path is not a proof.

Run from the repo root. `include` is `lib/**/*.test.ts`, `tests/unit/**/*.test.ts`, `components/consent/**/*.test.ts`. `exclude` includes `tests/visual/**`, `tests/integration/**`, and `**/*.spec.ts`. Do not point `<automated>` at `apps/web/tests/visual/legal-privacy-cookies.spec.ts`. That file is excluded and would be a vacuous green.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| META-01 | Three slots exist, labels exact, hooks exact | unit source pin | `test -f apps/web/lib/meta/legal-gate.test.ts && pnpm --dir apps/web exec vitest run lib/meta/legal-gate.test.ts -t "slots exist"` | Wave 0 |
| META-01 | No sentence in the three slots | unit source pin | same file, `-t "no sentence"` | Wave 0 |
| META-01 | Banner title stays `necessary-cookies-only` | unit source pin | same file, `-t "necessary-cookies-only remains"` | Wave 0 |
| META-02 | `CONSENT_POLICY_VERSION` is `2026-09-12` | unit source pin | same file, `-t "policy version unchanged"` | Wave 0 |
| META-01 | No `fbevents.js`, no `fbq(`, no pixel host, no pixel id in product source | unit source pin | same file, `-t "no fbevents.js"` | Wave 0 |
| META-01 | `metaMeasurementAllowed()` is false and not derived | unit | same file, `-t "flag off"` | Wave 0 |
| META-02 | `bind.ts` still records `marketing: false` | unit source pin | same file, `-t "marketing stays false"` | Wave 0. Existing `lib/consent/record.test.ts` already pins marketing false; keep it green. The new test pins the exact version string, which `record.test.ts` does not. |

### Named tests

Write these `it()` names in `apps/web/lib/meta/legal-gate.test.ts`. A later VALIDATION.md should copy them.

1. **`slots exist`** — `CookieBanner.tsx`, `cookies/page.tsx`, and `privacy/page.tsx` contain the three wrappers and the three labels: `Meta banner line`, `Meta cookie row`, `Meta privacy line`. Hooks: `data-meta-slot="banner"`, `data-meta-slot="cookies"`, `data-meta-slot="privacy"`. Cookies page has exactly one `Meta cookie row` and no extra Meta pill for name, purpose, or duration. The three duration pills remain: `Language cookie duration`, `Session duration`, `Consent duration`. Privacy still has `Analytics provider` and `Analytics region`. Imprint still has `Uid number` and `Photography credit`.
2. **`no sentence`** — Each slot wrapper's source is the `div` plus a single `<PendingSlot label="..." />` and nothing else. Labels contain no `.`, `!`, or `?`. The three page files do not contain `fbevents`, `fbq(`, the pixel id, or `graph.facebook.com`. Do not ban the word `Meta`. Do not ban `facebook` (footer). Do not invent a sentence in the assertion message.
3. **`necessary-cookies-only remains`** — `CookieBanner.tsx` still has `<h2 className="vt-ck-title">{t("necessary-cookies-only")}</h2>`. `en.json`, `de.json`, `fr.json`, and `ar.json` still have the key `necessary-cookies-only`. Do not edit those files. English value stays `Necessary cookies only`.
4. **`policy version unchanged`** — `apps/web/lib/consent/policy.ts` contains `export const CONSENT_POLICY_VERSION = "2026-09-12";`. No other file under `apps/web` assigns a different `CONSENT_POLICY_VERSION`.
5. **`no fbevents.js`** — Walk `apps/web/app`, `apps/web/components`, `apps/web/lib`, `apps/web/public` (skip `node_modules`, `.next`, `.wrangler`, and the test file itself). Zero matches for `fbevents.js`, `connect.facebook.net`, `fbq(`, `facebook.com/tr`, `graph.facebook.com`, and the pixel id. Also assert `apps/web/lib/security/headers.ts` does not contain `connect.facebook.net`. Do not open secret files. Do not assert the token value; assert the name `META_CAPI_ACCESS_TOKEN` is absent from those trees.
6. **`flag off`** — `import { META_LEGAL_GATE_OPEN, metaMeasurementAllowed } from "./legal-gate"`. Both are false. Source of `legal-gate.ts` contains `= false` and does not contain `process.env`, `fetch(`, `PendingSlot`, `fbevents`, `fbq`, or the pixel id. Exactly one assignment of `META_LEGAL_GATE_OPEN` under `apps/web`.
7. **`marketing stays false`** — `bind.ts` still has `marketing: false` and still defaults `policyVersion` to `CONSENT_POLICY_VERSION`. `record_consent` is still the write. No `UPDATE` of `consent_log` in this phase's diff (there should be no SQL diff).

`consent_log.policy_version` is `text not null`. The table is append-only (migration comment: nothing is rewritten). An old Accept is a row with `policy_version = 2026-09-12` and `marketing = false`, because that is all `bind.ts` writes. This phase does not add a reader. The pin is the write path staying false. [VERIFIED: `packages/db/supabase/migrations/20260823000018_consent_log.sql:15-23`, `bind.ts:19-24`]

### Sampling Rate

- **Per task commit:** `test -f apps/web/lib/meta/legal-gate.test.ts && pnpm --dir apps/web exec vitest run lib/meta/legal-gate.test.ts`
- **Per wave merge:** `pnpm --dir apps/web exec vitest run lib/meta/legal-gate.test.ts lib/consent/record.test.ts lib/legal/extract-no-invent.test.ts lib/security/headers.test.ts components/consent/banner-contract.test.ts`
- **Phase gate:** Full `pnpm --dir apps/web test` plus the `test -f` command. Full suite alone does not prove the new file exists.

### Wave 0 Gaps

- [ ] `apps/web/lib/meta/legal-gate.test.ts` — covers META-01 and META-02. Write the pins before claiming the phase green. A missing file exits 0.
- [ ] `apps/web/lib/meta/legal-gate.ts` — the flag. The test imports it.
- [ ] No new framework. No `vitest.config.ts` edit. Do not add `**/*.spec.ts` to `include`.
- [ ] Existing tests that must stay green and must not be weakened: `lib/consent/record.test.ts`, `lib/legal/extract-no-invent.test.ts`, `lib/security/headers.test.ts`, `components/consent/banner-contract.test.ts`.

Later phases that set `META_LEGAL_GATE_OPEN` to `true` invert the `flag off` assertion in the same commit as the constant. They do not delete `no fbevents.js` until the phase that is allowed to load the script, and Phase 28's own success criteria still say the flag stays off until the owner lines are in. This phase does not invert anything.

## Security Domain

`security_enforcement` is enabled. ASVS level 1 (`security_asvs_level: 1`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | No auth change. Do not touch Turnstile. |
| V3 Session Management | no | Do not touch `consent_subject`. Do not mint a mirror cookie. |
| V4 Access Control | yes | `metaMeasurementAllowed()` is the control. Default deny. No client-supplied override. |
| V5 Input Validation | yes | No new request body. Do not accept a legal sentence from a form, a query string, or a chat paste in this phase. |
| V6 Cryptography | no | Do not hash email or phone. Do not read the CAPI token. |

### Known Threat Patterns for this phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Agent-written sentence treated as consent | Repudiation | Flag not derived from copy. Slot test rejects extra text. No dictionary key to translate. |
| Official snippet copied into a layout | Information disclosure | Absence needles. No CSP host. No `next/script`. |
| Pixel id or CAPI token in client source | Information disclosure | Id stays out of product files. Do not read the token. Test asserts the secret name is absent from `apps/web`. |
| Old Accept re-read as marketing true | Elevation | `bind.ts` stays `marketing: false`. Version stays `2026-09-12`. Append-only ledger. Do not `UPDATE` old rows. |
| Script baked into cached `/cookies` or `/privacy` | Information disclosure | Do not add a script tag to those pages. Cache rules stay. |
| XSS via slot label | Tampering | Labels are string literals, not HTML from a request. `PendingSlot` renders `{label}` as text. Do not `dangerouslySetInnerHTML`. |

## Sources

### Primary (HIGH confidence)

- Live files read 2026-09-23: `CookieBanner.tsx`, `CookieBanner.css`, `PendingSlot.tsx`, `cookies/page.tsx`, `privacy/page.tsx`, `policy.ts`, `bind.ts`, `laws.css` (`[data-tok]` rules), `LegalPage.css`, `LegalPage.tsx`, `SiteShell.tsx`, `SiteFooter.tsx`, `headers.ts`, `headers.test.ts`, `middleware.ts` (`MARKETING_CACHE_PATHS`), `settle.ts` (`handleStripeMessage`), `quote.ts` (`LAUNCH_FLAGS_CLOSED`), `vitest.config.ts`, `package.json`, `consent_log.sql`, `extract-no-invent.test.ts`, `record.test.ts`, `banner-contract.test.ts`, `en.json` / `de.json` / `fr.json` / `ar.json` key `necessary-cookies-only`
- `26-CONTEXT.md`, `26-UI-SPEC.md`, `REQUIREMENTS.md` META-01 and META-02, `ROADMAP.md` Phase 26
- [Meta Pixel get started](https://developers.facebook.com/docs/meta-pixel/get-started) — base snippet loads `https://connect.facebook.net/en_US/fbevents.js`, calls `fbq('track', 'PageView')`, includes `facebook.com/tr` noscript image. Page updated 2026-06-30. Extracted this session.
- [Meta Pixel GDPR](https://developers.facebook.com/docs/meta-pixel/implementation/gdpr) — `fbq('consent', 'revoke')` before `init`. Page updated 2023-07-14. Extracted this session.
- vitest missing-file run this session: exit 0, "No test files found"

### Secondary (MEDIUM confidence)

- `.planning/research/SUMMARY.md`, `ARCHITECTURE.md`, `STACK.md`, `PITFALLS.md` (2026-09-23) — used only to confirm later-phase read sites. CONTEXT overrides the SUMMARY claim that Phase 26 delivers a paste check and a new policy version.

### Tertiary (LOW confidence)

- None that the planner should treat as a decision.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — no new package; versions read from `package.json`
- Architecture: HIGH — flag location follows the client/Worker split already in the tree. The function name is new, prescribed, and listed as A2.
- Pitfalls: HIGH — Meta snippet verified against current docs; vitest vacuous-green verified by running it; footer false-positive verified in `SiteFooter.tsx`

**Research date:** 2026-09-23
**Valid until:** 2026-10-23 (stable surfaces; re-check line numbers if those five files move)

---
phase: 05-public-surfaces-customer-accounts
plan: 17
subsystem: ui
tags: [contact, turnstile, playwright, i18n]

requires:
  - phase: 05-05
    provides: PageHero chrome, marketing layout
  - phase: 05-13
    provides: contactSchema, POST /api/contact code contract
provides:
  - lib/contact-channels.ts
  - TurnstileWidget
  - ContactForm
  - /contact
affects: [05-24]

tech-stack:
  added: []
  patterns: ["Turnstile site key as server prop, never NEXT_PUBLIC_", "contact-channels is the only phone/WhatsApp source"]

key-files:
  created:
    - apps/web/lib/contact-channels.ts
    - apps/web/components/forms/TurnstileWidget.tsx
    - apps/web/components/forms/ContactForm.tsx
    - apps/web/app/[locale]/contact/page.tsx
    - apps/web/app/[locale]/dev/contact-form/page.tsx
    - apps/web/tests/visual/contact.spec.ts
  modified:
    - apps/web/components/shell/SiteHeader.tsx

key-decisions:
  - "TurnstileWidget.action is literal \"contact\" only — Become a Partner is out of V1; lib/turnstile.ts already types TurnstileAction as \"contact\"."
  - "PageHero is about-namespaced; /contact inlines the same charcoal chrome (FAQ pattern) so copy stays in the contact catalogue."
  - "Live-chat CTA uses WHATSAPP_HREF; there is no live-chat product. Social row omitted — no confirmed URLs."

patterns-established:
  - "Addresses live in lib/contact-channels.ts and render inside .vt-dir-keep"
  - "Form route codes map to catalogue strings; the code is never visitor-visible copy"

requirements-completed: [SITE-04, SITE-09, SITE-06, SITE-07, SITE-02]

duration: 90min
completed: 2026-08-30
---

# Phase 05: 05-17 contact page

**Contact page with shared phone/WhatsApp constants, always-on Turnstile (`action=contact`), and a six-state form that maps `/api/contact` codes to catalogue copy.**

## Performance

- **Duration:** ~90 min
- **Completed:** 2026-08-30T15:31:00Z
- **Tasks:** 3
- **Files modified:** 10 production + 32 snapshots

## Accomplishments

- D-18: `PHONE_DISPLAY` / `PHONE_HREF` / `WHATSAPP_HREF` / `SUPPORT_EMAIL_HREF` in one module; header imports, does not redeclare.
- SITE-09: phone, WhatsApp (`https://wa.me/41796267082`), and the form on `/contact`, ≥44px targets, RTL number in `.vt-dir-keep`.
- D-22: site key from `getCloudflareContext().env.TURNSTILE_SITE_KEY` (fallback `process.env`); no `NEXT_PUBLIC_TURNSTILE_*` in `apps/web`.
- Six form states: idle, invalid, submitting, success, challenge-failed, service-unavailable.

## TurnstileWidget prop surface (05-19 reuse — partner page is out)

```ts
type TurnstileWidgetProps = {
  siteKey: string | undefined
  action: "contact"
  onToken(token: string | null): void
  labelKey?: string
  resetNonce?: number
}
```

Explicit `turnstile.render` / `remove(` on unmount. Missing `siteKey` → `onToken(null)` and `common.form-challenge-failed`; no fabricated pass token.

## Code-to-message mapping

| Route | Body | UI |
|-------|------|----|
| 200 `{ ok: true, created }` | either `created` | success (`contact.message-received`); duplicate is not an error |
| 403 `{ ok: false, code: "challenge_failed" }` | | `common.form-challenge-failed` beside the widget; widget reset; fields kept |
| 400 `{ ok: false, code: "invalid_input" }` | | re-run `contactSchema`; else generic failure (`contact.your-message-did-not-send` + phone next step) |
| 503 `{ ok: false, code: "unavailable" }` | | same next-step copy (`contact.something-on-our-side-failed-not-yours-your-text`) |

The `code` string is never rendered as copy.

## Header baselines

SiteHeader 4-viewport screenshots were unchanged after the constant move (phone is the same display string). SiteFooter 390 diffs on this branch come from `330a9d1` (Become a Partner removal), not this plan — snapshots not edited.

## Task Commits

1. **Task 1: shared channels + Turnstile widget** - `213a698` (feat)
2. **Task 2: contact page + form** - `52a0daf` (feat)
3. **Task 3: gallery + 32 baselines** - `703560f` (test)

**Plan metadata:** this file.

## Files Created/Modified

- `apps/web/lib/contact-channels.ts` — single source of truth for phone / WhatsApp / mailto
- `apps/web/components/forms/TurnstileWidget.tsx` + `.css` — explicit-render widget
- `apps/web/components/shell/SiteHeader.tsx` — imports `PHONE_*`
- `apps/web/components/forms/ContactForm.tsx` + `.css` — six states, `contactSchema`, `randomUUID`
- `apps/web/app/[locale]/contact/page.tsx` + `contact.css` — SITE-04/SITE-09 page
- `apps/web/app/[locale]/dev/contact-form/page.tsx` — states gallery
- `apps/web/tests/visual/contact.spec.ts` + 32 snapshots

## Decisions Made

- `action` is `"contact"` only (parent override; partner form deleted).
- Contact hero inlines PageHero.css rather than calling `PageHero` (about namespace).
- Start-a-chat button is WhatsApp; no CookieBanner; no yellow-50 / glow.

## Deviations from Plan

1. **Turnstile `action` union** — plan listed `"contact" | "partner-application"`. Partner page is out of V1; widget and `lib/turnstile.ts` are contact-only.
2. **PageHero** — component keys `tAbout(...)`; contact uses FAQ-style inlined chrome so strings stay in `contact` / `common`.
3. **`scripts/public-env-allowlist.json` `allowed`** — still contains `NEXT_PUBLIC_TURNSTILE_SITE_KEY` from an earlier plan; this plan added no identifier. `pnpm check:public-env` passed (zero `NEXT_PUBLIC_*` in `apps/web`). File not in `files_modified`; left alone.
4. **Full `pnpm test:visual`** — not run. `contact.spec.ts` 55 passed / 32 snapshots. Shell footer 390 is inherited from Become-a-Partner removal; not touched.

**Total deviations:** 4
**Impact on plan:** Product surface matches SITE-09/SITE-04. Partner widget reuse is deferred with the deleted page.

## Issues Encountered

- Worktree has no `node_modules`; Playwright used the main `apps/web` binary with `cwd` = worktree `apps/web`. Next binary resolved the same way. No `pnpm install`.
- Native `<input>` content-box at 390 is ~22px; 44px assertion targets `.vt-input` / `.vt-btn` / `[data-ch]`.

## User Setup Required

None — no external service configuration required. Local/dev supplies `TURNSTILE_SITE_KEY` (Cloudflare documented test key `1x00000000000000000000AA` in the gallery and the spec spawn env).

## Next Phase Readiness

`/contact` is ready for 05-24 inbox proof. Do not port a partner form against this widget.

---
*Phase: 05-public-surfaces-customer-accounts*
*Completed: 2026-08-30*

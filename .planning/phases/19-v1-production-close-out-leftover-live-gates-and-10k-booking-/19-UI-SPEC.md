---
phase: 19
slug: v1-production-close-out-leftover-live-gates-and-10k-booking
status: draft
reviewed_at: 2026-09-18
shadcn_initialized: false
preset: none
created: 2026-09-18
---

# Phase 19 — UI Design Contract

> No new screens. No restyle. Funnel chrome frozen.
> This phase’s UI is **observation + fail-closed** on existing quote / checkout / wait-room / confirmation.
> Tokens only `--vt-*`. Lucide via `Icon`. No glow. No tinted yellow. No invented CHF.
> Four languages same sitting **only if** fail-closed copy is added; otherwise copywriting none this phase.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (DC + `--vt-*`) |
| Preset | Vamos `--vt-*` |
| Component library | existing `VamosTaxiDesignSystem` |
| Icon library | Lucide via `Icon` |
| Font | `--vt-font-body` / `--vt-font-display` |

Do **not** initialize shadcn. No new registry. No Staff tab. No surge dashboard product.

---

## Spacing Scale

Declared values (must be multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | existing |
| sm | 8px | existing |
| md | 16px | existing |
| lg | 24px | existing |
| xl | 32px | existing |
| 2xl | 48px | existing |
| 3xl | 64px | existing |

Exceptions: none. Do not add spacing.

---

## Typography

Map to existing tokens only. Do not add a fifth size or a third weight.

| Role | Size | Weight | Token |
|------|------|--------|-------|
| Body | 16 | 400 | `--vt-body-md` |
| Label / meta | 14 | 400 | `--vt-body-sm` |
| Heading 3 | 20 | 600 | `--vt-heading-3` |
| Heading 2 | 26 | 600 | `--vt-heading-2` |

Weights: 400 + 600 only.

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--vt-bg` | unchanged |
| Secondary (30%) | `--vt-surface` | unchanged |
| Accent (10%) | `--vt-accent` | **not used by this phase** |
| Destructive | `--vt-danger` | existing error / 429 |

Accent reserved for: Publish / active tab / preview total / Live badge — **none of those are added here**. Never “all interactive elements”.

---

## Screens

| Screen | Route | What 19 changes |
|--------|-------|-----------------|
| Home quote | `https://vamostaxi.site/` | None. Still wipes previous quote. Observe 429 |
| Trip | `/checkout/trip` | None. Never a booking row |
| Details | `/checkout/details` | None. Unpaid booking only when travelling fields filled |
| Pay / wait-room | existing wait-room | Fail-closed if Stripe/Hyperdrive exhausted: voucher **or** error with next step (Phase 7 close). No new layout |
| Confirmation | `/confirmation` | None. Only after real pay |
| Ops fleet | `dashboard.vamostaxi.site` Fleet | Leftover 17 observation only — not 19 chrome |

### Desktop (≥861px) / Tablet / Phone

Unchanged existing funnel. Do not invent a layout.

---

## States

| State | UI |
|-------|-----|
| Happy 10k (after D-04) | Existing confirmation. Public still `CHF 000` until Publish |
| Rate limited | Existing product error `429 rate_limited`. Next step: wait / retry. Not empty. Not “No data found” |
| Hyperdrive/Stripe/Mapbox exhausted | Fail closed. Error with next step (contact `info@vamostaxi.site` or retry). No fake success |
| Wait-room | Existing voucher or error. Link = Stripe native |
| Load-test URL | **Must not exist** |

No new loading skeleton.

---

## Interaction

No new CTAs. Existing overlay verbs (`Save chauffeur`, `Keep editing`, etc.) are **do-not-touch**. Do not put them in a Copywriting CTA table.

Home click still starts a brand-new booking.

---

## Copywriting

**None this phase** unless D-07 requires a fail-closed string. If added: en/de/fr/ar same sitting, `--vt-body-md`, no CTA `Save` / `Cancel` / `Submit` / `OK`.

Public phone / WhatsApp unchanged: `+41 79 626 70 82`.

---

## Must-nots

- No glow, no tinted yellow, no invented CHF, no `CHF` live totals before Publish
- No `.eu`, no Staff, no driver app, no auto-dispatch
- No new Publish control
- No public `/load-test`
- Do not restyle Fleet / Support / Pricing

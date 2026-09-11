---
phase: 09
slug: booking-lifecycle-customer-self-service
status: approved
reviewed_at: 2026-09-12
shadcn_initialized: false
preset: none
created: 2026-09-12
---

# Phase 9 — UI Design Contract

> **Not a redesign.** `.dc.html` mocks + `--vt-*` are the pixels. Four languages same pass. No glow. No tinted yellow. `CLAUDE.md` wins.
>
> **Closed bar:** every control on these screens is UI → Worker API → Hyperdrive **direct** Postgres (`yaumjzvylngfjhtuffqs`, Zurich, never Supavisor `:6543`) → Stripe test refunds / Resend / R2 as named. No sample `TRIP`, no fixture `LX1234`, no client-only status, no localStorage-only success. A manage-token miss is an error, not a demo booking.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (Vamos design system) |
| Preset | not applicable |
| Component library | bound kit (`Button`, `Card`, `Input`, `Dialog`, `Alert`, `Icon`, `RouteSummary`, `StatusBadge`) |
| Icon library | Lucide via `Icon` |
| Font | Qurova display + Poppins UI |

**Forbidden:** shadcn, `--vt-shadow-accent`, `--vt-yellow-50`…`-300` washes, `--vt-yellow-600`/`-700` as text/icon, invented CHF, fake chauffeur names, `booking-detail.dc.html` as a 404 shell.

---

## Spacing Scale

Declared values from `design-system/tokens/spacing.css` (multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px (`--vt-space-1`) | Icon gaps |
| sm | 8px (`--vt-space-2`) | Compact gaps |
| md | 16px (`--vt-space-4`) | Default |
| lg | 24px (`--vt-space-6`) | Section padding |
| xl | 32px (`--vt-space-7`) | Layout gaps |
| 2xl | 48px | Major breaks |
| 3xl | 64px | Page-level |

Exceptions: 12px / 20px (`--vt-space-3` / `-5`) already in the DC files; 44px icon-only touch targets already in the mocks. Do not add a new scale.

---

## Typography

Four roles used on these screens (full ramp stays on the kit — do not add sizes):

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 16px `--vt-body-md` | 400 | 1.6 `--vt-body-leading` |
| Label | 13px `--vt-label-md` | 600 | 1.45 |
| Heading | 32px `--vt-heading-1` | 600 | 1.18 `--vt-heading-leading` |
| Figure | 26px `--vt-figure-md` | 600 | 1.04 |

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#F6F6F6` `--vt-grey-50` | Page background |
| Secondary (30%) | `#FFFFFF` / `#1E1F1F` | Cards / inverse voucher |
| Accent (10%) | `#FDC20B` `--vt-yellow` | Primary buttons, badges, kickers only |
| Destructive | `--vt-danger` | Confirm-cancellation primary on the sheet; trash/delete |

Accent reserved for: primary ticket CTAs (Confirm cancellation, Request time change, Submit review), status badges, kicker labels. Never all links/inputs.

---

## Screens

Same ticket chrome at two URLs (D-32). Paid cancel lives **on the ticket**, not the `/bookings` list row (D-01). Unpaid list Cancel stays the existing hard-delete path (`POST /api/account/bookings/cancel` → `checkout_cancel_unpaid`) — that is not paid self-serve cancel.

| URL | Mock | Live contract |
|-----|------|----------------|
| `/manage-booking?token=` | `app/pages/manage-booking.dc.html` | Guest lookup by **hashed** `booking_access_tokens` (`asGuest`). Token miss / revoked / unpaid-deleted → honest gone. Never paint sample `TRIP`. |
| `/confirmation/{ref}` | React `BookingVoucher` + `ConfirmationClient` (never `confirmation.dc.html`) | Signed-in JWT email owns the row. Same ticket chrome + Cancel sheet. Do not invent a third voucher. |
| `/bookings` | `app/pages/bookings.dc.html` | JWT email paid+unpaid pending. No paid Cancel on the row. Review trip / Reviewed chip (`reviewState`). Chauffeur/vehicle/plate empty until assigned — never fake names. |
| `/account` | `app/pages/account.dc.html` | Same `reviewState` chip as bookings (D-17/D-21). |
| `/booking-detail` | `app/pages/booking-detail.dc.html` | **Live 200.** Same ticket as confirmation; 404 is a fail. |
| `/review?token=` (or booking-scoped) | no dedicated mock — copy ticket / ops review chrome | Forever link; one submit; booking locale. |
| `/cancellation` | `app/pages/cancellation.dc.html` | Policy text **matches D-02 windows** (not leftover 75%). No invented CHF. |
| Ops `/bookings/{ref}` | `app/ops/OpsDetail.dc.html` | Confirm/refuse time-change; flight-edit banner; refund retry; mark Completed / No-show. |
| Ops `/dashboard` | `app/ops/OpsDash.dc.html` | Income = captured. **Refunds in Expenses.** Net drops. Period: today / this week / this month / all time. |

Breakpoints: 1440 / 1024 / 768 / 390. Logical properties.

**Focal point:** the inverse voucher / ticket card (route + status + refund line). Primary CTA sits on that card. Icon-only controls keep `aria-label` from the mock.

---

## Copywriting Contract

en source; de/fr/ar same pass. Do not invent CHF in strings.

| Element | Copy |
|---------|------|
| Primary paid-cancel CTA | Confirm cancellation |
| Time-change CTA | Request time change |
| Flight-number CTA | Save flight number |
| Review CTA | Submit review |
| Empty bookings | No trips yet. Book from the home page. |
| Token miss | We could not find this booking. Check the link in your confirmation email. |
| Unpaid deleted | This booking is gone. Start a new trip from home. |
| Stripe refund fail | Trip cancelled. The refund failed. We emailed operations to retry. |
| Time pending | Time-change requested. Pickup stays {original} until we confirm. |
| Time refused | We could not move this trip. Pickup stays {original}. |
| Destructive sheet >24h | This trip will be cancelled. You get a full refund of the amount we captured. |
| Destructive sheet 24h–6h | This trip will be cancelled. Refund pending operations (default 100% of captured). |
| Destructive sheet ≤6h / after pickup | This trip will be cancelled. No automatic refund. Operations can still refund. |
| Completed / No-show | Hide customer Confirm cancellation. |

No type-CANCEL. No undo. One confirm sheet then the same ticket with status **Cancelled** plus refund line: Pending Ops → Processing Stripe → Refunded (amount + payout time) or Failed.

---

## Interaction (must hit live systems)

| Control | API / store |
|---------|-------------|
| Guest open ticket | Hash token → `booking_access_tokens` + booking row. Fail = error. |
| Paid cancel | Window vs **original** pickup `Europe/Zurich` (D-02, D-26). Status `cancelled` + `booking_events`. Stripe `refunds.create` on captured PI when auto-full; else refund pending ops. `booking_refunds` append-only. Never un-cancel on Stripe fail. |
| Unpaid cancel | Hard-delete (`checkout_cancel_unpaid` / guest equivalent). Calendar slot free. Manage link after = gone. |
| Time change | `booking_edit_requests` upsert (second request replaces pending). Live time unchanged until ops confirm (`booking_edit_apply_payload`). |
| Flight number | Write-through on the booking; no ops confirm. Mail `bookings@vamostaxi.site` + assigned chauffeur. |
| 24h reminder | Worker scheduled job vs original pickup Zurich. Row in `booking_notifications` with `dedupe_key`. Skip cancelled/completed. Unassigned: customer reminder without driver + ops ping. Later assign: assignment mail, no second 24h. |
| Assignment mail | Resend the moment ops assigns (existing assign templates + `bookings@`). |
| Review submit | Insert `public.reviews` with `booking_id`. Optional one customer photo via existing R2 pipeline. Ops publish/hide already on `/api/staff/reviews`. GET `/api/reviews` stays published-only. |
| Ops complete / no-show | Ops-only. **No auto no-show sweep.** Review-request mail on Completed or paid no-show. |
| OpsDash money | Captured fares = Income. Refund rows = Expenses. |

**Out of this contract:** AeroDataBox, SMS, driver app, auto-dispatch, MX provisioning for `bookings@`, live Stripe keys / `vamostaxi.eu` DNS.

---

## Live stack (verify, do not stub)

Already in repo (reuse, do not duplicate):

- Guest RPC `manage_booking_cancel` (vamos_guest) — refund % still stub; Phase 9 must apply D-02 and then Stripe.
- Signed-in unpaid cancel `POST /api/account/bookings/cancel` → `checkout_cancel_unpaid` (keep for unpaid list only).
- `createRefund` in `apps/web/lib/checkout/stripe.ts` (test-mode only; `sk_live_` refused).
- Ops full refund `apps/web/lib/ops/refund.ts` — extend for partial % / retry Failed / remaining until 0 (D-12).
- Resend: confirmation, pay-link, assign/unassign, refund templates in `packages/emails`. Add cancel / time / flight / reminder / review-request; ops copies to `bookings@vamostaxi.site`.
- Worker crons: hourly `expireUnpaidBookings` + `0 3 * * *` notification sweep. **Add 24h-reminder selection on the hourly cron.** No no-show sweep.
- `booking_edit_requests` + apply RPCs (Phase 8). Wire customer request + ops confirm UI.
- `GET /api/reviews` published-only. **Customer POST does not exist yet** — must land this phase.
- `/booking-detail` is listed as a leftover 404 in `dc-mock-urls.ts` — that is a **fail** until it is a live 200 ticket.

Hyperdrive: Supabase **direct** connection only.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| none | — | not applicable — 2026-09-12 |

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS — verb+noun CTAs; empty/error have next step
- [x] Dimension 2 Visuals: PASS — ticket voucher is the focal point
- [x] Dimension 3 Color: PASS — 60/30/10; accent reserved list
- [x] Dimension 4 Typography: PASS — 4 sizes, 2 weights
- [x] Dimension 5 Spacing: PASS — 4/8/16/24/32/48/64 + DC exceptions
- [x] Dimension 6 Registry Safety: PASS — no third-party registry

**Approval:** approved 2026-09-12

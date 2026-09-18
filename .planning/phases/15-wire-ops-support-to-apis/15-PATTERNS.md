# Phase 15: Wire Ops #support to APIs - Pattern Map

**Mapped:** 2026-09-18
**Phase directory:** `.planning/phases/15-wire-ops-support-to-apis`

Use these analogs. Do not invent a Next `/ops/support` page or a second overlay.

## Files to create / modify

| File | Role | Analog | Notes |
|------|------|--------|-------|
| `apps/web/lib/ops/tickets-write.ts` | Save branch | itself (`status` / `reply`) | `{ phone, booking_ref, note }`; reuse `resolveStaffBookingId` |
| `apps/web/lib/ops/tickets-write.test.ts` | unit | itself | empty note; bad ref; do not mix reply |
| `apps/web/app/[locale]/(ops)/api/staff/tickets/[id]/route.ts` | parse body | itself | pass phone/booking_ref/note |
| `apps/web/lib/ops/tickets.ts` | GET load | itself | optional files; never fail if relation missing |
| `apps/web/lib/ops/tickets-map.ts` | map + files[] | itself | `whoKey` already maps `staff_note` |
| `apps/web/lib/ops/tickets-map.test.ts` | unit | itself | escape; files optional |
| `apps/web/lib/ops/resolve-booking-id.ts` | ref lookup | itself | `reference` or uuid; `erased_at is null` |
| `app/ops/OpsSupportTicket.dc.html` | board + overlay | itself | Save, badge, focus hydrate, files in `[data-msg]` |
| `app/ops/OpsSidebar.dc.html` | badge event | itself | keep `vamos:support-badge`; count is New+Responded |
| Dual-DC public copy | sync script | `scripts/sync-dc-mock-to-public.mjs` | do not hand-edit public |

## Do not touch

- `tickets-write.ts` Resend send / From / BCC / RFC GET — Phase 13
- Webhook ingest / R2 put — Phase 14
- MX / `replies.` DNS — Phase 16
- `env.production`, `vamostaxi.eu`, `POST /api/quote`
- `home.dc.html` (dirty, not this phase)
- Funnel 7–11

## Code excerpts (analogs)

### GET list

`apps/web/app/[locale]/(ops)/api/staff/tickets/route.ts` → `loadTickets` → `jsonOk`. Keep.

### PATCH

`[id]/route.ts` + `patchTicket`. Add Save keys. `withStaff`. Generic overlay error on 400/503.

### Booking ref

`resolveStaffBookingId(env, claims, key)` — do not SELECT bookings as system role.

### Note direction

`tickets-map.ts` `whoKey`: `note` / `staff_note` → `note`. Insert `staff_note`.

### Dual-DC

Writer `app/ops/`. Sync script copies to `apps/web/public`.

### Files open (14, display only)

Staff GET `/api/staff/tickets/:id/files/:fileId` (14-06). 15 only paints `href` / `<img>`.

## Data flow

Enter `#support` → GET → paint. Overlay Save → PATCH → hydrate GET. Tab focus → GET. Badge = filter new+responded.

## PATTERN MAPPING COMPLETE

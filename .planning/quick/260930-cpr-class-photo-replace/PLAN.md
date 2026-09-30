# Plan: quick 260930-cpr — no Remove link on dashboard photos; old class photos deleted

## Owner decisions (question form, 2026-09-30)
1. Class photo field without the Remove link: **signed** (pictures `screens/before-*`, `after-*`).
2. Remove link on chauffeur, vehicle, review and staff photos too: **"Remove everywhere"**. Every dashboard photo can only be replaced.
3. Inactive classes: **"Delete with the class"**: when a class is deleted for good, its photo and small copies go too; rows that still exist keep theirs.
4. Earlier: a replaced class photo and its small copies are deleted when the change goes live ("Delete both at publish", `.planning/decisions/2026-09-30-class-photo-replace.md`).

## Part A — the Remove link (built, commit on this branch)
- `app/ops/OpsTable.dc.html`: the photo editor has no Remove link any more (button, `clearShow`, `clearLabel`, `clearPhoto` gone). Used by class, vehicle and chauffeur photos.
- `app/ops/OpsProfile.dc.html`: the small X on the staff photo is gone.
- Strings for the removed controls deleted in four languages (`OpsPricing`, `OpsFleet`, `OpsProfile`, and the unused one in `OpsReviews`).
- Review photos: the review editor has no remove control today (only an unused string); nothing else to change.
- Side effect: 26.2's finding "Remove then Save brings the old photo back" cannot happen any more; nothing can be set to "no photo" from the dashboard.

## Part B — deleting old photos: what points to a class photo (read from code and migrations)
| Place | Holds the photo key? |
|---|---|
| `public.vehicle_classes.photo_path` | **Yes. The only place.** Not versioned: a Save writes it at once, so the new photo is live on the site at Save, not at Publish. |
| `public.distance_rates` / rate versions (draft, published) | No. They reference the class by id. |
| `public.price_snapshots`, quotes, bookings | No. Class id, lines and policy only (`20260825000007_quote_snapshot_rpc.sql`). |
| E-mails (`packages/emails`) | No photo anywhere (grep). |
| Confirmation, manage, account pages | No class photo (grep). |
| The public quote and checkout | Read `photo_path` live through `quote_rate_book` → `public-board.ts` → `/photos/<key>` (and `?w=640`). |
| Browsers | Up to one year's cache of an old photo (immutable address). A deleted key only stops new downloads. |

Write paths that change `photo_path`: `apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts` (distance save, `coalesce`), `apps/web/lib/ops/fleet-write.ts` `insertVehicleClassOnDraft` and `patchDraftClass` (via `api/staff/vehicle-classes` PATCH/POST), and the class delete `deleteVehicleClassIfUnreferenced` (database function `ops_vehicle_class_delete_or_hide`).

## Part B — how the delete works
- One helper in `apps/web/lib/ops/photos.ts`: `deleteReplacedPhoto(env, oldKey, stillUsed)` removes `oldKey`, `oldKey.w640.webp`, `oldKey.w1280.webp` from R2 `PHOTOS`.
- Called only AFTER the transaction that changed `photo_path` has committed, with the old key read inside that transaction (`select photo_path ... for update` before the update).
- Never deletes: the key the row points to now; a key another class row still points to (checked after commit); a key outside `classes/`; an empty key.
- A failed R2 delete is logged (`photo_delete_failed`, key) and the save still succeeds.
- Class hard delete: when the database answers `deleted`, the class's last `photo_path` (read before) is deleted the same way. `hidden` or `in-use`: nothing is deleted.
- Vehicle, chauffeur, review and staff photos: not deleted by this job (his decision was about class photos).

## Open question for the owner
The new photo is live at Save (no Publish needed for photos). Delete the old one at that Save?

## Tests first
Unit (route and helper, R2 and SQL faked through the Worker client options): replace → three objects gone, new key untouched; same key saved again → nothing deleted; key still used by another class → kept; R2 failure → save still 200, log line; class hard delete → its photo gone; hidden/in-use → nothing gone; keys outside `classes/` refused.
Visual: dashboard class editor without the link at 1440/1024/768/390, en de ar.

## Files outside this job's own
`apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts`, `apps/web/lib/ops/fleet-write.ts`, `apps/web/app/[locale]/(ops)/api/staff/vehicle-classes/route.ts`, `apps/web/lib/ops/photos.ts`: control session to confirm before editing (26.2 area).

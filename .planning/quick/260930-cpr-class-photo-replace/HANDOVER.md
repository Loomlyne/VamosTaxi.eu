# Hand-over: quick 260930-cpr (no Remove link on dashboard photos; old class photos deleted)

Written 2026-09-30. Branch `feat/class-photo-replace`, folder `/Users/koss/Developer/vamos-wt/class-photo-replace`, origin/main merged.
Final commit: the one carrying this file. Folder clean. Not pushed, no PR, not deployed. Plan and decisions: `PLAN.md` beside this file.

## Owner decisions (question form, 2026-09-30)
1. Class photo field without Remove: **signed** (pictures `screens/before-*`, `after-*`, 1440/1024/768/390, en de ar).
2. **Remove everywhere**: vehicle, chauffeur and staff photos too.
3. Inactive classes: **delete with the class**.
4. Replaced photo deleted **at Publish** (told that the new photo is live at Save).

## What changed
- Dashboard mocks: `app/ops/OpsTable.dc.html` (shared photo editor: Remove link gone), `app/ops/OpsProfile.dc.html` (staff photo X gone), strings for those controls removed in four languages in `OpsPricing`, `OpsFleet`, `OpsProfile`, `OpsReviews` (the last one was unused).
- `apps/web/lib/ops/class-photo-sweep.ts` (new): at Publish, deletes every stored class photo (`classes/`) that no class row points to, with its `.w640.webp` / `.w1280.webp` copies; keeps anything uploaded in the last 24 hours. After a class hard delete, empties that class's folder only.
- `apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts`: one call after a successful publish.
- `apps/web/app/[locale]/(ops)/api/staff/vehicle-classes/route.ts`: one call when the delete answers `deleted`.
- Tests: `lib/ops/class-photo-sweep.test.ts` (9), `tests/unit/no-photo-remove-link.test.ts` (3).

## What can point to a class photo (read, see PLAN.md)
Only `vehicle_classes.photo_path`. Price snapshots, quotes, bookings, mails and the confirmation/manage/account pages hold no photo key. Browsers may keep a cached copy up to a year; a deleted photo only stops new downloads.

## Checks
| Check | Result |
|---|---|
| unit lib/ops + app/photos + lib/photos | 773 passed |
| unit new: class-photo-sweep 9, no-photo-remove-link 3 | pass |
| integration ops-26-3-widths 24, ops-dc-pricing 5, ops-dc-fleet 5 | pass |
| typecheck, lint (0 errors), check:db-fences | pass |
| full unit set, build, the other gates | not run; the control session runs them in a clean clone |

## Not verified
- The sweep never ran against real R2 or a real database: the listing and deletes are tested with a fake bucket, the SQL read of `photo_path` is not exercised by a test. Read the Worker log after the first Publish: `class_photos_deleted` with the keys, or `class_photo_delete_failed`.
- Whether the staff role may read `vehicle_classes.photo_path` in that call: the rate-book loader reads the same column in the same way, so expected yes; not run.
- Dashboard pictures come from the mock with stubbed data, not the live dashboard.

## What the first Publish after the ship will delete on live
Every stored class photo older than 24 hours that no class row points to: photos replaced earlier, uploads that were never saved, and small copies of those. The photos of the three active classes and of every inactive class row that still exists stay. This cannot be undone.

## Migrations, settings
None.

## Owner UAT on dashboard.vamostaxi.site
1. Pricing → Distance rules → edit Business. Expected: the photo, "Choose photo", no Remove link.
2. Fleet → edit a vehicle and a chauffeur. Expected: no Remove link on their photos.
3. Profile. Expected: no small X on your photo; clicking the circle still uploads a new one.
4. Replace the Business photo, Save class. Expected: the site shows the new photo at once (vamostaxi.site home, laptop).
5. Publish the fare book. Expected: nothing changes for customers; the control session reads the Worker log and confirms the old Business photo is gone from storage.
6. Delete a test class (one you create for this, never Economy, Business or Van luxury). Expected: it disappears; the control session confirms its photo folder is empty.
No payment step: checkout is not touched.

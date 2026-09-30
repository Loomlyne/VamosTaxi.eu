# Owner decision: a replaced class photo is deleted at publish (2026-09-30)

Given by the owner through the question form in the session "Vamos Taxi 26.4.2 completion",
2026-09-30, answer "Delete both at publish". Recorded by the control session from that
session's report; not re-asked.

| # | Decision |
|---|---|
| 1 | When a class photo is replaced on dashboard /pricing and the change is published, the old photo and its small copies (`<key>.w640.webp`, `<key>.w1280.webp`) are deleted from storage for good. |
| 2 | The Remove link on the class photo field goes (26.2 finding P3). Pictures at four widths for his signature before code. |
| 3 | This does not change the signed photo note of the same day: making a small copy never changes or deletes an original. Deleting a replaced photo at publish is a separate rule. |

Not built yet. Files: `app/ops/OpsTable.dc.html`, `app/ops/OpsPricing.dc.html`,
`apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts`, `apps/web/lib/ops/photos.ts`.
A photo that a booking, a mail or a saved price snapshot still points to must be named in the
plan before anything is deleted.

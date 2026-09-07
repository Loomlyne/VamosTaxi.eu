# Quote publish — draft → live

For the person who runs this once, months from now, at the launch flip.
Owner action. Not a merge.

## What must be true first

1. The owner's matrix is seeded into a **DRAFT** `rate_versions` row (`packages/db/scripts/seed-draft-rate-book.mjs`, local/staging only). Numbers live in `docs/build/OWNER-ANSWERS.md` D-46. No live numbers until this procedure says so.
2. Every **active** surcharge carries a non-blank `predicate`. The five U38 rows
   (airport-zone and ski-tag) still need owner confirmation. The publish gate
   refuses `draft → live` until they land (`20260825000001_surcharge_predicate.sql`).
3. `settings_versions.service_area_geojson` is non-null.

Until those three hold, do not flip.

## Staging rehearsal

Set `PRICING_PREVIEW=true`. Draft numbers appear for **display only**. Checkout
still 409s: `rate_version_is_live` is trigger-derived from `status`, never from
the env var (D-33). `PRICING_PREVIEW` must not set `pricing_live`.

## The flip

```sql
UPDATE rate_versions SET status = 'live' WHERE id = :draft_id;
```

Taken by the owner, not by a merge. That UPDATE is the launch trigger.

## Watch immediately after

- First quote's `rate_version`, `pricing_live: true`, and a non-null total.
- The cached `HYPERDRIVE` binding is **not** on the read path. Quote reads go
  through `asQuote` on `HYPERDRIVE_NOCACHE`, so there is no ~75 s lag between
  the flip and the engine noticing (D-34).

## Rollback

Set the version back to `draft`. Nothing that already sold is affected: a
snapshot pins its version (D-26 — the flag is "was published"). A mid-lock
republish does not force an in-flight customer onto a new matrix.

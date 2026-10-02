# The four policy values get a draft and a Publish — D-27 is reversed

**Owner, 2026-10-02 (+04), in chat, through the question form.**

He tried to set the waiting time to 30 minutes in the dashboard and could not. The reason:
`app/ops/OpsSettings.dc.html:1080` binds all four policy boxes to `setMinAdvance: () => {}`,
`setCancelWindow: () => {}`, `setAirportWait: () => {}`, `setCityWait: () => {}` — empty
handlers — and `/api/staff/settings` says in its own header that PATCH updates
`public.settings` only and never `settings_versions`, where those four values live.
So the boxes look editable, accept typing, and save nothing.

That breaks his standing rule: a shown control must be live through UI, backend, database,
admin/ops and the public surface.

## What he chose

**"Make them save, with Publish."** Save keeps a draft; a separate Publish makes it live for
customers. The same two-step as the price book, so a half-typed number never reaches the site.
His example: set airport waiting to 30, press Publish, and the booking pages read 30 minutes.

## What this reverses

`apps/web/lib/ops/settings.ts` opens with **D-27**: "this module never writes
public.settings_versions. Publishing a new policy version is a migration, not a console
action — the function does not exist, so a later contributor adding one is crossing a
decision rather than filling a gap."

This decision crosses it deliberately. D-27 is dead for the four values named here. It stays
true for everything else on that row (cancellation tiers, night window, policy document
slug and version, service area) — those are still migration-only.

Note that the app already inserts into `settings_versions` from one place: the price-book
Publish route clones the current row forward on every publish. So the table was never
console-proof; only this module was.

## What stays

- `settings_versions` stays **append-only**. Publish INSERTs a new row; nothing is updated
  or deleted. `tg_append_only` raises 23001 and that stays.
- The live value is still "the newest row with `effective_from <= now()`".
- Only an admin may Publish. Save (draft) is staff.

## Why it matters beyond the one number

Live policy row 15 grants **city waiting 15 minutes**. `/terms` §08 — his signed legal text —
promises customers **30 minutes for all non-airport pickups** (airport is 60 in both).
The site has been promising twice what the database grants. The control he could not use was
the control that fixes it.

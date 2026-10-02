# Extras on a published price book: draft, then Publish

Owner's answer in the controller session, question form, 2026-10-02 03:24 (+04).

**Decision:** adding, changing or deleting an extra on a published price book (live row 18) works like
every other price: the change goes into a draft and is live only when the owner presses Publish. No
extra can be edited directly on the live row, and no rule is keyed on an extra's name.

**Why this needed asking:** finding D1 of the Phase 20 close-out (`.planning/quick/261002-phase20-close/HANDOVER.md`).
Live `tg_pricing_row_frozen` is the first version (a published row is frozen). The file
`packages/db/supabase/migrations/20260911000002_live_passenger_extras.sql` was never applied on live; it
would let seven named extras be edited on a published row, which breaks the owner's rule that extras are
generic and never matched by name. Local replays and tests run the file's version, so code and live disagree.

**Work (goes with the extras job, B2 parts B and C):** a new migration that restores
`tg_pricing_row_frozen` to the body live runs today (on live a no-op, read back by md5), so a from-zero
replay matches live; tests follow the draft-then-Publish rule. Never edit the old file in place.

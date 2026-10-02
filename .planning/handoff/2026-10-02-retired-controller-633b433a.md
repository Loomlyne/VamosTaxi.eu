# Hand-over from the retired controller (session local_633b433a, "VamosTaxi - session control")

Written 2026-10-02 15:31 (+04), after the owner confirmed in this session's question form that session
004ad4f0 ("vamostaxi-eu-b2") is the controller since 15:26. This session ships nothing more.
Not committed: the new controller decides what to do with this file.

## In flight from this session (read-only, results go to the new controller)

1. **Independent fresh review of `fix/settle-safety`** (cfcca21e, code f22b6a04, migration
   20261007200000): an Opus reviewer started at about 15:29, read-only (live SELECTs only). Its verdict
   will be sent to the new controller as soon as it arrives.
2. **Clean-clone gates for `fix/settle-safety`** on origin/main 3978fda9 + the branch (11 gates, build,
   unit, pgTAP from empty, types), in this session's scratch clone with stack `vamos-taxi-ctl` (647xx); the
   script stops and removes that stack at the end. Result will be sent the same way.
   Note: main moved to a03baf75 (planning note) after the clone was cut; the checked tree differs only in
   .planning/.

## Not on the board yet / for the new controller
- `CLAUDE.local.md` rule 1 (gitignored, owner's file) still names this session
  (`local_633b433a-13a1-4f99-bfe8-3d595717a4a1`) as the controller and "Next migration number:
  20261007210000". The board on main says the next free number is 20261007220000. The owner or the new
  controller should update that rule; this session did not touch it after the take-over.
- `.planning/prompts/00-common-rules.md` and `.planning/CONTROL-METHOD.md` still name this session as
  controller (last written by it at 14:15).
- Scratch clone `/private/tmp/claude-501/-Users-koss-Developer-VamosTaxi-eu/ad95bf82-30f3-4b52-b6ab-05d584c0c7e5/scratchpad/ctl-p20`
  is this session's own temp folder (gone on restart); nothing in it is unique.
- Owner steps this session had listed (also on the board's "What is left"): GitHub Actions billing; one
  4242 payment after today's checkout deploys (then read booking_payments and the newest stripe_events
  row: jsonb_typeof should be object); refund VT-26-0750 by hand; P6 UAT on VT-26-0750 (time, then pickup
  place); 10 travellers in Van luxury with 4242; waiting time 30; review texts; /contact test; pay in
  de/fr/ar and on a tablet; Meta switches; the design-canvas hand-over file; repo public/private; the rest
  of his 18:01 message.

# Owner confirmation: Meta Events Manager switches (2026-10-01)

Given through the question form in the Phase 28 session. His answer: "Both are off".

For pixel `1595596972063765`, in Meta Events Manager (the pixel → Settings):

- "Automatic advanced matching": off
- "Track events automatically without code": off

This is the confirmation META-08 and the Phase 28 success criterion 3 require before the pixel may
load. Phase 28 records it as the flag that lets the pixel load (together with the legal gate and the
visitor's Accept). If either switch is turned back on, the flag must go off again.

Also decided in the same form: Phase 28 comes before the finish-your-account follow-up (27 D-37);
order 28 → 29 → finish-your-account.

## Addendum 2026-10-01 09:15 UTC — Meta's setup file contradicts the answer

Meta's served setup for the pixel (`connect.facebook.net/signals/config/1595596972063765`) still
contains `optIn(..., "AutomaticMatching", true)` with `selectedMatchKeys` em, fn, ln, ge, ph, ct, st,
zp, db, country, external_id, and the automatic-event features (`InferredEvents`,
`MicrodataCoverage`, `SmartSetup`, `AutomaticParameters`) on. Put to the owner; his answer:
"keep me updated, check each hour on this, and when it is turned off start and continue working on it".

So the pixel flag stays closed and Phase 28 is not built until Meta's setup file no longer shows
them. The agent re-reads it hourly and tells him each time.

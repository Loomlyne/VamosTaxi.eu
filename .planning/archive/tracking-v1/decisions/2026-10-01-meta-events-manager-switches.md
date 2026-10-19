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

## Addendum 2026-10-03 — owner turned both switches off; Meta's setup file re-read

The owner said on 2026-10-03 that he has turned off "Automatic advanced matching" and "Track events
automatically without code" in Meta Events Manager for pixel `1595596972063765`.

Re-read by the Phase 28 job session at **2026-10-03 12:03:53 UTC** (read-only GET, nothing sent to Meta):

- `curl -s "https://connect.facebook.net/signals/config/1595596972063765?v=2.9.412&r=stable" | grep -c 'optIn("1595596972063765", "AutomaticMatching"'` → **0** (was 1 on 2026-10-01).
- No `config.set("1595596972063765", "automaticMatching", …)` any more. The one remaining
  `automaticMatching` string in the file is Meta's library code reading that setting
  (`t.get(s.id,"automaticMatching")`), which now finds nothing.
- `optIn("1595596972063765", "AutomaticMatchingForPartnerIntegrations", true)` is still served;
  Meta's code runs automatic matching only when both it and `AutomaticMatching` are on, so it does
  nothing alone.
- Still served: `optIn(..., "InferredEvents", true)` (twice), `MicrodataCoverage`, `SmartSetup`,
  `AutomaticParameters`, with `config.set(..., "inferredEvents", …)` and `"microdataCoverage"`.
  Phase 28 keeps the code defence from the research: `fbq('set','autoConfig',false,ID)` (and the
  global form) before `init`, and proves it with Meta's real script on a local test page whose
  requests to Meta are intercepted and never sent (plan 28-07). If that proof shows any automatic
  event, the flags stay off.

An earlier session's own message put this re-read at 12:02 UTC with the same result (0).

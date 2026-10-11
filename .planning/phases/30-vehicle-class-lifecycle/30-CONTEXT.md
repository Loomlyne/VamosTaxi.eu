# Phase 30: Vehicle class lifecycle — context

Discuss signed by Koss in the question form on 2026-10-11. The decisions, facts and file references are in
`.planning/decisions/2026-10-11-fleet-lifecycle.md` (source of truth; this file only points there).

Summary: say "class", never "fleet". Class rows on the dashboard Pricing page show Draft / Live / Retired.
"Delete" becomes "Retire"; a Retired list has "Bring back"; a Draft row lists what is missing (photo, seats,
bags, price in the live price book) beside "Go live". New price books skip retired classes. Chauffeurs are
not part of adding a class; a chauffeur on a retired class is flagged and cannot be assigned until changed.
`/fleet/chauffeurs` becomes `/chauffeurs`. One-off: test classes business, economy, first, van, mahaha and
reviews rv-1…rv-5 removed by a script Koss runs himself (archive tag + different-model check first).

Next: UI-SPEC pictures (Pricing class rows in each state, Draft checklist, Retired list, Retire dialog,
chauffeur flag) at 1440 and 390, English and Arabic; his signature; then /gsd-plan-phase 30.

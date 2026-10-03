# Owner answers to the 26.2 audit questions — 2026-10-03 ~02:05 (+04)

Source: the owner's answers in the controller session's question form (session 004ad4f0), first-hand.
Questions came from `.planning/phases/26.2-codebase-audit-bug-fix-simplify/26.2-HANDOVER-3.md` ("Owner questions").

| # | Question (page) | Answer, verbatim option | What follows |
|---|---|---|---|
| U04-3 | Airport pickup fee and route extra as their own lines on /checkout and the receipt | "Own lines, show me first (Recommended)" | Design job: pictures of /checkout and the receipt with separate lines; owner signs before code |
| U08-8 | Site header and footer on /coming-soon | "Leave it bare (Recommended)" | Nothing; the holding page stays one screen |
| U07-2 | Internal "Client input" notes visible on /imprint | "Labelled TBC gaps (Recommended)" | Build job: each note becomes a `data-tok` pill (English label + TBC, as for every pending legal value) |
| U08-11 | ~20 legal lines edited after translation show in English on de/fr/ar | "Drafts for you to approve (Recommended)" | Draft job: de/fr/ar translations on one sheet for approval; nothing goes live until approved, then used verbatim |

## Correction and new answer for U07-2, 2026-10-03 ~03:30 (+04)

The 02:05 question was based on two wrong facts: the "Client input" notes were already hidden on live (sections 05 and 07 showed as empty headings), and TBC pills are not how other gaps show — the owner's rule of 2026-09-30 is no TBC on any page a customer can see (`apps/web/lib/live-no-tbc.test.ts`). The controller said so and asked again.

| Question | Answer, verbatim option |
|---|---|
| /imprint sections 05 (licensing authority, licence number), 06 (dispute resolution body), 07 (content and links disclaimer) have no real text yet: what do customers see until the values come? | "Hide those sections (Recommended)" |

This replaces the U07-2 row above ("Labelled TBC gaps"). The no-TBC rule stays whole.

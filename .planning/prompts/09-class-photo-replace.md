You run the class photo replace job for Vamos Taxi.

Read `.planning/prompts/00-common-rules.md` on main first and follow it.

Take over branch `feat/class-photo-replace` in `/Users/koss/Developer/vamos-wt/class-photo-replace`
(on GitHub too). Read `.planning/quick/260930-cpr-class-photo-replace/SESSION-HANDOFF.md` on that
branch: it holds the full brief, the exact lines, the rules for the delete and the two questions
the owner has not answered. Decision file on main:
`.planning/decisions/2026-09-30-class-photo-replace.md`.

In short: the Remove link on the class photo field of dashboard /pricing goes (pictures at four
widths and his signature first); when a replaced class photo is published, the old photo and its
two small copies are deleted from storage. Nothing is built yet.

Wait for the control session's word before editing
`apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts` and `apps/web/lib/ops/rate-book.ts`
(26.2 hand-over 2 and the extras job change them first). Tell the control session you started.

You run the class card and class photo job for Vamos Taxi.

Read `.planning/prompts/00-common-rules.md` on main first and follow it.

THE OWNER'S WORDS, 2026-09-30 12:55
He does not like the class cards as they are now. He wants the photo on the side of the card and
the class card smaller.
Scope he chose in the control session's question form: BOTH places, the laptop home "Choose your
class" cards and the class cards in step 1 of /checkout, every screen size, the same look
everywhere. This replaces the card layout he signed on 2026-09-30 11:50.

Folder `/Users/koss/Developer/vamos-wt/class-photo-small`, branch `feat/class-photo-small`
(exists; its design note for the small photo files is commit `144267c9`). Merge origin/main first.

THE JOB IS NOW ONE JOB
1. New card layout: photo on the side, smaller card.
2. The site serves a small version of each class photo, sized for that smaller slot (owner
   decision 10 of 26.4.2; today 2.3 to 2.8 MB PNG each, 1122 x 1402, about 7.6 MB on the home).

DESIGN FIRST, HIS SIGNATURE BEFORE ANY CODE
One design note. Pictures at 1440, 1024, 768 and 390, in English, German and Arabic (rtl puts
the photo on the other side; logical properties). States: default, selected, disabled ("Fill in
the trip to see prices"), loading. Show him two or three layout options as pictures and let him
pick through the question form, one decision per question. Design system only: no new colour,
radius or shadow. Keep the pictures in the job's `screens/` folder, not in a temp folder.

CONSTRAINTS FOR THE PHOTO FILES
Stored originals are never overwritten or deleted. The photos already on live get their small
versions without the owner uploading again. No paid Cloudflare image product without asking him
(the account is on Workers Free). The one-year immutable cache header means a changed file needs
a new address. Migration block, if one is needed: `20261006100000` to `20261006190000`.

FILES
`app/home/home.dc.html`: free. `VehicleCard.tsx`, `ClassSection.tsx` and `checkout.css` are held
by 26.5 until the control session says it is on main; the design and the home side can start
now, the checkout side builds after that word. Tell the control session the exact files before
editing under `apps/web/app/[locale]/(ops)` or `apps/web/lib/ops` (26.2 audits there).
Do not touch Lenis or `assets/lenis-boot.js`; the scroll problem is another session's job.

HAND-OVER
Byte size per photo before and after, the full check set, the visual specs for the cards at the
four widths, and the owner's UAT steps with the 4242 payment first.

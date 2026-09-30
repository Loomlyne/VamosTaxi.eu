# Owner decision: no stops on the way — terms line removed (2026-10-01)

Given through the question form in the 26.2 audit session, after the extra-stop code was removed
(P4 part D; his rule 2026-09-30: "there is no extra stop, remove anything related to it").

| # | Decision |
|---|---|
| 1 | vamostaxi.site/terms, "Charged separately, only if you ask for it": the line "Additional stops: shown on your quote per stop." is deleted, in all four languages. Nothing is added. (`app/pages/terms.dc.html`; the Next.js twin `apps/web/app/[locale]/terms/page.tsx` for consistency.) The dictionary entries stay (append-only) and are simply no longer used. |
| 2 | The old checkout mock `app/pages/checkout.dc.html` (not reached by customers) loses its "Additional stops" counter and its words. |

No lawyer has read it.

## Added the same day (question form, 2026-10-01)

| # | Decision | Text, verbatim |
|---|---|---|
| 3 | vamostaxi.site/privacy, what we collect: the stop goes | en "Pickup and drop-off address." · de "Abhol- und Zieladresse." · fr "Adresse de prise en charge et de destination." · ar "عنوان الانطلاق والوصول." |
| 4 | vamostaxi.site/terms, "Charged separately, only if you ask for it": the line "Waiting beyond the included allowance: charged per commenced hour." is deleted, four languages, nothing added (his rule 2026-09-30: waiting "completely delete those"). The included waiting time stated elsewhere stays. | — |

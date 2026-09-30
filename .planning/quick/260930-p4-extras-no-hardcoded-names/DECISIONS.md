# P4 — extras: the owner's decisions (question form, 2026-09-30)

Source: three question forms in the 26.2 audit session. His words are quoted as typed.

| # | Question | His answer | What it means |
|---|---|---|---|
| D0 | An extra named "Ski" or "Waiting" cannot be saved | "I delete those items … anything deleted should be deleted completely" | No extra name is known to the code. Deleted extras leave no trace. |
| D1 | Is every extra a tick box the customer chooses? | "i wnat automatic extras too only the free ones are automatic so if i add an extra and i keep teh price as 0 it will show as included extra and it will come automatically ticked per default only if the user desable it thenit will remove it like tick it again to remove it" | Price above 0: a tick box, off by default, charged when ticked. Price 0: shown as "included", ticked by default; the customer can untick it to remove it. Nothing else is automatic. |
| D2 | An extra at CHF 0 | "Show as included" | Same as D1. |
| D3 | Child seat: one tick or a number | "A number (1, 2, 3)" | The customer can choose how many. |
| D3a | How the code knows which extra takes a number | "Switch per extra, my maximum (Recommended)" | The Pricing page gets, per extra, a switch "Customer can choose a number" and a field for the maximum. Off: one tick. Never decided by the name. |
| D2a | Is a free extra that stays ticked recorded? | "Yes, recorded everywhere (Recommended)" | Shown as "included" on checkout, confirmation, e-mail, booking page and dashboard. Unticked: not on the booking. |
| D5 | Night, weekend, holiday, waiting | "complitelly delete those" | No automatic night, weekend, holiday or waiting charge exists or is wanted. Every leftover in code, on the Pricing page and on the dashboard booking detail goes. As names they are ordinary extras. |
| D4 | Extra stop | "there is no extra stop remove anythign related to it" | There is no stop on the way in this product. The unused stop code in the fare engine, the request and the settings goes. |
| — | Airport fee as its own line (hand-over 2, lead L3) | "Leave as one fare (Recommended)" | The airport fee stays inside the fare and stays a per-class field on the Pricing page. |

Not asked again, because his rule D0 answers them: deleting an extra also deletes its four-language
names; the leftover words on the Pricing page ("Meet and greet stays on", "Free airport wait",
"Extra wait") go.

Already decided in hand-over 2 (his yes, fix 9): a cloned old price book shows its old-style
extras, so nothing goes live unseen.

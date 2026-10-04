# Decision: sorting on the dashboard bookings table

Owner, chat, 2026-10-04 20:38 +0400, verbatim: "the table i wnat it to be the nwest created bookogn to the oldest i wanna be able to
chnage the from just clicking n booked title it wil flip from nwest-olest to oldest-newest as well forvehicleby class
type , and river by assigned or not assigned, and total to boggest to smallest".

As built by `fix/ops-board-sort` (quick 261004-ops-board-sort):

| Header | First click | Click again |
|---|---|---|
| Booked (default on every load) | newest → oldest | oldest → newest |
| Vehicle | class order Economy → Business → Van luxury (from the class rows) | reverse |
| Driver | not assigned first | assigned first |
| Total | biggest → smallest | smallest → biggest |

Ties: newest booked first. Missing values last. Pickup, Customer and Route are not sortable (not asked).
Controller's choices where the message was silent: Driver's first click puts "not assigned" on top (needs action);
the sort is not remembered across reloads (the owner asked for newest first as the table's order).

# Owner decisions: the booking confirmation page (2026-10-01)

Given by the owner through the question form in the project thread "Pick-up report from GitHub",
2026-10-01. Pictures: `.planning/quick/261001-confirmation-redesign/screens/`. No lawyer has read it.

## Decisions

| # | Decision |
|---|---|
| 1 | The layout in `proposed-en-1440.png` and `proposed-en-390.png` is **signed** (answer "Signed", 11:24 UTC). |
| 2 | Changing the time or flight number and cancelling live on Manage booking only. They leave the confirmation page (today they call sign-in-only routes and do nothing for a guest). |
| 3 | The English wording below is **approved** (answer "Approve", 11:31 UTC). Used word for word. German, French and Arabic are drafted in the build and shown to the owner at UAT. |
| 4 | The build plan `.planning/quick/261001-confirmation-redesign/PLAN.md` is **signed** (answer "Signed", 11:34 UTC). The build runs on the owner's Mac. |

## Approved English text

"What happens next" card (heading `What happens next`, already live in four languages):

1. We assign your driver. / You get an e-mail with the driver's name and plate.
2. A reminder 24 hours before pickup. / By e-mail, with your driver's details once assigned.
3. Free cancellation up to 24 hours before pickup. / On Manage booking.
   ("24" is `freeCancelHours` from settings; when settings cannot be read the number is a labelled `data-tok` gap, never a guess.)

Under the two buttons: Change the time or the flight number, or cancel, on Manage booking.

Help line: Questions about this trip? Call +41 79 626 70 82 or write on WhatsApp.

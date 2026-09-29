# Owner decision: a booking on another device (2026-09-30)

Given by the owner in the control session, 2026-09-30, in his own words:
"if she already paid for the trip she can share it; if she didn't and is just trying to book
and wanted to finish it on desktop, she can't." He calls the second case a security breach,
"with just paste a link or even if she signed".

## Rule

| The trip is | On another device |
|---|---|
| Paid | The customer can open it and share it (confirmation and manage link). |
| Not paid | It cannot be continued. Not by pasting a link, not by signing in. The customer finishes on the device where she started, or starts again. |

## What the code does today (read, not tested, at main 0f58ab6d)

- The checkout link carries the trip only: from, to, when, passengers, bags, flight. No
  contact data, no price, no booking id.
- The unpaid booking with the contact details is returned by `/api/checkout/resume` only when
  the request carries the `vt_manage` cookie whose hash matches an active manage token of that
  booking. Another device does not have that cookie.

## Not verified

- Whether signing in on a second device can bring back an unpaid booking. Phase 26.5 adds
  accounts to checkout, so it must prove this with a test.
- Whether the owner also wants the trip itself (addresses and time) kept out of a pasted link.
  His words are about continuing a booking; he was not asked again.

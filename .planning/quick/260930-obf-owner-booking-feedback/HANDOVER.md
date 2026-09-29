# Handover: quick 260930-obf (owner booking feedback)

Branch `fix/26.4.2-booking-feedback` in `/Users/koss/Developer/vamos-wt/fix-26.4.2`. Not pushed, not deployed. Main has been merged into it. Control session: after the owner signs, land it on main in one commit and deploy.

Screenshots for the owner: `/private/tmp/claude-501/-Users-koss-Developer-VamosTaxi-eu/3c6c6056-f11d-41a2-8b13-17a758844e5c/scratchpad/sign-*.png` (list in SUMMARY.md).

## Owner UAT (on a staging or local build, control session provides the URL)

Phone (width 390), home page:

1. Tap the "Where to?" bar. Expected: one page opens with Where, When and Who. No steps, no Back.
2. Type "Zurich Air" in From and pick Zurich Airport. Expected: a Flight number field appears above From and your cursor is in it.
3. Tap SEE PRICES with nothing else filled. Expected: a message names what is missing and the first empty field is focused.
4. Fill To, tap Date. Expected: the Vamos calendar opens, not the phone's own picker. Pick a day.
5. Tap Time. Expected: the Vamos hour and minute picker opens, Time sits below Date.
6. Tap SEE PRICES. Expected: you go to checkout with the trip filled.

Tablet (width 768): repeat 1 to 6. Expected: same single page.

Laptop (width 1440):

7. Look at the bar. Expected: From, To, When, Travellers, SEE PRICES. No flight field.
8. Type "Zurich Air" in From and pick the airport. Expected: the Flight field slides in to the left of From, the bar does not jump up or down, your cursor is in Flight.
9. Press Tab repeatedly. Expected: Flight, From, To, When, Travellers, SEE PRICES, in that order.
10. Scroll the page so the bar sits at the bottom of the window, type in From. Expected: the address list opens upward.
11. Fill From, To and When. Expected: three cards appear under the bar (Economy, Business, Van luxury) after about one second, with skeletons first, then the prices from the server.
12. Change the date. Expected: the skeletons return and new prices arrive. Nothing fires while you type.
13. Click Select on Business. Expected: checkout opens with the trip and Business chosen.

Checkout on a phone (width 390):

14. Open a trip with 5 passengers. Expected: Economy and Business are greyed with "Seats up to 3", Van luxury shows its price and can be picked.
15. Tap Van luxury. Expected: dark 2 px border and a check.
16. Tap Edit trip. Expected: the fields are in the order Flight, From, To, When, Travellers.

Arabic: switch language to Arabic and repeat 2, 8, 9 and 11. Expected: the layout mirrors, Tab order follows the mirrored order, cards read right to left.

## What the control session must know

- The `pnpm db:seed:gen` output is committed (dictionary changed).
- Merge was done as `-s ours` plus main's diff because main squashed the 26.4 phase; a normal merge conflicts in 13 files.
- Open points are listed under "Not done" in SUMMARY.md.

// Plan 26.3-15 leaves three places for the second half of the one-page checkout.
// Plan 19 fills them (section 2 "Who is travelling", section 3 "Payment", the rail on
// >=1081 and the bottom pay bar on <=1080); each reads the page state through
// `useCheckoutFlow()`. They render nothing today, so no empty box shows.

export function CheckoutSectionsSlot() {
  return null;
}

export function CheckoutRailSlot() {
  return null;
}

export function CheckoutBarSlot() {
  return null;
}

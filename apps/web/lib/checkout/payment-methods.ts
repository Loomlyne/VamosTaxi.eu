// J8 (W3-08): which payment methods the Stripe page offers. Its own module so the page layout (checkout
// note, footer TWINT mark) reads the same flag as the session creation without importing the Stripe SDK.

/**
 * Payment methods on the hosted page: card (Apple Pay and Google Pay come with it) plus TWINT only once
 * `STRIPE_CHECKOUT_TWINT` is "on" (D-20). Default off: TWINT is not activated on the account, and listing it
 * would make session creation fail for everyone. The copy that names TWINT (checkout method note, footer mark)
 * follows this one function.
 */
export function checkoutPaymentMethodTypes(env: {
  STRIPE_CHECKOUT_TWINT?: string;
}): Array<"card" | "twint"> {
  return env.STRIPE_CHECKOUT_TWINT === "on" ? ["card", "twint"] : ["card"];
}

/** The checkout's method note: names TWINT only while the Stripe page offers it (J8, W3-08). */
export function methodNoteKey(twintOn: boolean): "methodNote" | "methodNoteNoTwint" {
  return twintOn ? "methodNote" : "methodNoteNoTwint";
}

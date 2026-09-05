#!/usr/bin/env node
// scripts/stripe-session-probe.mjs
//
// Manual sk_test_ probe for a Checkout Session. Never run from CI. Never
// accepts a live key. Plan 07-04 lands the file; an owner with a test key
// can invoke it later.

const key = process.env.STRIPE_SECRET_KEY ?? "";
if (!key.startsWith("sk_test_")) {
  console.error("stripe-session-probe: STRIPE_SECRET_KEY must start with sk_test_");
  process.exit(1);
}

console.error("stripe-session-probe: refuse to run without an explicit owner invocation.");
process.exit(2);

#!/usr/bin/env node
// scripts/stripe-fixture-sign.mjs
//
// Test tooling only — never a Worker. Signs a canned Stripe event body so
// apps/web/lib/checkout/webhook-verify.ts runs unmodified.
// Prefers Stripe.webhooks.generateTestHeaderString (SDK helper). If that
// helper is missing this is the single deliberate Don't-Hand-Roll exception
// in Phase 7: the test must exercise the real verifier.

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const Stripe = require("stripe");

const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
if (!secret.startsWith("whsec_")) {
  console.error("stripe-fixture-sign: STRIPE_WEBHOOK_SECRET must start with whsec_");
  process.exit(1);
}

const payload =
  process.argv[2] && process.argv[2] !== "-"
    ? process.argv[2]
    : readFileSync(0, "utf8");

if (typeof Stripe.webhooks?.generateTestHeaderString !== "function") {
  console.error("stripe-fixture-sign: Stripe.webhooks.generateTestHeaderString is missing");
  process.exit(1);
}

const header = Stripe.webhooks.generateTestHeaderString({
  payload,
  secret,
});
process.stdout.write(header);

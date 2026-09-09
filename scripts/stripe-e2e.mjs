#!/usr/bin/env node
// scripts/stripe-e2e.mjs
//
// Gated live Stripe test-mode pass (plan 07-10). Never CI. Never a live key.
// Reads docs/build/OWNER-ANSWERS.md for the dated Phase 7 D-27 entry and
// refuses to guess a fare. Under option B the charge steps wait on
// docs/runbooks/quote-publish.md — this script does not write rate_versions.

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ANSWERS = join(ROOT, "docs/build/OWNER-ANSWERS.md");
const PROBE = join(ROOT, "scripts/stripe-session-probe.mjs");

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function readDecision() {
  let text;
  try {
    text = readFileSync(ANSWERS, "utf8");
  } catch {
    fail("stripe-e2e: missing docs/build/OWNER-ANSWERS.md");
  }
  if (!text.includes("D-27") || !text.includes("Phase 7")) {
    fail(
      "stripe-e2e: no dated Phase 7 D-27 entry in docs/build/OWNER-ANSWERS.md — record the owner decision first",
    );
  }
  const chosen = /\*\*B\b/.test(text)
    ? "B"
    : /\*\*A\b/.test(text)
      ? "A"
      : /\*\*C\b/.test(text)
        ? "C"
        : null;
  if (!chosen) {
    fail("stripe-e2e: D-27 is present but the chosen option (A/B/C) is not marked");
  }
  return { chosen, text };
}

function guardTestKey() {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key.startsWith("sk_test_")) {
    fail("stripe-e2e: STRIPE_SECRET_KEY must start with sk_test_");
  }
}

function printPlan(chosen) {
  console.log(`stripe-e2e: D-27 option ${chosen} (docs/build/OWNER-ANSWERS.md)`);
  console.log("steps:");
  console.log("  1. stripe-session-probe (first; ui_mode empirically)");
  console.log("  2. POST /api/checkout/intent with no live rate → 409 pricing_not_live");
  if (chosen === "A") {
    console.log("  3. staging-only sacrificial rate (packages/db/scripts/, never a migration)");
  } else if (chosen === "B") {
    console.log("  3. owner matrix via docs/runbooks/quote-publish.md (draft → live). No invented fare.");
  } else {
    console.log("  3. live charge deferred by owner decision. Offline PAY-05 is the shipped proof.");
  }
  console.log("  4–9. quote → pay → webhook → voucher → one email → teardown (only after a live rate)");
}

const dryRun = process.argv.includes("--dry-run");
const { chosen } = readDecision();

if (dryRun) {
  printPlan(chosen);
  if (chosen === "C") {
    console.log("stripe-e2e: live pass deferred (option C). Task 1 offline suite is the shipped proof.");
  }
  if (chosen === "B") {
    console.log("stripe-e2e: waiting on the owner matrix. Will not write rate_versions.");
  }
  process.exit(0);
}

guardTestKey();
printPlan(chosen);

console.log("stripe-e2e: running stripe-session-probe first");
const probe = spawnSync(process.execPath, [PROBE], {
  env: process.env,
  stdio: "inherit",
});
if (probe.status === 1) {
  fail("stripe-e2e: stripe-session-probe rejected the key");
}

if (chosen === "C") {
  console.log("stripe-e2e: live pass deferred (option C). Offline PAY-05 stands.");
  process.exit(0);
}

const base = process.env.VAMOS_E2E_BASE_URL ?? "";
if (base) {
  console.log("stripe-e2e: would POST /api/checkout/intent and assert 409 pricing_not_live");
} else {
  console.log("stripe-e2e: set VAMOS_E2E_BASE_URL to assert 409 pricing_not_live against a Worker");
}

if (chosen === "B") {
  console.log(
    "stripe-e2e: no live rate_versions row. Follow docs/runbooks/quote-publish.md. Refusing to guess amounts. Charge steps not run.",
  );
  process.exit(0);
}

fail("stripe-e2e: option A sacrificial fixture is not in this tree (D-27 is not A)");

// apps/web/lib/checkout/stripe-account-var.test.ts
//
// Phase 31 (D-06 with C-01, plan 31-11): the live Worker `vamos` (wrangler env.staging, which
// runs the live Stripe key) carries the plain var STRIPE_ACCOUNT_ID so the dashboard REFUND links
// open the live Stripe account. The controller confirmed the id against the live publishable key
// on 2026-10-13 (31-CONTEXT S-11). Not a secret: Stripe shows it in Dashboard URLs and the
// publishable key embeds it. env.production stays without a value; the sandbox id lives only in
// .dev.vars.example (plan 31-01). Never reads a secret, `.dev.vars`, or `.env*` file.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");

const CONFIRMED_LIVE_ACCOUNT_ID = "acct_1UIZmAQbJiSLxJfu";
const SANDBOX_ACCOUNT_ID = "acct_1UIZmqHcNp9GZYjz";
/** Same shape the 31-01 URL builder accepts; anything else is dropped from the link. */
const ACCOUNT_ID_SHAPE = /^acct_[A-Za-z0-9]{8,64}$/;

type Vars = { STRIPE_ACCOUNT_ID?: string; STRIPE_PUBLISHABLE_KEY?: string };

function rawConfig(): string {
  return readFileSync(join(webRoot, "wrangler.jsonc"), "utf8");
}

/** Full-line `//` comments stripped, then parsed (wrangler.jsonc has no trailing commas). */
function wranglerConfig(): { vars?: Vars; env: { staging: { vars?: Vars }; production: { vars?: Vars } } } {
  return JSON.parse(rawConfig().replace(/^\s*\/\/.*$/gm, "")) as ReturnType<typeof wranglerConfig>;
}

describe("STRIPE_ACCOUNT_ID in wrangler.jsonc (31-11)", () => {
  it("env.staging carries the confirmed live account id in the builder's shape", () => {
    const id = wranglerConfig().env.staging.vars?.STRIPE_ACCOUNT_ID;
    expect(id).toBe(CONFIRMED_LIVE_ACCOUNT_ID);
    expect(id).toMatch(ACCOUNT_ID_SHAPE);
  });

  it("env.production and the top-level vars carry no account id", () => {
    const cfg = wranglerConfig();
    expect(cfg.env.production.vars ?? {}).not.toHaveProperty("STRIPE_ACCOUNT_ID");
    expect(cfg.vars ?? {}).not.toHaveProperty("STRIPE_ACCOUNT_ID");
  });

  it("the sandbox account id never appears in the file", () => {
    expect(rawConfig()).not.toContain(SANDBOX_ACCOUNT_ID);
  });

  it("the id is declared once", () => {
    expect(rawConfig().match(/"STRIPE_ACCOUNT_ID"/g) ?? []).toHaveLength(1);
  });

  it("the id matches the account embedded in the staging live publishable key", () => {
    const vars = wranglerConfig().env.staging.vars ?? {};
    const pk = vars.STRIPE_PUBLISHABLE_KEY ?? "";
    expect(pk.startsWith("pk_live_51")).toBe(true);
    const idTail = (vars.STRIPE_ACCOUNT_ID ?? "").replace(/^acct_1/, "");
    expect(idTail.length).toBeGreaterThan(0);
    expect(pk.slice("pk_live_51".length).startsWith(idTail)).toBe(true);
  });
});

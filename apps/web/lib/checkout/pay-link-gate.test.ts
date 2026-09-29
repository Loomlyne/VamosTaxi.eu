import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function read(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

describe("checkout intent gate (moved from the removed public pay-link sender)", () => {
  const route = read("../../app/api/checkout/intent/route.ts");
  const lib = read("./intent.ts");

  it("refuses a missing class id before any Stripe client is built", () => {
    const classRefuse = route.indexOf("refuse(refusalForMissingClassId())");
    const stripe = route.indexOf("stripeClient()");
    const build = route.indexOf("stripeFromEnv(env)");
    expect(classRefuse).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(classRefuse);
    expect(stripe).toBeGreaterThan(classRefuse);
    expect(route.slice(0, stripe)).toContain('refuse("pricing_not_live")');
  });

  it("stops the UAE prefix on the payable path before a token or session", () => {
    const prefix = lib.indexOf("stripeAccountIsLegacyUaeTest(");
    const mint = lib.indexOf("deps.mintManageToken()");
    expect(prefix).toBeGreaterThan(-1);
    expect(prefix).toBeLessThan(mint);
    expect(lib).toContain("legacyUaeAccountStop()");
    expect(route).not.toContain("STRIPE_SECRET_KEY");
    expect(route).not.toMatch(/sk_(test|live)_/);
  });
});

describe("pay-link open gate", () => {
  const src = read("../../app/api/checkout/pay-link/open/route.ts");

  it("D-21/D-22: a hash miss reads the pay-link state and does not open Stripe", () => {
    const miss = src.indexOf("if (!found)");
    const stripe = src.indexOf("stripeFromEnv(");
    expect(miss).toBeGreaterThan(-1);
    expect(stripe).toBeGreaterThan(miss);
    const missSlice = src.slice(miss, src.indexOf("catch", miss));
    expect(missSlice).toContain("refusePayLink()");
    expect(missSlice).not.toContain("payment_window_closed");
    const catchSlice = src.slice(src.indexOf("catch", miss), stripe);
    expect(catchSlice).toMatch(/state === "P0002"\)\s*return refusePayLink\(\)/);
    expect(catchSlice).toContain('refuse("quote_expired")');
    expect(catchSlice).not.toContain("payment_window_closed");
    const helper = src.slice(src.indexOf("const refusePayLink"), miss);
    expect(helper).toContain("resolvePayLinkRefusal(");
    expect(helper).toContain("public.checkout_pay_link_state(");
    expect(helper).not.toContain("stripeFromEnv(");
    expect(src).toContain('refuse("quote_already_booked")');
  });

  it("refuses an empty charge as pricing_not_live before a session", () => {
    const charge = src.indexOf('refuse("pricing_not_live")');
    const stripe = src.indexOf("stripeFromEnv(");
    const create = src.indexOf("createCheckoutSession(");
    expect(charge).toBeGreaterThan(-1);
    expect(charge).toBeLessThan(stripe);
    expect(charge).toBeLessThan(create);
    expect(src).not.toContain("payment_window_closed");
    expect(src).not.toContain("paymentWindowClosed");
  });

  it("stops the UAE prefix before retrieve and create", () => {
    const prefix = src.indexOf("stripeAccountIsLegacyUaeTest(");
    const retrieve = src.indexOf("retrieveCheckoutSession(");
    const create = src.indexOf("createCheckoutSession(");
    expect(prefix).toBeGreaterThan(-1);
    expect(prefix).toBeLessThan(retrieve);
    expect(prefix).toBeLessThan(create);
    expect(src).not.toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    expect(src).not.toMatch(/sk_(test|live)_/);
  });

  it("sets lock_expires_at from token_expires_at, not the snapshot window", () => {
    expect(src).toContain("lock_expires_at: isoInstant(row.token_expires_at)");
    expect(src).not.toMatch(/lock_expires_at:\s*[^,\n]*snapshot_expires_at/);
    expect(src).toContain("expires_at: isoInstant(row.snapshot_expires_at)");
  });
});

describe("pay-link lock exp migration", () => {
  const sql = read("../../../../packages/db/supabase/migrations/20260923121000_checkout_pay_link_lock_exp.sql");

  it("returns token_expires_at and grants vamos_checkout only", () => {
    expect(sql).toContain("token_expires_at pg_catalog.timestamptz");
    expect(sql).toContain("t.expires_at");
    expect(sql).not.toContain("quote_lock_expires_at");
    expect(sql).toContain("drop function if exists public.checkout_pay_link_by_hash(pg_catalog.bytea)");
    expect(sql).toContain("to vamos_checkout");
    expect(sql).toContain("from public");
    expect(sql).toContain("from anon");
    expect(sql).toContain("from authenticated");
    expect(sql).not.toMatch(/grant execute[\s\S]*to anon/);
    expect(sql).not.toMatch(/grant execute[\s\S]*to authenticated/);
    expect(sql).not.toMatch(/grant execute[\s\S]*to public/);
    expect(sql.toLowerCase()).not.toContain("stripe");
  });
});

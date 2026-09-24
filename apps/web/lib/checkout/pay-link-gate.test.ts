import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function read(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

describe("pay-link send gate", () => {
  const src = read("../../app/api/checkout/pay-link/route.ts");

  it("pins token exp to the lock and keeps email_failed a 502", () => {
    expect(src).toContain("payLinkTokenExpiresAt(lockPayload.exp)");
    expect(src).not.toContain("tokenExpiresAt: new Date(payload.expires_at)");
    expect(src).not.toContain("checkoutWindowMinutes * 60");
    const line = src.split("\n").find((row) => row.includes("email_failed"));
    expect(line).toMatch(/error:\s*"email_failed"/);
    expect(line).toMatch(/code:\s*"email_failed"/);
    expect(line).toMatch(/status:\s*502/);
    expect(line).not.toContain("pricing_not_live");
    expect(line).not.toContain("invalid_request");
  });

  it("refuses a missing class id before stripeFromEnv", () => {
    const classRefuse = src.indexOf("refuse(refusalForMissingClassId())");
    const stripe = src.indexOf("stripeFromEnv(");
    expect(classRefuse).toBeGreaterThan(-1);
    expect(stripe).toBeGreaterThan(classRefuse);
    expect(src.slice(0, stripe)).toContain('refuse("quote_expired")');
    expect(src.slice(0, stripe)).toContain('refuse("pricing_not_live")');
  });

  it("stops the UAE prefix on the payable path before stripeFromEnv", () => {
    const prefix = src.indexOf("stripeAccountIsLegacyUaeTest(");
    const stripe = src.indexOf("stripeFromEnv(");
    expect(prefix).toBeGreaterThan(-1);
    expect(prefix).toBeLessThan(stripe);
    expect(src).toContain("legacyUaePrefixStop()");
    expect(src).not.toContain("STRIPE_SECRET_KEY");
    expect(src).not.toMatch(/sk_(test|live)_/);
  });
});

describe("pay-link open gate", () => {
  const src = read("../../app/api/checkout/pay-link/open/route.ts");

  it("treats a hash miss as quote_expired and does not open Stripe", () => {
    const miss = src.indexOf("if (!found)");
    const stripe = src.indexOf("stripeFromEnv(");
    expect(miss).toBeGreaterThan(-1);
    expect(stripe).toBeGreaterThan(miss);
    const missSlice = src.slice(miss, src.indexOf("catch", miss));
    expect(missSlice).toContain('refuse("quote_expired")');
    expect(missSlice).not.toContain("payment_window_closed");
    const catchSlice = src.slice(src.indexOf("catch", miss), stripe);
    expect(catchSlice).toContain('refuse("quote_expired")');
    expect(catchSlice).not.toContain("payment_window_closed");
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

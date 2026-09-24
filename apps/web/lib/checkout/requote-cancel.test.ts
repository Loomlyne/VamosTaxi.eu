import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const migrationName = "20260923120000_checkout_requote_cancel.sql";
const migration = readFileSync(
  join(here, "../../../../packages/db/supabase/migrations", migrationName),
  "utf8",
);

describe("checkout_requote_cancel migration", () => {
  it("sorts after the coupons migration and is not an apply script", () => {
    expect(migrationName > "20260920000003_coupons_per_rate_version.sql").toBe(true);
    expect(migration.toLowerCase()).not.toContain("supabase db push");
  });

  it("is a vamos_checkout-only definer that writes canceled, not a fare", () => {
    const sql = migration.toLowerCase();
    expect(sql).toContain("checkout_requote_cancel");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("vamos_checkout");
    expect(sql).toMatch(/revoke\s+all\s+on\s+function[\s\S]*from\s+public/);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function[\s\S]*from\s+anon/);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function[\s\S]*from\s+authenticated/);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function[\s\S]*to\s+vamos_checkout/);
    expect(sql).not.toMatch(/grant\s+execute[\s\S]*\bto\s+authenticated\b/);
    expect(sql).not.toMatch(/grant\s+execute[\s\S]*\bto\s+anon\b/);
    expect(sql).toMatch(/status\s*=\s*'canceled'/);
    expect(sql).toMatch(/status\s*=\s*'cancelled'/);
    expect(sql).toContain("'pending'");
    expect(sql).toContain("'quote'");
    expect(sql).not.toContain("stripe");
    expect(sql).not.toContain("booking_refunds");
    expect(sql).not.toContain("extract(epoch");
    expect(sql).not.toMatch(/\bsk_/);
  });
});

describe("POST /api/checkout/requote", () => {
  const src = readFileSync(join(here, "../../app/api/checkout/requote/route.ts"), "utf8");

  it("calls the guest definer after CSRF and does not use account cancel", () => {
    const post = src.slice(src.indexOf("export async function POST"));
    expect(post.indexOf("csrfForbidden(request)")).toBeLessThan(post.indexOf("asCheckout"));
    expect(src).toContain("asCheckout");
    expect(src).toContain("asCheckout(env, null");
    expect(src).toContain("select * from public.checkout_requote_cancel");
    expect(src).not.toContain("checkout_cancel_unpaid");
    expect(src).not.toContain("asCustomer");
    expect(src).not.toContain("/api/checkout/abandon");
  });

  it("returns requote_not_applied, not ok, when the function is undefined", () => {
    const line = src.split("\n").find((row) => row.includes("requote_not_applied"));
    expect(line).toBeDefined();
    expect(line).toMatch(/ok:\s*false/);
    expect(line).toMatch(/code:\s*"requote_not_applied"/);
    expect(line).toMatch(/503/);
    expect(line).not.toContain("pricing_not_live");
    expect(line).not.toContain("quote_expired");
    expect(line).not.toContain("payCouldNotStart");
    expect(src).toContain("42883");
    expect(src).toContain("invalid_request");
  });

  it("does not expire or mint on the legacy UAE publishable prefix", () => {
    const legacy = src.indexOf("stripeAccountIsLegacyUaeTest");
    const expire = src.indexOf("expireCheckoutSession");
    const fromEnv = src.indexOf("stripeFromEnv");
    expect(legacy).toBeGreaterThan(-1);
    expect(src).toContain("!stripeAccountIsLegacyUaeTest");
    expect(expire).toBeGreaterThan(legacy);
    expect(fromEnv).toBeGreaterThan(legacy);
    expect(src).not.toContain("createCheckoutSession");
    expect(src).not.toContain("sessions.create");
    expect(src).not.toContain("stripePublishableKey");
  });
  it("returns ok true only after expire resolved or a successful lookup found no session", () => {
    for (const code of ["session_lookup_failed", "session_not_expired"]) {
      const lines = src.split("\n").filter((row) => row.includes(code));
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line).toMatch(/ok:\s*false/);
        expect(line).toMatch(/503/);
        expect(line).not.toContain("pricing_not_live");
        expect(line).not.toContain("quote_expired");
        expect(line).not.toContain("payCouldNotStart");
      }
    }
    const lookup = src.indexOf("checkout_open_payment");
    const lookupCatch = src.indexOf("catch", lookup);
    const afterLookup = src.slice(lookupCatch, src.indexOf("if (sessionId)", lookupCatch));
    expect(afterLookup).toContain("session_lookup_failed");
    expect(afterLookup).not.toContain("sessionId = null");
    expect(afterLookup).not.toContain("checkout_requote_cancel");
    const expireCall = src.indexOf("expireCheckoutSession(");
    const afterExpire = src.slice(expireCall);
    const catchRel = afterExpire.indexOf("catch");
    const okTrue = afterExpire.indexOf("ok: true");
    expect(catchRel).toBeGreaterThan(-1);
    expect(okTrue).toBeGreaterThan(catchRel);
    const between = afterExpire.slice(catchRel, okTrue);
    expect(between).toContain("session_not_expired");
    expect(between).toContain("return");
    expect(between).toContain("checkout_requote_cancel");
    expect(between).not.toContain("{ ok: true }");
    expect(src).not.toContain("createRefund");
    expect(src).not.toContain("sessionId = null");
  });
});

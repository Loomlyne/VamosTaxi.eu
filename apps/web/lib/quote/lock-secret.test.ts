import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lockSecretMissingResponse, lockSecretPresent } from "./lock-secret";

const src = (p: string) => readFileSync(join(__dirname, "../..", p), "utf8");

describe("F14 lock secret guard", () => {
  it("empty or absent is missing, a value is present", () => {
    expect(lockSecretPresent("", "/x")).toBe(false);
    expect(lockSecretPresent(undefined, "/x")).toBe(false);
    expect(lockSecretPresent("s", "/x")).toBe(true);
  });
  it("503, JSON, no-store", async () => {
    const r = lockSecretMissingResponse();
    expect(r.status).toBe(503);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(await r.json()).toEqual({ ok: false, code: "temporarily_unavailable" });
  });
  it.each([
    ["app/api/checkout/intent/route.ts", "QUOTE_LOCK_SECRET"],
    ["app/api/checkout/price/route.ts", "QUOTE_LOCK_SECRET"],
  ])("%s answers 503 before using the secret", (file) => {
    const s = src(file);
    const guard = s.indexOf("lockSecretPresent(");
    expect(guard).toBeGreaterThan(-1);
    expect(s.indexOf("lockSecretMissingResponse()")).toBeGreaterThan(guard);
    expect(guard).toBeLessThan(s.indexOf('QUOTE_LOCK_SECRET || ""'));
  });
  it.each(["app/api/quote/route.ts", "app/api/quote/reprice/route.ts"])("%s guards the POST", (file) => {
    const s = src(file);
    const post = s.indexOf("export async function POST");
    const guard = s.indexOf("lockSecretPresent(");
    expect(guard).toBeGreaterThan(post);
    expect(s.indexOf('errorResponse("temporarily_unavailable")', guard)).toBeGreaterThan(guard);
    expect(guard).toBeLessThan(s.indexOf("request.json()"));
  });
});

describe("F14 edit-request refuses an empty lock secret", () => {
  const env = { STRIPE_SECRET_KEY: "sk_test_x", QUOTE_LOCK_SECRET: "" } as never;
  const payload = {} as never;
  it("acceptPaidEdit answers temporarily_unavailable before any database or Stripe call", async () => {
    const { acceptPaidEdit } = await import("../ops/edit-request");
    const r = await acceptPaidEdit(env, { sub: "s", role: "authenticated" }, "VT-1", { payload, lock: "tok" });
    expect(r).toEqual({ ok: false, code: "temporarily_unavailable" });
  });
  it("the customer door reads no lock at all (P6 review 1): there is no customer request that takes one", async () => {
    const lib = await import("../ops/edit-request");
    expect((lib as Record<string, unknown>).requestCustomerPaidEdit).toBeUndefined();
    expect(lib.requestCustomerTimeChange.length).toBe(4);
  });
  it("the staff JSON error status is 503", async () => {
    const { failStatus } = await import("../ops/edit-request-map");
    expect(failStatus("temporarily_unavailable")).toBe(503);
  });
});


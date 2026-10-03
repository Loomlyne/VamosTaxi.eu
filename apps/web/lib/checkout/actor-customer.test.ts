import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readCheckoutPageSource } from "../../tests/support/checkout-sources";
import { actorCustomerAllowed, resolveActorCustomerId, resolveActorCustomerIdWithDeps } from "./actor-customer";

let claimsAsked = 0;
vi.mock("../account/session", () => ({
  customerClaims: async () => {
    claimsAsked += 1;
    return { sub: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" };
  },
}));

const USER = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const CUSTOMER = "11111111-2222-4333-8444-555555555555";
const here = dirname(fileURLToPath(import.meta.url));
const source = (rel: string) => readFileSync(join(here, "../..", rel), "utf8");

describe("resolveActorCustomerIdWithDeps (26.3 D-32)", () => {
  it("no session cookie → null, no lookup", async () => {
    const lookup = vi.fn(async () => CUSTOMER);
    expect(await resolveActorCustomerIdWithDeps({ claims: async () => null, lookup })).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("claims present and RPC returns a uuid → that uuid", async () => {
    const lookup = vi.fn(async () => CUSTOMER);
    expect(
      await resolveActorCustomerIdWithDeps({ claims: async () => ({ sub: USER }), lookup }),
    ).toBe(CUSTOMER);
    expect(lookup).toHaveBeenCalledWith(USER);
  });

  it("claims present but no customers row → null", async () => {
    expect(
      await resolveActorCustomerIdWithDeps({ claims: async () => ({ sub: USER }), lookup: async () => null }),
    ).toBeNull();
  });

  it("RPC throws → null and the error is reported (booking proceeds as guest)", async () => {
    const onError = vi.fn();
    expect(
      await resolveActorCustomerIdWithDeps({
        claims: async () => ({ sub: USER }),
        lookup: async () => {
          throw new Error("42883");
        },
        onError,
      }),
    ).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("claims lookup throws → null", async () => {
    expect(
      await resolveActorCustomerIdWithDeps({
        claims: async () => {
          throw new Error("cookie");
        },
        lookup: async () => CUSTOMER,
      }),
    ).toBeNull();
  });

  it("a non-uuid sub never reaches the RPC", async () => {
    const lookup = vi.fn(async () => CUSTOMER);
    expect(
      await resolveActorCustomerIdWithDeps({ claims: async () => ({ sub: "x' or 1=1" }), lookup }),
    ).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe("checkout routes use the signed-in actor", () => {
  it("intent resolves the actor instead of a hard-coded null", () => {
    for (const rel of ["app/api/checkout/intent/route.ts"]) {
      const route = source(rel);
      expect(route).not.toContain("actorCustomerId: null");
      expect(route).toContain("resolveActorCustomerId(env, request)");
    }
  });

  it("the checkout page has no pay-link sender", () => {
    const client = readCheckoutPageSource();
    expect(client).not.toContain("sendPayLink");
    expect(client).not.toContain("/api/checkout/pay-link");
  });
});

describe("dashboard host never has a customer actor (quick 261003)", () => {
  const req = (url: string) => new Request(url, { method: "POST" });

  it("public hosts may carry a customer; dashboard hosts may not", () => {
    expect(actorCustomerAllowed(req("https://vamostaxi.site/api/checkout/intent"))).toBe(true);
    expect(actorCustomerAllowed(req("http://localhost:3000/api/checkout/price"))).toBe(true);
    expect(actorCustomerAllowed(req("https://dashboard.vamostaxi.site/api/checkout/intent"))).toBe(false);
    expect(actorCustomerAllowed(req("https://DASHBOARD.vamostaxi.site/api/checkout/price"))).toBe(false);
    expect(actorCustomerAllowed(req("http://dashboard.localhost:4591/api/checkout/intent"))).toBe(false);
  });

  it("New trip on the dashboard host: null before any session is read (booking stays a guest booking)", async () => {
    claimsAsked = 0;
    const env = {} as CloudflareEnv;
    for (const path of ["/api/checkout/intent", "/api/checkout/price", "/api/checkout/me"]) {
      expect(await resolveActorCustomerId(env, req(`https://dashboard.vamostaxi.site${path}`))).toBeNull();
    }
    expect(claimsAsked).toBe(0);
  });
});

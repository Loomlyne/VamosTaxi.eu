import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveActorCustomerIdWithDeps } from "./actor-customer";

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
  it("intent and pay-link resolve the actor instead of a hard-coded null", () => {
    for (const rel of ["app/api/checkout/intent/route.ts", "app/api/checkout/pay-link/route.ts"]) {
      const route = source(rel);
      expect(route).not.toContain("actorCustomerId: null");
      expect(route).toContain("resolveActorCustomerId(env, request)");
    }
  });

  it("the checkout client has no pay-link sender", () => {
    const client = source("app/[locale]/checkout/CheckoutClient.tsx");
    expect(client).not.toContain("sendPayLink");
    expect(client).not.toContain("/api/checkout/pay-link");
  });
});

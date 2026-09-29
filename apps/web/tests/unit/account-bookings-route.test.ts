// Quick 260929-acl: a failed list read is a 500 `list_failed`, never an empty list.

import { beforeEach, describe, expect, it, vi } from "vitest";

const asCustomer = vi.fn();
const customerClaims = vi.fn();

vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => ({ env: {} }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/account/session", () => ({ customerClaims: (...a: unknown[]) => customerClaims(...a) }));
vi.mock("@/lib/db/identity", () => ({ asCustomer: (...a: unknown[]) => asCustomer(...a) }));

import { GET } from "@/app/api/account/bookings/route";

describe("GET /api/account/bookings", () => {
  beforeEach(() => {
    asCustomer.mockReset();
    customerClaims.mockReset();
  });

  it("answers 500 list_failed, private and no-store, when the list query throws", async () => {
    customerClaims.mockResolvedValue({ sub: "u1", email: "a@example.test" });
    asCustomer.mockRejectedValue(Object.assign(new Error("permission denied"), { code: "42501" }));
    const res = await GET(new Request("http://localhost/api/account/bookings"));
    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ error: "list_failed" });
  });

  it("keeps 401 for a signed-out visitor", async () => {
    customerClaims.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/account/bookings"));
    expect(res.status).toBe(401);
    expect(asCustomer).not.toHaveBeenCalled();
  });

  it("returns the mapped list on success", async () => {
    customerClaims.mockResolvedValue({ sub: "u1", email: "a@example.test" });
    asCustomer.mockResolvedValue([]);
    const res = await GET(new Request("http://localhost/api/account/bookings"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ bookings: [] });
  });
});

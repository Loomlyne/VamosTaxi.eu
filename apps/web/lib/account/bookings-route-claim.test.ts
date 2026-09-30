// apps/web/lib/account/bookings-route-claim.test.ts
//
// Owner decision 2026-10-01 (question form): "My bookings" shows the customer's bookings even
// when linking earlier guest bookings fails; the failed linking is logged and tried again on the
// next open. The stand-in wrapper behaves like postgres.js begin(): a query error inside the
// transaction aborts it and is thrown again after the callback, even if the callback caught it.

import { beforeEach, describe, expect, it, vi } from "vitest";

let claimFails = false;
let asCustomerCalls = 0;

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: {} }),
}));
vi.mock("@/lib/account/session", () => ({
  customerClaims: async () => ({ sub: "u1", email: "anna@example.test" }),
}));
vi.mock("@/lib/db/identity", () => ({
  asCustomer: async (_env: unknown, _claims: unknown, fn: (sql: unknown) => unknown) => {
    asCustomerCalls += 1;
    let aborted: Error | null = null;
    const sql = (strings: TemplateStringsArray) => {
      const text = strings.join("?");
      if (aborted) return Promise.reject(new Error("current transaction is aborted"));
      if (text.includes("customer_claim_guest_bookings") && claimFails) {
        aborted = new Error("claim failed");
        return Promise.reject(aborted);
      }
      if (text.includes("from public.bookings")) {
        return Promise.resolve([
          {
            reference: "VT-26-0001",
            status: "confirmed",
            price_total_rappen: null,
            pickup_text: "Zurich Airport (ZRH)",
            dropoff_text: "Zurich",
            scheduled_local: "2026-10-05T08:00",
            scheduled_at: "2026-10-05T06:00:00Z",
            pax: 1,
            is_test: false,
            pay_link_sent_at: null,
            has_review: false,
          },
        ]);
      }
      return Promise.resolve([]);
    };
    const out = await fn(sql);
    if (aborted) throw aborted;
    return out;
  },
}));

import { GET } from "../../app/api/account/bookings/route";

beforeEach(() => {
  claimFails = false;
  asCustomerCalls = 0;
});

describe("My bookings when linking guest bookings fails", () => {
  it("still lists the customer's bookings", async () => {
    claimFails = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await GET(new Request("https://vamostaxi.site/api/account/bookings"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { bookings: Array<{ ref?: string }> };
    expect(body.bookings.map((b) => b.ref)).toEqual(["VT-26-0001"]);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("lists as before when linking works", async () => {
    const res = await GET(new Request("https://vamostaxi.site/api/account/bookings"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { bookings: unknown[] };
    expect(body.bookings).toHaveLength(1);
  });
});

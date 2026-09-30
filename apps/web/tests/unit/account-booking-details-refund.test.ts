// 20-10 B4: the signed-in booking detail carries the refund row data (refundStatus, refundOwedRappen)
// of the customer's OWN booking, so the row and box survive a reload. Mocked SQL layer, synthetic rappen.

import { beforeEach, describe, expect, it, vi } from "vitest";

const asCustomer = vi.fn();
const customerClaims = vi.fn();

vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => ({ env: {} }) }));
vi.mock("@/lib/account/session", () => ({ customerClaims: (...a: unknown[]) => customerClaims(...a) }));
vi.mock("@/lib/db/identity", () => ({ asCustomer: (...a: unknown[]) => asCustomer(...a) }));

import { GET } from "@/app/api/account/bookings/details/route";

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>;
const queries: { text: string; values: unknown[] }[] = [];

function install(refundRows: unknown[]) {
  asCustomer.mockImplementation(async (_e: unknown, _c: unknown, fn: (sql: Sql) => unknown) =>
    fn(async (strings, ...values) => {
      const text = strings.join(" ");
      queries.push({ text, values });
      if (text.includes("customer_booking_extras")) return [{ payload: { money: null, driver: null } }];
      if (text.includes("refund_status")) return refundRows;
      return [];
    }),
  );
}

const call = () => GET(new Request("http://localhost/api/account/bookings/details?ref=VT-26-0101"));

describe("GET /api/account/bookings/details: refund fields (20-10 B4)", () => {
  beforeEach(() => {
    queries.length = 0;
    asCustomer.mockReset();
    customerClaims.mockReset();
    customerClaims.mockResolvedValue({ sub: "u1", email: "A@Example.test" });
  });

  it("returns refundStatus and refundOwedRappen of the customer's own booking (int8 string → number)", async () => {
    install([{ refund_status: "pending_ops", refund_owed_rappen: "12000" }]);
    const body = await (await call()).json();
    expect(body).toMatchObject({ ok: true, refundStatus: "pending_ops", refundOwedRappen: 12000 });
  });

  it("owed null reads 0; no readable row reads 'none'", async () => {
    install([{ refund_status: "pending_ops", refund_owed_rappen: null }]);
    expect(await (await call()).json()).toMatchObject({ refundStatus: "pending_ops", refundOwedRappen: 0 });
    install([]);
    expect(await (await call()).json()).toMatchObject({ refundStatus: "none", refundOwedRappen: 0 });
  });

  it("the refund read is filtered by reference AND the signed-in e-mail (never another customer's row)", async () => {
    install([]);
    await call();
    const q = queries.find((x) => x.text.includes("refund_status"))!;
    expect(q.text).toMatch(/lower\(b\.contact_email::text\) = lower\(/);
    expect(q.values).toContain("VT-26-0101");
    expect(q.values).toContain("A@Example.test");
  });
});

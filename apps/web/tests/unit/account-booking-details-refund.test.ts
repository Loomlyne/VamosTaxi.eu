// 20-10 B4: the signed-in booking detail carries the refund row data (refundStatus, refundOwedRappen)
// of the customer's OWN booking, so the row and box survive a reload. Mocked SQL layer, synthetic rappen.
// 261002: the same answer now also carries status, canCancel, cancelWindow and reviewSubmitted (their own
// cases are in lib/checkout/booking-pages-polish.test.ts); asSystem is mocked because the route imports it.

import { beforeEach, describe, expect, it, vi } from "vitest";

const asCustomer = vi.fn();
const asSystem = vi.fn();
const customerClaims = vi.fn();

vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => ({ env: {} }) }));
vi.mock("@/lib/account/session", () => ({ customerClaims: (...a: unknown[]) => customerClaims(...a) }));
vi.mock("@/lib/db/identity", () => ({
  asCustomer: (...a: unknown[]) => asCustomer(...a),
  asSystem: (...a: unknown[]) => asSystem(...a),
}));

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
    asSystem.mockReset();
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

// Phase 31 D-04: no owed amount for a cancel (the customer sees one policy line, never a computed refund).
// The refunded amount stays (D-02); a live booking keeps its owed amount for the class/trip difference line
// (owner-approved 2026-10-01). Synthetic rappen.
describe("GET /api/account/bookings/details: no owed amount on a cancelled booking (Phase 31 D-04)", () => {
  beforeEach(() => {
    queries.length = 0;
    asCustomer.mockReset();
    asSystem.mockReset();
    customerClaims.mockReset();
    customerClaims.mockResolvedValue({ sub: "u1", email: "A@Example.test" });
  });

  for (const status of ["cancelled", "refunded", "partially_cancelled"]) {
    it(`${status}: refundOwedRappen 0, refundedRappen unchanged`, async () => {
      install([{ id: "b1", status, has_review: false, refund_status: "pending_ops", refund_owed_rappen: "12000", refunded_rappen: "3000" }]);
      const body = await (await call()).json();
      expect(body).toMatchObject({ ok: true, status, refundStatus: "pending_ops", refundOwedRappen: 0, refundedRappen: 3000 });
    });
  }

  it("a live booking (confirmed) keeps the stored owed amount for the difference line", async () => {
    asSystem.mockResolvedValue("auto_full");
    install([{ id: "b1", status: "confirmed", has_review: false, refund_status: "pending_ops", refund_owed_rappen: "1500", refunded_rappen: "0" }]);
    const body = await (await call()).json();
    expect(body).toMatchObject({ ok: true, status: "confirmed", refundOwedRappen: 1500, refundedRappen: 0 });
  });
});

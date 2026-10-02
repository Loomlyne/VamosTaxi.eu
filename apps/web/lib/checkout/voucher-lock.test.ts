import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { RepriceRequestSchema } from "../quote/schema";
import { lockForVoucher, signVoucherLock } from "./voucher-lock";

const here = dirname(fileURLToPath(import.meta.url));

const ARGS = {
  quoteId: "q-1",
  lock: "base-lock",
  voucher: "TEN",
  locale: "en",
  displayCurrency: "CHF" as const,
  preferredClass: "economy",
};

function okAnswer(lock: string) {
  return new Response(JSON.stringify({ ok: true, quote_id: "q-1", lock, expires_at: "2026-09-05T13:00:00.000Z", classes: [] }), { status: 200 });
}

describe("voucher lock (26.2 audit U11-1)", () => {
  it("asks /api/quote/reprice for a lock with the voucher in it, in a body the reprice schema accepts", async () => {
    const fetchImpl = vi.fn(async () => okAnswer("signed-lock"));
    const out = await signVoucherLock(fetchImpl, ARGS);
    expect(out).toEqual({ ok: true, lock: "signed-lock" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/quote/reprice");
    const sent = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(sent).toMatchObject({ quote_id: "q-1", lock: "base-lock", coupon: "TEN", preferred_class: "economy" });
    expect(RepriceRequestSchema.safeParse(sent).success).toBe(true);
  });

  it("answers the refusal code, or network, when the reprice fails", async () => {
    const refused = await signVoucherLock(async () => new Response(JSON.stringify({ ok: false, error: "quote_expired" }), { status: 409 }), ARGS);
    expect(refused).toEqual({ ok: false, code: "quote_expired" });
    const down = await signVoucherLock(async () => {
      throw new Error("offline");
    }, ARGS);
    expect(down).toEqual({ ok: false, code: "network" });
  });

  it("sends the base lock with no voucher, the signed lock only for that base and that voucher", () => {
    const held = { base: "base-lock", voucher: "TEN", lock: "signed-lock" };
    expect(lockForVoucher("base-lock", null, held)).toBe("base-lock");
    expect(lockForVoucher("base-lock", "TEN", held)).toBe("signed-lock");
    expect(lockForVoucher("base-lock", "TEN", null)).toBeNull();
    expect(lockForVoucher("base-lock", "OTHER", held)).toBeNull();
    expect(lockForVoucher("new-base-lock", "TEN", held)).toBeNull();
  });

  it("CheckoutForm sends the voucher lock to both the price call and PAY", () => {
    const src = readFileSync(join(here, "../../app/[locale]/checkout/CheckoutForm.tsx"), "utf8");
    expect(src).toMatch(/body: JSON\.stringify\(\{\s+lock,\s+vehicle_class: selectedClass/);
    expect(src).toMatch(/lock: payLock,/);
    expect(src).not.toMatch(/lock: quote\.lock,\s+trip,/);
  });
});

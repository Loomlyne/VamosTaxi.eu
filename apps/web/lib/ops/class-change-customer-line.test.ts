// apps/web/lib/ops/class-change-customer-line.test.ts
//
// 26.2 P1: a cheaper class on a trip that still runs leaves "Refund due" (pending_ops with an owed
// amount) for the admin. The customer's account page must not read it as the cancel promise
// "Full refund · sent by our team": that line is for a cancelled booking only. The customer gets the
// confirmation again with the new class and total (D7); no new customer wording is invented here.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../../../../app/vamos-manage-ticket.js"), "utf8");

type Ticket = { refundLine: (b: Record<string, unknown>) => string };

function load(): Ticket {
  const win: Record<string, unknown> = {};
  new Function("window", src)(win);
  return win.VamosManageTicket as Ticket;
}

describe("the customer's Refund row and a change credit", () => {
  const { refundLine } = load();

  it("a trip that still runs shows no refund promise for a change credit", () => {
    expect(refundLine({ status: "confirmed", refundStatus: "pending_ops", refundOwedRappen: 300 })).toBe("");
    expect(refundLine({ status: "assigned", refundStatus: "pending_ops", refundOwedRappen: 300 })).toBe("");
  });

  it("a cancelled trip keeps the approved cancel line", () => {
    expect(refundLine({ status: "cancelled", refundStatus: "pending_ops", refundOwedRappen: 300 })).toBe("Full refund · sent by our team");
    expect(refundLine({ status: "cancelled", refundStatus: "pending_ops", refundOwedRappen: 0 })).toBe("Refund under review");
    expect(refundLine({ status: "cancelled", refundStatus: "refunded" })).toBe("Refunded");
  });
});

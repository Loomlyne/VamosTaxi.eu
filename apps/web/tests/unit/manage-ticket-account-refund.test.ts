// 20-10 B4: the ticket built from an account booking carries refundStatus and refundOwedRappen
// (app/vamos-manage-ticket.js loadAccount copies them from /api/account/bookings/details).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../../../../app/vamos-manage-ticket.js"), "utf8");

describe("vamos-manage-ticket.js account path (20-10 B4)", () => {
  it("loadAccount copies refundStatus and refundOwedRappen from the details answer", () => {
    const load = src.slice(src.indexOf("function loadAccount"), src.indexOf("function cancelGuest"));
    expect(load).toMatch(/booking\.refundStatus\s*=\s*d\.body\.refundStatus/);
    expect(load).toMatch(/booking\.refundOwedRappen\s*=\s*Number\(d\.body\.refundOwedRappen\)/);
  });

  it("fromAccount starts with owed 0 (the details answer fills the real value)", () => {
    const from = src.slice(src.indexOf("function fromAccount"), src.indexOf("function loadAccount"));
    expect(from).toMatch(/refundOwedRappen:\s*0/);
  });
});

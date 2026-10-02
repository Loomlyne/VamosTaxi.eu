// apps/web/lib/ops/edit-request-map.test.ts
//
// 261002 settle safety (migration 20261007200000): a second Accept on a customer request, after the
// amount to pay moved, is refused by the database with `price-changed` and nothing is written. The
// route must hand that name back, as a conflict the owner can act on (refuse the request).

import { describe, expect, it } from "vitest";
import { failStatus, mapEditSqlError } from "./edit-request-map";

describe("price-changed (second Accept, the difference moved)", () => {
  it("maps by name, whatever the message layout", () => {
    const refused = { ok: false, code: "price-changed" };
    expect(mapEditSqlError({ message: "price-changed" })).toEqual(refused);
    expect(mapEditSqlError({ message: "price-changed\nCONTEXT: PL/pgSQL function" })).toEqual(refused);
    expect(mapEditSqlError({ message: "price-changed ", code: "P0001" })).toEqual(refused);
  });

  it("is a conflict (409), not a bad request", () => {
    expect(failStatus("price-changed")).toBe(409);
  });

  it("a name that only starts like it is not it; the neighbours keep their names and statuses", () => {
    expect(mapEditSqlError({ message: "price-changed-x" })).toEqual({ ok: false, code: "unknown" });
    expect(mapEditSqlError({ message: "staff-change-waiting" })).toEqual({ ok: false, code: "staff-change-waiting" });
    expect(failStatus("staff-change-waiting")).toBe(409);
    expect(failStatus("already-paid")).toBe(409);
    expect(failStatus("customer-time-only")).toBe(400);
  });
});

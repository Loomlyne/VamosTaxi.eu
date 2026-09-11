import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "..", "..");

function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("ops write contract", () => {
  const store = readRepo("app/vamos-ops-data.js");
  const table = readRepo("app/ops/OpsTable.dc.html");
  const api = readRepo("app/vamos-ops-api.js");

  it("does not mint fake customer/coupon/pricing ids", () => {
    expect(store).not.toMatch(/id\("cu"\)/);
    expect(store).not.toMatch(/id\("cp"\)/);
    expect(store).not.toMatch(/id\("FR"\)/);
    expect(store).not.toMatch(/id\("S"\)/);
    expect(store).not.toMatch(/id\("B"\)/);
    expect(store).not.toMatch(/id\("RP"\)/);
    expect(store).toMatch(/function isMintedId/);
    expect(store).toMatch(/function isNumericId/);
    expect(store).toMatch(/function isWriteId/);
  });

  it("POSTs empty or minted ids and PATCHes UUID or numeric ids", () => {
    expect(store).toMatch(/var row = persistable\(clean\(rec \|\| \{\}\)\)/);
    expect(store).toMatch(/api\("POST", base, row\)/);
    expect(store).toMatch(/if \(!writeId\) return this\.add\(row\)/);
    expect(store).toMatch(/api\("PATCH", base \+ "\/" \+ encodeURIComponent\(writeId\)/);
    expect(store).toMatch(/api\("DELETE", base \+ "\/" \+ encodeURIComponent\(writeId\)/);
  });

  it("writes bookings by bookingId, not the VT- display ref", () => {
    expect(store).toMatch(/var bid = row && row\.bookingId/);
    expect(store).toMatch(/findRow\(\(patch && patch\.bookingId\) \|\| ""\)/);
  });

  it("PATCHes settings and profile singletons", () => {
    expect(store).toMatch(/api\("PATCH", writePath, patch\)/);
    expect(store).toMatch(/name === "profile" \? "\/api\/staff\/profile" : path/);
    expect(store).not.toMatch(/api\("PUT", path/);
  });

  it("waits for hydrate before update/remove", () => {
    expect(store).toMatch(/readyPromise/);
    expect(store).toMatch(/return hydrate\(\)\.then\(function \(\) \{/);
  });

  it("maps Next 405 to method-not-allowed", () => {
    expect(api).toMatch(/method-not-allowed/);
    expect(api).toMatch(/res\.status === 405/);
  });

  it("OpsTable waits on the store promise and stays open on failure", () => {
    expect(table).toMatch(/finishWrite/);
    expect(table).toMatch(/run\.then\(this\.finishWrite/);
    expect(table).toMatch(/if \(!json \|\| json\.ok !== true\)/);
    expect(table).toMatch(/data-vt-save-err/);
    expect(table).toMatch(/This row has no database id/);
    expect(table).toMatch(/The live rate book is locked/);
    expect(table).toMatch(/function maskLicence/);
    expect(table).toMatch(/data-vt-table-scroll/);
    expect(table).toMatch(/data-vt-editor-foot/);
    expect(table).not.toMatch(/if \(this\.props\.onSave\) this\.props\.onSave\(d\);\s*this\.closeEditor\(\);/);
  });

  it("ops screens return the store promise from save/delete", () => {
    const board = readRepo("app/ops/OpsBoard.dc.html");
    const coupons = readRepo("app/ops/OpsCoupons.dc.html");
    const customers = readRepo("app/ops/OpsCustomers.dc.html");
    const pricing = readRepo("app/ops/OpsPricing.dc.html");
    const calendar = readRepo("app/ops/OpsCalendar.dc.html");
    expect(board).toMatch(/editorSave: \(rec\) => ops \? ops\.bookings\.upsert\(rec\) : null/);
    expect(coupons).toMatch(/onSave: \(rec\) => ops \? ops\.coupons\.upsert\(rec\) : null/);
    expect(customers).toMatch(/return ops\.customers\.upsert\(row\)/);
    expect(pricing).toMatch(/return ops\.routes\.upsert\(patch\)/);
    expect(calendar).toMatch(/onSave: \(rec\) => ops \? ops\.bookings\.upsert\(rec\) : null/);
  });

  it("rate-book writes fork a live book instead of freezing", () => {
    const src = readRepo("apps/web/lib/ops/rate-book.ts");
    const route = readRepo("apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts");
    expect(src).toMatch(/export async function forkLiveRateVersion/);
    expect(route).toMatch(/resolveWritableVersionId/);
    expect(route).toMatch(/forkLiveRateVersion/);
  });
});

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

  it("POSTs coupon UUID drafts; only numeric coupon ids PATCH", () => {
    expect(store).toMatch(/if \(name === "coupons"\)/);
    expect(store).toMatch(/A client UUID is a draft key/);
    expect(store).toMatch(/if \(name === "coupons" && row\.id && !isNumericId\(row\.id\)\) dropId = true/);
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
    expect(table).toMatch(/json\.message \|\| json\.error \|\| json\.detail/);
    expect(table).toMatch(/Licence number is required/);
    expect(table).toMatch(/That vehicle is missing/);
    expect(table).toMatch(/That save could not link this row/);
    expect(table).toMatch(/data-fill="\{\{ tableFill \}\}"/);
    expect(table).toMatch(/minDate === 'today'/);
    expect(table).toMatch(/zurichYmdNow/);
    expect(table).toMatch(/kind === 'address' && \(key === 'from' \|\| key === 'to'\)/);
    // Fill keeps bool columns at max-content and still spans the panel (5a4b0eb).
    expect(table).toMatch(/\[data-fill="1"\] \.vt-table\{width:max-content;min-width:100%;table-layout:auto\}/);
    expect(table).toMatch(/whiteSpace:'nowrap'/);
    expect(table).toMatch(/Math\.round\(this\.state\.sug\.rect\.width\)/);
    expect(table).toMatch(/text-align:start/);
    expect(table).toMatch(/fk-missing/);
    expect(table).not.toMatch(/Check name, licence, and photo/);
    expect(table).toMatch(/function maskLicence/);
    expect(table).toMatch(/data-vt-table-scroll="1" data-fill="\{\{ tableFill \}\}" data-scroll-native="1" data-lenis-prevent="1"/);
    expect(table).toMatch(/inset-inline-end:0/);
    expect(table).toMatch(/f\.key === 'from' \|\| f\.key === 'to'/);
    expect(table).toMatch(/mapbox_id: hit\.mapbox_id/);
    expect(table).toMatch(/data-vt-editor-foot/);
    expect(table).toMatch(/\[data-vt-editor-foot\]\{[^}]*padding:18px 24px var\(--vt-space-6\)/);
    expect(table).not.toMatch(/editor === 'iconGrid'/);
    expect(table).toMatch(/editor === 'amountKind'/);
    expect(table).not.toMatch(/data-vt-iconpick/);
    expect(table).not.toMatch(/data-vt-icongrid/);
    expect(table).toMatch(/data-vt-amountkind/);
    expect(store).toMatch(/name === "customers" && a\.email && b\.email/);
    expect(store).toMatch(/name !== "chauffeurs"/);
    expect(store).toMatch(/if \(!findRow\(writeId\)\) return self\.add\(row\)/);
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
    expect(customers).toMatch(/return ops\.customers\.upsert\(patch\)/);
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

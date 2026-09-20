// apps/web/lib/ops/customers-board.test.ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "../..");

function readWeb(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

function readRepo(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

describe("ops customers board", () => {
  it("does not min(uuid) when grouping booking emails", () => {
    const src = readWeb("lib/ops/customers.ts");
    expect(src).toMatch(/array_agg\(b\.id order by b\.created_at desc\)/);
    expect(src).not.toMatch(/min\(b\.id\)/);
    expect(src).toMatch(/export async function eraseCustomer/);
  });

  it("saves a customer via PATCH /api/staff/customers/:id", () => {
    const detail = readWeb("app/[locale]/(ops)/api/staff/customers/[id]/route.ts");
    const pub = readWeb("app/api/staff/customers/[id]/route.ts");
    const src = readWeb("lib/ops/customers.ts");
    expect(src).toMatch(/export async function upsertCustomer/);
    expect(src).toMatch(/phone: asTrimmed\(rec\.phone\)/);
    expect(src).not.toMatch(/company: asTrimmed\(rec\.company\)/);
    expect(src).not.toMatch(/type = excluded\.type/);
    expect(src).not.toMatch(/company_name = \$\{input\.company\}/);
    expect(src).toMatch(/on conflict \(email\) where erased_at is null do update set/);
    expect(detail).toMatch(/upsertCustomer/);
    expect(detail).toMatch(/export async function PATCH/);
    expect(pub).toMatch(/export\s*\{\s*GET,\s*PATCH,\s*DELETE\s*\}/);
  });

  it("deletes a customer via DELETE /api/staff/customers/:id", () => {
    const detail = readWeb("app/[locale]/(ops)/api/staff/customers/[id]/route.ts");
    const pub = readWeb("app/api/staff/customers/[id]/route.ts");
    expect(detail).toMatch(/eraseCustomer/);
    expect(detail).toMatch(/export async function DELETE/);
    expect(pub).toMatch(/export\s*\{\s*GET,\s*PATCH,\s*DELETE\s*\}/);
  });

  it("cancels a booking via PATCH and tombstones via DELETE", () => {
    const item = readWeb("app/[locale]/(ops)/api/staff/bookings/[id]/route.ts");
    const write = readWeb("lib/ops/bookings-write.ts");
    expect(item).toMatch(/cancelBooking/);
    expect(item).toMatch(/eraseBooking/);
    expect(write).toMatch(/ops_cancel_booking/);
    expect(write).toMatch(/resolveStaffBookingId/);
    expect(write).toMatch(/erased_at = now\(\)/);
  });

  it("OpsCustomers wires save, history under Notes, and remove", () => {
    const html = readRepo("app/ops/OpsCustomers.dc.html");
    expect(html).toBe(readWeb("public/app/ops/OpsCustomers.dc.html"));
    expect(html).toMatch(/customers\.remove/);
    expect(html).toMatch(/customers\.update/);
    expect(html).toMatch(/historyRows/);
    expect(html).toMatch(/history-label/);
    expect(html).toMatch(/\/bookings\/' \+ encodeURIComponent\(b\.id\)/);
    expect(html).not.toMatch(/Traveller/);
  });

  it("customer editor keeps identity fields and drops type, trips, note, company", () => {
    const html = readRepo("app/ops/OpsCustomers.dc.html");
    expect(html).toMatch(/key:'name', label:t\.fName/);
    expect(html).toMatch(/key:'email', label:t\.fEmail/);
    expect(html).toMatch(/key:'phone', label:t\.fPhone/);
    expect(html).toMatch(/key:'since', label:t\.fSince, half:true, icon:'calendar', readonly:true/);
    expect(html).not.toMatch(/key:'type', label:t\.fType/);
    expect(html).not.toMatch(/key:'trips', label:t\.fTrips/);
    expect(html).not.toMatch(/key:'note', label:t\.fNote/);
    expect(html).not.toMatch(/key:'company', label:t\.fCompany/);
    expect(html).not.toMatch(/hNote:'Anything a dispatcher should know before the call\.'/);
    expect(html).toMatch(/const patch = \{ id: row\.id, name: row\.name, email: row\.email, phone: row\.phone \}/);
  });

  it("OpsDetail Cancel recaps then PATCHes cancelled; History tab is gone", () => {
    const html = readRepo("app/ops/OpsDetail.dc.html");
    expect(html).toBe(readWeb("public/app/ops/OpsDetail.dc.html"));
    expect(html).toMatch(/openCancel/);
    expect(html).toMatch(/status: 'cancelled'/);
    expect(html).toMatch(/saveEdit/);
    const save = html.slice(html.indexOf("saveEdit: () =>"), html.indexOf("markRefund: ()"));
    expect(save).toMatch(/'PATCH'/);
    expect(save).toMatch(/\/api\/staff\/bookings\/' \+ encodeURIComponent\(id\)/);
    expect(save).not.toMatch(/edit-accept/);
    expect(html).not.toMatch(/vamosOpsEdit/);
    expect(html).not.toMatch(/tabItems: \[t\.details, t\.history\]/);
  });

  it("OpsPricing edits the live rate book, not a draft publish chrome", () => {
    const html = readRepo("app/ops/OpsPricing.dc.html");
    expect(html).toBe(readWeb("public/app/ops/OpsPricing.dc.html"));
    expect(html).toMatch(/ops\.rates/);
    expect(html).not.toMatch(/data-price-head-publish/);
    expect(html).not.toMatch(/data-pricing-publish/);
    expect(html).not.toMatch(/tCurrencyLabel/);
    expect(html).not.toMatch(/cu\.pick/);
  });
});

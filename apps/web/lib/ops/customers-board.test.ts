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

  it("deletes a customer via DELETE /api/staff/customers/:id", () => {
    const detail = readWeb("app/[locale]/(ops)/api/staff/customers/[id]/route.ts");
    const pub = readWeb("app/api/staff/customers/[id]/route.ts");
    expect(detail).toMatch(/eraseCustomer/);
    expect(detail).toMatch(/export async function DELETE/);
    expect(pub).toMatch(/export\s*\{\s*GET,\s*DELETE\s*\}/);
  });

  it("cancels a booking via PATCH and tombstones via DELETE", () => {
    const item = readWeb("app/[locale]/(ops)/api/staff/bookings/[id]/route.ts");
    const write = readWeb("lib/ops/bookings-write.ts");
    expect(item).toMatch(/cancelBooking/);
    expect(item).toMatch(/eraseBooking/);
    expect(write).toMatch(/status = 'cancelled'/);
    expect(write).toMatch(/erased_at = now\(\)/);
  });

  it("OpsCustomers wires remove and drops History", () => {
    const html = readRepo("app/ops/OpsCustomers.dc.html");
    expect(html).toBe(readWeb("public/app/ops/OpsCustomers.dc.html"));
    expect(html).toMatch(/customers\.remove/);
    expect(html).not.toMatch(/history-label/);
    expect(html).not.toMatch(/Traveller/);
  });

  it("OpsDetail Cancel recaps then PATCHes cancelled; History tab is gone", () => {
    const html = readRepo("app/ops/OpsDetail.dc.html");
    expect(html).toBe(readWeb("public/app/ops/OpsDetail.dc.html"));
    expect(html).toMatch(/openCancel/);
    expect(html).toMatch(/bookings\.update/);
    expect(html).toMatch(/status: 'cancelled'/);
    expect(html).not.toMatch(/tabItems: \[t\.details, t\.history\]/);
  });
});

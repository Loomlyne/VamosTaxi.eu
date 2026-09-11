// apps/web/lib/lifecycle/no-show-sweep.test.ts
//
// 09-01 Wave 0 / LIFE-07: hourly expireUnpaidBookings stays; no auto no-show
// sweep (D-31). This file must be green now. Do not change worker.ts.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");

function read(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

describe("LIFE-07 no auto no-show sweep (D-31)", () => {
  it("worker.ts scheduled hourly calls expireUnpaidBookings", () => {
    const worker = read("worker.ts");
    const expire = read("lib/checkout/expire-unpaid.ts");
    expect(worker).toContain("expireUnpaidBookings");
    expect(expire).toContain("expireUnpaidBookings");
    expect(expire).toContain("checkout_expire_unpaid");
  });

  it("worker.ts has no noShow / no_show_sweep / sweepNoShow", () => {
    const worker = read("worker.ts");
    expect(worker).not.toMatch(/noShow/);
    expect(worker).not.toMatch(/no_show_sweep/);
    expect(worker).not.toMatch(/sweepNoShow/);
  });

  it("wrangler crons stay 0 * * * * and 0 3 * * *", () => {
    const wrangler = read("wrangler.jsonc");
    expect(wrangler).toContain('"0 * * * *"');
    expect(wrangler).toContain('"0 3 * * *"');
    expect(wrangler).toMatch(/"crons":\s*\[\s*"0 \* \* \* \*"\s*,\s*"0 3 \* \* \*"\s*\]/);
    expect(wrangler).not.toMatch(/noShow/);
    expect(wrangler).not.toMatch(/no_show_sweep/);
    expect(wrangler).not.toMatch(/sweepNoShow/);
  });
});

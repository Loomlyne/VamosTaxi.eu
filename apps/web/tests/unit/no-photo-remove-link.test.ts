import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Quick 260930-cpr (owner, 2026-09-30): every dashboard photo is replaced by choosing another one;
// no dashboard screen offers a way to leave a class, vehicle, chauffeur or staff member without a photo.
const APP = join(__dirname, "../../../../app/ops");
const read = (f: string) => readFileSync(join(APP, f), "utf8");

describe("dashboard photos have no Remove control", () => {
  it("the shared photo editor has no Remove link and no way to empty the field", () => {
    const s = read("OpsTable.dc.html");
    expect(s).not.toMatch(/clearPhoto|clearShow|clearLabel/);
  });
  it("the staff photo has no remove button", () => {
    const s = read("OpsProfile.dc.html");
    expect(s).not.toMatch(/clearPhoto|photoClearShow|removePhoto/);
  });
  it("no screen still carries a Remove-photo string", () => {
    for (const f of ["OpsPricing.dc.html", "OpsFleet.dc.html", "OpsReviews.dc.html"]) {
      expect(read(f), f).not.toMatch(/clearPhoto|removePhoto/);
    }
  });
});

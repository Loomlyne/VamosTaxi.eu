// apps/web/lib/ops/rate-book-jsonb-writers.test.ts
//
// 26.2 audit, "JSON double encoding" in the rate-book writers and the rate-versions Publish.
// (rate_version_rules and its payload writers were removed 2026-10-13, decision items 10, 13.)
// Through the Worker's client (`fetch_types: false`, prepared statements) a parameter Postgres
// describes as jsonb is serialised by the driver, so `${JSON.stringify(x)}::jsonb` stores a JSON
// STRING (proved on a real database in lib/checkout/stripe-event-record.local.test.ts). On the
// Publish path that string also breaks `settings_versions_service_area_geojson_object`
// (jsonb_typeof = 'object') with 23514 as soon as a draft carries a service-area polygon.
// Every jsonb value these two routes write goes through the driver's JSON helper instead.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const staff = join(here, "../../app/[locale]/(ops)/api/staff");

/** Source without whole-line comments, so the explanation of the old form does not count. */
const code = (rel: string) =>
  readFileSync(join(staff, rel), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");

describe("price-book routes bind jsonb through the driver's JSON helper", () => {
  it("rate-book: no stringified JSON is written; the extra rule goes through tx.json", () => {
    const src = code("rate-book/route.ts");
    expect(src).not.toMatch(/JSON\.stringify\(/);
    expect(src).not.toMatch(/\}::jsonb/);
    expect(src).toMatch(/const rule = tx\.json\(MANUAL_PREDICATE\)/);
  });

  it("publish: the service-area polygon is an object through tx.json, and a missing one stays SQL NULL", () => {
    const src = code("rate-versions/[id]/publish/route.ts");
    expect(src).not.toMatch(/JSON\.stringify\(/);
    expect(src).toMatch(
      /serviceArea == null \? null : tx\.json\(serviceArea as Parameters<typeof tx\.json>\[0\]\)/,
    );
    // `${null}::jsonb` is SQL NULL, so the coalesce keeps the current settings polygon.
    expect(src).toMatch(/coalesce\(\$\{serviceAreaJson\}::jsonb, sv\.service_area_geojson\)/);
  });
});

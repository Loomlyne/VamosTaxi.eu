// apps/web/lib/lifecycle/review-submit.test.ts
//
// 09-01 Wave 0: customer review POST inserts public.reviews with booking_id.
// GET /api/reviews stays published-only. Submit route red until 09-12.
// No TRIP. No LX1234.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

describe("GET /api/reviews published-only", () => {
  it("public GET stays published-only", () => {
    const route = read("apps/web/app/api/reviews/route.ts");
    const loader = read("apps/web/lib/public/reviews.ts");
    expect(route).toMatch(/loadPublishedReviews/);
    expect(route).toMatch(/export async function GET/);
    expect(loader).toMatch(/where r\.published = true/);
    expect(loader).not.toMatch(/published = false/);
    expect(route).not.toMatch(/submit_review/);
  });
});

describe("customer review POST", () => {
  it("POST inserts public.reviews with booking_id", () => {
    const src = read("apps/web/app/api/reviews/submit/route.ts");
    expect(src).toMatch(/submit_review/);
    expect(src).toMatch(/booking_id/);
    expect(src).toMatch(/POST/);
    expect(src).not.toMatch(/\bTRIP\b/);
    expect(src).not.toMatch(/LX1234/);
  });
});

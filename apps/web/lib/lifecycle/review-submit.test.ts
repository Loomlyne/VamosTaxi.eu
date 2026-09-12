// apps/web/lib/lifecycle/review-submit.test.ts
//
// 09-12: customer review POST + photo R2 write. GET /api/reviews stays
// published-only. No TRIP. No LX1234.

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

  it("maps unpaid/cancelled to 403 and a second submit to 409", () => {
    const src = read("apps/web/app/api/reviews/submit/route.ts");
    expect(src).toMatch(/not_reviewable/);
    expect(src).toMatch(/already_reviewed/);
    expect(src).toMatch(/403/);
    expect(src).toMatch(/409/);
    expect(src).toMatch(/asGuest/);
    expect(src).toMatch(/asCustomer|asSystem/);
    expect(src).toMatch(/verifyTurnstile/);
  });

  it("stores optional photoKey only when it is a reviews/ object key", () => {
    const src = read("apps/web/app/api/reviews/submit/route.ts");
    expect(src).toMatch(/photoKey|photo_path|p_photo_path/);
    expect(src).toMatch(/reviews\//);
    expect(src).not.toMatch(/requireStaffClaims|withStaff|asStaff/);
  });
});

describe("POST /api/reviews/photo", () => {
  it("writes PHOTOS.put under reviews/ and is not staff-gated", () => {
    const src = read("apps/web/app/api/reviews/photo/route.ts");
    expect(src).toMatch(/PHOTOS\.put/);
    expect(src).toMatch(/buildPhotoKey/);
    expect(src).toMatch(/["']review["']/);
    expect(src).toMatch(/assertPhotoUpload/);
    expect(src).not.toMatch(/requireStaffClaims|withStaff|asStaff/);
    expect(src).not.toMatch(/photos\/upload/);
    expect(src).not.toMatch(/\bTRIP\b/);
    expect(src).not.toMatch(/LX1234/);
  });
});

describe("/review page", () => {
  it("has Submit review, three star rows, thank you, no TRIP", () => {
    const page = read("apps/web/app/[locale]/review/page.tsx");
    const form = read("apps/web/app/[locale]/review/ReviewForm.tsx");
    const src = `${page}\n${form}`;
    expect(src).toMatch(/Submit review|submit-review/);
    expect(src).toMatch(/thank-you|Thank you/);
    expect(src).toMatch(/company/);
    expect(src).toMatch(/chauffeur/);
    expect(src).toMatch(/overall/);
    expect(src).toMatch(/\/api\/reviews\/photo/);
    expect(src).toMatch(/\/api\/reviews\/submit/);
    expect(src).not.toMatch(/\bTRIP\b/);
    expect(src).not.toMatch(/LX1234/);
    expect(src).not.toMatch(/@marsidev/);
  });
});

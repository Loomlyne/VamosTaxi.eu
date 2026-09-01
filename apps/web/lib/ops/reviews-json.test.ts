// apps/web/lib/ops/reviews-json.test.ts
//
// Staff reviews JSON door: dual mount, move/publish, empty remote store, photo.
// Database-free. No Hyperdrive. File reads only — do not import staff-json
// (that pulls @supabase/ssr, which is not in the worktree).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "../..");

describe("reviews JSON dual mount + mock", () => {
  it("re-exports GET/POST and PATCH/DELETE", () => {
    const list = readFileSync(join(webRoot, "app/api/staff/reviews/route.ts"), "utf8");
    expect(list).toMatch(/export\s*\{\s*GET\s*,\s*POST\s*\}/);
    const one = readFileSync(join(webRoot, "app/api/staff/reviews/[id]/route.ts"), "utf8");
    expect(one).toMatch(/export\s*\{\s*PATCH\s*,\s*DELETE\s*\}/);
  });

  it("PATCH calls moveReview and setReviewPublished", () => {
    const route = readFileSync(
      join(webRoot, "app/[locale]/(ops)/api/staff/reviews/[id]/route.ts"),
      "utf8",
    );
    expect(route).toMatch(/moveReview/);
    expect(route).toMatch(/setReviewPublished/);
    expect(route).toMatch(/withStaff/);
  });

  it("collection GET/POST uses withStaff", () => {
    const route = readFileSync(
      join(webRoot, "app/[locale]/(ops)/api/staff/reviews/route.ts"),
      "utf8",
    );
    expect(route).toMatch(/withStaff/);
    expect(route).toMatch(/createReview/);
  });

  it("vamos-reviews.js has no localStorage and no fake quote SEED", () => {
    const store = readFileSync(join(repoRoot, "app/vamos-reviews.js"), "utf8");
    expect(store).not.toMatch(/localStorage/);
    expect(store).not.toMatch(/\bSEED\b/);
    expect(store).toMatch(/\/api\/staff\/reviews/);
  });

  it("OpsReviews file control POSTs /api/photos/upload kind=review", () => {
    const html = readFileSync(join(repoRoot, "app/ops/OpsReviews.dc.html"), "utf8");
    expect(html).toMatch(/type="file"/);
    expect(html).toMatch(/\/api\/photos\/upload/);
    expect(html).toMatch(/credentials:\s*['"]include['"]/);
    expect(html).toMatch(/kind['"]?,\s*['"]review['"]/);
    expect(html).not.toMatch(/readAsDataURL/);
    expect(html).toMatch(/isEmpty/);
    expect(html).toMatch(/\/api\/staff\/reviews/);
  });
});

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

  it("rating 0, custom dropoff, and vehicle class UUID persist on PATCH", () => {
    const actions = readFileSync(
      join(webRoot, "app/[locale]/(ops)/ops/reviews/actions.ts"),
      "utf8",
    );
    expect(actions).toMatch(/resolveVehicleClassId/);
    expect(actions).toMatch(/rating = \$\{parsed\.rating\}/);
    expect(actions).toMatch(/vehicle_class_id = \$\{vehicleClassId\}/);
    expect(actions).toMatch(/route_label = \$\{parsed\.routeLabel\}/);
    const reviews = readFileSync(join(webRoot, "lib/ops/reviews.ts"), "utf8");
    expect(reviews).toMatch(/input\.authorRole !== row\.authorRole/);
    expect(reviews).not.toMatch(/input\.rating !== row\.rating/);
    expect(reviews).toMatch(/export async function resolveVehicleClassId/);
    const store = readFileSync(join(repoRoot, "app/vamos-reviews.js"), "utf8");
    expect(store).toMatch(/function classIdFromRow/);
    expect(store).toMatch(/vehicleClassId: classIdFromRow\(r\)/);
    const html = readFileSync(join(repoRoot, "app/ops/OpsReviews.dc.html"), "utf8");
    expect(html).toMatch(/onInput="\{\{ lf\.onChange \}\}"/);
    expect(html).toMatch(/makeLocField\('dropoff'/);
    expect(html).toMatch(/cur && cur\.rating === n \? 0 : n/);
    expect(html).toMatch(/vehicleClassId: slug \? classIdOf\(v\) : null/);
    const collection = readFileSync(
      join(webRoot, "app/[locale]/(ops)/api/staff/reviews/route.ts"),
      "utf8",
    );
    expect(collection).toMatch(/vehicleClassSlug/);
    expect(collection).toMatch(/body\.vehicleClass/);
  });

  it("staff name/body patches persist on imported rows, including empty body", () => {
    const actions = readFileSync(
      join(webRoot, "app/[locale]/(ops)/ops/reviews/actions.ts"),
      "utf8",
    );
    expect(actions).toMatch(/lockedContentTouched/);
    expect(actions).not.toMatch(/\bcontentTouched\b/);
    expect(actions).toMatch(/author_name = \$\{parsed\.authorName\}/);
    expect(actions).toMatch(/body = \$\{parsed\.body\}/);
    const store = readFileSync(join(repoRoot, "app/vamos-reviews.js"), "utf8");
    expect(store).toMatch(/r\.body != null/);
    expect(store).toMatch(/r\.text != null \? String\(r\.text\)/);
    expect(store).toMatch(/list = nextList/);
    const html = readFileSync(join(repoRoot, "app/ops/OpsReviews.dc.html"), "utf8");
    expect(html).toMatch(/setName: \(e\) => this\.patch\(\{ name: e\.target\.value \}\)/);
    expect(html).toMatch(/setText: \(e\) => this\.patch\(\{ text: e\.target\.value \}\)/);
  });

  it("public review card shows a borderless original-review icon after the stars", () => {
    const html = readFileSync(join(repoRoot, "app/home/Reviews.dc.html"), "utf8");
    expect(html).toMatch(/data-rv-who/);
    expect(html).toMatch(/data-rv-link/);
    expect(html).toMatch(/name="external-link"/);
    expect(html).toMatch(/\[data-rv-link\]\{[^}]*display:inline-flex/);
    expect(html).toMatch(/\[data-rv-link\]\{[^}]*border:0/);
    expect(html).not.toMatch(/\[data-rv-link\]\{[^}]*border:1px solid/);
    expect(html).toMatch(/aria-label="\{\{ r\.linkLabel \}\}"/);
    expect(html).toMatch(/rel="noopener noreferrer"/);
    expect(html).not.toMatch(/<a data-rv-link[^>]*>\{\{ r\.linkLabel \}\}/);
    expect(html).toMatch(
      /<div data-rv-who="1"[^>]*>\s*<strong data-rv-name="1">\{\{ r\.name \}\}<\/strong>/,
    );
    expect(html).toMatch(
      /data-rv-stars[\s\S]*?<\/span>\s*<a data-rv-link="1"/,
    );
  });

  it("OpsReviews has no photo upload, no grip drag, and no View on site", () => {
    const html = readFileSync(join(repoRoot, "app/ops/OpsReviews.dc.html"), "utf8");
    expect(html).not.toMatch(/type="file"/);
    expect(html).not.toMatch(/\/api\/photos\/upload/);
    expect(html).not.toMatch(/grip-vertical/);
    expect(html).not.toMatch(/draggable="true"/);
    expect(html).not.toMatch(/tViewOnSite|View on site/);
    expect(html).toMatch(/chevron-up/);
    expect(html).toMatch(/chevron-down/);
    expect(html).not.toMatch(/tVerifiedHint/);
    expect(html).not.toMatch(/tPublishedHint/);
    expect(html).not.toMatch(/data-av=/);
    expect(html).toMatch(/logo: s\.logo/);
    expect(html).toMatch(/parseSourceUrl/);
    expect(html).toMatch(/togglePublish/);
    expect(html).toMatch(/data-danger/);
    expect(html).toMatch(/--vt-danger/);
    expect(html).toMatch(/isEmpty/);
    expect(html).toMatch(/\/api\/staff\/reviews/);
  });
});

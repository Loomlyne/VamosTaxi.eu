// apps/web/lib/ops/reviews-patch-merge.test.ts
//
// 26.2-07: PATCH /api/staff/reviews/:id with a partial body must keep every field
// the body does not name. Database-free: the route's collaborators are mocked.

import { beforeEach, describe, expect, it, vi } from "vitest";

const updateReview = vi.fn(async () => ({ ok: true as const }));

const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  externalRef: "ext-1",
  source: "google",
  authorName: "Ana Keller",
  authorRole: "Business traveller",
  body: "Driver was on time.",
  rating: 4,
  routeLabel: "ZRH to Zurich",
  vehicleClassId: "22222222-2222-4222-8222-222222222222",
  avatarPath: "reviews/ana.jpg",
  sourceUrl: "https://example.test/r/1",
  verified: true,
  published: false,
  sortOrder: 30,
};

vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: {} }) }));
vi.mock("@/lib/ops/staff-json", () => ({
  jsonErr: (code: string, status: number) => Response.json({ ok: false, code }, { status }),
  jsonOk: (data: unknown, status = 200) => Response.json({ ok: true, data }, { status }),
  withStaff: (handler: (claims: object, request: Request) => Promise<Response>) => (request: Request) =>
    handler({ sub: "staff-1" }, request),
}));
vi.mock("@/lib/ops/reviews", () => ({ loadReviews: async () => [ROW] }));
vi.mock("@/app/[locale]/(ops)/ops/reviews/actions", () => ({
  createReview: vi.fn(),
  deleteReview: vi.fn(),
  moveReview: vi.fn(),
  setReviewPublished: vi.fn(),
  updateReview: (...args: unknown[]) => (updateReview as unknown as (...a: unknown[]) => unknown)(...args),
}));

async function patch(body: unknown): Promise<Response> {
  const { PATCH } = await import("../../app/[locale]/(ops)/api/staff/reviews/[id]/route");
  return PATCH(
    new Request("https://dashboard.test/api/staff/reviews/x", { method: "PATCH", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: ROW.id }) },
  );
}

describe("staff review PATCH merges onto the stored row", () => {
  beforeEach(() => updateReview.mockClear());

  it("a rating-only body keeps name, text, flags, source and order", async () => {
    await patch({ rating: 5 });
    expect(updateReview).toHaveBeenCalledTimes(1);
    const [, merged] = updateReview.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(merged).toMatchObject({
      authorName: ROW.authorName,
      authorRole: ROW.authorRole,
      body: ROW.body,
      rating: 5,
      routeLabel: ROW.routeLabel,
      source: ROW.source,
      verified: true,
      published: false,
      sortOrder: 30,
      sourceUrl: ROW.sourceUrl,
      avatarPath: ROW.avatarPath,
      vehicleClassId: ROW.vehicleClassId,
    });
  });

  it("an alias key (name, text) still overrides the stored value", async () => {
    await patch({ name: "Ana K.", text: "Great." });
    const [, merged] = updateReview.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(merged).toMatchObject({ authorName: "Ana K.", body: "Great.", rating: 4, published: false });
  });
});

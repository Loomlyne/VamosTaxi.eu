// GET /api/reviews is the one API answer shared for 5 minutes: same published rows for every
// visitor. Errors and every other method are never cached.

import { describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: {} }) }));
vi.mock("@/lib/public/reviews", () => ({ loadPublishedReviews: async () => [{ id: "r1" }] }));

describe("/api/reviews cache headers", () => {
  it("GET is public for 5 minutes", async () => {
    const { GET } = await import("@/app/api/reviews/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("vary") ?? "").not.toMatch(/cookie/i);
  });

  it("POST, PATCH and DELETE answer 405 and are never cached", async () => {
    const { POST, PATCH, DELETE } = await import("@/app/api/reviews/route");
    for (const f of [POST, PATCH, DELETE]) {
      const res = f();
      expect(res.status).toBe(405);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    }
  });
});

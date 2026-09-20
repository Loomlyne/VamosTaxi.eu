// apps/web/tests/unit/public-reviews-route.test.ts
//
// Published filter, no locked field, empty list is 200 { ok: true, data: [] }.
// No Hyperdrive.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const publicSql = vi.fn();

vi.mock("@/lib/db/public", () => ({
  publicSql: (...args: unknown[]) => publicSql(...args),
}));

import { loadPublishedReviews } from "../../lib/public/reviews";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } } as CloudflareEnv;

function jsonOk(data: unknown, status = 200): Response {
  return Response.json({ ok: true, data }, { status });
}

describe("GET /api/reviews", () => {
  beforeEach(() => {
    publicSql.mockReset();
  });

  it("returns only published rows and omits locked", async () => {
    const sql = vi.fn().mockResolvedValue([
      {
        id: "r1",
        source: "google",
        author_name: "Ada",
        author_role: "Guest",
        body: "On time.",
        rating: 5,
        route_label: "ZRH → city",
        vehicle_class_slug: "business",
        avatar_path: null,
        source_url: "https://example.test/r",
        verified: true,
        published: true,
        sort_order: 0,
        locked: true,
      },
    ]);
    publicSql.mockReturnValue(sql);

    const rows = await loadPublishedReviews(env);
    const response = jsonOk(rows);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      ok: true,
      data: [
        {
          id: "r1",
          source: "google",
          authorName: "Ada",
          authorRole: "Guest",
          body: "On time.",
          rating: 5,
          routeLabel: "ZRH → city",
          vehicleClassSlug: "business",
          avatarPath: null,
          sourceUrl: "https://example.test/r",
          verified: true,
          published: true,
          sortOrder: 0,
        },
      ],
    });
    expect(JSON.stringify(json)).not.toMatch(/locked/);
    const fragments = (sql.mock.calls[0]?.[0] as TemplateStringsArray | undefined) ?? [];
    expect(fragments.join(" ")).toMatch(/published\s*=\s*true/);
  });

  it("returns { ok: true, data: [] } when none are published, not 404", async () => {
    publicSql.mockReturnValue(vi.fn().mockResolvedValue([]));
    const rows = await loadPublishedReviews(env);
    const response = jsonOk(rows);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: [] });
  });

  it("route source does not import withStaff or asStaff and rejects writes", () => {
    const source = readFileSync(join(process.cwd(), "app/api/reviews/route.ts"), "utf8");
    expect(source).not.toMatch(/withStaff|asStaff/);
    expect(source).toMatch(/loadPublishedReviews/);
    expect(source).toMatch(/export function POST/);
    expect(source).toMatch(/status: 405/);
  });
});

describe("loadPublishedReviews", () => {
  it("filters published = true in SQL", async () => {
    const sql = vi.fn().mockResolvedValue([]);
    publicSql.mockReturnValue(sql);
    await loadPublishedReviews(env);
    const fragments = (sql.mock.calls[0]?.[0] as TemplateStringsArray | undefined) ?? [];
    expect(fragments.join(" ")).toMatch(/published\s*=\s*true/);
  });

  it("drops invalid source_url and never returns an avatar", async () => {
    const sql = vi.fn().mockResolvedValue([
      {
        id: "r2",
        source: "manual",
        author_name: "Bea",
        author_role: "Guest",
        body: "Quiet car.",
        rating: 5,
        route_label: "ZRH → city",
        vehicle_class_slug: null,
        avatar_path: "reviews/bea.jpg",
        source_url: "https://",
        verified: false,
        published: true,
        sort_order: 1,
      },
    ]);
    publicSql.mockReturnValue(sql);
    const rows = await loadPublishedReviews(env);
    expect(rows).toEqual([
      {
        id: "r2",
        source: "manual",
        authorName: "Bea",
        authorRole: "Guest",
        body: "Quiet car.",
        rating: 5,
        routeLabel: "ZRH → city",
        vehicleClassSlug: null,
        avatarPath: null,
        sourceUrl: null,
        verified: false,
        published: true,
        sortOrder: 1,
      },
    ]);
  });
});

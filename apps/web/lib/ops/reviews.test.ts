// apps/web/lib/ops/reviews.test.ts
//
// Dense reorder, locked-row gate, rating CHECK, and the empty-seed reader.
// No Hyperdrive, no Docker.

import { beforeEach, describe, expect, it, vi } from "vitest";

const asStaff = vi.fn();

vi.mock("../db/identity", () => ({
  asStaff: (...args: unknown[]) => asStaff(...args),
}));

import {
  assertNotLocked,
  assertReviewInput,
  loadReviews,
  parseReviewSourceUrl,
  planReorder,
  ReviewInputError,
  ReviewLockedError,
  type ReviewRow,
} from "./reviews";

const claims = {
  sub: "11111111-1111-4111-8111-111111111111",
  role: "authenticated" as const,
  aal: "aal2" as const,
  app_metadata: { vamos_role: "dispatcher" as const },
};

const env = {} as CloudflareEnv;

function row(partial: Partial<ReviewRow> & Pick<ReviewRow, "id">): ReviewRow {
  return {
    externalRef: null,
    source: "manual",
    authorName: "A",
    authorRole: "",
    body: "",
    rating: 5,
    routeLabel: "",
    vehicleClassId: null,
    vehicleClassSlug: null,
    avatarPath: null,
    sourceUrl: null,
    verified: false,
    published: true,
    sortOrder: 0,
    locked: false,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...partial,
  };
}

describe("planReorder", () => {
  it("returns a dense 0-based sequence with the target and its predecessor exchanged", () => {
    const rows = [
      row({ id: "a", sortOrder: 1 }),
      row({ id: "b", sortOrder: 2 }),
      row({ id: "c", sortOrder: 3 }),
    ];
    expect(planReorder(rows, "b", "up")).toEqual([
      { id: "b", sortOrder: 0 },
      { id: "a", sortOrder: 1 },
      { id: "c", sortOrder: 2 },
    ]);
  });

  it("still reorders when every row shares sort_order 0", () => {
    const rows = [
      row({ id: "a", sortOrder: 0 }),
      row({ id: "b", sortOrder: 0 }),
      row({ id: "c", sortOrder: 0 }),
    ];
    expect(planReorder(rows, "b", "up")).toEqual([
      { id: "b", sortOrder: 0 },
      { id: "a", sortOrder: 1 },
      { id: "c", sortOrder: 2 },
    ]);
  });

  it("returns an empty plan when the first row moves up", () => {
    const rows = [row({ id: "a" }), row({ id: "b" })];
    expect(planReorder(rows, "a", "up")).toEqual([]);
  });
});

describe("assertNotLocked", () => {
  it("throws for a google-sourced locked row", () => {
    expect(() => assertNotLocked({ locked: true })).toThrow(ReviewLockedError);
  });

  it("returns for a manual row", () => {
    expect(() => assertNotLocked({ locked: false })).not.toThrow();
  });
});

describe("assertReviewInput", () => {
  it("rejects a rating outside 0..5", () => {
    expect(() =>
      assertReviewInput({
        authorName: "A",
        authorRole: "",
        body: "",
        rating: 6,
        routeLabel: "",
        vehicleClassId: null,
        avatarPath: null,
        sourceUrl: null,
      }),
    ).toThrow(ReviewInputError);
  });

  it("accepts null vehicle_class_id, avatar_path and source_url", () => {
    const parsed = assertReviewInput({
      authorName: "A",
      authorRole: "role",
      body: "body",
      rating: 5,
      routeLabel: "",
      vehicleClassId: null,
      avatarPath: null,
      sourceUrl: null,
    });
    expect(parsed.vehicleClassId).toBeNull();
    expect(parsed.avatarPath).toBeNull();
    expect(parsed.sourceUrl).toBeNull();
    expect("locked" in parsed).toBe(false);
  });

  it("accepts an empty source URL and a full http(s) URL", () => {
    expect(parseReviewSourceUrl("")).toBeNull();
    expect(parseReviewSourceUrl("  ")).toBeNull();
    expect(parseReviewSourceUrl("https://maps.google.com/review")).toBe(
      "https://maps.google.com/review",
    );
    expect(parseReviewSourceUrl("http://example.test/r")).toBe("http://example.test/r");
  });

  it("rejects an invalid source URL fail-closed", () => {
    expect(() => parseReviewSourceUrl("https://")).toThrow(ReviewInputError);
    expect(() => parseReviewSourceUrl("javascript:alert(1)")).toThrow(ReviewInputError);
    expect(() => parseReviewSourceUrl("not-a-url")).toThrow(ReviewInputError);
    expect(() =>
      assertReviewInput({
        authorName: "A",
        authorRole: "",
        body: "",
        rating: 5,
        routeLabel: "",
        vehicleClassId: null,
        avatarPath: null,
        sourceUrl: "https://",
      }),
    ).toThrow(ReviewInputError);
  });
});

describe("loadReviews", () => {
  beforeEach(() => {
    asStaff.mockReset();
  });

  it("maps locked and verified as booleans and avatar_path as null", async () => {
    asStaff.mockImplementation(
      async (_env: unknown, _claims: unknown, fn: (sql: unknown) => Promise<unknown>) => {
        const sql = async () => [
          {
            id: "11111111-1111-4111-8111-111111111111",
            external_ref: "rv-1",
            source: "google",
            author_name: "First L.",
            author_role: "Airport transfer, Zurich",
            body: "One verbatim sentence",
            rating: 5,
            route_label: "ZRH → Zurich city",
            vehicle_class_id: null,
            vehicle_class_slug: null,
            avatar_path: null,
            source_url: null,
            verified: true,
            published: true,
            sort_order: 1,
            locked: true,
            created_at: "2026-08-01T00:00:00.000Z",
            updated_at: "2026-08-01T00:00:00.000Z",
          },
        ];
        return fn(sql);
      },
    );

    const rows = await loadReviews(env, claims);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.locked).toBe(true);
    expect(rows[0]?.verified).toBe(true);
    expect(rows[0]?.avatarPath).toBeNull();
  });
});

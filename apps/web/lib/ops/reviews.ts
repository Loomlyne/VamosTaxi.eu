// apps/web/lib/ops/reviews.ts
//
// Staff reader, dense reorder planner, and locked-row gate for public.reviews.
// This module exports no mutation.

import { asStaff, type VamosClaims } from "../db/identity";
import { mapSqlState } from "./sqlstate";

export { mapSqlState };

export type ReviewSource = "google" | "tripadvisor" | "trustpilot" | "manual";

export type ReviewRow = {
  id: string;
  externalRef: string | null;
  source: ReviewSource;
  authorName: string;
  authorRole: string;
  body: string;
  rating: number;
  routeLabel: string;
  vehicleClassId: string | null;
  vehicleClassSlug: string | null;
  avatarPath: string | null;
  sourceUrl: string | null;
  verified: boolean;
  published: boolean;
  sortOrder: number;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ReorderPlan = Array<{ id: string; sortOrder: number }>;

export type ReviewInput = {
  externalRef?: string | null;
  source?: ReviewSource;
  authorName: string;
  authorRole: string;
  body: string;
  rating: number;
  routeLabel: string;
  vehicleClassId: string | null;
  avatarPath: string | null;
  sourceUrl: string | null;
  verified?: boolean;
  published?: boolean;
  sortOrder?: number;
};

export type AssertedReviewInput = {
  externalRef: string | null;
  source: ReviewSource;
  authorName: string;
  authorRole: string;
  body: string;
  rating: number;
  routeLabel: string;
  vehicleClassId: string | null;
  avatarPath: string | null;
  sourceUrl: string | null;
  verified: boolean;
  published: boolean;
  sortOrder: number;
};

export class ReviewInputError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(key);
    this.name = "ReviewInputError";
    this.key = key;
  }
}

export class ReviewLockedError extends Error {
  readonly key: string;

  constructor() {
    super("reviews-locked");
    this.name = "ReviewLockedError";
    this.key = "reviews-locked";
  }
}

const SOURCES: ReadonlySet<string> = new Set([
  "google",
  "tripadvisor",
  "trustpilot",
  "manual",
]);

type ReviewSqlRow = {
  id: string;
  external_ref: string | null;
  source: ReviewSource;
  author_name: string;
  author_role: string;
  body: string;
  rating: number;
  route_label: string;
  vehicle_class_id: string | null;
  vehicle_class_slug: string | null;
  avatar_path: string | null;
  source_url: string | null;
  verified: boolean;
  published: boolean;
  sort_order: number;
  locked: boolean;
  created_at: Date | string;
  updated_at: Date | string;
};

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function isSource(value: string): value is ReviewSource {
  return SOURCES.has(value);
}

/**
 * Dense 0-based renumbering rather than a two-value swap is the whole point:
 * `sort_order` has `default 0` and no unique constraint, so a console-created
 * review ties with every other console-created review, and exchanging two
 * equal integers is a no-op that presents as a broken button.
 */
export function planReorder(
  rows: ReadonlyArray<Pick<ReviewRow, "id">>,
  id: string,
  direction: "up" | "down",
): ReorderPlan {
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) return [];
  if (direction === "up" && index === 0) return [];
  if (direction === "down" && index === rows.length - 1) return [];

  const next = rows.map((row) => row.id);
  const neighbour = direction === "up" ? index - 1 : index + 1;
  const current = next[index];
  const swapped = next[neighbour];
  if (current === undefined || swapped === undefined) return [];
  next[index] = swapped;
  next[neighbour] = current;

  return next.map((rowId, sortOrder) => ({ id: rowId, sortOrder }));
}

/**
 * ADR-008: `locked` is `generated always as (source <> 'manual') stored` and
 * has no trigger and no policy behind it — the database will happily accept
 * an UPDATE that rewrites a Google review's body. This function is the
 * enforcement, not a convenience.
 */
export function assertNotLocked(row: Pick<ReviewRow, "locked">): void {
  if (row.locked) throw new ReviewLockedError();
}

export function assertReviewInput(input: ReviewInput): AssertedReviewInput {
  if (!Number.isInteger(input.rating) || input.rating < 0 || input.rating > 5) {
    throw new ReviewInputError("reviews-rating");
  }

  const source: ReviewSource = input.source && isSource(input.source) ? input.source : "manual";

  const externalRef = input.externalRef ? input.externalRef : null;
  const vehicleClassId = input.vehicleClassId ? input.vehicleClassId : null;
  const avatarPath = input.avatarPath ? input.avatarPath : null;
  const sourceUrl = input.sourceUrl ? input.sourceUrl : null;
  const sortOrder = input.sortOrder == null ? 0 : input.sortOrder;

  if (!Number.isInteger(sortOrder)) {
    throw new ReviewInputError("reviews-sort-order");
  }

  return {
    externalRef,
    source,
    authorName: input.authorName,
    authorRole: input.authorRole,
    body: input.body,
    rating: input.rating,
    routeLabel: input.routeLabel,
    vehicleClassId,
    avatarPath,
    sourceUrl,
    verified: input.verified === true,
    published: input.published !== false,
    sortOrder,
  };
}

export async function loadReviews(
  env: CloudflareEnv,
  claims: VamosClaims,
): Promise<ReviewRow[]> {
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<ReviewSqlRow[]>`
      select
        r.id,
        r.external_ref,
        r.source,
        r.author_name,
        r.author_role,
        r.body,
        r.rating,
        r.route_label,
        r.vehicle_class_id,
        vc.slug as vehicle_class_slug,
        r.avatar_path,
        r.source_url,
        r.verified,
        r.published,
        r.sort_order,
        r.locked,
        r.created_at,
        r.updated_at
      from public.reviews r
      left join public.vehicle_classes vc on vc.id = r.vehicle_class_id
      order by r.sort_order asc, r.created_at desc
    `;
    return rows.map((row: ReviewSqlRow) => ({
      id: row.id,
      externalRef: row.external_ref,
      source: row.source,
      authorName: row.author_name,
      authorRole: row.author_role,
      body: row.body,
      rating: row.rating,
      routeLabel: row.route_label,
      vehicleClassId: row.vehicle_class_id,
      vehicleClassSlug: row.vehicle_class_slug,
      avatarPath: row.avatar_path,
      sourceUrl: row.source_url,
      verified: row.verified,
      published: row.published,
      sortOrder: row.sort_order,
      locked: row.locked,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    }));
  });
}

// apps/web/lib/public/reviews.ts
//
// Published-only reader for the public home carousel. Uses publicSql (no identity).
// Staff list/mutations stay on lib/ops/reviews.ts + /api/staff/reviews.

import { publicSql } from "@/lib/db/public";

/**
 * One published review as GET /api/reviews sends it. Security S10 (2026-10-05): no row id. The
 * home carousel, the header score and the review store (app/vamos-reviews.js) never read it.
 *
 * Phase 32 (D-09): `ref` is the opaque handle `public.review_ref(body)` (first 16 hex of sha256 of the
 * body; a body edit gives a new ref, so a cached translation URL never serves an old text) and
 * `language` the detected ISO 639-1 code (null until the review job sets it). The translate button
 * asks GET /api/reviews/<ref>/translation?lang=xx.
 */
export type PublicReview = {
  ref: string;
  language: string | null;
  source: string;
  authorName: string;
  authorRole: string;
  body: string;
  rating: number;
  routeLabel: string;
  vehicleClassSlug: string | null;
  avatarPath: string | null;
  sourceUrl: string | null;
  verified: boolean;
  published: boolean;
  sortOrder: number;
};

type ReviewSqlRow = {
  ref: string;
  language: string | null;
  source: string;
  author_name: string;
  author_role: string;
  body: string;
  rating: number;
  route_label: string;
  vehicle_class_slug: string | null;
  avatar_path: string | null;
  source_url: string | null;
  verified: boolean;
  published: boolean;
  sort_order: number;
};

function publicSourceUrl(value: string | null): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if ((url.protocol === "https:" || url.protocol === "http:") && url.hostname) return raw;
  } catch {
    /* fail closed — never render an invalid href */
  }
  return null;
}

export async function loadPublishedReviews(env: CloudflareEnv): Promise<PublicReview[]> {
  const sql = publicSql(env);
  const rows = await sql<ReviewSqlRow[]>`
    select
      public.review_ref(r.body) as ref,
      r.language,
      r.source,
      r.author_name,
      r.author_role,
      r.body,
      r.rating,
      r.route_label,
      vc.slug as vehicle_class_slug,
      r.avatar_path,
      r.source_url,
      r.verified,
      r.published,
      r.sort_order
    from public.reviews r
    left join public.vehicle_classes vc on vc.id = r.vehicle_class_id
    where r.published = true
    order by r.sort_order asc, r.created_at desc
  `;
  return rows.map((row) => ({
    ref: row.ref,
    language: row.language ?? null,
    source: row.source,
    authorName: row.author_name,
    authorRole: row.author_role,
    body: row.body,
    rating: row.rating,
    routeLabel: row.route_label,
    vehicleClassSlug: row.vehicle_class_slug,
    avatarPath: null,
    sourceUrl: publicSourceUrl(row.source_url),
    verified: row.verified,
    published: row.published,
    sortOrder: row.sort_order,
  }));
}

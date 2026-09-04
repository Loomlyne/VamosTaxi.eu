// apps/web/lib/public/reviews.ts
//
// Published-only reader for the public home carousel. Uses publicSql (no identity).
// Staff list/mutations stay on lib/ops/reviews.ts + /api/staff/reviews.

import { publicSql } from "@/lib/db/public";

export type PublicReview = {
  id: string;
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
  id: string;
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

export async function loadPublishedReviews(env: CloudflareEnv): Promise<PublicReview[]> {
  const sql = publicSql(env);
  const rows = await sql<ReviewSqlRow[]>`
    select
      r.id,
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
    id: row.id,
    source: row.source,
    authorName: row.author_name,
    authorRole: row.author_role,
    body: row.body,
    rating: row.rating,
    routeLabel: row.route_label,
    vehicleClassSlug: row.vehicle_class_slug,
    avatarPath: row.avatar_path,
    sourceUrl: row.source_url,
    verified: row.verified,
    published: row.published,
    sortOrder: row.sort_order,
  }));
}

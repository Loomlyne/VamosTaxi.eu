// apps/web/lib/db/content.ts
//
// The ONLY `publicSql` consumer in Phase 5. It reads two of the five allow-listed tables
// (`content_strings`, `reviews`) on the cacheable binding, performs no write, and holds no
// module-scope state. D-11's two-source window is deliberate: the home page's Reviews and FAQ
// sections come from here NOW, while every other surface stays on Phase 1's JSON catalogue
// until Phase 6's I18N-07 swap. A later reader must not treat that split as a bug.

import { publicSql } from "@/lib/db/public";

export type ContentLocale = "en" | "de" | "fr" | "ar";

export type ReviewRow = {
  id: string;
  authorName: string;
  authorRole: string;
  body: string;
  rating: number;
  routeLabel: string;
  avatarPath: string | null;
  verified: boolean;
};

export type ContentStringRow = {
  key: string;
  en: string;
  de: string | null;
  fr: string | null;
  ar: string | null;
  pendingValue: boolean;
  nonTranslatable: boolean;
};

type ReviewQueryRow = {
  id: string;
  author_name: string;
  author_role: string;
  body: string;
  rating: number;
  route_label: string;
  avatar_path: string | null;
  verified: boolean;
};

type ContentStringQueryRow = {
  key: string;
  en: string;
  de: string | null;
  fr: string | null;
  ar: string | null;
  pending_value: boolean;
  non_translatable: boolean;
};

function mapReview(row: ReviewQueryRow): ReviewRow {
  return {
    id: row.id,
    authorName: row.author_name,
    authorRole: row.author_role,
    body: row.body,
    rating: row.rating,
    routeLabel: row.route_label,
    avatarPath: row.avatar_path,
    verified: row.verified,
  };
}

function mapContentString(row: ContentStringQueryRow): ContentStringRow {
  return {
    key: row.key,
    en: row.en,
    de: row.de,
    fr: row.fr,
    ar: row.ar,
    pendingValue: row.pending_value,
    nonTranslatable: row.non_translatable,
  };
}

/**
 * Locale column for a content-string row. `en` is the documented fallback when a translation
 * column is null. `pending_value` (ADR-011) and `non_translatable` (ADR-012) rows always
 * return `en` regardless of locale — a pending value stays English and a product literal is
 * the same in every language.
 */
export function pickLocaleColumn(row: ContentStringRow, locale: ContentLocale): string {
  if (row.pendingValue || row.nonTranslatable) return row.en;
  if (locale === "en") return row.en;
  return row[locale] ?? row.en;
}

export async function getPublishedReviews(env: CloudflareEnv, limit: number): Promise<ReviewRow[]> {
  const sql = publicSql(env);
  const rows = await sql<ReviewQueryRow[]>`
    select id, author_name, author_role, body, rating, route_label, avatar_path, verified
      from public.reviews
     where published
     order by sort_order, created_at desc
     limit ${limit}
  `;
  return rows.map(mapReview);
}

export async function getContentStrings(
  env: CloudflareEnv,
  keys: readonly string[],
): Promise<ContentStringRow[]> {
  const sql = publicSql(env);
  const list = [...keys];
  const rows = await sql<ContentStringQueryRow[]>`
    select key, en, de, fr, ar, pending_value, non_translatable
      from public.content_strings
     where key in ${sql(list)}
  `;
  return rows.map(mapContentString);
}

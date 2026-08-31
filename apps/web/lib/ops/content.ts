// apps/web/lib/ops/content.ts
//
// Staff reader/writer helpers for public.content_strings (I18N-07 / D-15).
// Three flags stay three flags: pending_value, non_translatable, no_param_reason.
// There is no combined boolean derived from them.
//
// Every query goes through asStaff on HYPERDRIVE_NOCACHE (D-02). The cacheable
// publicSql path is 06-16's. Bound parameters only — Phase 3's fence already refuses the rest.
//
// 06-07's mapSqlState is not on this branch (06-10 depends_on 06-04 only).
// Callers branch on err.code for 23505 / 23514; this file does not import it.

import { asStaff, type VamosClaims } from "@/lib/db/identity";

// Library module — force-dynamic is meaningless here, but D-06's fence greps
// the importer for this export (same situation as apps/web/lib/db/content.ts,
// which is named on force_dynamic_exempt; that JSON is outside this plan).
export const dynamic = "force-dynamic";

export const CONTENT_FILTERS = [
  "all",
  "untranslated",
  "pending",
  "nonTranslatable",
  "noParamOptOut",
  "recentlyEdited",
] as const;

export type ContentFilter = (typeof CONTENT_FILTERS)[number];

export const LEGAL_DOC_SLUGS = [
  "terms",
  "privacy",
  "cookies",
  "imprint",
  "cancellation",
] as const;

export type LegalDocSlug = (typeof LEGAL_DOC_SLUGS)[number];

export type ContentStringRow = {
  key: string;
  en: string;
  de: string | null;
  fr: string | null;
  ar: string | null;
  pendingValue: boolean;
  nonTranslatable: boolean;
  noParamReason: string | null;
  updatedAt: string;
  updatedBy: string | null;
};

export type ContentNamespace = {
  namespace: string;
  count: number;
};

export type ContentStringList = {
  rows: ContentStringRow[];
  total: number;
};

export type ContentStringQuery = {
  namespace?: string;
  search?: string;
  filter?: ContentFilter;
  limit?: number;
  offset?: number;
};

export type ContentStringInput = {
  en: string;
  de: string | null;
  fr: string | null;
  ar: string | null;
  pendingValue: boolean;
  nonTranslatable: boolean;
  noParamReason: string | null;
};

export type LegalDocCoverage = {
  slug: LegalDocSlug;
  total: number;
  present: { en: number; de: number; fr: number; ar: number };
  pendingValueCount: number;
};

export class ContentStringInputError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(key);
    this.name = "ContentStringInputError";
    this.key = key;
  }
}

type SqlContentRow = {
  key: string;
  en: string;
  de: string | null;
  fr: string | null;
  ar: string | null;
  pending_value: boolean;
  non_translatable: boolean;
  no_param_reason: string | null;
  updated_at: Date | string;
  updated_by: string | null;
};

function isContentFilter(value: string): value is ContentFilter {
  return (CONTENT_FILTERS as readonly string[]).includes(value);
}

export function parseContentFilter(value: string | undefined | null): ContentFilter {
  if (value && isContentFilter(value)) return value;
  return "all";
}

function escapeLikePattern(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function mapRow(row: SqlContentRow): ContentStringRow {
  return {
    key: row.key,
    en: row.en,
    de: row.de,
    fr: row.fr,
    ar: row.ar,
    pendingValue: row.pending_value,
    nonTranslatable: row.non_translatable,
    noParamReason: row.no_param_reason,
    updatedAt: toIso(row.updated_at),
    updatedBy: row.updated_by,
  };
}

function icuPlaceholderNames(value: string): string[] {
  const names = new Set<string>();
  const re = /\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value))) {
    const name = match[1]?.split(",")[0]?.trim();
    if (name) names.add(name);
  }
  return [...names].sort();
}

function sameIcuSet(en: string, other: string): boolean {
  const left = icuPlaceholderNames(en);
  const right = icuPlaceholderNames(other);
  if (left.length !== right.length) return false;
  return left.every((name, i) => name === right[i]);
}

function trimOrNull(value: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function assertContentStringInput(input: ContentStringInput): ContentStringInput {
  const en = input.en.trim();
  if (!en) throw new ContentStringInputError("content-error-en-required");

  const noParamReason =
    input.noParamReason == null ? null : input.noParamReason.trim();
  if (input.noParamReason != null && !noParamReason) {
    throw new ContentStringInputError("content-error-no-param-reason");
  }

  const de = trimOrNull(input.de);
  const fr = trimOrNull(input.fr);
  const ar = trimOrNull(input.ar);

  if (input.nonTranslatable) {
    const literalOk = (value: string | null) => value == null || value === en;
    if (!literalOk(de) || !literalOk(fr) || !literalOk(ar)) {
      throw new ContentStringInputError("content-error-literal-mismatch");
    }
  }

  for (const value of [de, fr, ar]) {
    if (value != null && !sameIcuSet(en, value)) {
      throw new ContentStringInputError("content-error-icu-mismatch");
    }
  }

  return {
    en,
    de,
    fr,
    ar,
    pendingValue: input.pendingValue,
    nonTranslatable: input.nonTranslatable,
    noParamReason,
  };
}

export async function loadNamespaces(
  env: CloudflareEnv,
  claims: VamosClaims,
): Promise<ContentNamespace[]> {
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<{ namespace: string; count: number }[]>`
      select split_part(key, '.', 1) as namespace, count(*)::int as count
        from public.content_strings
       group by 1
       order by 1
    `;
    return rows.map((row) => ({ namespace: row.namespace, count: row.count }));
  });
}

export async function loadContentStrings(
  env: CloudflareEnv,
  claims: VamosClaims,
  query: ContentStringQuery = {},
): Promise<ContentStringList> {
  const filter = parseContentFilter(query.filter);
  const namespace = query.namespace?.trim() || null;
  const searchRaw = query.search?.trim() || null;
  const like = searchRaw ? `%${escapeLikePattern(searchRaw)}%` : null;
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
  const offset = Math.max(query.offset ?? 0, 0);

  return asStaff(env, claims, async (sql) => {
    // untranslated: a language column is NULL or still equal to en, while both
    // non_translatable and pending_value are false. Both exclusions matter: an
    // ADR-012 product name is identical in four languages by design, and an
    // ADR-011 pending_value row is identical in four languages because the
    // owner has not supplied it yet. Reporting either as untranslated makes
    // the filter useless. recentlyEdited is updated_by IS NOT NULL — seed
    // stamps updated_at = now() on every row, so a time window would match all
    // 1,516 seeded keys.
    const rows = await sql<SqlContentRow[]>`
      select key, en, de, fr, ar,
             pending_value, non_translatable, no_param_reason,
             updated_at, updated_by
        from public.content_strings
       where (${namespace}::text is null or split_part(key, '.', 1) = ${namespace})
         and (${like}::text is null
              or key ilike ${like} escape '\\'
              or en  ilike ${like} escape '\\')
         and (
              ${filter}::text = 'all'
           or (
                ${filter}::text = 'untranslated'
                and pending_value = false
                and non_translatable = false
                and (
                     de is null or de = en
                  or fr is null or fr = en
                  or ar is null or ar = en
                )
              )
           or (${filter}::text = 'pending' and pending_value = true)
           or (${filter}::text = 'nonTranslatable' and non_translatable = true)
           or (${filter}::text = 'noParamOptOut' and no_param_reason is not null)
           or (${filter}::text = 'recentlyEdited' and updated_by is not null)
         )
       order by key
       limit ${limit}
      offset ${offset}
    `;

    const totalRows = await sql<{ n: number }[]>`
      select count(*)::int as n
        from public.content_strings
       where (${namespace}::text is null or split_part(key, '.', 1) = ${namespace})
         and (${like}::text is null
              or key ilike ${like} escape '\\'
              or en  ilike ${like} escape '\\')
         and (
              ${filter}::text = 'all'
           or (
                ${filter}::text = 'untranslated'
                and pending_value = false
                and non_translatable = false
                and (
                     de is null or de = en
                  or fr is null or fr = en
                  or ar is null or ar = en
                )
              )
           or (${filter}::text = 'pending' and pending_value = true)
           or (${filter}::text = 'nonTranslatable' and non_translatable = true)
           or (${filter}::text = 'noParamOptOut' and no_param_reason is not null)
           or (${filter}::text = 'recentlyEdited' and updated_by is not null)
         )
    `;

    return { rows: rows.map(mapRow), total: totalRows[0]?.n ?? 0 };
  });
}

export async function loadLegalCoverage(
  env: CloudflareEnv,
  claims: VamosClaims,
): Promise<LegalDocCoverage[]> {
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<
      {
        key: string;
        en: string | null;
        de: string | null;
        fr: string | null;
        ar: string | null;
        pending_value: boolean;
      }[]
    >`
      select key, en, de, fr, ar, pending_value
        from public.content_strings
       where key like 'legal.%'
       order by key
    `;

    return LEGAL_DOC_SLUGS.map((slug) => {
      const prefix = `legal.${slug}.`;
      const docs = rows.filter((row) => row.key.startsWith(prefix));
      return {
        slug,
        total: docs.length,
        present: {
          en: docs.filter((row) => row.en != null).length,
          de: docs.filter((row) => row.de != null).length,
          fr: docs.filter((row) => row.fr != null).length,
          ar: docs.filter((row) => row.ar != null).length,
        },
        pendingValueCount: docs.filter((row) => row.pending_value).length,
      };
    });
  });
}

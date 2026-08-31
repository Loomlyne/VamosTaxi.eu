// apps/web/lib/content/messages.ts
//
// I18N-07 runtime dictionary. The public read of content_strings goes through
// publicSql(env) on the cacheable HYPERDRIVE binding (D-03). Constructed inside
// the function, never at module scope: a postgres client built at module scope
// on Workers fails silently on the first request.
//
// CONTENT_SOURCE defaults to json until the swap is proven in the environment
// being deployed to. A thrown query or a zero-row result falls back to the JSON
// import and emits one structured error log — loud, not silent.

import { cache } from "react";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { publicSql } from "../db/public";
import { log } from "../logger";

export type RawMessages = Record<string, unknown>;

export type ContentLocale = "en" | "de" | "fr" | "ar";

export type ContentSource = "json" | "db";

/** Default until the swap is proven. Live value is resolved per request. */
export const CONTENT_SOURCE: ContentSource = "json";

type ContentStringRow = {
  key: string;
  en: string;
  de: string | null;
  fr: string | null;
  ar: string | null;
};

export class KeyPrefixCollisionError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(`content_strings key collides with an existing prefix: ${key}`);
    this.name = "KeyPrefixCollisionError";
    this.key = key;
  }
}

function resolveContentSource(raw: string | undefined): ContentSource {
  return raw === "db" ? "db" : CONTENT_SOURCE;
}

function readContentSource(): ContentSource {
  let raw: string | undefined = process.env.CONTENT_SOURCE;
  try {
    raw = getCloudflareContext().env.CONTENT_SOURCE ?? raw;
  } catch {
    // Vitest / a process with no Workers env: process.env (or the json default).
  }
  return resolveContentSource(raw);
}

async function loadJsonMessages(locale: ContentLocale): Promise<RawMessages> {
  return (await import(`../../i18n/messages/${locale}.json`)).default as RawMessages;
}

/**
 * Exact inverse of scripts/check-i18n-coverage.mjs (and generate-seed.mjs) flatten:
 * split on `.` and nest each segment. The measured key set has no key that is a
 * strict prefix of another, so no segment is ever both a string and an object.
 * Throw if a future key breaks that invariant — the silent alternative is one
 * namespace vanishing from the site.
 */
export function unflattenKeys(flat: Record<string, string>): RawMessages {
  const root: Record<string, unknown> = {};
  // Shorter keys first so a leaf such as `quote.error` lands before
  // `quote.error.min_advance`. Flatten concatenates JSON keys that themselves
  // contain dots; the inverse keeps those as a single key at the parent.
  const keys = Object.keys(flat).sort((a, b) => {
    const byDepth = a.split(".").length - b.split(".").length;
    return byDepth !== 0 ? byDepth : a.localeCompare(b);
  });
  for (const dotted of keys) {
    const value = flat[dotted];
    const segments = dotted.split(".");
    if (segments.some((segment) => segment.length === 0)) {
      throw new KeyPrefixCollisionError(dotted);
    }
    let cursor: Record<string, unknown> = root;
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (segment === undefined) throw new KeyPrefixCollisionError(dotted);
      const last = i === segments.length - 1;
      if (last) {
        const existing = cursor[segment];
        if (existing !== undefined && typeof existing === "object" && existing !== null) {
          throw new KeyPrefixCollisionError(dotted);
        }
        cursor[segment] = value;
        break;
      }
      const existing = cursor[segment];
      if (typeof existing === "string") {
        const remainder = segments.slice(i).join(".");
        const clash = cursor[remainder];
        if (clash !== undefined && typeof clash === "object" && clash !== null) {
          throw new KeyPrefixCollisionError(dotted);
        }
        cursor[remainder] = value;
        break;
      }
      if (existing === undefined || existing === null || typeof existing !== "object") {
        cursor[segment] = {};
      }
      cursor = cursor[segment] as Record<string, unknown>;
    }
  }
  return root;
}

function projectLocale(rows: ContentStringRow[], locale: ContentLocale): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const row of rows) {
    const value = row[locale];
    // A NULL translation is omitted, not emitted. mergeWithEnglishFallback
    // merges per leaf with the target winning wherever it defines one — so a
    // `de` key present with value null or "" beats English and renders as
    // nothing. A key whose column is NULL must simply not appear here.
    if (value == null) continue;
    flat[row.key] = value;
  }
  return flat;
}

function logFallback(cause: "query_failed" | "empty_result", detail: string): void {
  log(
    "error",
    "content_strings_fallback",
    {
      requestId: "content-loader",
      route: "i18n/loadMessagesFromDb",
      locale: null,
    },
    {
      scope: "i18n",
      event: "content_strings_fallback",
      cause,
      detail,
    },
  );
}

const fetchContentStringRows = cache(async (): Promise<ContentStringRow[] | null> => {
  let env: CloudflareEnv;
  try {
    env = getCloudflareContext().env;
  } catch (err) {
    logFallback("query_failed", err instanceof Error ? err.message : String(err));
    return null;
  }

  try {
    const sql = publicSql(env);
    const rows = await sql<ContentStringRow[]>`
      select key, en, de, fr, ar
        from public.content_strings
    `;
    if (rows.length === 0) {
      logFallback("empty_result", "content_strings returned zero rows");
      return null;
    }
    return rows;
  } catch (err) {
    logFallback("query_failed", err instanceof Error ? err.message : String(err));
    return null;
  }
});

export async function loadMessagesFromDb(locale: ContentLocale): Promise<RawMessages> {
  if (readContentSource() !== "db") {
    return loadJsonMessages(locale);
  }
  const rows = await fetchContentStringRows();
  if (rows === null) {
    return loadJsonMessages(locale);
  }
  return unflattenKeys(projectLocale(rows, locale));
}

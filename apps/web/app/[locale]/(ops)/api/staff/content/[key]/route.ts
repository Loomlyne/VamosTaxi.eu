// apps/web/app/[locale]/(ops)/api/staff/content/[key]/route.ts
//
// PATCH /api/staff/content/:key — language values { en?, de?, fr?, ar? }.
// Keys may contain dots; decodeURIComponent once. Flag writes live on /flags
// so a pending_value-only body cannot collapse the other two $meta flags.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asStaff } from "@/lib/db/identity";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";
import {
  updateContentString,
  type ContentActionResult,
  type ContentLanguageValues,
} from "../../../../ops/content/actions";

export const dynamic = "force-dynamic";

export type ContentStringFlagsPatch = {
  pendingValue?: boolean;
  nonTranslatable?: boolean;
  noParamReason?: string | null;
};

export type ContentStringRowSnapshot = {
  en: string;
  de: string | null;
  fr: string | null;
  ar: string | null;
  pendingValue: boolean;
  nonTranslatable: boolean;
  noParamReason: string | null;
};

export function decodeContentKey(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const raw: unknown = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    return raw as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function actionResponse(result: ContentActionResult): Response {
  if (result.ok) return jsonOk({ saved: true });
  if (result.key === "content-error-unknown") return jsonErr(result.key, 404);
  if (result.key === "content-error-conflict") return jsonErr(result.key, 409);
  return jsonErr(result.key, 400);
}

export async function loadContentRow(
  env: CloudflareEnv,
  claims: Parameters<typeof asStaff>[1],
  key: string,
): Promise<ContentStringRowSnapshot | null> {
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<
      {
        en: string;
        de: string | null;
        fr: string | null;
        ar: string | null;
        pending_value: boolean;
        non_translatable: boolean;
        no_param_reason: string | null;
      }[]
    >`
      select en, de, fr, ar, pending_value, non_translatable, no_param_reason
        from public.content_strings
       where key = ${key}
       limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      en: row.en,
      de: row.de,
      fr: row.fr,
      ar: row.ar,
      pendingValue: row.pending_value,
      nonTranslatable: row.non_translatable,
      noParamReason: row.no_param_reason,
    };
  });
}

function asOptionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error("content-error-invalid");
  return value;
}

function asOptionalNullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new Error("content-error-invalid");
  return value;
}

export function parseLanguagePatch(body: Record<string, unknown>): {
  en?: string;
  de?: string | null;
  fr?: string | null;
  ar?: string | null;
} {
  return {
    en: asOptionalString(body.en),
    de: asOptionalNullableString(body.de),
    fr: asOptionalNullableString(body.fr),
    ar: asOptionalNullableString(body.ar),
  };
}

export function parseFlagPatch(body: Record<string, unknown>): ContentStringFlagsPatch {
  const patch: ContentStringFlagsPatch = {};
  if ("pendingValue" in body) {
    if (typeof body.pendingValue !== "boolean") throw new Error("content-error-invalid");
    patch.pendingValue = body.pendingValue;
  }
  if ("nonTranslatable" in body) {
    if (typeof body.nonTranslatable !== "boolean") throw new Error("content-error-invalid");
    patch.nonTranslatable = body.nonTranslatable;
  }
  if ("noParamReason" in body) {
    const reason = asOptionalNullableString(body.noParamReason);
    patch.noParamReason = reason === undefined ? undefined : reason;
  }
  return patch;
}

function mergeLanguages(
  existing: ContentStringRowSnapshot,
  patch: { en?: string; de?: string | null; fr?: string | null; ar?: string | null },
): ContentLanguageValues {
  return {
    en: patch.en ?? existing.en,
    de: patch.de !== undefined ? patch.de : existing.de,
    fr: patch.fr !== undefined ? patch.fr : existing.fr,
    ar: patch.ar !== undefined ? patch.ar : existing.ar,
  };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ key: string }> },
): Promise<Response> {
  const { key: rawKey } = await context.params;
  const key = decodeContentKey(rawKey);
  return withStaff(async (claims) => {
    const body = await readJsonObject(request);
    if (!body) return jsonErr("content-error-invalid", 400);
    let patch;
    try {
      patch = parseLanguagePatch(body);
    } catch {
      return jsonErr("content-error-invalid", 400);
    }
    const { env } = getCloudflareContext();
    const existing = await loadContentRow(env, claims, key);
    if (!existing) return jsonErr("content-error-unknown", 404);
    return actionResponse(await updateContentString(key, mergeLanguages(existing, patch)));
  })(request);
}

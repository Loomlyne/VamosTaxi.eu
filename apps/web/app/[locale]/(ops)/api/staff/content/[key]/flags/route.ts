// apps/web/app/[locale]/(ops)/api/staff/content/[key]/flags/route.ts
//
// PATCH /api/staff/content/:key/flags
// { pendingValue?, nonTranslatable?, noParamReason? } — three independent
// fields. A body that only flips pendingValue must not clear nonTranslatable
// or noParamReason. There is no combined translatable boolean.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { jsonErr, withStaff } from "@/lib/ops/staff-json";
import { setContentStringFlags } from "../../../../../ops/content/actions";
import {
  actionResponse,
  decodeContentKey,
  loadContentRow,
  parseFlagPatch,
  readJsonObject,
} from "../route";

export const dynamic = "force-dynamic";

export type ContentStringFlagsPatch = {
  pendingValue?: boolean;
  nonTranslatable?: boolean;
  noParamReason?: string | null;
};

function mergeFlags(
  existing: {
    pendingValue: boolean;
    nonTranslatable: boolean;
    noParamReason: string | null;
  },
  patch: ContentStringFlagsPatch,
): {
  pendingValue: boolean;
  nonTranslatable: boolean;
  noParamReason: string | null;
} {
  return {
    pendingValue: patch.pendingValue ?? existing.pendingValue,
    nonTranslatable: patch.nonTranslatable ?? existing.nonTranslatable,
    noParamReason:
      patch.noParamReason !== undefined ? patch.noParamReason : existing.noParamReason,
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
    let patch: ContentStringFlagsPatch;
    try {
      patch = parseFlagPatch(body);
    } catch {
      return jsonErr("content-error-invalid", 400);
    }
    const { env } = getCloudflareContext();
    const existing = await loadContentRow(env, claims, key);
    if (!existing) return jsonErr("content-error-unknown", 404);
    return actionResponse(await setContentStringFlags(key, mergeFlags(existing, patch)));
  })(request);
}

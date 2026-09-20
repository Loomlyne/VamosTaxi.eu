// apps/web/app/[locale]/(ops)/api/photos/upload/route.ts
//
// POST multipart upload, staff-gated. Writes the object to R2 via the PHOTOS
// binding and returns `{ key }` only — never a URL, never the bucket name.
//
// This route writes no database column. The owning screen's Server Action
// stores the returned key through asStaff so every column write stays inside
// the audited, RLS-checked path (T-06-39). The browser never holds an R2
// credential (D-19).

import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  OpsAuthError,
  requireStaffClaims,
  type StaffAuthClient,
} from "@/lib/ops/session";
import {
  PhotoUploadError,
  assertPhotoRecordId,
  assertPhotoUpload,
  buildPhotoKey,
  isPhotoKind,
} from "@/lib/ops/photos";
import { staffOriginAllowed } from "@/lib/ops/staff-json";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const noStore = { "cache-control": "private, no-store" };

function authResponse(reason: OpsAuthError["reason"]): Response {
  const status = reason === "no-session" ? 401 : 403;
  return Response.json({ error: reason }, { status, headers: noStore });
}

export async function POST(request: Request): Promise<Response> {
  const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
  try {
    await requireStaffClaims(supabase);
  } catch (err) {
    if (err instanceof OpsAuthError) return authResponse(err.reason);
    throw err;
  }
  if (!staffOriginAllowed(request.headers.get("Origin"))) {
    return Response.json({ error: "csrf" }, { status: 403, headers: noStore });
  }

  const formData = await request.formData();
  const kindRaw = formData.get("kind");
  const recordIdRaw = formData.get("recordId");
  const fileRaw = formData.get("file");

  if (typeof kindRaw !== "string" || !isPhotoKind(kindRaw)) {
    return Response.json({ error: "type_not_allowed" }, { status: 400, headers: noStore });
  }
  if (typeof recordIdRaw !== "string" || recordIdRaw.length === 0) {
    return Response.json({ error: "type_not_allowed" }, { status: 400, headers: noStore });
  }
  try {
    assertPhotoRecordId(recordIdRaw);
  } catch {
    return Response.json({ error: "type_not_allowed" }, { status: 400, headers: noStore });
  }
  if (!(fileRaw instanceof File)) {
    return Response.json({ error: "type_not_allowed" }, { status: 400, headers: noStore });
  }

  const bytes = new Uint8Array(await fileRaw.arrayBuffer());
  try {
    assertPhotoUpload({ type: fileRaw.type, size: fileRaw.size, bytes });
  } catch (err) {
    if (err instanceof PhotoUploadError) {
      return Response.json({ error: err.code }, { status: 400, headers: noStore });
    }
    throw err;
  }

  const key = buildPhotoKey(kindRaw, recordIdRaw, fileRaw.type);
  const { env } = getCloudflareContext();
  await env.PHOTOS.put(key, bytes, {
    httpMetadata: { contentType: fileRaw.type },
  });

  return Response.json({ key }, { headers: noStore });
}

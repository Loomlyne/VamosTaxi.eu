// apps/web/app/photos/[key]/route.ts
//
// GET proxy over PHOTOS.get(key). Deliberately outside [locale] and outside
// (ops): a photo is not a localised page and is read by the public site (D-23).
// Keys contain slashes (`vehicles/<id>/<uuid>.jpg`); the sibling [...key]
// route re-exports this handler so nested paths match. Validate against
// PHOTO_PREFIXES and reject traversal before touching R2.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PHOTO_PREFIXES, readPhotoKeyFromPathname } from "@/lib/ops/photos";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  const key = readPhotoKeyFromPathname(pathname);
  if (!key || !PHOTO_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    return new Response(null, { status: 404, headers: { "cache-control": "private, no-store" } });
  }

  const { env } = getCloudflareContext();
  const object = await env.PHOTOS.get(key);
  if (!object) {
    return new Response(null, { status: 404, headers: { "cache-control": "private, no-store" } });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}

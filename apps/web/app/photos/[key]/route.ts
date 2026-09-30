// apps/web/app/photos/[key]/route.ts
//
// GET proxy over PHOTOS.get(key). Deliberately outside [locale] and outside
// (ops): a photo is not a localised page and is read by the public site (D-23).
// Keys contain slashes (`vehicles/<id>/<uuid>.jpg`); the sibling [...key]
// route re-exports this handler so nested paths match. Validate against
// PHOTO_PREFIXES and reject traversal before touching R2.
//
// `?w=640|1280` answers a WebP of that width (quick 260930-cps): made once with the
// IMAGES binding, kept in the bucket beside the original, reused afterwards. If it
// cannot be made the original is served, so a photo never breaks.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PHOTO_PREFIXES, readPhotoKeyFromPathname } from "@/lib/ops/photos";
import {
  isVariantKey,
  PHOTO_VARIANT_QUALITY,
  readVariantWidth,
  variantKey,
  type PhotoVariantWidth,
} from "@/lib/photos/variant";

export const dynamic = "force-dynamic";

const IMMUTABLE = "public, max-age=31536000, immutable";
/** The original answered under a `?w=` address is a stand-in: keep it short so the small version can take over. */
const FALLBACK = "public, max-age=300";

function notFound(): Response {
  return new Response(null, { status: 404, headers: { "cache-control": "private, no-store" } });
}

/** Makes the WebP once and stores it. Null when the binding is missing or refuses. */
async function makeVariant(
  env: CloudflareEnv,
  original: ArrayBuffer,
  key: string,
  width: PhotoVariantWidth,
): Promise<ArrayBuffer | null> {
  try {
    if (!env.IMAGES) return null;
    const source = new Response(original).body;
    if (!source) return null;
    const out = await env.IMAGES.input(source)
      .transform({ width, fit: "scale-down" })
      .output({ format: "image/webp", quality: PHOTO_VARIANT_QUALITY });
    const bytes = await out.response().arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength >= original.byteLength) return null;
    await env.PHOTOS.put(variantKey(key, width), bytes, { httpMetadata: { contentType: "image/webp" } });
    return bytes;
  } catch (error) {
    console.error("photo_variant_failed", { key, width, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const key = readPhotoKeyFromPathname(url.pathname);
  if (!key || !PHOTO_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    return notFound();
  }

  const { env } = getCloudflareContext();
  const width = isVariantKey(key) ? null : readVariantWidth(url.searchParams);

  if (width) {
    const kept = await env.PHOTOS.get(variantKey(key, width));
    if (kept) {
      return new Response(kept.body, { headers: { "Content-Type": "image/webp", "Cache-Control": IMMUTABLE } });
    }
  }

  const object = await env.PHOTOS.get(key);
  if (!object) {
    return notFound();
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);

  if (width) {
    const original = await object.arrayBuffer();
    const made = await makeVariant(env, original, key, width);
    if (made) {
      return new Response(made, { headers: { "Content-Type": "image/webp", "Cache-Control": IMMUTABLE } });
    }
    headers.set("Cache-Control", FALLBACK);
    return new Response(original, { headers });
  }

  headers.set("Cache-Control", IMMUTABLE);
  return new Response(object.body, { headers });
}

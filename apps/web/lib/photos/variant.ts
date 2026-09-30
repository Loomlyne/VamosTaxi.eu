// apps/web/lib/photos/variant.ts
//
// Small versions of a stored photo (quick 260930-cps). `/photos/<key>?w=640|1280` answers a
// WebP of that width, made once with the IMAGES binding and kept in the PHOTOS bucket beside
// the original. The original is never changed. Any other `w` is ignored.

export const PHOTO_VARIANT_WIDTHS = [640, 1280] as const;
export type PhotoVariantWidth = (typeof PHOTO_VARIANT_WIDTHS)[number];

export const PHOTO_VARIANT_QUALITY = 80;

/** The allowed width asked for in `?w=`, or null (serve the original). */
export function readVariantWidth(search: URLSearchParams): PhotoVariantWidth | null {
  const raw = search.get("w");
  if (!raw || !/^[1-9]\d{2,3}$/.test(raw)) return null;
  const n = Number(raw);
  return (PHOTO_VARIANT_WIDTHS as readonly number[]).includes(n) ? (n as PhotoVariantWidth) : null;
}

const VARIANT_SUFFIX_RE = /\.w\d+\.webp$/;

/** True for a key that is itself a stored small version. */
export function isVariantKey(key: string): boolean {
  return VARIANT_SUFFIX_RE.test(key);
}

/** Where the small version of `key` is kept: beside the original, never over it. */
export function variantKey(key: string, width: PhotoVariantWidth): string {
  return `${key}.w${width}.webp`;
}

/** `/photos/<key>` to `/photos/<key>?w=<width>`. Anything that is not a plain photo URL is returned as is. */
export function smallPhotoUrl(url: string | null | undefined, width: PhotoVariantWidth): string {
  if (!url) return "";
  if (!url.startsWith("/photos/") || url.includes("?") || url.includes("#")) return url;
  return `${url}?w=${width}`;
}

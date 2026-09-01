// apps/web/lib/ops/photos.ts
//
// The photo pipeline every fleet/chauffeur/review/staff screen renders through.
// Keys are generated here; the browser never holds an R2 credential (D-19).
// Reads go through /photos/<key> (D-23). Zero photos is the shipping state (D-22).

export const PHOTO_PREFIXES = ["vehicles/", "chauffeurs/", "reviews/", "staff/", "site/"] as const;

export type PhotoPrefix = (typeof PHOTO_PREFIXES)[number];
export type PhotoKind = "vehicle" | "chauffeur" | "review" | "staff";

const KIND_TO_PREFIX: Record<PhotoKind, PhotoPrefix> = {
  vehicle: "vehicles/",
  chauffeur: "chauffeurs/",
  review: "reviews/",
  staff: "staff/",
};

const MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type AllowedPhotoMime = keyof typeof MIME_TO_EXT;

/** 5 MB — a reasonable cap for a phone photo. Enforced server-side before PHOTOS.put (T-06-36). */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export type PhotoUploadCode = "type_not_allowed" | "too_large" | "type_mismatch";

export class PhotoUploadError extends Error {
  readonly code: PhotoUploadCode;

  constructor(code: PhotoUploadCode) {
    super(code);
    this.code = code;
  }
}

export type PhotoUploadInput = {
  type: string;
  size: number;
  bytes: Uint8Array;
};

function isAllowedMime(type: string): type is AllowedPhotoMime {
  return type === "image/jpeg" || type === "image/png" || type === "image/webp";
}

function sniffMatches(bytes: Uint8Array, type: AllowedPhotoMime): boolean {
  if (type === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  // image/webp: RIFF....WEBP
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

/**
 * `<prefix><recordId>/<crypto.randomUUID()>.<ext>`.
 * Extension comes from the validated content type — never from an uploaded filename.
 */
export function buildPhotoKey(kind: PhotoKind, recordId: string, contentType: string): string {
  const prefix = KIND_TO_PREFIX[kind];
  if (!prefix || !isAllowedMime(contentType)) {
    throw new PhotoUploadError("type_not_allowed");
  }
  const ext = MIME_TO_EXT[contentType];
  return `${prefix}${recordId}/${crypto.randomUUID()}.${ext}`;
}

export function isPhotoKind(value: string): value is PhotoKind {
  return value === "vehicle" || value === "chauffeur" || value === "review" || value === "staff";
}

export function assertPhotoUpload(file: PhotoUploadInput): asserts file is PhotoUploadInput & {
  type: AllowedPhotoMime;
} {
  if (!isAllowedMime(file.type)) {
    throw new PhotoUploadError("type_not_allowed");
  }
  if (file.size > PHOTO_MAX_BYTES) {
    throw new PhotoUploadError("too_large");
  }
  if (!sniffMatches(file.bytes, file.type)) {
    throw new PhotoUploadError("type_mismatch");
  }
}

export function photoUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  return `/photos/${key}`;
}

export function isReadablePhotoKey(key: string): boolean {
  if (!key) return false;
  if (key.startsWith("/") || key.includes("\\") || key.includes("..")) return false;
  if (/%(?:2e|2f|5c)/i.test(key)) return false;
  return PHOTO_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * Parse `/photos/<key>` from a request pathname. Rejects encoded separators
 * on the raw path before R2 is touched (T-06-33).
 */
export function readPhotoKeyFromPathname(pathname: string): string | null {
  const marker = "/photos/";
  const index = pathname.indexOf(marker);
  if (index < 0) return null;
  const rest = pathname.slice(index + marker.length);
  if (/%(?:2e|2f|5c)/i.test(rest)) return null;
  if (rest.includes("\\") || rest.includes("..") || rest.startsWith("/")) return null;
  let key = rest;
  try {
    key = decodeURIComponent(rest);
  } catch {
    return null;
  }
  if (!isReadablePhotoKey(key)) return null;
  return key;
}

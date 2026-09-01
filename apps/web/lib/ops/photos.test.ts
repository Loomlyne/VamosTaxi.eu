// apps/web/lib/ops/photos.test.ts
//
// Contract for the R2 photo pipeline (06-06). Keys, MIME sniff, size cap,
// public URL helper, and the read-path allow-list — no R2, no network.

import { describe, expect, it } from "vitest";
import {
  PHOTO_MAX_BYTES,
  PHOTO_PREFIXES,
  assertPhotoUpload,
  buildPhotoKey,
  isReadablePhotoKey,
  photoUrl,
  readPhotoKeyFromPathname,
  PhotoUploadError,
} from "./photos";

function jpegBytes(length = 32): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  return bytes;
}

function pngBytes(length = 32): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

function webpBytes(length = 32): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.set([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
  return bytes;
}

const RECORD_ID = "11111111-1111-4111-8111-111111111111";

describe("PHOTO_PREFIXES", () => {
  it("is the closed set of kind prefixes", () => {
    expect([...PHOTO_PREFIXES]).toEqual(["vehicles/", "chauffeurs/", "reviews/", "staff/"]);
  });
});

describe("buildPhotoKey", () => {
  it("returns a key under the kind prefix with a random component and normalised extension", () => {
    const key = buildPhotoKey("vehicle", RECORD_ID, "image/jpeg");
    expect(key.startsWith(`vehicles/${RECORD_ID}/`)).toBe(true);
    expect(key.endsWith(".jpg")).toBe(true);
    expect(key).toMatch(
      /^vehicles\/11111111-1111-4111-8111-111111111111\/[0-9a-f-]{36}\.jpg$/,
    );
  });

  it("never contains a caller-supplied filename", () => {
    const key = buildPhotoKey("chauffeur", RECORD_ID, "image/png");
    expect(key).not.toContain("portrait");
    expect(key).not.toContain(".PNG");
    expect(key.endsWith(".png")).toBe(true);
  });

  it("maps webp to .webp and review/staff prefixes", () => {
    expect(buildPhotoKey("review", RECORD_ID, "image/webp")).toMatch(
      new RegExp(`^reviews/${RECORD_ID}/[0-9a-f-]{36}\\.webp$`),
    );
    expect(buildPhotoKey("staff", RECORD_ID, "image/jpeg")).toMatch(
      new RegExp(`^staff/${RECORD_ID}/[0-9a-f-]{36}\\.jpg$`),
    );
  });

  it("two calls produce different keys", () => {
    const a = buildPhotoKey("vehicle", RECORD_ID, "image/jpeg");
    const b = buildPhotoKey("vehicle", RECORD_ID, "image/jpeg");
    expect(a).not.toBe(b);
  });
});

describe("assertPhotoUpload", () => {
  it("accepts jpeg/png/webp under the size cap whose magic matches the label", () => {
    expect(() =>
      assertPhotoUpload({ type: "image/jpeg", size: 32, bytes: jpegBytes() }),
    ).not.toThrow();
    expect(() =>
      assertPhotoUpload({ type: "image/png", size: 32, bytes: pngBytes() }),
    ).not.toThrow();
    expect(() =>
      assertPhotoUpload({ type: "image/webp", size: 32, bytes: webpBytes() }),
    ).not.toThrow();
  });

  it("rejects a declared type outside the allow-list", () => {
    expect(() =>
      assertPhotoUpload({ type: "image/gif", size: 32, bytes: jpegBytes() }),
    ).toThrow(PhotoUploadError);
    try {
      assertPhotoUpload({ type: "text/html", size: 8, bytes: new Uint8Array(8) });
    } catch (err) {
      expect(err).toBeInstanceOf(PhotoUploadError);
      expect((err as PhotoUploadError).code).toBe("type_not_allowed");
    }
  });

  it("rejects anything over the size cap", () => {
    const bytes = jpegBytes(16);
    try {
      assertPhotoUpload({ type: "image/jpeg", size: PHOTO_MAX_BYTES + 1, bytes });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(PhotoUploadError);
      expect((err as PhotoUploadError).code).toBe("too_large");
    }
  });

  it("rejects a PNG magic number under an image/jpeg label", () => {
    try {
      assertPhotoUpload({ type: "image/jpeg", size: 32, bytes: pngBytes() });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(PhotoUploadError);
      expect((err as PhotoUploadError).code).toBe("type_mismatch");
    }
  });
});

describe("photoUrl", () => {
  it("returns /photos/<key> or null", () => {
    expect(photoUrl(null)).toBeNull();
    expect(photoUrl(undefined)).toBeNull();
    expect(photoUrl("")).toBeNull();
    expect(photoUrl(`vehicles/${RECORD_ID}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg`)).toBe(
      `/photos/vehicles/${RECORD_ID}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg`,
    );
  });
});

describe("isReadablePhotoKey / readPhotoKeyFromPathname", () => {
  const good = `vehicles/${RECORD_ID}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg`;

  it("accepts allow-listed prefixes", () => {
    expect(isReadablePhotoKey(good)).toBe(true);
    expect(isReadablePhotoKey(`chauffeurs/${RECORD_ID}/a.png`)).toBe(true);
    expect(isReadablePhotoKey(`reviews/${RECORD_ID}/a.webp`)).toBe(true);
    expect(isReadablePhotoKey(`staff/${RECORD_ID}/a.jpg`)).toBe(true);
  });

  it("returns 404-shape false for a key that does not start with an allow-listed prefix", () => {
    expect(isReadablePhotoKey("other/x.jpg")).toBe(false);
    expect(isReadablePhotoKey("vehicle/x.jpg")).toBe(false);
    expect(isReadablePhotoKey("")).toBe(false);
  });

  it("rejects .., a leading /, a backslash, or a percent-encoded separator", () => {
    expect(isReadablePhotoKey(`vehicles/../secret.jpg`)).toBe(false);
    expect(isReadablePhotoKey(`/vehicles/${RECORD_ID}/a.jpg`)).toBe(false);
    expect(isReadablePhotoKey(`vehicles\\${RECORD_ID}\\a.jpg`)).toBe(false);
    expect(isReadablePhotoKey(`vehicles/${RECORD_ID}%2F..%2Fetc.jpg`)).toBe(false);
    expect(readPhotoKeyFromPathname(`/photos/vehicles%2F${RECORD_ID}%2Fa.jpg`)).toBeNull();
    expect(readPhotoKeyFromPathname(`/photos/vehicles/${RECORD_ID}/%2e%2e/x.jpg`)).toBeNull();
    expect(readPhotoKeyFromPathname(`/photos/${good}`)).toBe(good);
  });
});

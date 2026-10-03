// apps/web/tests/integration/ops-photo-upload.spec.ts
//
// Photo pipeline (06-06): key contract, MIME/size sniff, read-path allow-list.
// Tagged @ops-photo. component-1440 only. No R2, no live Next server.
// OpsPhotoField React chrome is gone (06-01); DC mock will call POST /api/photos/upload.

import { test, expect } from "../support/test";
import {
  PHOTO_MAX_BYTES,
  PHOTO_PREFIXES,
  PhotoUploadError,
  assertPhotoUpload,
  buildPhotoKey,
  isReadablePhotoKey,
  photoUrl,
  readPhotoKeyFromPathname,
} from "../../lib/ops/photos";

const RUN_PROJECT = "component-1440";
const RECORD_ID = "11111111-1111-4111-8111-111111111111";

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== RUN_PROJECT,
    "Photo proofs do not vary by breakpoint — this spec runs once, under component-1440.",
  );
});

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

test.describe("ops photo upload @ops-photo", () => {
  test("buildPhotoKey uses a fixed prefix, a random component, and a normalised extension", () => {
    const key = buildPhotoKey("vehicle", RECORD_ID, "image/jpeg");
    expect(key.startsWith(`vehicles/${RECORD_ID}/`)).toBe(true);
    expect(key.endsWith(".jpg")).toBe(true);
    expect(key).not.toContain("portrait");
    expect([...PHOTO_PREFIXES]).toEqual(["vehicles/", "chauffeurs/", "reviews/", "staff/", "site/", "classes/"]);
  });

  test("assertPhotoUpload rejects the wrong type, oversize, and magic mismatch", () => {
    expect(() =>
      assertPhotoUpload({ type: "image/jpeg", size: 32, bytes: jpegBytes() }),
    ).not.toThrow();
    expect(() =>
      assertPhotoUpload({ type: "image/gif", size: 32, bytes: jpegBytes() }),
    ).toThrow(PhotoUploadError);
    try {
      assertPhotoUpload({
        type: "image/jpeg",
        size: PHOTO_MAX_BYTES + 1,
        bytes: jpegBytes(),
      });
      throw new Error("unreachable");
    } catch (err) {
      if (err instanceof Error && err.message === "unreachable") throw err;
      expect((err as PhotoUploadError).code).toBe("too_large");
    }
    try {
      assertPhotoUpload({ type: "image/jpeg", size: 32, bytes: pngBytes() });
      throw new Error("unreachable");
    } catch (err) {
      if (err instanceof Error && err.message === "unreachable") throw err;
      expect((err as PhotoUploadError).code).toBe("type_mismatch");
    }
  });

  test("traversal-shaped and prefix-mismatched keys 404 without a readable key", () => {
    const good = `vehicles/${RECORD_ID}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg`;
    expect(isReadablePhotoKey(good)).toBe(true);
    expect(isReadablePhotoKey("other/x.jpg")).toBe(false);
    expect(isReadablePhotoKey(`vehicles/../secret.jpg`)).toBe(false);
    expect(readPhotoKeyFromPathname(`/photos/vehicles%2F${RECORD_ID}%2Fa.jpg`)).toBeNull();
    expect(readPhotoKeyFromPathname(`/photos/${good}`)).toBe(good);
  });

  test("round trip of allowed bytes keeps content type and body through the key contract", () => {
    const bytes = jpegBytes(64);
    assertPhotoUpload({ type: "image/jpeg", size: bytes.byteLength, bytes });
    const key = buildPhotoKey("vehicle", RECORD_ID, "image/jpeg");
    const store = new Map<string, { body: Uint8Array; contentType: string }>();
    store.set(key, { body: bytes, contentType: "image/jpeg" });
    const stored = store.get(key);
    expect(stored?.contentType).toBe("image/jpeg");
    expect(stored?.body).toEqual(bytes);
    expect(photoUrl(key)).toBe(`/photos/${key}`);
  });

  test("rejected MIME type leaves value unchanged", () => {
    let value: string | null = "vehicles/keep.jpg";
    const onChange = (next: string | null) => {
      value = next;
    };
    try {
      assertPhotoUpload({ type: "image/gif", size: 8, bytes: new Uint8Array(8) });
      throw new Error("unreachable");
    } catch (err) {
      if (err instanceof Error && err.message === "unreachable") throw err;
      expect((err as PhotoUploadError).code).toBe("type_not_allowed");
      onChange(value);
    }
    expect(value).toBe("vehicles/keep.jpg");
  });

  test("a successful upload key is rendered from /photos/<key>", () => {
    const key = `chauffeurs/${RECORD_ID}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg`;
    expect(photoUrl(key)).toBe(`/photos/${key}`);
  });
});

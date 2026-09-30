import { describe, expect, it } from "vitest";
import { isVariantKey, readVariantWidth, smallPhotoUrl, variantKey } from "./variant";

const q = (s: string) => new URLSearchParams(s);

describe("photo variants", () => {
  it("accepts only the two fixed widths", () => {
    expect(readVariantWidth(q("w=640"))).toBe(640);
    expect(readVariantWidth(q("w=1280"))).toBe(1280);
    for (const bad of ["", "w=", "w=641", "w=0640", "w=64", "w=99999", "w=-640", "w=640px", "w=6e2", "width=640"]) {
      expect(readVariantWidth(q(bad)), bad).toBeNull();
    }
  });

  it("keeps the small version beside the original, never on it", () => {
    const key = "classes/abc/def.png";
    expect(variantKey(key, 640)).toBe("classes/abc/def.png.w640.webp");
    expect(variantKey(key, 640)).not.toBe(key);
    expect(isVariantKey(variantKey(key, 1280))).toBe(true);
    expect(isVariantKey(key)).toBe(false);
  });

  it("adds the width to a plain photo URL only", () => {
    expect(smallPhotoUrl("/photos/classes/a/b.png", 640)).toBe("/photos/classes/a/b.png?w=640");
    expect(smallPhotoUrl("/photos/classes/a/b.png?w=1280", 640)).toBe("/photos/classes/a/b.png?w=1280");
    expect(smallPhotoUrl("https://elsewhere.example/x.png", 640)).toBe("https://elsewhere.example/x.png");
    expect(smallPhotoUrl(null, 640)).toBe("");
    expect(smallPhotoUrl("", 640)).toBe("");
  });
});

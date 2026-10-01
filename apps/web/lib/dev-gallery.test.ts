import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { devGalleryEnabled, isDevGalleryPath } from "./dev-gallery";

describe("devGalleryEnabled", () => {
  it("is false in production whatever the flag or DEPLOY_ENV say", () => {
    expect(devGalleryEnabled({ NODE_ENV: "production", VAMOS_DEV_GALLERY: "1" })).toBe(false);
    expect(
      devGalleryEnabled({ NODE_ENV: "production", VAMOS_DEV_GALLERY: "1", DEPLOY_ENV: "staging" } as never),
    ).toBe(false);
  });
  it("is false without the flag", () => {
    expect(devGalleryEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(devGalleryEnabled({ NODE_ENV: "development", VAMOS_DEV_GALLERY: "0" })).toBe(false);
  });
  it("is true in dev and test with the flag", () => {
    expect(devGalleryEnabled({ NODE_ENV: "development", VAMOS_DEV_GALLERY: "1" })).toBe(true);
    expect(devGalleryEnabled({ NODE_ENV: "test", VAMOS_DEV_GALLERY: "1" })).toBe(true);
  });
  it("matches /dev paths only", () => {
    expect(isDevGalleryPath("/dev")).toBe(true);
    expect(isDevGalleryPath("/dev/home/services")).toBe(true);
    expect(isDevGalleryPath("/device")).toBe(false);
  });
  it("wrangler.jsonc never carries the flag", () => {
    const src = readFileSync(resolve(__dirname, "../wrangler.jsonc"), "utf8");
    expect(src).not.toContain("VAMOS_DEV_GALLERY");
  });
});

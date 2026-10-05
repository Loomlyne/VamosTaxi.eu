// apps/web/lib/photos/sealed-url.test.ts
//
// Security S10 (2026-10-05): the photo route answers a sealed class-photo address with the stored
// object, a 640 px variant with `?w=640`, and a private 404 for anything that does not open.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { sealClassPhotoKey } from "./sealed-url";

const SECRET = "test-quote-lock-secret-0123456789abcdef";
const KEY = "classes/5b1f3c2a-9d4e-4f6a-8b7c-1d2e3f4a5b6c/0975620a-98e5-4657-9986-24fd637bfc0a.png";
const asked: string[] = [];

function object(body: string, type: string) {
  return {
    body,
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    writeHttpMetadata: (h: Headers) => h.set("content-type", type),
  };
}

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({
    env: {
      QUOTE_LOCK_SECRET: SECRET,
      PHOTOS: {
        get: async (key: string) => {
          asked.push(key);
          if (key === KEY) return object("png-bytes", "image/png");
          if (key === `${KEY}.w640.webp`) return object("webp-640", "image/webp");
          return null;
        },
        put: async () => undefined,
      },
    },
  }),
}));

import { GET } from "../../app/photos/[key]/route";

describe("S10: the photo route opens sealed class-photo addresses", () => {
  beforeEach(() => {
    asked.length = 0;
  });

  it("serves the stored object behind a sealed address, immutable", async () => {
    const url = (await sealClassPhotoKey(SECRET, KEY))!;
    const res = await GET(new Request(`https://vamostaxi.site${url}`));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("png-bytes");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(asked).toEqual([KEY]);
  });

  it("keeps the ?w=640 small version working", async () => {
    const url = (await sealClassPhotoKey(SECRET, KEY))!;
    const res = await GET(new Request(`https://vamostaxi.site${url}?w=640`));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("webp-640");
    expect(asked).toEqual([`${KEY}.w640.webp`]);
  });

  it("answers a private 404 for a sealed address made with another secret, never touching R2", async () => {
    const url = (await sealClassPhotoKey("another-secret", KEY))!;
    const res = await GET(new Request(`https://vamostaxi.site${url}`));
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(asked).toEqual([]);
  });

  it("the plain key still works for the dashboard screens", async () => {
    const res = await GET(new Request(`https://vamostaxi.site/photos/${KEY}`));
    expect(res.status).toBe(200);
    expect(asked).toEqual([KEY]);
  });
});

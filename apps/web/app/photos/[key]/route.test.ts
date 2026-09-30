import { beforeEach, describe, expect, it, vi } from "vitest";

// Quick 260930-cps: /photos/<key>?w=640|1280 answers a WebP made once and kept beside the original.

type Stored = { bytes: Uint8Array; contentType: string };
const bucket = new Map<string, Stored>();
const calls = { transform: [] as unknown[], put: [] as string[] };
let imagesMode: "ok" | "throw" | "bigger" | "missing" = "ok";

const PHOTOS = {
  get: vi.fn(async (key: string) => {
    const hit = bucket.get(key);
    if (!hit) return null;
    return {
      body: new Response(hit.bytes).body,
      arrayBuffer: async () => hit.bytes.buffer.slice(hit.bytes.byteOffset, hit.bytes.byteOffset + hit.bytes.byteLength),
      writeHttpMetadata: (h: Headers) => h.set("content-type", hit.contentType),
    };
  }),
  put: vi.fn(async (key: string, value: ArrayBuffer, opts: { httpMetadata: { contentType: string } }) => {
    calls.put.push(key);
    bucket.set(key, { bytes: new Uint8Array(value), contentType: opts.httpMetadata.contentType });
  }),
};

const IMAGES = {
  input: () => ({
    transform: (t: unknown) => {
      calls.transform.push(t);
      return {
        output: async () => {
          if (imagesMode === "throw") throw new Error("images refused");
          const size = imagesMode === "bigger" ? 5000 : 40;
          return { response: () => new Response(new Uint8Array(size).fill(7)) };
        },
      };
    },
  }),
};

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: imagesMode === "missing" ? { PHOTOS } : { PHOTOS, IMAGES } }),
}));

import { GET } from "./route";

const KEY = "classes/abc/def.png";
const ORIGINAL = new Uint8Array(1000).fill(1);
const get = (path: string) => GET(new Request(`https://vamostaxi.site${path}`));
const size = async (res: Response) => (await res.arrayBuffer()).byteLength;

beforeEach(() => {
  bucket.clear();
  bucket.set(KEY, { bytes: ORIGINAL, contentType: "image/png" });
  calls.transform.length = 0;
  calls.put.length = 0;
  imagesMode = "ok";
});

describe("GET /photos/<key>", () => {
  it("without ?w= serves the original, immutable, and never calls the image tool", async () => {
    const res = await get(`/photos/${KEY}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await size(res)).toBe(1000);
    expect(calls.transform).toEqual([]);
    expect(calls.put).toEqual([]);
  });

  it("?w=640 makes the WebP once, keeps it beside the original and reuses it", async () => {
    const first = await get(`/photos/${KEY}?w=640`);
    expect(first.headers.get("content-type")).toBe("image/webp");
    expect(first.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await size(first)).toBe(40);
    expect(calls.transform).toEqual([{ width: 640, fit: "scale-down" }]);
    expect(calls.put).toEqual([`${KEY}.w640.webp`]);

    const second = await get(`/photos/${KEY}?w=640`);
    expect(second.headers.get("content-type")).toBe("image/webp");
    expect(await size(second)).toBe(40);
    expect(calls.transform).toHaveLength(1);
    expect(calls.put).toHaveLength(1);
    // the original is untouched
    expect(bucket.get(KEY)!.bytes).toBe(ORIGINAL);
  });

  it("a width that is not 640 or 1280 gets the original and makes nothing", async () => {
    for (const w of ["641", "100", "99999", "abc", ""]) {
      const res = await get(`/photos/${KEY}?w=${w}`);
      expect(res.headers.get("content-type"), w).toBe("image/png");
      expect(res.headers.get("cache-control"), w).toBe("public, max-age=31536000, immutable");
    }
    expect(calls.transform).toEqual([]);
    expect(calls.put).toEqual([]);
  });

  for (const mode of ["throw", "bigger", "missing"] as const) {
    it(`when the image tool is ${mode}, the original is served for a short time and nothing is stored`, async () => {
      imagesMode = mode;
      const res = await get(`/photos/${KEY}?w=1280`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      expect(res.headers.get("cache-control")).toBe("public, max-age=300");
      expect(await size(res)).toBe(1000);
      expect(calls.put).toEqual([]);
    });
  }

  it("a stored small version asked for by its own key is served as is, never resized again", async () => {
    await get(`/photos/${KEY}?w=640`);
    const res = await get(`/photos/${KEY}.w640.webp?w=1280`);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(calls.transform).toHaveLength(1);
    expect(calls.put).toEqual([`${KEY}.w640.webp`]);
  });

  it("an unknown key or a key outside the photo folders is 404, with or without ?w=", async () => {
    expect((await get("/photos/classes/abc/nope.png?w=640")).status).toBe(404);
    expect((await get("/photos/secrets/x.png?w=640")).status).toBe(404);
    expect((await get("/photos/classes/..%2Fx.png")).status).toBe(404);
    expect(calls.transform).toEqual([]);
  });
});

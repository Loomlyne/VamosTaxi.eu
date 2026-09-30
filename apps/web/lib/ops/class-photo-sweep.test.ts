import { describe, expect, it, vi } from "vitest";
import { photoOriginalOf, planClassPhotoSweep, sweepClassPhotos, CLASS_PHOTO_GRACE_MS } from "./class-photo-sweep";

const NOW = Date.parse("2026-10-01T12:00:00Z");
const old = new Date(NOW - 3 * CLASS_PHOTO_GRACE_MS);
const fresh = new Date(NOW - 60_000);
const A = "classes/aaaa/old.png", B = "classes/aaaa/new.png", C = "classes/cccc/c.png";

describe("class photo sweep", () => {
  it("knows the original of a small copy", () => {
    expect(photoOriginalOf(`${A}.w640.webp`)).toBe(A);
    expect(photoOriginalOf(`${A}.w1280.webp`)).toBe(A);
    expect(photoOriginalOf(A)).toBe(A);
  });

  it("a replaced photo goes with both small copies; the one in use and its copies stay", () => {
    const stored = [A, `${A}.w640.webp`, `${A}.w1280.webp`, B, `${B}.w640.webp`].map((key) => ({ key, uploaded: old }));
    expect(planClassPhotoSweep(stored, new Set([B]), NOW).sort()).toEqual([A, `${A}.w1280.webp`, `${A}.w640.webp`]);
  });

  it("never touches a key any class row points to, active or hidden", () => {
    const stored = [A, C].map((key) => ({ key, uploaded: old }));
    expect(planClassPhotoSweep(stored, new Set([A, C]), NOW)).toEqual([]);
  });

  it("keeps a photo uploaded in the last 24 hours and its small copy (a Save may be on its way)", () => {
    const stored = [{ key: A, uploaded: fresh }, { key: `${A}.w640.webp`, uploaded: fresh }];
    expect(planClassPhotoSweep(stored, new Set(), NOW)).toEqual([]);
  });

  it("deletes a small copy whose original is already gone", () => {
    expect(planClassPhotoSweep([{ key: `${A}.w640.webp`, uploaded: fresh }], new Set(), NOW)).toEqual([`${A}.w640.webp`]);
  });

  it("only ever looks at class photos", () => {
    const stored = ["vehicles/x/y.png", "chauffeurs/x/y.png", "site/hero.jpg"].map((key) => ({ key, uploaded: old }));
    expect(planClassPhotoSweep(stored, new Set(), NOW)).toEqual([]);
  });

  it("lists every page of classes/ and deletes in one call per 1000 keys", async () => {
    const pages = [
      { objects: [{ key: A, uploaded: old }], truncated: true, cursor: "c1" },
      { objects: [{ key: B, uploaded: old }, { key: `${A}.w640.webp`, uploaded: old }], truncated: false },
    ];
    const list = vi.fn(async (_o: { prefix: string; cursor?: string; limit?: number }) => pages.shift()!);
    const del = vi.fn(async () => undefined);
    const bucket = { list, delete: del } as unknown as Parameters<typeof sweepClassPhotos>[0];
    const deleted = await sweepClassPhotos(bucket, new Set([B]), NOW);
    expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls[0]![0]).toMatchObject({ prefix: "classes/" });
    expect(list.mock.calls[1]![0]).toMatchObject({ prefix: "classes/", cursor: "c1" });
    expect(deleted.sort()).toEqual([A, `${A}.w640.webp`]);
    expect(del).toHaveBeenCalledTimes(1);
  });

  it("a deleted class: only its own folder, whatever the age", async () => {
    const list = vi.fn(async (_o: { prefix: string }) => ({ objects: [{ key: "classes/dddd/x.png", uploaded: fresh }, { key: "classes/dddd/x.png.w640.webp", uploaded: fresh }], truncated: false }));
    const del = vi.fn(async (_k: string[]) => undefined);
    const bucket = { list, delete: del } as unknown as Parameters<typeof sweepClassPhotos>[0];
    const deleted = await sweepClassPhotos(bucket, new Set([B]), NOW, { prefix: "classes/dddd/", graceMs: 0 });
    expect(list.mock.calls[0]![0]).toMatchObject({ prefix: "classes/dddd/" });
    expect(deleted.sort()).toEqual(["classes/dddd/x.png", "classes/dddd/x.png.w640.webp"]);
  });

  it("deletes nothing when everything is in use", async () => {
    const del = vi.fn(async () => undefined);
    const bucket = { list: async () => ({ objects: [{ key: B, uploaded: old }], truncated: false }), delete: del } as unknown as Parameters<typeof sweepClassPhotos>[0];
    expect(await sweepClassPhotos(bucket, new Set([B]), NOW)).toEqual([]);
    expect(del).not.toHaveBeenCalled();
  });
});

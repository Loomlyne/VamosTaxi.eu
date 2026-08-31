// apps/web/lib/content/messages.test.ts
//
// unflattenKeys is the inverse of generate-seed / check-i18n flatten.
// loadMessagesFromDb: JSON kill switch, NULL omission, loud fallback.
// No Hyperdrive, no Docker.

import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../i18n/messages/en.json";

const publicSql = vi.fn();
const getCloudflareContext = vi.fn();
const log = vi.fn();

vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

vi.mock("../db/public", () => ({
  publicSql: (...args: unknown[]) => publicSql(...args),
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => getCloudflareContext(),
}));

vi.mock("../logger", () => ({
  log: (...args: unknown[]) => log(...args),
}));

import {
  CONTENT_SOURCE,
  KeyPrefixCollisionError,
  loadMessagesFromDb,
  unflattenKeys,
} from "./messages";

function flatten(obj: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (prefix: string, value: unknown) => {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (const k of Object.keys(value as Record<string, unknown>)) {
        walk(`${prefix}.${k}`, (value as Record<string, unknown>)[k]);
      }
      return;
    }
    out[prefix] = value as string;
  };
  for (const topKey of Object.keys(obj)) {
    if (topKey.startsWith("$")) continue;
    walk(topKey, obj[topKey]);
  }
  return out;
}

function stripMeta(messages: Record<string, unknown>): Record<string, unknown> {
  if (!("$meta" in messages)) return messages;
  const { $meta: _meta, ...rest } = messages;
  return rest;
}

describe("unflattenKeys", () => {
  it("nests dotted keys", () => {
    expect(unflattenKeys({ "a.b": "x", "a.c.d": "y" })).toEqual({
      a: { b: "x", c: { d: "y" } },
    });
  });

  it("round-trips the current en.json minus $meta", () => {
    const withoutMeta = stripMeta(en as Record<string, unknown>);
    const flat = flatten(withoutMeta);
    expect(unflattenKeys(flat)).toEqual(withoutMeta);
  });

  it("keeps dotted JSON keys as siblings of a leaf prefix (quote.error vs quote.error.min_advance)", () => {
    expect(unflattenKeys({ "a.b": "leaf", "a.b.c": "child" })).toEqual({
      a: { b: "leaf", "b.c": "child" },
    });
  });

  it("throws KeyPrefixCollisionError on an empty segment", () => {
    expect(() => unflattenKeys({ "a..b": "x" })).toThrow(KeyPrefixCollisionError);
  });

  it("is the inverse of flatten: flattening the unflattened en.json map returns the same leaves", () => {
    const withoutMeta = stripMeta(en as Record<string, unknown>);
    const flat = flatten(withoutMeta);
    expect(flatten(unflattenKeys(flat))).toEqual(flat);
  });
});

describe("CONTENT_SOURCE", () => {
  it("defaults to json until the swap is proven", () => {
    expect(CONTENT_SOURCE).toBe("json");
  });
});

describe("loadMessagesFromDb", () => {
  beforeEach(() => {
    publicSql.mockReset();
    getCloudflareContext.mockReset();
    log.mockReset();
    delete process.env.CONTENT_SOURCE;
  });

  it("returns the JSON import without opening a connection when CONTENT_SOURCE is json", async () => {
    process.env.CONTENT_SOURCE = "json";
    getCloudflareContext.mockReturnValue({ env: { CONTENT_SOURCE: "json" } });

    const messages = await loadMessagesFromDb("en");

    expect(publicSql).not.toHaveBeenCalled();
    expect(messages).toEqual(en);
  });

  it("returns the JSON import without opening a connection when CONTENT_SOURCE is unset", async () => {
    getCloudflareContext.mockImplementation(() => {
      throw new Error("no cloudflare context");
    });

    const messages = await loadMessagesFromDb("de");

    expect(publicSql).not.toHaveBeenCalled();
    expect(messages).toEqual(
      (await import("../../i18n/messages/de.json")).default,
    );
  });

  it("omits keys whose locale column is NULL and never emits null or empty string", async () => {
    process.env.CONTENT_SOURCE = "db";
    getCloudflareContext.mockReturnValue({
      env: { CONTENT_SOURCE: "db", HYPERDRIVE: { connectionString: "postgres://unused" } },
    });
    const sql = vi.fn().mockResolvedValue([
      { key: "a.b", en: "English", de: "Deutsch", fr: null, ar: null },
      { key: "a.c", en: "Only EN", de: null, fr: null, ar: null },
    ]);
    publicSql.mockReturnValue(sql);

    const de = await loadMessagesFromDb("de");
    const fr = await loadMessagesFromDb("fr");

    expect(de).toEqual({ a: { b: "Deutsch" } });
    expect(fr).toEqual({});
    expect(JSON.stringify(de)).not.toMatch(/null/);
    expect(JSON.stringify(de)).not.toMatch(/""/);
    expect("$meta" in de).toBe(false);
    expect("$meta" in fr).toBe(false);
  });

  it("falls back to JSON and logs once when the query throws", async () => {
    process.env.CONTENT_SOURCE = "db";
    getCloudflareContext.mockReturnValue({
      env: { CONTENT_SOURCE: "db", HYPERDRIVE: { connectionString: "postgres://unused" } },
    });
    const sql = vi.fn().mockRejectedValue(new Error("connection refused"));
    publicSql.mockReturnValue(sql);

    const messages = await loadMessagesFromDb("en");

    expect(messages).toEqual(en);
    expect(log).toHaveBeenCalledTimes(1);
    const first = log.mock.calls[0];
    expect(first?.[0]).toBe("error");
    expect(first?.[3]).toMatchObject({
      scope: "i18n",
      event: "content_strings_fallback",
      cause: "query_failed",
    });
  });

  it("falls back to JSON and logs when the query returns zero rows", async () => {
    process.env.CONTENT_SOURCE = "db";
    getCloudflareContext.mockReturnValue({
      env: { CONTENT_SOURCE: "db", HYPERDRIVE: { connectionString: "postgres://unused" } },
    });
    const sql = vi.fn().mockResolvedValue([]);
    publicSql.mockReturnValue(sql);

    const messages = await loadMessagesFromDb("fr");

    expect(messages).toEqual((await import("../../i18n/messages/fr.json")).default);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[3]).toMatchObject({
      scope: "i18n",
      event: "content_strings_fallback",
      cause: "empty_result",
    });
  });
});

// apps/web/lib/geo/session.test.ts
//
// In-memory KV proofs for the suggest→retrieve session gate (D-14, D-15).
// No Mapbox, no network.

import { describe, expect, it } from "vitest";
import {
  SESSION_TTL_SECONDS,
  hasSeenSession,
  publicSuggestion,
  rememberSession,
  sessionBucket,
  type PublicSuggestion,
} from "./session";

const TOKEN_A = "00000000-0000-4000-8000-00000000000a";
const TOKEN_B = "00000000-0000-4000-8000-00000000000b";

type Stored = { value: string; expiresAt: number };

class MemoryKV {
  readonly puts: { key: string; value: string; expirationTtl?: number }[] = [];
  private readonly store = new Map<string, Stored>();
  nowMs = 1_000_000;

  async get(key: string): Promise<string | null> {
    const row = this.store.get(key);
    if (!row) return null;
    if (row.expiresAt <= this.nowMs) {
      this.store.delete(key);
      return null;
    }
    return row.value;
  }

  async put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void> {
    this.puts.push({ key, value, expirationTtl: options?.expirationTtl });
    const ttl = options?.expirationTtl ?? 0;
    this.store.set(key, { value, expiresAt: this.nowMs + ttl * 1000 });
  }
}

class ThrowingKV {
  async get(): Promise<string | null> {
    throw new Error("kv down");
  }
  async put(): Promise<void> {
    throw new Error("kv down");
  }
}

describe("session gate", () => {
  it("remember-then-see is true for the same bucket", async () => {
    const kv = new MemoryKV();
    const env = { QUOTE_ABUSE: kv as unknown as KVNamespace };
    await rememberSession(env, TOKEN_A, "1.2.3.4");
    expect(await hasSeenSession(env, TOKEN_A, "1.2.3.4")).toBe(true);
  });

  it("a different bucket is false", async () => {
    const kv = new MemoryKV();
    const env = { QUOTE_ABUSE: kv as unknown as KVNamespace };
    await rememberSession(env, TOKEN_A, "1.2.3.4");
    expect(await hasSeenSession(env, TOKEN_A, "5.6.7.8")).toBe(false);
    expect(await hasSeenSession(env, TOKEN_B, "1.2.3.4")).toBe(false);
  });

  it("an expired record is false", async () => {
    const kv = new MemoryKV();
    const env = { QUOTE_ABUSE: kv as unknown as KVNamespace };
    await rememberSession(env, TOKEN_A, "1.2.3.4");
    expect(kv.puts[0]?.expirationTtl).toBe(SESSION_TTL_SECONDS);
    kv.nowMs += SESSION_TTL_SECONDS * 1000 + 1;
    expect(await hasSeenSession(env, TOKEN_A, "1.2.3.4")).toBe(false);
  });

  it("a throwing KV is false (fail closed)", async () => {
    const env = { QUOTE_ABUSE: new ThrowingKV() as unknown as KVNamespace };
    expect(await hasSeenSession(env, TOKEN_A, "1.2.3.4")).toBe(false);
  });

  it("unavailable KV is false", async () => {
    expect(await hasSeenSession({}, TOKEN_A, "1.2.3.4")).toBe(false);
  });

  it("the stored key contains neither the raw UUID nor any Mapbox field", async () => {
    const kv = new MemoryKV();
    const env = { QUOTE_ABUSE: kv as unknown as KVNamespace };
    await rememberSession(env, TOKEN_A, "1.2.3.4");
    expect(kv.puts).toHaveLength(1);
    const { key, value } = kv.puts[0]!;
    expect(key).not.toContain(TOKEN_A);
    expect(key).not.toContain("mapbox");
    expect(key).toMatch(/^geo:session:1\.2\.3\.4:[0-9a-f]{64}$/);
    expect(value).toBe("1");
    expect(value).not.toContain("mapbox_id");
    expect(value).not.toContain("coordinates");
    expect(JSON.stringify(kv.puts[0])).not.toMatch(/lng|lat|geometry|full_address/);
  });
});

describe("publicSuggestion", () => {
  it("strips every coordinate field rather than trusting the mapper", () => {
    const leaked = {
      mapbox_id: "sbx.fixture.zurich-hb",
      name: "Zürich HB",
      address: "Museumstrasse 1",
      context: "Zürich, Switzerland",
      lng: 8.5417,
      lat: 47.3769,
      longitude: 8.5417,
      latitude: 47.3769,
      coordinates: { longitude: 8.5417, latitude: 47.3769 },
    };
    const publicHit = publicSuggestion(leaked as PublicSuggestion);
    expect(publicHit).toEqual({
      mapbox_id: "sbx.fixture.zurich-hb",
      name: "Zürich HB",
      address: "Museumstrasse 1",
      context: "Zürich, Switzerland",
    });
    expect(publicHit).not.toHaveProperty("lng");
    expect(publicHit).not.toHaveProperty("lat");
    expect(publicHit).not.toHaveProperty("longitude");
    expect(publicHit).not.toHaveProperty("latitude");
    expect(publicHit).not.toHaveProperty("coordinates");
    const serialized = JSON.stringify(publicHit);
    expect(serialized).not.toMatch(/"lng"/);
    expect(serialized).not.toMatch(/"lat"/);
    expect(serialized).not.toMatch(/"coordinates"/);
  });
});

describe("sessionBucket", () => {
  it("prefers cf-connecting-ip over x-forwarded-for", () => {
    const request = new Request("https://vamos.example/api/geo/suggest", {
      headers: {
        "cf-connecting-ip": "1.2.3.4",
        "x-forwarded-for": "9.9.9.9, 8.8.8.8",
      },
    });
    expect(sessionBucket(request)).toBe("1.2.3.4");
  });

  it("falls back to unknown when no client ip header is present", () => {
    const request = new Request("https://vamos.example/api/geo/suggest");
    expect(sessionBucket(request)).toBe("unknown");
  });
});

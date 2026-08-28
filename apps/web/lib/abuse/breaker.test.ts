// apps/web/lib/abuse/breaker.test.ts
//
// Daily Mapbox unit breaker (D-37, D-54). KV is an in-memory double —
// no Cloudflare account, no network, no invented franc ceiling.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  breakerOpen,
  countMapboxUnit,
  MAPBOX_BUDGET_KEY_PREFIX,
} from "./breaker";

class MemoryKV {
  readonly store = new Map<string, string>();
  readonly puts: Array<{ key: string; value: string }> = [];

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.puts.push({ key, value });
    this.store.set(key, value);
  }
}

class ThrowingKV {
  async get(): Promise<string | null> {
    throw new Error("kv unavailable");
  }
  async put(): Promise<void> {
    throw new Error("kv unavailable");
  }
}

const SENTINEL = "5";
const BEFORE_MIDNIGHT = Date.parse("2026-08-28T23:59:59.000Z");
const AFTER_MIDNIGHT = Date.parse("2026-08-29T00:00:00.000Z");

describe("MAPBOX_BUDGET_KEY_PREFIX", () => {
  it("is the UTC day key prefix from D-37", () => {
    expect(MAPBOX_BUDGET_KEY_PREFIX).toBe("quote:mapbox-budget:");
  });
});

describe("breakerOpen", () => {
  it("is false when the day's counter is below the sentinel", async () => {
    const kv = new MemoryKV();
    kv.store.set(`${MAPBOX_BUDGET_KEY_PREFIX}2026-08-28`, "4");
    const open = await breakerOpen(
      { QUOTE_ABUSE: kv as unknown as KVNamespace, MAPBOX_DAILY_UNIT_SENTINEL: SENTINEL },
      BEFORE_MIDNIGHT,
    );
    expect(open).toBe(false);
  });

  it("is true at exactly the sentinel", async () => {
    const kv = new MemoryKV();
    kv.store.set(`${MAPBOX_BUDGET_KEY_PREFIX}2026-08-28`, "5");
    const open = await breakerOpen(
      { QUOTE_ABUSE: kv as unknown as KVNamespace, MAPBOX_DAILY_UNIT_SENTINEL: SENTINEL },
      BEFORE_MIDNIGHT,
    );
    expect(open).toBe(true);
  });

  it("is true above the sentinel", async () => {
    const kv = new MemoryKV();
    kv.store.set(`${MAPBOX_BUDGET_KEY_PREFIX}2026-08-28`, "6");
    const open = await breakerOpen(
      { QUOTE_ABUSE: kv as unknown as KVNamespace, MAPBOX_DAILY_UNIT_SENTINEL: SENTINEL },
      BEFORE_MIDNIGHT,
    );
    expect(open).toBe(true);
  });

  it("unset sentinel returns false and logs once — not a zero ceiling", async () => {
    const kv = new MemoryKV();
    const emit = vi.fn();
    const first = await breakerOpen(
      { QUOTE_ABUSE: kv as unknown as KVNamespace },
      BEFORE_MIDNIGHT,
      emit,
    );
    const second = await breakerOpen(
      { QUOTE_ABUSE: kv as unknown as KVNamespace },
      BEFORE_MIDNIGHT,
      emit,
    );
    expect(first).toBe(false);
    expect(second).toBe(false);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("non-numeric sentinel returns false and logs a warning", async () => {
    const kv = new MemoryKV();
    kv.store.set(`${MAPBOX_BUDGET_KEY_PREFIX}2026-08-28`, "99");
    const emit = vi.fn();
    const open = await breakerOpen(
      {
        QUOTE_ABUSE: kv as unknown as KVNamespace,
        MAPBOX_DAILY_UNIT_SENTINEL: "not-a-number",
      },
      BEFORE_MIDNIGHT,
      emit,
    );
    expect(open).toBe(false);
    expect(emit).toHaveBeenCalled();
    const level = emit.mock.calls[0]?.[0];
    expect(level).toBe("warn");
  });
});

describe("countMapboxUnit", () => {
  it("writes to QUOTE_ABUSE on quote:mapbox-budget:YYYY-MM-DD and never GEO_CACHE", async () => {
    const abuse = new MemoryKV();
    const geoPuts: string[] = [];
    const env = {
      QUOTE_ABUSE: abuse as unknown as KVNamespace,
      GEO_CACHE: {
        put: async (key: string) => {
          geoPuts.push(key);
        },
      } as unknown as KVNamespace,
    };
    await countMapboxUnit(env, BEFORE_MIDNIGHT);
    expect(abuse.puts.length).toBe(1);
    expect(abuse.puts[0]!.key).toBe(`${MAPBOX_BUDGET_KEY_PREFIX}2026-08-28`);
    expect(abuse.store.get(`${MAPBOX_BUDGET_KEY_PREFIX}2026-08-28`)).toBe("1");
    expect(geoPuts).toEqual([]);
  });

  it("on a throwing KV does not throw — the count is best-effort", async () => {
    await expect(
      countMapboxUnit(
        { QUOTE_ABUSE: new ThrowingKV() as unknown as KVNamespace },
        BEFORE_MIDNIGHT,
      ),
    ).resolves.toBeUndefined();
  });

  it("day key rolls at UTC midnight, proven by instants either side", async () => {
    const kv = new MemoryKV();
    const env = { QUOTE_ABUSE: kv as unknown as KVNamespace };
    await countMapboxUnit(env, BEFORE_MIDNIGHT);
    await countMapboxUnit(env, AFTER_MIDNIGHT);
    expect(kv.store.get(`${MAPBOX_BUDGET_KEY_PREFIX}2026-08-28`)).toBe("1");
    expect(kv.store.get(`${MAPBOX_BUDGET_KEY_PREFIX}2026-08-29`)).toBe("1");
    expect(kv.puts.map((p) => p.key)).toEqual([
      `${MAPBOX_BUDGET_KEY_PREFIX}2026-08-28`,
      `${MAPBOX_BUDGET_KEY_PREFIX}2026-08-29`,
    ]);
  });
});

describe("D-54 / D-37 source-text rules", () => {
  it("executable source has no GEO_CACHE and no currency / francs", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "breaker.ts"), "utf8");
    const executable = src
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n");
    expect(executable).not.toMatch(/GEO_CACHE/);
    expect(executable).not.toMatch(/CHF/);
    expect(executable).not.toMatch(/francs/);
    expect(executable).not.toMatch(/\$/);
  });
});

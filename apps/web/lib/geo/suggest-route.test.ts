// apps/web/lib/geo/suggest-route.test.ts
//
// A query that is only spaces is not a query: no Mapbox call, no unit in the
// daily breaker, no session recorded (the home box already trims before it asks).

import { afterEach, describe, expect, it, vi } from "vitest";

const kvStore = vi.hoisted(() => new Map<string, string>());

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({
    env: {
      MAPBOX_TOKEN: "test-mapbox-token-not-a-credential",
      QUOTE_ABUSE: {
        get: async (key: string) => kvStore.get(key) ?? null,
        put: async (key: string, value: string) => {
          kvStore.set(key, value);
        },
      },
    },
  }),
}));

import { GET } from "@/app/api/geo/suggest/route";

const SESSION = "00000000-0000-4000-8000-000000000001";

function suggestRequest(q: string): Request {
  const url = new URL("https://vamos.example/api/geo/suggest");
  url.searchParams.set("q", q);
  url.searchParams.set("session_token", SESSION);
  url.searchParams.set("locale", "en");
  return new Request(url);
}

afterEach(() => {
  kvStore.clear();
  vi.unstubAllGlobals();
});

describe("GET /api/geo/suggest short queries", () => {
  it("answers an empty list for two spaces without a Mapbox call, a counted unit or a session", async () => {
    const fetchFn = vi.fn(async () => Response.json({ suggestions: [] }));
    vi.stubGlobal("fetch", fetchFn);
    const response = await GET(suggestRequest("  "));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, suggestions: [] });
    expect(fetchFn).not.toHaveBeenCalled();
    expect([...kvStore.keys()]).toEqual([]);
  });

  it("still asks Mapbox and counts one unit for a real two-letter query", async () => {
    const fetchFn = vi.fn(async () => Response.json({ suggestions: [] }));
    vi.stubGlobal("fetch", fetchFn);
    const response = await GET(suggestRequest("zu"));
    expect(response.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect([...kvStore.entries()].some(([k, v]) => k.startsWith("quote:mapbox-budget:") && v === "1")).toBe(true);
  });
});

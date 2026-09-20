// apps/web/lib/quote/errors.test.ts
//
// Vocabulary proofs: table shape, oracle-free pairings, body allow-list, and
// every i18n_key resolving in en.json (table and dictionary are one thing).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  QUOTE_ERRORS,
  quoteErrorResponse,
  type QuoteAction,
  type QuoteErrorCode,
} from "./errors";

const CONTRACT_CODES: QuoteErrorCode[] = [
  "untrusted_input",
  "malformed",
  "mode_not_offered",
  "place_unresolved",
  "same_place",
  "place_out_of_box",
  "out_of_service_area",
  "service_area_undefined",
  "min_advance",
  "route_unavailable",
  "extras_max_stops",
  "extras_max_child_seats",
  "no_settings_version",
  "rate_limited",
  "turnstile_required",
  "retrieve_without_suggest",
  "temporarily_unavailable",
  "provider_unavailable",
  "not_found",
  "quote_not_found",
  "quote_expired",
  "pricing_not_live",
  "price_changed",
  "engine_changed",
  "coupon_no_longer_valid",
  "partially_priced_class",
];

const ALLOWED_ACTIONS: ReadonlySet<QuoteAction> = new Set([
  "retry",
  "requote",
  "reload_challenge",
  "enter_time",
]);

const BODY_ALLOW = new Set(["ok", "error", "i18n_key", "action", "params"]);

function flattenKeys(
  obj: Record<string, unknown>,
  prefix = "",
): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (k === "$meta") continue;
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      out.push(...flattenKeys(v as Record<string, unknown>, path));
    } else {
      out.push(path);
    }
  }
  return out;
}

function loadEnKeys(): Set<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  const enPath = join(here, "../../i18n/messages/en.json");
  const en = JSON.parse(readFileSync(enPath, "utf8")) as Record<
    string,
    unknown
  >;
  return new Set(flattenKeys(en));
}

describe("QUOTE_ERRORS table", () => {
  it("has exactly one entry per contract row — no extra, no missing", () => {
    const keys = Object.keys(QUOTE_ERRORS).sort();
    expect(keys).toEqual([...CONTRACT_CODES].sort());
    expect(keys).toHaveLength(26);
  });

  it("every non-null action is one of retry|requote|reload_challenge|enter_time", () => {
    for (const [code, entry] of Object.entries(QUOTE_ERRORS)) {
      if (entry.action !== null) {
        expect(ALLOWED_ACTIONS.has(entry.action), `${code} action`).toBe(true);
      }
    }
  });

  it("quote_not_found and quote_expired share quote.error.expired (D-28)", () => {
    expect(QUOTE_ERRORS.quote_not_found.i18n_key).toBe("quote.error.expired");
    expect(QUOTE_ERRORS.quote_expired.i18n_key).toBe("quote.error.expired");
    expect(QUOTE_ERRORS.quote_not_found.status).toBe(404);
    expect(QUOTE_ERRORS.quote_expired.status).toBe(409);
  });

  it("generic quote.error covers internal/abuse codes", () => {
    for (const code of [
      "untrusted_input",
      "retrieve_without_suggest",
      "no_settings_version",
      "partially_priced_class",
    ] as const) {
      expect(QUOTE_ERRORS[code].i18n_key).toBe("quote.error");
    }
  });

  it("every i18n_key exists in en.json (reads the file, not a hand list)", () => {
    const keys = loadEnKeys();
    for (const [code, entry] of Object.entries(QUOTE_ERRORS)) {
      expect(
        keys.has(entry.i18n_key),
        `${code} → ${entry.i18n_key} missing in en.json`,
      ).toBe(true);
    }
  });
});

describe("quoteErrorResponse", () => {
  it("quote_expired → 409 JSON body with allow-listed keys only", async () => {
    const res = quoteErrorResponse("quote_expired");
    expect(res.status).toBe(409);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("cache-control")).toMatch(/no-store/i);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.error).toBe("quote_expired");
    expect(body.i18n_key).toBe("quote.error.expired");
    expect(body.action).toBe("requote");
    for (const key of Object.keys(body)) {
      expect(BODY_ALLOW.has(key), `unexpected body key ${key}`).toBe(true);
    }
    expect(body).not.toHaveProperty("message");
    expect(body).not.toHaveProperty("detail");
    expect(body).not.toHaveProperty("description");
  });

  it("carries params for min_advance without interpolating", async () => {
    const res = quoteErrorResponse("min_advance", { params: { minutes: 120 } });
    expect(res.status).toBe(422);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.params).toEqual({ minutes: 120 });
    expect(body.i18n_key).toBe("quote.error.min_advance");
  });

  it("omits action when null", async () => {
    const body = (await quoteErrorResponse("untrusted_input").json()) as Record<
      string,
      unknown
    >;
    expect(body).not.toHaveProperty("action");
  });

  it("mode_not_offered is 422 with product key", async () => {
    const res = quoteErrorResponse("mode_not_offered");
    expect(res.status).toBe(422);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.i18n_key).toBe("quote.error.mode_not_offered");
    expect(body.error).toBe("mode_not_offered");
  });

  it("turnstile_required carries reload_challenge", async () => {
    const body = (await quoteErrorResponse("turnstile_required").json()) as Record<
      string,
      unknown
    >;
    expect(body.action).toBe("reload_challenge");
  });

  it("provider_unavailable and not_found carry enter_time", () => {
    expect(QUOTE_ERRORS.provider_unavailable.action).toBe("enter_time");
    expect(QUOTE_ERRORS.not_found.action).toBe("enter_time");
    expect(QUOTE_ERRORS.provider_unavailable.status).toBe(503);
    expect(QUOTE_ERRORS.not_found.status).toBe(404);
  });

  it("quote_not_found is 404 with same key as expired", async () => {
    const res = quoteErrorResponse("quote_not_found");
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.i18n_key).toBe("quote.error.expired");
    expect(body.action).toBe("requote");
  });
});

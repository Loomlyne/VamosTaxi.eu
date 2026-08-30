// apps/web/lib/abuse/breaker.ts
//
// D-37 / D-54: daily Mapbox unit breaker. Counts calls, not francs, and
// trips rather than logs.
//
// Namespace is QUOTE_ABUSE. Mixing a daily counter into a cache means one
// evicts the other — the cache binding is a different TTL regime and is
// never written here.
//
// D-37: every Mapbox call counts, geo included. The four billable shapes
// are Search Box /suggest, Search Box /retrieve, Geocoding v6 /reverse, and
// Directions v5 driving. A later reader must not "optimise" the geo call
// sites out of the count — three of the four shapes are geo.
//
// U37 / U54: no Mapbox plan exists, so no franc ceiling can be honest. The
// ceiling is MAPBOX_DAILY_UNIT_SENTINEL, a UNIT COUNT. It TRIPS rather than
// logs because a log-only breaker is a bill with a note attached. Replace
// with DAILY_MAPBOX_QUOTE_BUDGET at roughly 70 % of the monthly-tolerable
// ceiling divided by 30 once a plan exists — a known edit, not a rediscovery.
//
// The count is best-effort (a throwing write does not throw). The trip is
// not: breakerOpen reads the same day key and, at or above the sentinel,
// every Mapbox-spending path answers 503.

import { log, type LogFields, type LogLevel } from "../logger";

export type AbuseEmit = (
  level: LogLevel,
  type: string,
  fields?: LogFields,
) => void;

/** UTC day key prefix. The word is a key shape, not a franc amount (D-54). */
export const MAPBOX_BUDGET_KEY_PREFIX = "quote:mapbox-budget:";

const DAY_TTL_SECONDS = 3 * 24 * 60 * 60;

const fallbackEmit: AbuseEmit = (level, type, fields = {}) => {
  log(level, type, { requestId: "abuse", route: "breaker", locale: null }, fields);
};

let unsetSentinelLogged = false;

function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function mapboxBudgetKey(nowMs: number = Date.now()): string {
  // Concatenation, not a template: executable source must not contain `$` (D-54).
  return MAPBOX_BUDGET_KEY_PREFIX + utcDay(nowMs);
}

function isUnsignedIntegerString(raw: string): boolean {
  if (raw.length === 0) return false;
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code < 48 || code > 57) return false;
  }
  return true;
}

function parseSentinel(raw: string | undefined): number | null {
  if (raw === undefined || raw.length === 0) return null;
  if (!isUnsignedIntegerString(raw)) return Number.NaN;
  return Number.parseInt(raw, 10);
}

/**
 * True when today's unit count is at or above MAPBOX_DAILY_UNIT_SENTINEL.
 * Unset or non-numeric sentinels are not a zero ceiling — they do not trip.
 */
export async function breakerOpen(
  env: { QUOTE_ABUSE: KVNamespace; MAPBOX_DAILY_UNIT_SENTINEL?: string },
  nowMs: number = Date.now(),
  emit?: AbuseEmit,
): Promise<boolean> {
  const logLine = emit ?? fallbackEmit;
  const parsed = parseSentinel(env.MAPBOX_DAILY_UNIT_SENTINEL);
  if (parsed === null) {
    if (!unsetSentinelLogged) {
      unsetSentinelLogged = true;
      logLine("warn", "mapbox_sentinel_unset", { open: 0 });
    }
    return false;
  }
  if (!Number.isFinite(parsed)) {
    logLine("warn", "mapbox_sentinel_invalid", { open: 0 });
    return false;
  }

  let count = 0;
  try {
    const stored = await env.QUOTE_ABUSE.get(mapboxBudgetKey(nowMs));
    if (stored !== null && stored !== undefined) {
      const n = Number.parseInt(stored, 10);
      count = Number.isFinite(n) ? n : 0;
    }
  } catch {
    return false;
  }
  return count >= parsed;
}

/**
 * Increment today's unit counter. Best-effort: a throwing write is swallowed.
 */
export async function countMapboxUnit(
  env: { QUOTE_ABUSE: KVNamespace },
  nowMs: number = Date.now(),
): Promise<void> {
  try {
    const key = mapboxBudgetKey(nowMs);
    const stored = await env.QUOTE_ABUSE.get(key);
    const current = stored ? Number.parseInt(stored, 10) : 0;
    const next = (Number.isFinite(current) ? current : 0) + 1;
    await env.QUOTE_ABUSE.put(key, String(next), { expirationTtl: DAY_TTL_SECONDS });
  } catch {
    // Count is best-effort. The trip is not.
  }
}

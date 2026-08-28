// apps/web/lib/flight/aerodatabox.ts
//
// D-19, D-20, D-42, D-47, D-52.
//
// One shot against AeroDataBox. This module does not poll, does not track, does
// not decide which field of the widget to fill, does not add a buffer, and does
// not build a Response.
//
// Negative space, plainly: no live tracking, no invented waiting allowance, no
// first-record guess on an overnight flight.

import { withRequestContext } from "../logger";
import type { QuoteErrorCode } from "../quote/errors";

export const FLIGHT_FETCH_TIMEOUT_MS = 8_000;

const AERODATABOX_HOST = "aerodatabox.p.rapidapi.com";
const ZURICH_TZ = "Europe/Zurich";
const CIVIL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Two-letter prefix plus 1–4 digits, or letter+digit prefix plus 3–4 digits
 * (U24321). A one-letter `L318` is refused before a unit is spent.
 */
export const FLIGHT_NUMBER_RE = /^(?:[A-Z]{2}\d{1,4}|[A-Z][0-9]\d{3,4})$/;

export type LandingSource = "scheduled" | "estimated" | "actual";

export type FlightEnv = { FLIGHT_API_KEY?: string };

export type FlightDeps = {
  fetch?: typeof globalThis.fetch;
  now?: Date;
};

export type FlightLookupInput = {
  number: string;
  date?: string;
  locale?: string | null;
};

export type FlightRecord = {
  number: string;
  date: string;
  landing_at: string;
  landing_local: string;
  landing_source: LandingSource;
  origin_iata?: string;
  dest_iata?: string;
  terminal?: string;
  gate?: string;
  baggage_belt?: string;
  status?: string;
};

export type FlightLookupOk = {
  ok: true;
  flight: FlightRecord;
};

export type FlightLookupDisambiguate = {
  ok: true;
  action: "disambiguate";
  candidates: FlightRecord[];
  i18n_key: "quote.flight.pick_one";
};

export type FlightLookupFail = {
  ok: false;
  code: Extract<
    QuoteErrorCode,
    "malformed" | "not_found" | "provider_unavailable"
  >;
};

export type FlightLookupResult =
  | FlightLookupOk
  | FlightLookupDisambiguate
  | FlightLookupFail;

type Emit = ReturnType<typeof withRequestContext>;

// D-19: explicit ordered ladder a dispatcher can explain — not nested ternaries.
const LANDING_TIME_LADDER = [
  { field: "runwayTime", source: "actual" },
  { field: "revisedTime", source: "estimated" },
  { field: "scheduledTime", source: "scheduled" },
] as const;

export function normaliseFlightNumber(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function keyOf(env: FlightEnv): string | undefined {
  const key = env.FLIGHT_API_KEY;
  return typeof key === "string" && key.length > 0 ? key : undefined;
}

function emitFor(locale: string | null): Emit {
  return withRequestContext({
    requestId: crypto.randomUUID(),
    route: "flight.lookup",
    locale,
  });
}

function fail(
  code: FlightLookupFail["code"],
): FlightLookupFail {
  return { ok: false, code };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function optionalText(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  return undefined;
}

function partValue(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  for (const part of parts) {
    if (part.type === type) return part.value;
  }
  return "";
}

function zurichCivilDate(instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZURICH_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  return `${partValue(parts, "year")}-${partValue(parts, "month")}-${partValue(parts, "day")}`;
}

function landingLocal(instant: Date): string {
  // YYYY-MM-DDTHH:MM Europe/Zurich wall-clock. A bare new Date(string) is
  // UTC-or-local by parser whim in a Worker — always name the zone.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZURICH_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  return `${partValue(parts, "year")}-${partValue(parts, "month")}-${partValue(parts, "day")}T${partValue(parts, "hour")}:${partValue(parts, "minute")}`;
}

function parseAdbUtc(raw: unknown): Date | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const normalised = raw.includes("T") ? raw : raw.replace(" ", "T");
  const ms = Date.parse(normalised);
  if (Number.isNaN(ms)) return null;
  return new Date(ms);
}

function timeUtc(endpoint: Record<string, unknown>, field: string): unknown {
  const value = endpoint[field];
  if (typeof value === "string") return value;
  const rec = asRecord(value);
  return rec?.utc;
}

function lookupDate(input: FlightLookupInput, now: Date): string {
  if (typeof input.date === "string" && CIVIL_DATE_RE.test(input.date)) {
    return input.date;
  }
  return zurichCivilDate(now);
}

function recordNumber(raw: Record<string, unknown>): string {
  return typeof raw.number === "string" ? normaliseFlightNumber(raw.number) : "";
}

function mapRecord(
  raw: Record<string, unknown>,
  number: string,
  date: string,
): FlightRecord | null {
  const arrival = asRecord(raw.arrival);
  if (!arrival) return null;

  let landingAt: Date | null = null;
  let landingSource: LandingSource | null = null;
  for (const step of LANDING_TIME_LADDER) {
    const instant = parseAdbUtc(timeUtc(arrival, step.field));
    if (instant) {
      landingAt = instant;
      landingSource = step.source;
      break;
    }
  }
  if (!landingAt || !landingSource) return null;

  const departure = asRecord(raw.departure);
  const originAirport = asRecord(departure?.airport);
  const destAirport = asRecord(arrival.airport);

  const flight: FlightRecord = {
    number,
    date,
    landing_at: landingAt.toISOString(),
    landing_local: landingLocal(landingAt),
    landing_source: landingSource,
  };

  const origin = optionalText(originAirport?.iata);
  if (origin) flight.origin_iata = origin;
  const dest = optionalText(destAirport?.iata);
  if (dest) flight.dest_iata = dest;

  const terminal = optionalText(arrival.terminal);
  if (terminal) flight.terminal = terminal;
  const gate = optionalText(arrival.gate);
  if (gate) flight.gate = gate;
  const belt = optionalText(arrival.baggageBelt);
  if (belt) flight.baggage_belt = belt;

  const status = optionalText(raw.status);
  if (status) flight.status = status;

  return flight;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * One lookup. Regex gate runs before the key check and before fetch — a
 * malformed number must never buy a request (cost control).
 *
 * D-42: waiting is settings_versions.airport_waiting_minutes, read by the
 * policy builder. Flight autofill does not get a private copy.
 *
 * D-52: two or more records for the typed number are a choice, never a
 * guessed calendar day. A 23:40 departure becoming a 00:15 arrival on the
 * wrong civil day is the concrete failure. This is both the default and the
 * U45 fallback — answering dateLocalRole against a live key later changes
 * nothing here.
 *
 * Codeshares are not deduplicated: the record for the number typed is the
 * number on the boarding pass.
 */
export async function lookupFlight(
  input: FlightLookupInput,
  env: FlightEnv,
  deps: FlightDeps = {},
): Promise<FlightLookupResult> {
  const locale = input.locale ?? null;
  const emit = emitFor(locale);
  const number = normaliseFlightNumber(input.number);

  if (!FLIGHT_NUMBER_RE.test(number)) {
    return fail("malformed");
  }

  const apiKey = keyOf(env);
  if (!apiKey) {
    // D-47 / ADR-014 §4: no key is the shipping configuration.
    return fail("provider_unavailable");
  }

  const now = deps.now ?? new Date();
  const date = lookupDate(input, now);
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const url = new URL(
    `https://${AERODATABOX_HOST}/flights/number/${encodeURIComponent(number)}/${date}`,
  );

  const started = Date.now();
  let status = 0;
  let body: unknown = null;
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      headers: {
        "X-RapidAPI-Key": apiKey,
        "X-RapidAPI-Host": AERODATABOX_HOST,
      },
      signal: AbortSignal.timeout(FLIGHT_FETCH_TIMEOUT_MS),
    });
    status = res.status;
    emit("info", "aerodatabox_call", {
      call: "lookup",
      upstream_status: status,
      elapsed_ms: Date.now() - started,
    });
    if (!res.ok) {
      return fail("provider_unavailable");
    }
    body = await readJson(res);
  } catch {
    emit("warn", "aerodatabox_call", {
      call: "lookup",
      upstream_status: 0,
      elapsed_ms: Date.now() - started,
    });
    return fail("provider_unavailable");
  }

  if (!Array.isArray(body)) {
    return fail("provider_unavailable");
  }

  const matching: Record<string, unknown>[] = [];
  for (const item of body) {
    const rec = asRecord(item);
    if (!rec) continue;
    if (recordNumber(rec) === number) matching.push(rec);
  }

  if (matching.length === 0) {
    return fail("not_found");
  }

  // Multi-record branch before any indexing. Overnight flights offer a choice.
  if (matching.length > 1) {
    const candidates: FlightRecord[] = [];
    for (const rec of matching) {
      const mapped = mapRecord(rec, number, date);
      if (mapped) candidates.push(mapped);
    }
    return {
      ok: true,
      action: "disambiguate",
      candidates,
      i18n_key: "quote.flight.pick_one",
    };
  }

  let single: FlightRecord | null = null;
  for (const rec of matching) {
    single = mapRecord(rec, number, date);
  }
  if (!single) return fail("not_found");
  return { ok: true, flight: single };
}

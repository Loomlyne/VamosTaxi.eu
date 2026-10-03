// apps/web/app/api/flight/[no]/route.ts
//
// GET /api/flight/:no?date=&locale= — QUOTE-08 one-shot lookup (D-19, D-47).
//
// This route deliberately does NOT call /api/quote and does NOT decide which
// widget field to fill. The decision table (departure versus arrival,
// cancelled, already-departed) is the widget's, per SPEC-home-flight-autofill
// §1 and 04-UI-SPEC.md §F — this route returns status and dir and stops there.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { wireRateLimitGuard } from "@/lib/abuse/guards";
import {
  lookupFlight,
  normaliseFlightNumber,
  type FlightRecord,
} from "@/lib/flight/aerodatabox";
import { quoteErrorResponse } from "@/lib/quote/errors";
import { withRequestContext } from "@/lib/logger";

export const dynamic = "force-dynamic";

const FLIGHT_JSON = { "Cache-Control": "private, no-store" } as const;

const ZURICH_TZ = "Europe/Zurich";
const CIVIL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const DateQuery = z.string().regex(CIVIL_DATE_RE);
const LocaleQuery = z.enum(["en", "de", "fr", "ar"]);

type FlightDir =
  | "to-airport"
  | "from-airport"
  | "neither"
  | "cancelled"
  | "departed";

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

/**
 * TTL by distance from today in Europe/Zurich civil days.
 * A landing that is hours away changes rarely; one that is minutes away
 * changes constantly.
 *
 * 90-second same-day tier: Cloudflare KV refuses expirationTtl below 60 —
 * do not "tighten" this to 30 or production put() throws.
 */
function flightCacheTtlSeconds(flightDate: string, now: Date): number {
  const today = zurichCivilDate(now);
  const flightMs = Date.parse(`${flightDate}T00:00:00Z`);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  const days = Math.round((flightMs - todayMs) / 86_400_000);
  if (days <= 0) return 90;
  if (days === 1) return 1_800;
  return 21_600;
}

function ours(iata: string | undefined): boolean {
  return iata === "ZRH" || iata === "GVA" || iata === "BSL";
}

function flightDir(
  origin: string | undefined,
  dest: string | undefined,
  status: string | undefined,
): FlightDir {
  const lowered = (status ?? "").toLowerCase();
  if (lowered.includes("cancel")) return "cancelled";
  if (lowered === "departed") return "departed";
  if (ours(dest) && !ours(origin)) return "from-airport";
  if (ours(origin) && !ours(dest)) return "to-airport";
  return "neither";
}

function withDir(flight: FlightRecord): FlightRecord & { dir: FlightDir } {
  return {
    ...flight,
    dir: flightDir(flight.origin_iata, flight.dest_iata, flight.status),
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ no: string }> },
) {
  const { env } = getCloudflareContext();
  const { no } = await context.params;
  const url = new URL(request.url);

  const dateRaw = url.searchParams.get("date");
  const dateParsed = dateRaw ? DateQuery.safeParse(dateRaw) : null;
  const date = dateParsed?.success ? dateParsed.data : undefined;

  const localeRaw = url.searchParams.get("locale");
  const localeParsed = localeRaw ? LocaleQuery.safeParse(localeRaw) : null;
  const locale = localeParsed?.success ? localeParsed.data : undefined;

  const emit = withRequestContext({
    requestId: crypto.randomUUID(),
    route: "/api/flight",
    locale: locale ?? null,
  });

  // Worker-limit only. Invisible challenge stays off (§8).
  // No Mapbox breaker — this path spends no Mapbox unit.
  // Own small counter (quick 261003 review): AeroDataBox bills every call, not_found is never cached.
  const limited = await wireRateLimitGuard(env, request, "flight")();
  if (!limited.ok) return quoteErrorResponse(limited.code);

  const now = new Date();
  const civilDate = date ?? zurichCivilDate(now);
  const number = normaliseFlightNumber(no ?? "");
  // Neither an id, an IP nor a session token may ever enter this key — the
  // normalised number plus the date is the whole of it.
  const cacheKey = `flight:${number}:${civilDate}`;

  try {
    const cached = await env.GEO_CACHE.get(cacheKey, "json");
    if (cached && typeof cached === "object") {
      emit("info", "flight_lookup", { cache_hit: true, outcome: "ok" });
      return Response.json({ ok: true, flight: cached, cache_hit: true }, { headers: FLIGHT_JSON });
    }
  } catch {
    // Cache read failure must not extend an outage — fall through to lookup.
  }

  const result = await lookupFlight(
    { number: no ?? "", date: civilDate, locale },
    { FLIGHT_API_KEY: env.FLIGHT_API_KEY },
  );

  if (!result.ok) {
    emit("info", "flight_lookup", {
      cache_hit: false,
      outcome: result.code,
    });
    // not_found: caching a 404 outlives the schedule being published.
    // provider_unavailable: caching a provider outage extends it.
    return quoteErrorResponse(result.code);
  }

  if ("flight" in result) {
    const flight = withDir(result.flight);
    try {
      await env.GEO_CACHE.put(cacheKey, JSON.stringify(flight), {
        expirationTtl: flightCacheTtlSeconds(civilDate, now),
      });
    } catch {
      // Put failure still returns the live lookup.
    }
    emit("info", "flight_lookup", { cache_hit: false, outcome: "ok" });
    return Response.json({ ok: true, flight, cache_hit: false }, { headers: FLIGHT_JSON });
  }

  emit("info", "flight_lookup", {
    cache_hit: false,
    outcome: "disambiguate",
  });
  // disambiguate is never written — a choice is not a fact to replay.
  return Response.json(
    {
      ok: true,
      action: "disambiguate",
      candidates: result.candidates,
      i18n_key: "quote.flight.pick_one",
    },
    { headers: FLIGHT_JSON },
  );
}

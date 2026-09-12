// apps/web/lib/quote/deps.ts
//
// Request-scoped pipeline dependencies. Route handlers stay thin: they
// preprocess, parse, run the pipeline, and respond. Wiring lives here so
// a business rule cannot grow in the handler.

import { mintLockDeadline, loadSettingsVersion } from "../db/quote";
import { routeLegs, type RouteLegInput } from "../geo/mapbox";
import { mapSettingsSnapshot } from "../pricing/rateBook";
import type { ClassBoardEntry, PolicySnapshot, QuoteInput } from "../pricing/types";
import { ENGINE_VERSION } from "../version";
import { loadAndPrice } from "./engine";
import type { LoadAndPriceResult } from "./engine";
import type { QuotePipelineDeps } from "./pipeline";

function hostnameOf(hostHeader: string | null | undefined): string {
  return (hostHeader ?? "").split(":")[0]?.toLowerCase() ?? "";
}

function isOpsChangesPreviewHost(host: string): boolean {
  return host === "vamos-ops-changes.koussayzayeni.workers.dev"
    || host.endsWith("-vamos-ops-changes.koussayzayeni.workers.dev")
    || host === "vamos-web-ops-changes.koussayzayeni.workers.dev"
    || host.endsWith("-vamos-web-ops-changes.koussayzayeni.workers.dev");
}

/** Match middleware isNamedDashboardHost. Public site hosts are false. */
export function isNamedDashboardHost(hostHeader: string | null | undefined): boolean {
  const host = hostnameOf(hostHeader);
  return host === "dashboard.vamostaxi.site"
    || host === "dashboard.localhost"
    || isOpsChangesPreviewHost(host);
}

function stubRouteLegs(legs: RouteLegInput[]) {
  return Promise.resolve({
    ok: true as const,
    legs: legs.map((_, i) => ({
      leg_seq: (i === 0 ? 1 : 2) as 1 | 2,
      distance_m: 12_000,
      duration_s: 1_200,
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [8.5417, 47.3769],
          [8.5624, 47.4504],
        ] as [number, number][],
      },
    })),
  });
}

function launchPolicy(): PolicySnapshot {
  return {
    settings_version_id: 1,
    free_cancel_hours: null,
    modification_deadline_hours: null,
    min_advance_minutes: null,
    airport_waiting_minutes: null,
    city_waiting_minutes: null,
    cancellation_tiers: [],
    policy_doc: null,
  };
}

function launchBoard(pax: number): ClassBoardEntry[] {
  const caps: Array<{ slug: ClassBoardEntry["slug"]; pax: number; bags: number }> = [
    { slug: "economy", pax: 3, bags: 3 },
    { slug: "business", pax: 3, bags: 3 },
    { slug: "van", pax: 8, bags: 8 },
  ];
  return caps.map((c) => {
    const eligible = pax <= c.pax;
    return {
      slug: c.slug,
      eligible,
      ineligible_reason: eligible ? null : "pax",
      effective_max_pax: c.pax,
      max_bags: c.bags,
      fixed_route: false,
      total_rappen: null,
      lines: eligible
        ? [
            {
              seq: 1,
              leg_seq: 1,
              kind: "fare",
              code: "distance",
              i18n_key: "price.line.distance",
              basis: { rule: "per_km" },
              amount_rappen: null,
            },
          ]
        : [],
    };
  });
}

function stubLoadAndPrice(
  _env: CloudflareEnv,
  input: QuoteInput,
): Promise<LoadAndPriceResult> {
  const classes = launchBoard(input.pax);
  return Promise.resolve({
    ok: true,
    quote: {
      no_eligible_class: classes.every((c) => !c.eligible),
      classes,
      policy: launchPolicy(),
      rate_version: null,
      engine_version: ENGINE_VERSION,
      pricing_live: false,
      settings_version_id: 1,
      partially_priced_class_slugs: [],
      computed_at: input.computed_at,
    },
  });
}

export function buildQuotePipelineDeps(
  env: CloudflareEnv,
  opts?: { dashboardHost?: boolean },
): QuotePipelineDeps {
  const computedAt = new Date().toISOString();
  const stubGeo = process.env.QUOTE_TEST_STUB_GEO === "1";
  const current = env.QUOTE_LOCK_SECRET || process.env.QUOTE_LOCK_SECRET || "";
  const previous =
    env.QUOTE_LOCK_SECRET_PREVIOUS || process.env.QUOTE_LOCK_SECRET_PREVIOUS;
  const dashboardHost = opts?.dashboardHost === true;

  return {
    env,
    lockSecrets: previous ? { current, previous } : { current },
    nowMs: Date.now(),
    computedAt,
    nowIso: computedAt,
    engineVersion: ENGINE_VERSION,
    quoteLockDeadline: stubGeo
      ? async () => "2099-01-01T12:00:00.000Z"
      : (id) => mintLockDeadline(env, id),
    loadAndPrice: stubGeo
      ? stubLoadAndPrice
      : (e, input, loaders, request) =>
          loadAndPrice(e, input, loaders, request, { dashboardHost }),
    loadSettings: stubGeo
      ? async () => ({
          id: 1,
          min_advance_minutes: null,
          service_area_geojson: null,
        })
      : async () => {
          const raw = await loadSettingsVersion(env, computedAt);
          const mapped = mapSettingsSnapshot(raw);
          if (!mapped) return null;
          return {
            id: mapped.id,
            min_advance_minutes: mapped.min_advance_minutes,
            service_area_geojson: mapped.service_area_geojson,
          };
        },
    routeLegs: stubGeo ? stubRouteLegs : (legs) => routeLegs(legs, env),
    checkServiceArea: stubGeo ? () => ({ ok: true }) : undefined,
    reverse: stubGeo ? async () => ({ place: null }) : undefined,
    retrieve: stubGeo
      ? async () => ({
          place: {
            mapbox_id: "stub",
            name: "Zurich",
            address: "",
            lng: 8.5417,
            lat: 47.3769,
          },
        })
      : undefined,
  };
}

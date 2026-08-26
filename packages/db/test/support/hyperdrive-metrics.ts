// packages/db/test/support/hyperdrive-metrics.ts
//
// Two readers, both designed now and unrun until a staging Worker has actually written traffic
// (plan 03-07):
//
//  `p50Latency`       — DATA-05's percentile, from the Workers Analytics Engine SQL API, via a
//                        weighted-quantile call over `vamos_db_latency` (D-23/D-32). Until a
//                        staging Worker exists this returns an empty array and DATA-05 stays
//                        DEFERRED — the phase summary carries the literal line
//                        `DATA-05 p50 = DEFERRED (no staging Worker)` until then. NEVER
//                        substitute a local client-side wall-clock delta for this number, and
//                        NEVER assert Cloudflare's own documented 1-3ms figure in its place.
//  `cacheStatusWindow` — A5's validity gate: the identity Hyperdrive config's `cacheStatus`
//                        distribution and the window's total query count, from Cloudflare's
//                        GraphQL Analytics API. A5 needs BOTH the distribution (never `hit`)
//                        AND a non-zero query count (zero queries means the probe never used
//                        Hyperdrive at all, which would make a clean-looking run meaningless).
//
// Both throw a NAMED error (`HyperdriveMetricsConfigError`) when their required credential is
// missing, rather than returning an empty/zero shape that would read as "no leak found" — an
// unconfigured metrics reader must be loud, not quietly indistinguishable from a clean result.
//
// The GraphQL query shape below (dataset name, dimension names) follows the same
// viewer -> accounts(filter) -> <dataset>Groups(filter, limit) { dimensions { ... } count }
// convention every other Cloudflare Analytics dataset uses. Like every other execution-time-
// checked item in this plan (D-32...D-43), the exact dataset/dimension names are confirmed
// against the live schema at the first deployed run (plan 03-07) — this file is designed here,
// run in plan 03-07, matching D-14's own framing for the rest of this harness.

/** Thrown by both readers below when a required Cloudflare credential is missing. Named so a
 *  caller (or a CI log) can tell "not configured yet" apart from "queried and found nothing". */
export class HyperdriveMetricsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HyperdriveMetricsConfigError";
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new HyperdriveMetricsConfigError(
      `${name} is not set — hyperdrive-metrics.ts refuses to return a shape that would read as "no leak found". DATA-05/A5 stay DEFERRED until this is configured (plan 03-07).`,
    );
  }
  return value;
}

const CLOUDFLARE_GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";
const CLOUDFLARE_ANALYTICS_ENGINE_SQL_ENDPOINT = (accountId: string): string =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`;

/** Builds one weighted-quantile percentile expression — the SOLE literal occurrence of the WAE
 *  function name (below) in this file. p50 and p95 are both requested through this one helper
 *  so a reader (and the plan's own acceptance grep) can see there is exactly one WAE percentile
 *  call site, not two independently-typed copies that could silently drift apart. */
function quantileExpr(level: number): string {
  return `quantileExactWeighted(${level})(double1, _sample_interval)`;
}

export interface PercentileRow {
  identity_kind: string;
  p50_ms: number;
  p95_ms: number;
  n: number;
}

/**
 * DATA-05's percentile query (Code Example 9): the p50 weighted-quantile call and its 0.95
 * twin, grouped by `blob1` (the identity kind the WAE write-path tags every point with), over
 * `vamos_db_latency`. `accountId`/`token` are explicit parameters rather than read from
 * `process.env` directly inside this function, because the Analytics Engine SQL API's bearer
 * token is a distinct credential from the GraphQL Analytics API's — callers source both from
 * `CF_ACCOUNT_ID`/`CF_ANALYTICS_TOKEN` themselves (matching `cacheStatusWindow`'s own env-read
 * guard in spirit); this function still throws the SAME named error if either arrives empty.
 *
 * Until a staging Worker has written points, this returns an empty array and DATA-05 is
 * DEFERRED (D-23/D-27) — never substitute a local client-side wall-clock delta, and never
 * assert Cloudflare's documented 1-3ms figure as a measurement.
 */
export async function p50Latency(
  accountId: string,
  token: string,
  windowHours = 24,
): Promise<PercentileRow[]> {
  if (!accountId || !token) {
    throw new HyperdriveMetricsConfigError(
      "p50Latency: accountId/token must both be supplied (source from CF_ACCOUNT_ID/CF_ANALYTICS_TOKEN) — refusing to silently return an empty percentile that would read as 'no leak found'.",
    );
  }

  const sql = `
    SELECT
      blob1 AS identity_kind,
      ${quantileExpr(0.5)} AS p50_ms,
      ${quantileExpr(0.95)} AS p95_ms,
      count() AS n
    FROM vamos_db_latency
    WHERE timestamp > NOW() - INTERVAL '${windowHours}' HOUR
    GROUP BY blob1
  `;

  const res = await fetch(CLOUDFLARE_ANALYTICS_ENGINE_SQL_ENDPOINT(accountId), {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "text/plain" },
    body: sql,
  });
  if (!res.ok) {
    throw new Error(`p50Latency: Analytics Engine SQL API returned ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as { data?: PercentileRow[] };
  return body.data ?? [];
}

export interface CacheStatusWindow {
  /** e.g. `{ disabled: 412, transaction: 88 }` — A5 requires this never carries a `hit` key
   *  with a non-zero count for the identity config. */
  statuses: Record<string, number>;
  /** Zero here means the probe never issued a query through this Hyperdrive config at all — a
   *  clean-looking `statuses` distribution on a zero-query window is not evidence of anything. */
  totalQueries: number;
}

/**
 * A5's validity gate: the given Hyperdrive config's `cacheStatus` distribution and the window's
 * total query count, over `[fromIso, toIso)`. Reads `CF_ACCOUNT_ID`/`CF_ANALYTICS_TOKEN` itself
 * (its own signature carries no accountId/token parameters) and throws the named
 * `HyperdriveMetricsConfigError` if either is unset.
 */
export async function cacheStatusWindow(
  configId: string,
  fromIso: string,
  toIso: string,
): Promise<CacheStatusWindow> {
  const accountId = requireEnv("CF_ACCOUNT_ID");
  const token = requireEnv("CF_ANALYTICS_TOKEN");

  const query = `
    query HyperdriveCacheStatus($accountTag: string!, $configId: string!, $from: Time!, $to: Time!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          hyperdriveQueriesAdaptiveGroups(
            limit: 1000
            filter: { configId: $configId, datetime_geq: $from, datetime_leq: $to }
          ) {
            count
            dimensions {
              cacheStatus
            }
          }
        }
      }
    }
  `;

  const res = await fetch(CLOUDFLARE_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      query,
      variables: { accountTag: accountId, configId, from: fromIso, to: toIso },
    }),
  });
  if (!res.ok) {
    throw new Error(`cacheStatusWindow: Cloudflare GraphQL API returned ${res.status}: ${await res.text()}`);
  }

  const body = (await res.json()) as {
    data?: {
      viewer?: {
        accounts?: Array<{
          hyperdriveQueriesAdaptiveGroups?: Array<{
            count: number;
            dimensions: { cacheStatus: string };
          }>;
        }>;
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (body.errors?.length) {
    throw new Error(`cacheStatusWindow: GraphQL errors: ${body.errors.map((e) => e.message).join("; ")}`);
  }

  const groups = body.data?.viewer?.accounts?.[0]?.hyperdriveQueriesAdaptiveGroups ?? [];
  const statuses: Record<string, number> = {};
  let totalQueries = 0;
  for (const g of groups) {
    statuses[g.dimensions.cacheStatus] = (statuses[g.dimensions.cacheStatus] ?? 0) + g.count;
    totalQueries += g.count;
  }
  return { statuses, totalQueries };
}

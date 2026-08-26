// packages/db/test/support/drive.ts
//
// The deployed DATA-06 concurrency driver (D-14/D-45). Two exports:
//
//  `drive()`      — pins the socket count so "N-way concurrent" is a measured fact, not a hope;
//                    refuses a `localhost`/`127.0.0.1` base URL (local does not exercise
//                    Hyperdrive pooling — a local run would produce a green result that means
//                    nothing); drives strict A/B alternation across the supplied identities;
//                    measures `peakInFlight`.
//  `adjacencySet` — implements 03-RESEARCH.md's adjacency-set definition verbatim. This is what
//                    turns "200 requests returned the right rows" from theatre into a number, S,
//                    that the isolation gate can hold to a floor.
//
// Nothing in this file runs against anything until a caller with a real `PROBE_BASE_URL` invokes
// `drive()` — importing this module does no network I/O and no environment validation of its own.

import { Agent, fetch as undiciFetch, setGlobalDispatcher } from "undici";

// DEVIATION-shaped decision, recorded here rather than only in the plan summary: Node 26's own
// bundled undici backs `globalThis.fetch`, but `setGlobalDispatcher` is NOT reachable from the
// global runtime without importing the `undici` package itself — confirmed empirically
// (`typeof globalThis.setGlobalDispatcher === "undefined"`, and a bare `require("undici")` /
// dynamic `import("undici")` both fail with "Cannot find package 'undici'" until the package is
// an actual dependency). Node's global `fetch` and the `undici` npm package are two separate
// module instances; calling `setGlobalDispatcher` from the npm package does NOT constrain
// `globalThis.fetch` calls. So this file takes the plan's documented fallback path: `undici`
// is an exact-pinned devDependency of `packages/db` (Package Legitimacy Audit: Approved;
// version verified with `npm view undici version` at plan time), and every probe request below
// goes through UNDICI'S OWN `fetch` export — never `globalThis.fetch` — because only requests
// issued through the same module instance that received `setGlobalDispatcher` are actually
// pinned to the dispatcher's socket count.

/** One probe response, plus the two fields the HARNESS attaches (never the Worker itself,
 *  per apps/isolation-probe/src/index.ts's own header comment): `customer` (which side of the
 *  A/B pair issued this call — not necessarily a literal `customer` identity kind; the field
 *  name matches the plan's frozen `<interfaces>` block verbatim) and `cfRay`. */
export interface ProbeResult {
  impl: string;
  customer: "a" | "b";
  userAtEntry: string;
  claimsAtEntry: string;
  guestAtEntry: string;
  pid: number;
  t0: string;
  /** Only present for impl constructions that issue a second timestamped statement after their
   *  own read (today: `impl=correct`). Absence is expected, not an error. */
  t1?: string;
  /** A2/U2 tripwire — only present for `impl=correct`. */
  userBound?: string;
  rows?: Array<{ reference: string }>;
  sqlstate?: string | null;
  cfRay?: string;
  /** NC3's row count when the fail-closed grant wall is bypassed. */
  n?: number;
  /** NC4's own evidence field. */
  heldOrigin?: boolean;
  /** NC5+'s own label, so the harness never applies the mutant "must go red" rule to it. */
  positiveControl?: boolean;
  /** waituntil_captured / waituntil_fenced's immediate-response field; the real result is
   *  retrieved with a `?drain=<nonce>` follow-up. */
  nonce?: string;
  note?: string;
}

export interface DriveIdentity {
  label: "a" | "b";
  accessToken: string;
  /** Only set for `kind=guest` — bound as `?manageTokenHash=`, independent of the bearer token
   *  (apps/isolation-probe/src/index.ts's own gate/dispatch split). */
  manageTokenHash?: string;
}

export interface DriveOptions {
  baseUrl: string;
  secret: string;
  /** The probe's closed `impl` union (03-04-PLAN.md `<interfaces>`). Kept as `string` here,
   *  not imported from `apps/isolation-probe`, so this test-support module never depends on a
   *  staging-only Worker package's own source tree. */
  impl: string;
  /** The `IdentityKind` this run drives against (D-45: customer, guest or staff). */
  kind?: string;
  identities: { a: DriveIdentity; b: DriveIdentity };
  requests?: number;
  concurrency?: number;
}

export interface DriveResult {
  /** Issue order preserved — index 0 is request #0, etc. */
  results: ProbeResult[];
  /** MEASURED peak simultaneous in-flight requests — a serialised run must be caught here, not
   *  hoped against. */
  peakInFlight: number;
  distinctPids: number;
  wallMs: number;
}

/**
 * Starting values for `PROBE_REQUESTS` / `PROBE_CONCURRENCY` / `PROBE_MIN_ADJACENCY`, per
 * 03-RESEARCH.md's "PR smoke (after deploy)" iteration-table row (400 / 32 / 200) — re-derived
 * once the real pool size is known (D-43, plan 03-07). Exported so both `drive()` and the
 * deployed test files read the SAME three numbers from the SAME three env vars, never a second,
 * independently-typed copy of the defaults.
 */
export const ITERATION_DEFAULTS = {
  requests: Number(process.env.PROBE_REQUESTS ?? 400),
  concurrency: Number(process.env.PROBE_CONCURRENCY ?? 32),
  minAdjacency: Number(process.env.PROBE_MIN_ADJACENCY ?? 200),
};

/**
 * Refuses a `localhost` / `127.0.0.1` base URL. Local does not exercise Hyperdrive pooling — a
 * local run would produce a green result that means nothing (03-RESEARCH.md "Concurrency").
 */
function assertNotLocal(baseUrl: string): void {
  const host = new URL(baseUrl).hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    throw new Error(
      `drive(): refusing baseUrl "${baseUrl}" — a localhost/127.0.0.1 target does not exercise Hyperdrive pooling. A local run would produce a green result that means nothing.`,
    );
  }
}

/**
 * Drives strict A/B alternation across `opts.identities` at the given concurrency, against the
 * REAL deployed probe only (never localhost — see `assertNotLocal`). Pins the socket count with
 * an `undici` `Agent({ connections, pipelining: 0 })` so "N-way concurrent" is a fact this
 * function can measure, not assume, and returns the MEASURED `peakInFlight` alongside it.
 */
export async function drive(opts: DriveOptions): Promise<DriveResult> {
  assertNotLocal(opts.baseUrl);

  const requests = opts.requests ?? ITERATION_DEFAULTS.requests;
  const concurrency = opts.concurrency ?? ITERATION_DEFAULTS.concurrency;
  const kind = opts.kind ?? "customer";

  // pipelining: 0 — undici over HTTP/1.1 does no request pipelining by default, but this is
  // explicit so "one socket == one in-flight request" is guaranteed, not merely the current
  // default. Without pinning `connections`, undici's own pool would grow/shrink the socket
  // count on its own schedule and "N-way concurrent" would stop being a fact the harness can
  // assert.
  setGlobalDispatcher(new Agent({ connections: concurrency, pipelining: 0 }));

  const results: ProbeResult[] = new Array(requests);
  let inFlight = 0;
  let peakInFlight = 0;
  let nextIndex = 0;

  function claimIndex(): number | undefined {
    if (nextIndex >= requests) return undefined;
    const claimed = nextIndex;
    nextIndex += 1;
    return claimed;
  }

  async function issue(index: number): Promise<void> {
    // Strict A/B alternation by GLOBAL issue order, not per-worker order — index 0 -> a,
    // index 1 -> b, index 2 -> a, ... regardless of which of the `concurrency` workers below
    // happens to claim which index.
    const label: "a" | "b" = index % 2 === 0 ? "a" : "b";
    const identity = opts.identities[label];

    const url = new URL("/probe", opts.baseUrl);
    url.searchParams.set("impl", opts.impl);
    url.searchParams.set("kind", kind);
    if (identity.manageTokenHash) {
      url.searchParams.set("manageTokenHash", identity.manageTokenHash);
    }

    inFlight += 1;
    // MEASURED, not assumed — this is the counter the isolation gate's V2 validity check reads.
    peakInFlight = Math.max(peakInFlight, inFlight);
    try {
      const res = await undiciFetch(url, {
        headers: {
          "x-vamos-probe": opts.secret,
          authorization: `Bearer ${identity.accessToken}`,
        },
      });
      const body = (await res.json()) as Record<string, unknown>;
      results[index] = {
        ...(body as Omit<ProbeResult, "customer" | "cfRay">),
        customer: label,
        cfRay: res.headers.get("cf-ray") ?? undefined,
      } as ProbeResult;
    } finally {
      inFlight -= 1;
    }
  }

  const wallStart = Date.now();
  const workers = Array.from({ length: Math.min(concurrency, requests) || 1 }, async () => {
    for (;;) {
      const index = claimIndex();
      if (index === undefined) return;
      await issue(index);
    }
  });
  await Promise.all(workers);
  const wallMs = Date.now() - wallStart;

  const finalResults = results.filter((r): r is ProbeResult => r !== undefined);
  const distinctPids = new Set(finalResults.map((r) => r.pid)).size;

  return { results: finalResults, peakInFlight, distinctPids, wallMs };
}

/** One adjacency-set pair: `p` is the earlier probe on a shared `pid`, `q` is the one that
 *  followed it with nothing between them, issued by a DIFFERENT identity. */
export interface AdjacencyPair {
  p: ProbeResult;
  q: ProbeResult;
}

/**
 * Implements 03-RESEARCH.md's adjacency-set definition to the letter: group by `pid`; within
 * each pid sort by `t0` (the DATABASE SERVER's clock — never the client's, since only the
 * server's clock is shared across every probe regardless of which physical machine issued the
 * request); take consecutive pairs `(p, q)` with `q.t0 > p.t1` (nothing else can fall between
 * two array-adjacent elements of a sorted list, so "nothing between them" is automatic once the
 * sort is by the same clock every entry uses); keep the pairs where `p.customer !== q.customer`.
 *
 * `p.t1` must exist for a pair to be considered — only impl constructions that issue a second
 * timestamped statement after their own read (today: `impl=correct`) carry it. A `p` with no
 * `t1` cannot anchor an ordering claim and is skipped, not treated as satisfying it.
 *
 * HONEST BOUND, stated here because it is the whole point of this file: a deterministic bug is
 * caught at `S = 1`. `S` (this function's return length) is COVERAGE, not assurance — a large
 * `N` in a CI log must never be read as security evidence. The assurance is D-01, D-02 and the
 * negative controls in `negative-controls.test.ts`; this function only tells the isolation gate
 * how much of the run was actually eligible to say anything at all.
 */
export function adjacencySet(results: ProbeResult[]): AdjacencyPair[] {
  const byPid = new Map<number, ProbeResult[]>();
  for (const r of results) {
    if (!Number.isInteger(r.pid) || r.pid <= 0) continue;
    const list = byPid.get(r.pid) ?? [];
    list.push(r);
    byPid.set(r.pid, list);
  }

  const pairs: AdjacencyPair[] = [];
  for (const list of byPid.values()) {
    const sorted = [...list].sort((a, b) => Date.parse(a.t0) - Date.parse(b.t0));
    for (let i = 0; i < sorted.length - 1; i++) {
      const p = sorted[i]!;
      const q = sorted[i + 1]!;
      if (p.t1 === undefined) continue;
      if (!(Date.parse(q.t0) > Date.parse(p.t1))) continue;
      // The whole point of the pairing: only a pair issued by two DIFFERENT identities can say
      // anything about cross-request leakage.
      if (p.customer !== q.customer) {
        pairs.push({ p, q });
      }
    }
  }
  return pairs;
}

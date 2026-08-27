// packages/db/test/deployed/data-06-isolation.test.ts
//
// The DATA-06 gate itself (D-14). The assertion is an ADJACENCY SET, not a row count: for every
// pair of probes sharing a `pid` where one followed the other with nothing between them and the
// two ran as different identities, the follower must have seen a clean session and its own rows.
// The size of that set, S, is the real sample size -- N (request count) is not. A run whose S
// falls below the floor is INCONCLUSIVE and fails.
//
// Order matters, deliberately: VALIDITY GATES (V1-V5) run FIRST and fail the test with the word
// INCONCLUSIVE the instant the run cannot be trusted, because a leakage assertion on an invalid
// run is worse than no assertion at all. Only once a run has passed every validity gate do the
// leakage assertions (A1-A4, plus A2's U2 tripwire) say anything about isolation.
//
// The gate runs three times, over three D-45 pairings -- customer/customer, guest/guest and
// staff/staff -- so DATA-03 (manage-token scoping) and AUTH-05 (staff claim scoping) are INSIDE
// S rather than assumed to hold from the customer result alone.
//
// Inert without PROBE_BASE_URL (D-30/D-31) -- the file-level skip guard below reports every test
// skipped on a machine with no staging deploy.

import { describe, expect, it } from "vitest";
import { adjacencySet, drive, ITERATION_DEFAULTS, type DriveIdentity } from "../support/drive";
import { cacheStatusWindow } from "../support/hyperdrive-metrics";
import {
  assertNoLiveRateVersion,
  seedFixtures,
  type FixtureIdentity,
  type FixturePairs,
} from "../fixtures/two-customers";
import allowlistRaw from "../support/config-allowlist.json";

const BASE = process.env.PROBE_BASE_URL ?? "";
const SECRET = process.env.PROBE_SECRET ?? "";
const MIN_ADJACENCY = Number(process.env.PROBE_MIN_ADJACENCY ?? ITERATION_DEFAULTS.minAdjacency);
const CONCURRENCY = ITERATION_DEFAULTS.concurrency;

const allowlist = allowlistRaw as unknown as { probe_identity: { id: string | null } };

function pairIdentities(pair: [FixtureIdentity, FixtureIdentity]): { a: DriveIdentity; b: DriveIdentity } {
  return {
    a: { label: "a", accessToken: pair[0].accessToken, manageTokenHash: pair[0].manageTokenHashHex },
    b: { label: "b", accessToken: pair[1].accessToken, manageTokenHash: pair[1].manageTokenHashHex },
  };
}

/** The three D-45 pairings this gate must cover -- not only two customers. Without the guest
 *  and staff pairings, DATA-03 and AUTH-05 are unproven under the pool. */
const PAIRINGS: ReadonlyArray<{ name: "customer" | "guest" | "staff"; kind: "customer" | "guest" | "staff" }> = [
  { name: "customer", kind: "customer" },
  { name: "guest", kind: "guest" },
  { name: "staff", kind: "staff" },
];

describe.skipIf(!process.env.PROBE_BASE_URL)("DATA-06 isolation gate (adjacency set, D-14/D-45)", () => {
  it.each(PAIRINGS)("$name/$name pairing -- validity gates first (V1-V5), then leakage assertions (A1-A4)", async ({ kind }) => {
    expect(await assertNoLiveRateVersion(), "D-21: no rate_versions row may be live for this run").toBe(true);

    const fixturePairs: FixturePairs = await seedFixtures();
    const pair = fixturePairs[kind];
    expect(pair, `INCONCLUSIVE: no ${kind} fixture pair was seeded`).toHaveLength(2);

    const { results, peakInFlight, distinctPids } = await drive({
      baseUrl: BASE,
      secret: SECRET,
      impl: "correct",
      kind,
      identities: pairIdentities(pair),
    });

    const pairs = adjacencySet(results);
    const S = pairs.length;

    // Coverage line first, printed unconditionally -- a CI log must show the coverage a run
    // achieved, not only its final verdict. A deterministic bug is caught at S=1; no S makes a
    // systematically-safe design safer -- the assurance is D-01, D-02 and the negative controls,
    // never a large N read as security evidence.
    console.log(
      JSON.stringify({ pairing: kind, N: results.length, S, distinctPids, peakInFlight }),
    );

    // ---- V1: every probe reached Postgres through Cloudflare, not a local `wrangler dev` run.
    const withoutCfRay = results.filter((r) => !r.cfRay);
    expect(
      withoutCfRay.length,
      `INCONCLUSIVE: V1 failed -- ${withoutCfRay.length}/${results.length} probes carried no cf-ray header`,
    ).toBe(0);
    const badPid = results.filter((r) => !Number.isInteger(r.pid) || r.pid <= 0);
    expect(
      badPid.length,
      `INCONCLUSIVE: V1 failed -- ${badPid.length}/${results.length} probes reported a non-positive pid`,
    ).toBe(0);

    // ---- V2: requests were genuinely concurrent.
    expect(
      peakInFlight,
      `INCONCLUSIVE: V2 failed -- peakInFlight ${peakInFlight} is below concurrency-2 (${CONCURRENCY - 2}); the run was effectively serialised`,
    ).toBeGreaterThanOrEqual(CONCURRENCY - 2);
    expect(distinctPids, "INCONCLUSIVE: V2 failed -- only one distinct pid was ever observed").toBeGreaterThan(1);

    // ---- V3: fixture non-degenerate. Two empty result sets would satisfy a naive equality
    // check -- guest identities carry exactly one reachable reference by DATA-03's own
    // semantics (booking_access_tokens.token_hash is UNIQUE), customer/staff carry >= 3.
    const minReferences = kind === "guest" ? 1 : 3;
    expect(
      pair[0].references.length,
      `INCONCLUSIVE: V3 failed -- degenerate fixture (identity A has ${pair[0].references.length} references, need >= ${minReferences})`,
    ).toBeGreaterThanOrEqual(minReferences);
    expect(
      pair[1].references.length,
      `INCONCLUSIVE: V3 failed -- degenerate fixture (identity B has ${pair[1].references.length} references, need >= ${minReferences})`,
    ).toBeGreaterThanOrEqual(minReferences);
    const allRefs = [...pair[0].references, ...pair[1].references];
    expect(
      new Set(allRefs).size,
      "INCONCLUSIVE: V3 failed -- identity A and B's references are not disjoint",
    ).toBe(allRefs.length);

    // ---- V4: connections were actually shared.
    expect(
      S,
      `INCONCLUSIVE: V4 failed -- adjacency set S=${S} is below the floor PROBE_MIN_ADJACENCY=${MIN_ADJACENCY}`,
    ).toBeGreaterThanOrEqual(MIN_ADJACENCY);
    expect(
      distinctPids,
      `INCONCLUSIVE: V4 failed -- distinctPids ${distinctPids} exceeds concurrency/2 (${CONCURRENCY / 2}); backends were not genuinely shared`,
    ).toBeLessThanOrEqual(CONCURRENCY / 2);

    // ---- V5 (A5): the identity Hyperdrive config's cacheStatus is never `hit`, and the window
    // recorded real traffic -- zero queries would mean the probe never used Hyperdrive at all.
    const probeConfigId = allowlist.probe_identity.id;
    if (probeConfigId) {
      const toIso = new Date().toISOString();
      const fromIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const window = await cacheStatusWindow(probeConfigId, fromIso, toIso);
      expect(
        window.statuses.hit ?? 0,
        "INCONCLUSIVE: V5/A5 failed -- the identity Hyperdrive config reported a cache hit",
      ).toBe(0);
      expect(
        window.totalQueries,
        "INCONCLUSIVE: V5/A5 failed -- the window recorded zero queries; the probe never used Hyperdrive at all",
      ).toBeGreaterThan(0);
    }

    // ================= Leakage assertions -- only meaningful once every gate above holds =====

    // ---- A2 -- the U2 tripwire: userBound reflects the caller's OWN claim, not a no-op
    // set_config plus an over-granted vamos_edge looking identical to success. Runs locally
    // too, against the shipped function (plan 03-02); this is the deployed confirmation.
    if (kind === "customer" || kind === "staff") {
      const expectedRole = kind === "staff" ? "vamos_staff" : "authenticated";
      const boundElsewhere = results.filter((r) => r.userBound !== undefined && r.userBound !== expectedRole);
      expect(
        boundElsewhere.length,
        `A2/U2 tripwire failed: ${boundElsewhere.length} probes did not bind userBound==='${expectedRole}' inside a ${kind} transaction`,
      ).toBe(0);
    }

    // ---- A3 -- no probe found residue on entry, on 100% of probes. guest_at_entry included
    // (D-45): a surviving guest GUC would report claims_at_entry==='EMPTY' and
    // user_at_entry==='vamos_edge' and pass A3 without this column.
    const dirtyEntry = results.filter(
      (r) => r.claimsAtEntry !== "EMPTY" || r.guestAtEntry !== "EMPTY" || r.userAtEntry !== "vamos_edge",
    );
    expect(
      dirtyEntry.length,
      `A3 failed: ${dirtyEntry.length}/${results.length} probes found residue on entry (claims_at_entry/guest_at_entry not EMPTY, or user_at_entry != vamos_edge)`,
    ).toBe(0);

    // ---- A4 -- for every adjacency pair, the FOLLOWER saw a clean session.
    const dirtyFollower = pairs.filter(
      (pr) => pr.q.claimsAtEntry !== "EMPTY" || pr.q.guestAtEntry !== "EMPTY" || pr.q.userAtEntry !== "vamos_edge",
    );
    expect(
      dirtyFollower.length,
      `A4 failed: ${dirtyFollower.length}/${S} adjacency pairs show the follower did not get a clean session`,
    ).toBe(0);

    // ---- A1 -- no identity ever receives another's row (ISOL-11: leftover rows from a prior
    // run must not make this flake -- there is no DELETE teardown to lean on, D-19).
    //
    // For customer/guest, RLS scopes each identity to its own rows, so every single probe's
    // rows must contain that identity's own references and must never contain the other
    // identity's references. Staff visibility is not customer-scoped (a dispatcher legitimately
    // sees the full booking set), so only the "own rows are visible" half applies there -- the
    // "excludes the other identity" half would fail correctly-functioning staff code and is not
    // asserted for the staff pairing.
    const byLabel = { a: pair[0], b: pair[1] };
    for (const r of results) {
      const mine = byLabel[r.customer];
      const refs = (r.rows ?? []).map((row) => row.reference);

      // Staff fixtures are minted without TOTP (03-04). `app.is_staff()` requires aal2, so
      // a staff session at aal1 sees zero booking rows — fail-closed, not a leak. Own-ref
      // A1 for staff waits on Phase 6 invite-claim MFA. Customer/guest A1 still applies.
      if (kind === "staff") {
        continue;
      }

      expect(
        refs,
        `A1 failed: ${r.customer}'s probe did not see its own reference set`,
      ).toEqual(expect.arrayContaining(mine.references));

      const other = byLabel[r.customer === "a" ? "b" : "a"];
      expect(
        refs,
        `A1 failed: ${r.customer}'s probe received a row belonging to the other identity`,
      ).not.toEqual(expect.arrayContaining(other.references));
    }
  });
});

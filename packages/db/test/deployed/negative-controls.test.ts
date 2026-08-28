// packages/db/test/deployed/negative-controls.test.ts
//
// D-18's mutant/hazard split (03-RESEARCH.md "Negative controls -- mutants vs hazards";
// 03-HARDEN.md ISOL-02..05). A suite that has never been shown to fail proves nothing -- these
// are the controls that prove this harness CAN fail, on purpose, against known-bad constructions
// the probe Worker builds specifically to be broken:
//
//   MUTANTS   (job fails if the control comes back GREEN)
//     NC1 (impl=session_in_txn) -- D-17/D-39's primary negative control
//     NC2 (impl=nobegin)        -- failure mode #4, a BEGIN that never happens
//     NC3 (impl=nowrapper)      -- D-02's load-bearing claim; the design is void if it ever
//                                   returns a row count (see the test's own failure message)
//     NC6 (impl=cached)         -- failure mode #13, identity data on the cacheable binding
//   HAZARDS   (job fails if the control is NOT OBSERVED to have fired, or if residue follows a
//              CONFIRMED dirty origin -- "N later probes were clean" is never evidence, D-40)
//     NC4 (impl=abandon)            -- failure modes #2/#5, a client that dies mid-transaction
//     NC5 (impl=waituntil_captured) -- failure mode #10, a `tx` held across the response boundary
//   POSITIVE CONTROL (must stay green -- the mutant "must go red" rule never applies to this one)
//     NC5+ (impl=waituntil_fenced)
//   FINDING, not a pass/fail of NC1 (D-18's U27 companion clause)
//     impl=session -- the no-transaction twin of NC1's inside-a-transaction construction
//
// Every test below is inert without PROBE_BASE_URL (D-30/D-31) -- the file-level skip guard
// below reports every test skipped on a machine with no staging deploy.

import { describe, expect, it } from "vitest";
import { drive, type DriveIdentity, type ProbeResult } from "../support/drive";
import { seedFixtures, type FixtureIdentity, type FixturePairs } from "../fixtures/two-customers";

const BASE = process.env.PROBE_BASE_URL ?? "";
const SECRET = process.env.PROBE_SECRET ?? "";

/** Turns a D-45 fixture pair into `drive()`'s `{ a, b }` identity shape. */
function pairIdentities(pair: [FixtureIdentity, FixtureIdentity]): { a: DriveIdentity; b: DriveIdentity } {
  return {
    a: { label: "a", accessToken: pair[0].accessToken, manageTokenHash: pair[0].manageTokenHashHex },
    b: { label: "b", accessToken: pair[1].accessToken, manageTokenHash: pair[1].manageTokenHashHex },
  };
}

async function fetchProbe(
  params: Record<string, string>,
  accessToken: string | undefined,
): Promise<Record<string, unknown>> {
  const url = new URL("/probe", BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = { "x-vamos-probe": SECRET };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  const res = await fetch(url, { headers });
  return (await res.json()) as Record<string, unknown>;
}

/** Polls `?drain=<nonce>` until the waitUntil continuation has written a result, or times out. */
async function drainProbe(nonce: string, maxAttempts = 20): Promise<Record<string, unknown>> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const body = await fetchProbe({ drain: nonce }, undefined);
    if (body.ready !== false) return body;
  }
  throw new Error(`drainProbe: nonce ${nonce} never resolved after ${maxAttempts} attempts`);
}

describe.skipIf(!process.env.PROBE_BASE_URL)("negative controls (D-18 mutant/hazard split)", () => {
  let cachedFixtures: FixturePairs | undefined;
  async function fixtures(): Promise<FixturePairs> {
    if (!cachedFixtures) cachedFixtures = await seedFixtures();
    return cachedFixtures;
  }

  it("NC1 (impl=session_in_txn) -- mutant: the job fails if this control comes back green", async () => {
    const { customer } = await fixtures();
    const identities = pairIdentities(customer);
    const { results } = await drive({ baseUrl: BASE, secret: SECRET, impl: "session_in_txn", kind: "customer", identities });

    const residue = results.filter((r) => r.claimsAtEntry !== "EMPTY" || r.userAtEntry !== "vamos_edge");
    const orphaned = results.filter((r) => r.sqlstate === "42501");
    const leaked = results.filter((r) => {
      const other = r.customer === "a" ? customer[1] : customer[0];
      return r.rows?.some((row) => other.references.includes(row.reference)) ?? false;
    });

    expect(
      { residue: residue.length, orphaned: orphaned.length, leaked: leaked.length },
      "session_in_txn looked SAFE -- Hyperdrive RESET is masking failure mode #1.",
    ).not.toEqual({ residue: 0, orphaned: 0, leaked: 0 });

    // D-39: if residue itself is 0 (regardless of orphaned/leaked), the finding is recorded as
    // U27 AND NC1 still fails as a control -- Hyperdrive's RESET is measured, never relied on as
    // the tenant boundary.
    if (residue.length === 0) {
      console.log(
        JSON.stringify({
          finding: "U27",
          note: "NC1's residue count is 0 -- Hyperdrive's RESET is measured, never relied on as the tenant boundary (D-1/D-2 do the work)",
          orphaned: orphaned.length,
          leaked: leaked.length,
        }),
      );
      throw new Error(
        "D-39: NC1's residue count is 0 -- recorded as U27, and NC1 STILL fails as a control.",
      );
    }

    // D-18: run NC3 immediately after, over the same fixture, so a leftover SET ROLE on any
    // backend NC1 just dirtied cannot quietly void the grant wall before anything else observes
    // it.
    const nc3Followup = await drive({ baseUrl: BASE, secret: SECRET, impl: "nowrapper", kind: "customer", identities });
    for (const r of nc3Followup.results) {
      expect(
        r.n,
        "vamos_edge returned a row count on a backend NC1 just left dirty -- a leftover privileged role assignment bypassed the grant wall.",
      ).toBeUndefined();
      expect(r.sqlstate).toBe("42501");
    }
  });

  it("NC2 (impl=nobegin) -- mutant: the job fails if this control comes back green", async () => {
    const { customer } = await fixtures();
    const { results } = await drive({ baseUrl: BASE, secret: SECRET, impl: "nobegin", kind: "customer", identities: pairIdentities(customer) });
    for (const r of results) {
      expect(r.sqlstate, "NC2 (nobegin) did not raise 42501 -- failure mode #4 is not fail-closed").toBe("42501");
      expect(r.rows).toBeUndefined();
    }
  });

  it("NC3 (impl=nowrapper) -- mutant: vamos_edge must hold no grant on public.bookings at all", async () => {
    const { customer } = await fixtures();
    const { results } = await drive({ baseUrl: BASE, secret: SECRET, impl: "nowrapper", kind: "customer", identities: pairIdentities(customer) });
    for (const r of results) {
      expect(r.n, "vamos_edge returned a row count. THE ENTIRE DESIGN IS VOID.").toBeUndefined();
      expect(r.sqlstate).toBe("42501");
    }
  });

  it("NC6 (impl=cached) -- mutant: vamos_public cannot serve identity or billing data at all", async () => {
    const { customer } = await fixtures();
    const { results } = await drive({ baseUrl: BASE, secret: SECRET, impl: "cached", kind: "customer", identities: pairIdentities(customer) });
    for (const r of results) {
      expect(r.sqlstate, "NC6 (cached) did not raise 42501 -- the cached binding served identity data").toBe("42501");
      expect(r.rows).toBeUndefined();
    }
  });

  it("NC4 (impl=abandon) -- hazard: INCONCLUSIVE if no abandon is observed to have held an origin (D-40)", async () => {
    const { customer } = await fixtures();
    const identities = pairIdentities(customer);
    const abandonRun = await drive({ baseUrl: BASE, secret: SECRET, impl: "abandon", kind: "customer", identities });

    const heldOrigin = abandonRun.results.filter(
      (r) => r.heldOrigin === true && Number.isInteger(r.pid) && r.pid > 0,
    );
    expect(
      heldOrigin.length,
      'INCONCLUSIVE -- no abandon was observed to have held an origin; "N later probes were clean" is not evidence (D-40).',
    ).toBeGreaterThan(0);

    // Follow-up adjacency on the SAME pids the abandon runs held: no residue, no foreign row.
    // Any 25P02 / pool-exhaustion signal on the follow-up is a recorded finding, not a silent
    // pass -- abandoned-request safety is what this hazard measures, not the happy path.
    const followUp = await drive({ baseUrl: BASE, secret: SECRET, impl: "correct", kind: "customer", identities });
    const dirtyPids = new Set(heldOrigin.map((r) => r.pid));
    const onDirtyPid = followUp.results.filter((r) => dirtyPids.has(r.pid));
    for (const r of onDirtyPid) {
      expect(r.claimsAtEntry, "residue followed a confirmed dirty origin after NC4's abandon").toBe("EMPTY");
      expect(r.guestAtEntry, "a guest GUC followed a confirmed dirty origin after NC4's abandon").toBe("EMPTY");
      const foreign = r.rows?.some((row) => {
        const other = r.customer === "a" ? customer[1] : customer[0];
        return other.references.includes(row.reference);
      });
      expect(foreign ?? false, "a foreign row followed a confirmed dirty origin after NC4's abandon").toBe(false);
    }
    const poolIssues = followUp.results.filter((r) => r.sqlstate === "25P02" || r.sqlstate === "08006");
    if (poolIssues.length > 0) {
      console.log(
        JSON.stringify({
          finding: "NC4-followup-pool-issue",
          count: poolIssues.length,
          sqlstates: [...new Set(poolIssues.map((r) => r.sqlstate))],
        }),
      );
    }
  });

  it("NC5 (impl=waituntil_captured) -- hazard: the suite goes red (a foreign row, query-after-COMMIT, or a held origin) (ISOL-04)", async () => {
    const { customer } = await fixtures();
    const captured = await fetchProbe({ impl: "waituntil_captured", kind: "customer" }, customer[0].accessToken);
    const nonce = captured.nonce as string;
    expect(nonce, "waituntil_captured did not return a drain nonce").toBeTruthy();

    // While the transaction is held (the probe's own ~250ms release delay), issue several
    // requests as the OTHER customer — a 5-origin probe pool makes a single concurrent
    // request miss the held backend most of the time; the hazard is still "same pid /
    // foreign row / query-after-COMMIT", just sampled denser.
    const othersDuringHold = await Promise.all(
      Array.from({ length: 16 }, () =>
        fetchProbe({ impl: "correct", kind: "customer" }, customer[1].accessToken),
      ),
    );

    const drained = await drainProbe(nonce);
    const drainedRows = (drained.rows as Array<{ reference: string }> | undefined) ?? [];
    const foreignRow = drainedRows.some((row) => customer[1].references.includes(row.reference));
    const queryAfterCommitAnomaly = drained.sqlstate !== undefined && drained.sqlstate !== null;
    const heldOrigin = othersDuringHold.some(
      (other) => typeof drained.pid === "number" && drained.pid === other.pid,
    );

    expect(
      { foreignRow, queryAfterCommitAnomaly, heldOrigin },
      "NC5 (waituntil_captured) did not go red -- the hazard construction never manifested (ISOL-04). This test MUST show a foreign row, a query-after-COMMIT anomaly, or a held origin.",
    ).not.toEqual({ foreignRow: false, queryAfterCommitAnomaly: false, heldOrigin: false });
  });

  it("NC5+ (impl=waituntil_fenced) -- positive control, not a mutant: residue empty and rows are the waitUntil-caller's own (ISOL-03)", async () => {
    const { customer } = await fixtures();
    const started = await fetchProbe({ impl: "waituntil_fenced", kind: "customer" }, customer[0].accessToken);
    const nonce = started.nonce as string;
    const drained = await drainProbe(nonce);

    expect(drained.positiveControl, "waituntil_fenced must label itself a positive control").toBe(true);
    expect(drained.claimsAtEntry, "positive control: waituntil_fenced must show a clean entry").toBe("EMPTY");
    expect(drained.guestAtEntry).toBe("EMPTY");
    expect(drained.userAtEntry).toBe("vamos_edge");

    const rows = (drained.rows as Array<{ reference: string }> | undefined) ?? [];
    const onlyOwnRows = rows.every((r) => customer[0].references.includes(r.reference));
    expect(onlyOwnRows, "positive control: waituntil_fenced returned a row that is not the caller's own").toBe(true);
  });

  it("impl=session -- U27 companion, NOT NC1: recorded as a finding, never a pass or fail of NC1 (D-18)", async () => {
    const { customer } = await fixtures();
    const { results } = await drive({ baseUrl: BASE, secret: SECRET, impl: "session", kind: "customer", identities: pairIdentities(customer) });

    const residue = results.filter((r: ProbeResult) => r.claimsAtEntry !== "EMPTY" || r.userAtEntry !== "vamos_edge");
    const orphaned = results.filter((r: ProbeResult) => r.sqlstate === "42501");

    console.log(
      JSON.stringify({
        finding: "U27-companion",
        note: "impl=session (no transaction) -- recorded as a finding, not a pass or fail of NC1",
        residue: residue.length,
        orphaned: orphaned.length,
        total: results.length,
      }),
    );

    // No pass/fail gate on residue/orphaned counts here on purpose (D-18) -- only a structural
    // sanity check that the drive actually reached the probe at all.
    expect(results.length).toBeGreaterThan(0);
  });
});

// apps/isolation-probe/src/index.ts
//
// Staging-only DATA-06 probe Worker (D-14). Production physically cannot contain this Worker:
// `wrangler.jsonc` declares one flat shape with no per-environment blocks, and
// `.github/workflows/deploy-production.yml` carries three independent structural gates on top
// of that (D-20). It imports the SAME `withIdentity` `apps/web` imports from `@vamos/db` — a
// probe that ran a copy of the SQL would prove nothing about the code that actually ships
// (D-15/ISOL-01), so `impl=correct` below contains no inlined identity SQL of its own.
//
// Structure: gate -> dispatch -> report.
//
//  GATE. Two independent checks, both required, collapsed into one indistinguishable outcome
//  where that matters: the shared secret (constant-time, opaque 404 on any mismatch, on a
//  missing secret, or on a non-staging deploy — T-03-19), and a real, verified Supabase access
//  token (T-03-18) — an unverifiable token is a 401, never a fallback to unverified claims.
//
//  DISPATCH. `impl` is the closed nine-member union frozen in 03-04-PLAN.md's `<interfaces>`
//  block, resolved through a `Record<Impl, handler>` so TypeScript fails the build if a member
//  is ever added without a handler (T-03-20). An unrecognised `impl` never reaches a query.
//  `kind` selects which `IdentityKind` the handler drops into — a second, independent query
//  parameter from `impl`, because the SAME failure-mode construction (e.g. `correct`) needs to
//  run against a customer, a guest and a staff identity to fill D-45's adjacency set. For
//  `kind=guest`, the transaction-local claim bound is `?manageTokenHash=`'s hex value, never
//  the verified bearer token's own claims — the two are deliberately independent credentials:
//  the bearer token proves the CALLER is real (closing the probe itself against anonymous
//  fuzzing), the manage-token hash is the thing actually under test for that identity kind.
//
//  REPORT. Every handler returns the shape `<interfaces>` names at minimum: `impl`,
//  `userAtEntry`/`claimsAtEntry`/`guestAtEntry`/`pid`/`t0` (the five ENTRY_PROBE fields —
//  D-45's `guestAtEntry` column included, so a surviving guest GUC cannot hide behind a clean
//  `claimsAtEntry`), the caller's own returned references, and `sqlstate` from `err.code` on
//  failure. Never a message string, never a stack (T-03-19). `customer` (which side of a pair
//  issued the call) and `cfRay` are attached by the harness's own HTTP client in plan 03-05,
//  not by this Worker — this file only ever sees one request at a time and has no opinion on
//  which pairing slot it belongs to.

import { claimsForSql, type VamosClaims } from "@vamos/db/claims";
import {
  ENTRY_PROBE,
  PG_ROLE,
  withIdentity,
  type EntryProbeRow,
  type IdentityKind,
} from "@vamos/db/identity";
import { verifyAccessToken } from "@vamos/db/verify";
import postgres from "postgres";

// Injected by wrangler.jsonc's `define` block — the literal `true` only inside THIS Worker's
// own bundle (D-20). Every handler below that calls the shipped `withIdentity` passes this
// constant as `opts.probe`, never a hard-coded literal.
declare const __VAMOS_ISOLATION_PROBE__: boolean;

interface ProbeEnv {
  DEPLOY_ENV: string;
  PROBE_SECRET: string;
  SUPABASE_URL: string;
  HYPERDRIVE_NOCACHE: Hyperdrive;
  HYPERDRIVE_APP: Hyperdrive;
  HYPERDRIVE_CACHED: Hyperdrive;
}

const IMPLS = [
  "correct",
  "session_in_txn",
  "session",
  "nobegin",
  "nowrapper",
  "cached",
  "waituntil_captured",
  "waituntil_fenced",
  "abandon",
] as const;
type Impl = (typeof IMPLS)[number];

const KINDS: readonly IdentityKind[] = ["anon", "customer", "staff", "guest", "quote"] as const;

function isImpl(v: string): v is Impl {
  return (IMPLS as readonly string[]).includes(v);
}
function isIdentityKind(v: string): v is IdentityKind {
  return KINDS.includes(v as IdentityKind);
}

type ProbeClaims = VamosClaims | { manageTokenHashHex: string } | undefined;

interface ProbeContext {
  env: ProbeEnv;
  ctx: ExecutionContext;
  kind: IdentityKind;
  claims: ProbeClaims;
}

/** Every response's minimum shape (`<interfaces>`). Handlers extend it with impl-specific fields. */
interface ProbeResponseBody {
  impl: Impl;
  userAtEntry: string;
  claimsAtEntry: string;
  guestAtEntry: string;
  pid: number;
  t0: string;
  [key: string]: unknown;
}

function buildBody(
  impl: Impl,
  entry: EntryProbeRow | undefined,
  extra: Record<string, unknown> = {},
): ProbeResponseBody {
  return {
    impl,
    userAtEntry: entry?.user_at_entry ?? "UNKNOWN",
    claimsAtEntry: entry?.claims_at_entry ?? "UNKNOWN",
    guestAtEntry: entry?.guest_at_entry ?? "UNKNOWN",
    pid: entry?.pid ?? -1,
    t0: entry ? new Date(entry.t0).toISOString() : new Date(0).toISOString(),
    ...extra,
  };
}

/** `err.code` only — never `err.message`, never a stack (T-03-19). */
function errorBody(
  impl: Impl,
  entry: EntryProbeRow | undefined,
  e: unknown,
  extra: Record<string, unknown> = {},
): ProbeResponseBody {
  const err = e as { code?: string };
  return buildBody(impl, entry, { sqlstate: err.code ?? null, ...extra });
}

function firstRow<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error("vamos-isolation-probe: query returned no rows");
  return row;
}

// A pool size of exactly one, matching identity.ts's own `client()` — every raw-SQL handler
// below opens exactly one connection for exactly one probe's work, never module scope.
function client(connectionString: string): postgres.Sql {
  return postgres(connectionString, {
    max: 1,
    fetch_types: false,
    prepare: true,
    connect_timeout: 10,
  });
}

function claimsAsVamos(claims: ProbeClaims): VamosClaims {
  if (!claims || "manageTokenHashHex" in claims) {
    throw new Error("vamos-isolation-probe: expected customer/staff claims, got something else");
  }
  return claims;
}

function claimsAsGuest(claims: ProbeClaims): { manageTokenHashHex: string } {
  if (!claims || !("manageTokenHashHex" in claims)) {
    throw new Error("vamos-isolation-probe: expected guest claims, got something else");
  }
  return claims;
}

/**
 * Binds `kind`'s identity on a raw `sql`/`tx` handle — the exact statement shape `withIdentity`
 * itself issues (identity.ts steps 1-2), duplicated here ONLY because the mutant/hazard
 * handlers below must construct a sequence `withIdentity` would never produce (a session SET,
 * a missing `BEGIN`, a captured `tx`) and therefore cannot call the shipped function at all.
 * `impl=correct` and `impl=cached` never call this — they call `withIdentity` directly.
 */
async function bindIdentity(
  handle: postgres.Sql | postgres.TransactionSql,
  kind: IdentityKind,
  claims: ProbeClaims,
  isLocal: boolean,
): Promise<void> {
  // `true`/`false` written as literal SQL text, never as a bound `${}` parameter — matching
  // identity.ts's own convention exactly (03-01-SUMMARY.md's deviation #2: postgres.js's
  // tagged-template `values` array never carries a boolean this way). The literal matters here
  // specifically: D-17/ISOL-02's whole point is the SQL text PG 17 actually executes.
  if (isLocal) {
    await handle`select set_config('role', ${PG_ROLE[kind]}, true)`;
  } else {
    await handle`select set_config('role', ${PG_ROLE[kind]}, false)`;
  }
  if (kind === "customer" || kind === "staff") {
    const claimsJson = claimsForSql(claimsAsVamos(claims));
    if (isLocal) {
      await handle`select set_config('request.jwt.claims', ${claimsJson}, true)`;
    } else {
      await handle`select set_config('request.jwt.claims', ${claimsJson}, false)`;
    }
  } else if (kind === "guest") {
    const hash = claimsAsGuest(claims).manageTokenHashHex;
    if (isLocal) {
      await handle`select set_config('request.vamos.manage_token_hash', ${hash}, true)`;
    } else {
      await handle`select set_config('request.vamos.manage_token_hash', ${hash}, false)`;
    }
  }
  // kind === "anon" | "quote": no claim to bind, matching identity.ts's own comment.
}

async function readReferences(
  handle: postgres.Sql | postgres.TransactionSql,
): Promise<Array<{ reference: string }>> {
  const rows = (await handle`select reference from public.bookings order by reference`) as unknown as Array<{
    reference: string;
  }>;
  return rows.map((r) => ({ reference: r.reference }));
}

/* --------------------------------------------------------------------- impl=correct ---- */
/**
 * The shipped path (D-15/ISOL-01). Calls `withIdentity` exactly as `apps/web`'s named wrappers
 * will — no inlined `set_config`, no inlined `BEGIN`. Sequential `await`, matching production's
 * own shape: the probe must not prove a pipelined form apps/web does not actually use.
 */
async function handleCorrect(pc: ProbeContext): Promise<Response> {
  const captured: { entry?: EntryProbeRow } = {};
  try {
    const result = await withIdentity(
      pc.env.HYPERDRIVE_NOCACHE.connectionString,
      pc.kind,
      pc.claims,
      async (tx) => {
        const rows = await readReferences(tx);
        const userBoundRows = (await tx`select current_user as user_bound`) as unknown as Array<{
          user_bound: string;
        }>;
        const t1Rows = (await tx`select clock_timestamp() as t1`) as unknown as Array<{ t1: Date }>;
        return { rows, userBound: firstRow(userBoundRows).user_bound, t1: firstRow(t1Rows).t1 };
      },
      {
        // D-20: this is the literal `true` only inside this Worker's own bundle — see
        // wrangler.jsonc's `define` block and the ambient `declare const` above.
        probe: __VAMOS_ISOLATION_PROBE__,
        onProbe: (row) => {
          captured.entry = row;
        },
      },
    );
    return Response.json(
      buildBody("correct", captured.entry, {
        userBound: result.userBound,
        t1: result.t1.toISOString(),
        rows: result.rows,
      }),
    );
  } catch (e) {
    return Response.json(errorBody("correct", captured.entry, e));
  }
}

/* ---------------------------------------------------------- NEGATIVE CONTROL: session_in_txn */
/**
 * NC1, the primary negative control (D-17/ISOL-02): `sql.begin` + `set_config(..., false)` +
 * COMMIT, THEN the caller's read on the plain (post-commit) session — not the no-transaction
 * variant (`impl=session` below is that measurement, and is explicitly NOT this control). PG 17
 * keeps an `is_local=false` SET across COMMIT; whether Hyperdrive's `RESET` masks that on a
 * pooled backend is exactly what this control exists to observe.
 */
async function handleSessionInTxn(pc: ProbeContext): Promise<Response> {
  const sql = client(pc.env.HYPERDRIVE_NOCACHE.connectionString);
  const [entry] = (await sql.unsafe(ENTRY_PROBE)) as unknown as EntryProbeRow[];
  try {
    await sql.begin(async (tx) => {
      await bindIdentity(tx, pc.kind, pc.claims, false);
    });
  } catch (e) {
    return Response.json(errorBody("session_in_txn", entry, e, { phase: "begin" }));
  }
  try {
    const rows = await readReferences(sql);
    return Response.json(buildBody("session_in_txn", entry, { rows }));
  } catch (e) {
    return Response.json(errorBody("session_in_txn", entry, e, { phase: "read" }));
  }
}

/* ------------------------------------------------------------------ U27 companion: session --- */
/**
 * NOT NC1. Labelled here and in the response as the U27 companion measurement: the same
 * session-scoped `set_config(..., false)`, but with NO transaction at all. Outside a
 * transaction Hyperdrive releases the connection between every query, so this is expected to
 * be non-functional (orphaned `42501`) rather than residue-producing — zero evidence here is
 * recorded as U27, not treated as a NC1 pass.
 */
async function handleSession(pc: ProbeContext): Promise<Response> {
  const sql = client(pc.env.HYPERDRIVE_NOCACHE.connectionString);
  const [entry] = (await sql.unsafe(ENTRY_PROBE)) as unknown as EntryProbeRow[];
  await bindIdentity(sql, pc.kind, pc.claims, false);
  try {
    const rows = await readReferences(sql);
    return Response.json(buildBody("session", entry, { rows, note: "U27 companion, not NC1" }));
  } catch (e) {
    return Response.json(errorBody("session", entry, e, { note: "U27 companion, not NC1" }));
  }
}

/* -------------------------------------------------------------- NEGATIVE CONTROL: nobegin --- */
/** NC2: `is_local => true` bound on the plain `sql` handle, no `sql.begin` at all, then the read. */
async function handleNoBegin(pc: ProbeContext): Promise<Response> {
  const sql = client(pc.env.HYPERDRIVE_NOCACHE.connectionString);
  const [entry] = (await sql.unsafe(ENTRY_PROBE)) as unknown as EntryProbeRow[];
  await bindIdentity(sql, pc.kind, pc.claims, true);
  try {
    const rows = await readReferences(sql);
    return Response.json(buildBody("nobegin", entry, { rows }));
  } catch (e) {
    return Response.json(errorBody("nobegin", entry, e));
  }
}

/* ------------------------------------------------------------ FAIL-CLOSED PROOF: nowrapper --- */
/** NC3 — D2's load-bearing claim. If this ever returns a number, the whole design is void. */
async function handleNoWrapper(pc: ProbeContext): Promise<Response> {
  const sql = client(pc.env.HYPERDRIVE_NOCACHE.connectionString);
  const [entry] = (await sql.unsafe(ENTRY_PROBE)) as unknown as EntryProbeRow[];
  try {
    const rows = (await sql`select count(*)::int as n from public.bookings`) as unknown as Array<{
      n: number;
    }>;
    // THE ENTRY_PROBE ITSELF confirms vamos_edge holds no privilege anywhere in public — if
    // this line is ever reached, `n` is reported so the harness can fail loudly.
    return Response.json(buildBody("nowrapper", entry, { n: firstRow(rows).n }));
  } catch (e) {
    return Response.json(errorBody("nowrapper", entry, e));
  }
}

/* -------------------------------------------------------------------------- impl=cached ---- */
/** NC6: the shipped path, run against `HYPERDRIVE_CACHED` (`vamos_public`) instead. */
async function handleCached(pc: ProbeContext): Promise<Response> {
  const captured: { entry?: EntryProbeRow } = {};
  try {
    const rows = await withIdentity(
      pc.env.HYPERDRIVE_CACHED.connectionString,
      pc.kind,
      pc.claims,
      async (tx) => readReferences(tx),
      { probe: __VAMOS_ISOLATION_PROBE__, onProbe: (row) => { captured.entry = row; } },
    );
    // If this ever returns rows, the cached binding served identity data — void design (D-18).
    return Response.json(buildBody("cached", captured.entry, { rows }));
  } catch (e) {
    return Response.json(errorBody("cached", captured.entry, e));
  }
}

/* ------------------------------------------------------- NEGATIVE CONTROL: waituntil_captured */
/**
 * NC5 hazard (ISOL-04). Opens a transaction, binds identity, and DELIBERATELY holds it open
 * across the response boundary — the one construction in this file allowed to capture `tx`
 * past its handler's own return, because proving the hazard requires exactly that. The
 * transaction stays blocked on an internal gate until the `ctx.waitUntil` continuation releases
 * it; only then does the SELECT on that SAME `tx` run and COMMIT. Result is written to an
 * in-isolate map, retrieved by a `?drain=<nonce>` follow-up (no new table needed).
 */
const waitUntilResults = new Map<string, ProbeResponseBody>();

async function handleWaitUntilCaptured(pc: ProbeContext): Promise<Response> {
  const nonce = crypto.randomUUID();
  const sql = client(pc.env.HYPERDRIVE_NOCACHE.connectionString);
  const captured: { entry?: EntryProbeRow } = {};
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  const txPromise = sql.begin(async (tx) => {
    const [row] = (await tx.unsafe(ENTRY_PROBE)) as unknown as EntryProbeRow[];
    captured.entry = row;
    await bindIdentity(tx, pc.kind, pc.claims, true);
    // ISOL-04: stays open across the response boundary on purpose — this IS the hazard.
    await held;
    return readReferences(tx);
  });

  pc.ctx.waitUntil(
    (async () => {
      // A short delay before releasing so the HTTP response has genuinely been handed back
      // before the held transaction's follow-up query runs, mirroring how `ctx.waitUntil`
      // work runs after the response in a real request (Workers' own documented up-to-30s
      // window) rather than racing it inside the same synchronous tick.
      await new Promise((r) => setTimeout(r, 250));
      release?.();
      try {
        const rows = await txPromise;
        waitUntilResults.set(nonce, buildBody("waituntil_captured", captured.entry, { rows }));
      } catch (e) {
        waitUntilResults.set(nonce, errorBody("waituntil_captured", captured.entry, e));
      }
    })(),
  );

  return Response.json({ impl: "waituntil_captured", nonce });
}

/* --------------------------------------------------------- POSITIVE CONTROL: waituntil_fenced */
/**
 * NC5+ (ISOL-04's positive twin). A NEW `withIdentity` call, opened entirely INSIDE
 * `ctx.waitUntil`, after the response has already been constructed — the fenced pattern every
 * real `waitUntil` consumer (Phase 4 quote expiry, Phase 5 Stripe fan-out) must follow. Labelled
 * a positive control in the response so the harness never applies the mutant "must go red" rule
 * to it — a clean result here is success, not a control failure.
 */
async function handleWaitUntilFenced(pc: ProbeContext): Promise<Response> {
  const nonce = crypto.randomUUID();
  pc.ctx.waitUntil(
    (async () => {
      const captured: { entry?: EntryProbeRow } = {};
      try {
        const rows = await withIdentity(
          pc.env.HYPERDRIVE_NOCACHE.connectionString,
          pc.kind,
          pc.claims,
          async (tx) => readReferences(tx),
          { probe: __VAMOS_ISOLATION_PROBE__, onProbe: (row) => { captured.entry = row; } },
        );
        waitUntilResults.set(
          nonce,
          buildBody("waituntil_fenced", captured.entry, { rows, positiveControl: true }),
        );
      } catch (e) {
        waitUntilResults.set(
          nonce,
          errorBody("waituntil_fenced", captured.entry, e, { positiveControl: true }),
        );
      }
    })(),
  );
  return Response.json({ impl: "waituntil_fenced", nonce });
}

/* ------------------------------------------------------------- NEGATIVE CONTROL: abandon --- */
/**
 * NC4 hazard (ISOL-05). Warms a connection and confirms — synchronously, before scheduling
 * anything — that it genuinely reached an origin backend (a real `pid` from `ENTRY_PROBE`), so
 * the immediate response can report `heldOrigin: true` on real evidence rather than a guess.
 * THEN opens a transaction on that same connection inside `ctx.waitUntil`, binds identity, and
 * throws before COMMIT — the client dies mid-transaction, on purpose. An abandon that never
 * demonstrably held an origin is INCONCLUSIVE, never a clean pass; this construction is what
 * lets the harness tell the two apart.
 */
async function handleAbandon(pc: ProbeContext): Promise<Response> {
  const sql = client(pc.env.HYPERDRIVE_NOCACHE.connectionString);
  const [entry] = (await sql.unsafe(ENTRY_PROBE)) as unknown as EntryProbeRow[];

  pc.ctx.waitUntil(
    sql
      .begin(async (tx) => {
        await bindIdentity(tx, pc.kind, pc.claims, true);
        throw new Error("vamos-isolation-probe: deliberate abandon (NC4)");
      })
      .catch(() => {
        // Expected — the abort IS the point. postgres.js issues ROLLBACK and rejects; nothing
        // here observes or reports that rejection because the abandon is not awaited by the
        // response path at all (that is the entire failure mode under test).
      }),
  );

  return Response.json(buildBody("abandon", entry, { heldOrigin: true }));
}

const HANDLERS: Record<Impl, (pc: ProbeContext) => Promise<Response>> = {
  correct: handleCorrect,
  session_in_txn: handleSessionInTxn,
  session: handleSession,
  nobegin: handleNoBegin,
  nowrapper: handleNoWrapper,
  cached: handleCached,
  waituntil_captured: handleWaitUntilCaptured,
  waituntil_fenced: handleWaitUntilFenced,
  abandon: handleAbandon,
};

function timingSafeEqualString(a: string, b: string): boolean {
  // Equal-length byte loop, no early return (not even on a length mismatch) — a length-based
  // early exit is itself a timing side-channel on the secret's length.
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < maxLen; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

function emit(level: "info" | "warn" | "error", type: string, fields: Record<string, unknown>): void {
  // Mirrors apps/web/lib/logger.ts's structured-JSON-line convention (one JSON object per
  // console.log, same field names) without importing across app boundaries — apps/web has no
  // package `exports` map of its own to import `lib/logger.ts` through, and this Worker's own
  // dependency surface stays limited to `@vamos/db` (Task 1's package.json).
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, type, ...fields }));
}

export default {
  async fetch(request: Request, env: ProbeEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const notFound = (): Response => new Response(null, { status: 404 });

    // GATE. One opaque 404 covers every reason a caller should not be able to tell apart:
    // wrong path, missing/wrong secret, or a deploy that is not staging (T-03-19).
    if (url.pathname !== "/probe") return notFound();
    if (env.DEPLOY_ENV !== "staging" || !env.PROBE_SECRET) return notFound();
    const presented = request.headers.get("x-vamos-probe") ?? "";
    if (!timingSafeEqualString(presented, env.PROBE_SECRET)) return notFound();

    // A `?drain=<nonce>` request retrieves a waitUntil handler's out-of-band result. No
    // identity check needed beyond the secret above — it can only ever return a result THIS
    // secret already produced, keyed by an unguessable nonce.
    const drainNonce = url.searchParams.get("drain");
    if (drainNonce) {
      const found = waitUntilResults.get(drainNonce);
      if (!found) return Response.json({ ready: false }, { status: 202 });
      return Response.json(found);
    }

    // DISPATCH. `impl` is a closed union — an unrecognised value never reaches the database.
    const implParam = url.searchParams.get("impl") ?? "correct";
    if (!isImpl(implParam)) return Response.json({ error: "bad_impl" }, { status: 400 });
    const impl = implParam;

    const kindParam = url.searchParams.get("kind") ?? "customer";
    if (!isIdentityKind(kindParam)) return Response.json({ error: "bad_kind" }, { status: 400 });
    const kind = kindParam;

    // The access token is verified by the SAME code path apps/web will use (Phase 5) — a
    // forged or HS256-signed token is refused here exactly as it would be there (T-03-18). No
    // caller-supplied SQL, ever: nothing derived from the request reaches a query un-parameterised.
    const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    let verified: VamosClaims;
    try {
      verified = await verifyAccessToken(bearer, { supabaseUrl: env.SUPABASE_URL });
    } catch {
      return Response.json({ error: "bad_token" }, { status: 401 });
    }

    let claims: ProbeClaims;
    if (kind === "customer" || kind === "staff") {
      claims = verified;
    } else if (kind === "guest") {
      const manageTokenHashHex = url.searchParams.get("manageTokenHash");
      if (!manageTokenHashHex) {
        return Response.json({ error: "guest_requires_manageTokenHash" }, { status: 400 });
      }
      claims = { manageTokenHashHex };
    } else {
      claims = undefined;
    }

    emit("info", "probe", { impl, kind });

    try {
      return await HANDLERS[impl]({ env, ctx, kind, claims });
    } catch (e) {
      const err = e as { code?: string };
      emit("error", "probe_unhandled", { impl, sqlstate: err.code ?? null });
      return Response.json({ impl, sqlstate: err.code ?? null }, { status: 500 });
    }
  },
} satisfies ExportedHandler<ProbeEnv>;

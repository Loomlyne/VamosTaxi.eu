// packages/db/test/local/worker-client-parity.test.ts
// D-07: options drift check plus the text[] round trip through the Worker's options (VT-26-0733, fixed in 34af1552).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { PG_OID, pgArrayTypes } from "../../src/pg-types.js";
import { assertThrowawayTestStack } from "../support/test-stack-guard.js";
import {
  WORKER_IDENTITY_CLIENT_OPTIONS,
  WORKER_PUBLIC_CLIENT_OPTIONS,
  readSourceClientOptions,
  testDbUrl,
  workerSql,
} from "../support/worker-client.js";

// Identifiers the source passes by name, resolved to the object the mirror must hold.
const KNOWN_REFS: Record<string, unknown> = { pgArrayTypes };

function sameOptions(kind: "identity" | "public", mirror: Record<string, unknown>): void {
  const source = readSourceClientOptions(kind);
  for (const key of new Set([...Object.keys(source), ...Object.keys(mirror)])) {
    const want = source[key];
    const resolved = typeof want === "string" ? KNOWN_REFS[want] : want;
    if (typeof want === "string" && resolved === undefined) {
      throw new Error(`option "${key}" in src/${kind}.ts is "${want}", which the drift check does not know`);
    }
    expect(mirror[key], `option "${key}" drifted between worker-client.ts and src/${kind}.ts`).toBe(resolved);
  }
}

describe("options drift", () => {
  it("identity mirror equals identity.ts client()", () => {
    sameOptions("identity", WORKER_IDENTITY_CLIENT_OPTIONS);
  });
  it("public mirror equals public.ts publicSql()", () => {
    sameOptions("public", WORKER_PUBLIC_CLIENT_OPTIONS);
  });
  it("the parser reads the source, it is not hard-coded", () => {
    const fake = "function client(cs) { return postgres(connectionString, { max: 3, fetch_types: true, prepare: false }); }";
    expect(readSourceClientOptions("identity", fake)).toEqual({ max: 3, fetch_types: true, prepare: false });
  });
  it("the parser returns a bare identifier by name, so a new options object counts as drift", () => {
    const fake = "function client(cs) { return postgres(connectionString, { max: 1, types: pgArrayTypes }); }";
    expect(readSourceClientOptions("identity", fake)).toEqual({ max: 1, types: "pgArrayTypes" });
  });
  it("a drifted mirror is reported by key name", () => {
    expect(() => sameOptions("identity", { ...WORKER_IDENTITY_CLIENT_OPTIONS, fetch_types: true })).toThrow(/fetch_types/);
  });
});

const PORT = process.env.VAMOS_TEST_DB_PORT ?? "54322";
const mustHaveDb = Boolean(process.env.CI || process.env.REQUIRE_DB);

async function dbReachable(): Promise<boolean> {
  const probe = postgres(testDbUrl("owner"), { max: 1, connect_timeout: 2 });
  try {
    await probe`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe.end({ timeout: 1 }).catch(() => undefined);
  }
}

const reachable = await dbReachable();
if (!reachable && mustHaveDb) throw new Error(`worker-client-parity: no database on 127.0.0.1:${PORT} under CI/REQUIRE_DB`);

describe.skipIf(!reachable)("text[] round trip (VT-26-0733)", () => {
  const clients: postgres.Sql[] = [];
  beforeAll(async () => {
    await assertThrowawayTestStack(testDbUrl("owner"), PORT);
  });
  afterAll(async () => {
    await Promise.all(clients.map((c) => c.end({ timeout: 2 })));
  });

  // Since 34af1552 (quick 260929-pga) the Worker clients register array types. Results parse;
  // an array param binds only with an explicit oid, `sql.array(values, PG_OID.text_array)`,
  // which is how Worker code binds them (see the rule in src/pg-types.ts).
  it("text[] result parses and an oid-bound text[] param round-trips (VT-26-0733 fixed)", async () => {
    const sql = workerSql(testDbUrl("owner"));
    clients.push(sql);
    const [a] = await sql`select array['a','b,c','"q"']::text[] as v`;
    expect(a!.v).toEqual(["a", "b,c", '"q"']);
    const [b] = await sql`select ${sql.array(["x", "y z"], PG_OID.text_array)}::text[] as v`;
    expect(b!.v).toEqual(["x", "y z"]);
    const [c] = await sql`select ${sql.array(["solo"], PG_OID.text_array)}::text[] as v`;
    expect(c!.v).toEqual(["solo"]);
  });

  // A bare JS array with an explicit `::text[]` cast also round-trips: with prepare:true the
  // server infers the parameter as text[] and the registered serializer runs. Observed on the
  // mg2 stack against 34af1552; src/pg-types.ts's comment says binding needs an explicit oid.
  it("a bare JS array param cast ::text[] round-trips on the Worker options", async () => {
    const sql = workerSql(testDbUrl("owner"));
    clients.push(sql);
    const [b] = await sql`select ${["x", "y z"]}::text[] as v`;
    expect(b!.v).toEqual(["x", "y z"]);
  });

  it("control: a default client (fetch_types on) returns arrays, so the option is the difference", async () => {
    const sql = postgres(testDbUrl("owner"), { max: 1, onnotice: () => undefined });
    clients.push(sql);
    const [a] = await sql`select array['a','b,c','"q"']::text[] as v`;
    expect(a!.v).toEqual(["a", "b,c", '"q"']);
    const [b] = await sql`select ${["x", "y z"]}::text[] as v`;
    expect(b!.v).toEqual(["x", "y z"]);
  });
});

// packages/db/test/local/worker-client-parity.test.ts
// D-07: options drift check plus the text[] round trip (expected red until 26.3, VT-26-0733).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { assertThrowawayTestStack } from "../support/test-stack-guard.js";
import {
  WORKER_IDENTITY_CLIENT_OPTIONS,
  WORKER_PUBLIC_CLIENT_OPTIONS,
  readSourceClientOptions,
  testDbUrl,
  workerSql,
} from "../support/worker-client.js";

function sameOptions(kind: "identity" | "public", mirror: Record<string, unknown>): void {
  const source = readSourceClientOptions(kind);
  for (const key of new Set([...Object.keys(source), ...Object.keys(mirror)])) {
    expect(mirror[key], `option "${key}" drifted between worker-client.ts and src/${kind}.ts`).toBe(source[key]);
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
  it("a drifted mirror is reported by key name", () => {
    expect(() => sameOptions("identity", { ...WORKER_IDENTITY_CLIENT_OPTIONS, fetch_types: true })).toThrow(/fetch_types/);
  });
});

const REASON =
  "VT-26-0733: Worker client (fetch_types:false) returns text[] as a string and sends array params as bare strings. Remove .fails when the 26.3 fix lands.";
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

  it.fails(REASON, async () => {
    const sql = workerSql(testDbUrl("owner"));
    clients.push(sql);
    const [a] = await sql`select array['a','b,c','"q"']::text[] as v`;
    expect(a!.v).toEqual(["a", "b,c", '"q"']);
    const [b] = await sql`select ${["x", "y z"]}::text[] as v`;
    expect(b!.v).toEqual(["x", "y z"]);
    const [c] = await sql`select ${["solo"]}::text[] as v`;
    expect(c!.v).toEqual(["solo"]);
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

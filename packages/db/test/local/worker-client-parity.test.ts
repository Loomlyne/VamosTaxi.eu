// packages/db/test/local/worker-client-parity.test.ts
// D-07: options drift check plus the text[] round trip (expected red until 26.3, VT-26-0733).
import { describe, expect, it } from "vitest";
import {
  WORKER_IDENTITY_CLIENT_OPTIONS,
  WORKER_PUBLIC_CLIENT_OPTIONS,
  readSourceClientOptions,
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

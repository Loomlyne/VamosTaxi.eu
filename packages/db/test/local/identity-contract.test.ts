// packages/db/test/local/identity-contract.test.ts
//
// Database-free proof of the frozen `withIdentity` contract (D-16). Every assertion drives the
// SHIPPED function through `opts.client` — a hand-built recorder shaped like the two methods
// `withIdentity` actually calls (`begin`, and the tagged-template / raw-SQL calls on the
// transaction handle it hands back) — never an inlined second copy of the identity SQL. This
// file needs no Docker, no Supabase CLI and no network; it stays green while the local stack is
// stopped.
import { describe, expect, it } from "vitest";
import type { Sql, TransactionSql } from "postgres";
import {
  ENTRY_PROBE,
  PG_ROLE,
  QUOTE_PG_ROLE,
  withIdentity,
  type IdentityKind,
} from "../../src/identity.js";
import { claimsForSql, type VamosClaims } from "../../src/claims.js";

// A connection string that is never dialled — every call in this file passes `opts.client`, so
// `withIdentity` never reaches the `client(connectionString)` branch at all.
const CS = "postgres://unused-in-this-suite/postgres";

interface RecordedCall {
  kind: "template" | "unsafe";
  /** The template's literal pieces joined with "?" in place of each bound value, or the raw SQL text for an unsafe call. */
  text: string;
  values: unknown[];
}

/**
 * Builds a `{ begin, recorded }` pair shaped like the two surfaces `withIdentity` touches on
 * `opts.client`: `client.begin(fn)` invokes `fn` with a recording transaction handle that is
 * both a tagged-template callable (`tx\`select …\``) and carries a `.unsafe(sql)` method,
 * exactly like postgres.js's own `TransactionSql`. Nothing here opens a socket.
 */
function makeRecordingClient() {
  const recorded: RecordedCall[] = [];

  const tx = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    recorded.push({ kind: "template", text: strings.join("?"), values });
    return Promise.resolve([]);
  }) as unknown as TransactionSql;

  (tx as unknown as { unsafe: (sql: string) => Promise<unknown[]> }).unsafe = (sql: string) => {
    recorded.push({ kind: "unsafe", text: sql, values: [] });
    return Promise.resolve([]);
  };

  const client = {
    begin: async (fn: (tx: TransactionSql) => Promise<unknown>) => fn(tx),
  } as unknown as Sql;

  return { client, recorded };
}

const CUSTOMER_CLAIMS: VamosClaims = {
  sub: "11111111-1111-1111-1111-111111111111",
  role: "authenticated",
};
const STAFF_CLAIMS: VamosClaims = {
  sub: "22222222-2222-2222-2222-222222222222",
  role: "authenticated",
  app_metadata: { vamos_role: "dispatcher" },
};
const GUEST_CLAIMS = { manageTokenHashHex: "deadbeef00112233" };

describe("identity-contract (D-16, database-free)", () => {
  it("claim 1 — PG_ROLE equals exactly the applied-migration contract, all five kinds", () => {
    expect(PG_ROLE).toEqual({
      anon: "anon",
      customer: "authenticated",
      staff: "vamos_staff",
      guest: "vamos_guest",
      quote: QUOTE_PG_ROLE,
    });
    expect(Object.keys(PG_ROLE).sort()).toEqual(
      ["anon", "customer", "guest", "quote", "staff"].sort(),
    );
  });

  it("claim 2 — the first recorded statement is set_config('role', …, true), role arrives as a bound parameter, for all five kinds", async () => {
    const cases: Array<[IdentityKind, unknown]> = [
      ["anon", undefined],
      ["customer", CUSTOMER_CLAIMS],
      ["staff", STAFF_CLAIMS],
      ["guest", GUEST_CLAIMS],
      ["quote", undefined],
    ];

    for (const [kind, claims] of cases) {
      const { client, recorded } = makeRecordingClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await withIdentity(CS, kind as any, claims as any, async () => "ok", { client });

      const first = recorded[0];
      expect(first, `kind=${kind} recorded no statement at all`).toBeDefined();
      expect(first!.kind).toBe("template");
      expect(first!.text).toContain("set_config('role'");
      expect(first!.values[0], `kind=${kind}`).toBe(PG_ROLE[kind]);
    }
  });

  it("claim 2b — the quote kind's bound role parameter equals QUOTE_PG_ROLE specifically (D-44a)", async () => {
    const { client, recorded } = makeRecordingClient();
    await withIdentity(CS, "quote", undefined, async () => "ok", { client });
    expect(recorded[0]!.values[0]).toBe(QUOTE_PG_ROLE);
  });

  it("claim 3 — customer/staff bind request.jwt.claims, guest binds request.vamos.manage_token_hash, anon/quote bind nothing extra", async () => {
    for (const kind of ["customer", "staff"] as const) {
      const { client, recorded } = makeRecordingClient();
      const claims = kind === "customer" ? CUSTOMER_CLAIMS : STAFF_CLAIMS;
      await withIdentity(CS, kind, claims, async () => "ok", { client });
      expect(recorded).toHaveLength(2);
      expect(recorded[1]!.text).toContain("set_config('request.jwt.claims'");
      expect(recorded[1]!.values[0]).toBe(claimsForSql(claims));
    }

    {
      const { client, recorded } = makeRecordingClient();
      await withIdentity(CS, "guest", GUEST_CLAIMS, async () => "ok", { client });
      expect(recorded).toHaveLength(2);
      expect(recorded[1]!.text).toContain("set_config('request.vamos.manage_token_hash'");
      expect(recorded[1]!.values[0]).toBe(GUEST_CLAIMS.manageTokenHashHex);
    }

    for (const kind of ["anon", "quote"] as const) {
      const { client, recorded } = makeRecordingClient();
      await withIdentity(CS, kind, undefined, async () => "ok", { client });
      expect(recorded, `kind=${kind} — no claim to bind`).toHaveLength(1);
    }
  });

  it("claim 4 — every recorded set_config passes true, none passes false", async () => {
    // `true`/`false` here are the literal third-argument text `withIdentity` writes into each
    // `set_config(...)` template — never a bound value — so this asserts against the recorded
    // statement TEXT, matching how it actually reaches Postgres.
    const { client, recorded } = makeRecordingClient();
    await withIdentity(CS, "staff", STAFF_CLAIMS, async () => "ok", { client });
    expect(recorded.length).toBeGreaterThan(0);
    for (const call of recorded) {
      expect(call.text).toMatch(/,\s*true\)\s*$/);
      expect(call.text).not.toMatch(/,\s*false\s*\)/);
    }
  });

  it("claim 5 — claimsForSql strips user_metadata and defaults aal/app_metadata", () => {
    const withStrayField = {
      sub: "33333333-3333-3333-3333-333333333333",
      role: "authenticated" as const,
      // A field claimsForSql does not name — the property most likely to be user-writable via
      // the client SDK. It must never survive into the SQL-visible payload.
      user_metadata: { display_name: "attacker-controlled" },
    };
    const parsed = JSON.parse(claimsForSql(withStrayField as unknown as VamosClaims));
    expect(parsed).not.toHaveProperty("user_metadata");
    expect(parsed.aal).toBe("aal1");
    expect(parsed.app_metadata).toEqual({});
  });

  it("claim 6 — opts.probe makes ENTRY_PROBE the first recorded statement; no opts records none", async () => {
    {
      const { client, recorded } = makeRecordingClient();
      await withIdentity(CS, "anon", undefined, async () => "ok", { client, probe: true });
      expect(recorded[0]!.kind).toBe("unsafe");
      expect(recorded[0]!.text).toBe(ENTRY_PROBE);
    }
    {
      const { client, recorded } = makeRecordingClient();
      await withIdentity(CS, "anon", undefined, async () => "ok", { client });
      expect(recorded.some((c) => c.kind === "unsafe")).toBe(false);
    }
  });

  it("claim 7 — ENTRY_PROBE selects all five entry columns, including the D-45 guest column", () => {
    expect(ENTRY_PROBE).toMatch(/as user_at_entry/);
    expect(ENTRY_PROBE).toMatch(/as claims_at_entry/);
    expect(ENTRY_PROBE).toMatch(/as guest_at_entry/);
    expect(ENTRY_PROBE).toMatch(/as pid/);
    expect(ENTRY_PROBE).toMatch(/as t0/);
  });

  it("claim 8 — a thrown error propagates out by the same object identity, not a copy", async () => {
    const { client } = makeRecordingClient();
    const boom = Object.assign(new Error("boom"), { code: "42501" });
    await expect(
      withIdentity(CS, "anon", undefined, async () => {
        throw boom;
      }, { client }),
    ).rejects.toBe(boom);
  });
});

// Claim 9 (D-08) — compile-time only, never executed. `pnpm typecheck` fails if `fn`'s return
// type ever loosens enough to let it return the transaction handle. Kept outside any `it()`
// block, at module scope, so vitest's runtime never touches it.
function typeOnlyProof_fnCannotReturnTx() {
  const { client } = makeRecordingClient();
  // @ts-expect-error - fn must not return the transaction handle (D-08)
  //
  // This IS the deliberate violation the @ts-expect-error line above proves the type system
  // catches; plan 03-06's syntax fence would otherwise also flag it, which is correct
  // everywhere except this one proof.
  // eslint-disable-next-line no-restricted-syntax
  return withIdentity(CS, "anon", undefined, async (tx) => tx, { client });
}
void typeOnlyProof_fnCannotReturnTx;

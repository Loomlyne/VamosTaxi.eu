// packages/db/test/local/consent-reader.test.ts
//
// Phase 27 plan 01. public.consent_choice() through the SAME options the Worker's client uses
// (`fetch_types: false`, `types: pgArrayTypes`), under role `anon` exactly as `withIdentity(..., "anon")`
// sets it, with the subject GUC bound. Everything runs in one transaction that is rolled back.
// Local only: the host is fixed to 127.0.0.1; the port comes from VAMOS_LOCAL_DB_PORT (default 59322,
// this worktree's own stack, never another session's stack).
import { describe, expect, it } from "vitest";
import { withIdentity } from "../../src/identity.js";
import { workerSql } from "../support/worker-client.js";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"] ?? "59322";
const SUPER = `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`;
const SUBJECT = "a1b2c3d4-0000-4000-8000-000000002701";
const VERSION = "9999-01-01";

class Rollback extends Error {}

interface Choice {
  method: string;
  necessary: boolean;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
  recorded_at: unknown;
}

describe("consent_choice through the Worker client options (fetch_types: false)", () => {
  it("returns booleans and a timestamp, latest wins, as-of hides later rows", async () => {
    // Same option set as identity.ts client(); the pinned client lets withIdentity's own role
    // switch run inside a transaction this test rolls back.
    const sql = workerSql(SUPER, "identity");
    let latest: Choice | undefined;
    let asOf: Choice | undefined;
    let none: Choice[] | undefined;
    try {
      await withIdentity(
        SUPER,
        "anon",
        undefined,
        async (tx) => {
          // Fixtures as postgres (the pinned client logs in as postgres), then back to anon.
          await tx`select set_config('role', 'postgres', true)`;
          await tx`
            insert into public.consent_log
              (consent_subject_id, policy_version, method, necessary, functional, analytics, marketing, locale, recorded_at)
            values
              (${SUBJECT}::uuid, ${VERSION}, 'accept_all', true, true, true, true, 'en', '2026-10-02 10:00+00'),
              (${SUBJECT}::uuid, ${VERSION}, 'reject_all', true, false, false, false, 'en', '2026-10-02 12:00+00')`;
          await tx`select set_config('role', 'anon', true)`;
          await tx`select set_config('request.vamos.consent_subject', ${SUBJECT}, true)`;
          latest = (await tx<Choice[]>`select * from public.consent_choice(${VERSION}, null)`)[0];
          asOf = (
            await tx<Choice[]>`select * from public.consent_choice(${VERSION}, '2026-10-02 11:00+00'::timestamptz)`
          )[0];
          none = await tx<Choice[]>`select * from public.consent_choice(${VERSION}, '2026-10-02 09:00+00'::timestamptz)`;
          throw new Rollback();
        },
        { client: sql },
      ).catch((err) => {
        if (!(err instanceof Rollback)) throw err;
      });
    } finally {
      await sql.end({ timeout: 5 });
    }

    expect(latest).toBeDefined();
    expect(typeof latest!.marketing).toBe("boolean");
    expect(typeof latest!.necessary).toBe("boolean");
    expect(latest!.marketing).toBe(false);
    expect(latest!.method).toBe("reject_all");
    expect(asOf!.marketing).toBe(true);
    expect(none).toHaveLength(0);
    // Pinned so plan 27-05 can rely on it: with fetch_types:false postgres.js still parses timestamptz.
    expect(latest!.recorded_at).toBeInstanceOf(Date);
    expect((latest!.recorded_at as Date).toISOString()).toBe("2026-10-02T12:00:00.000Z");
    // No arrays cross this boundary.
    for (const v of Object.values(latest!)) expect(Array.isArray(v)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import type postgres from "postgres";
import { readConsentChoice } from "./read";
import { CONSENT_POLICY_VERSION } from "./policy";

type Call = { sql: string; values: unknown[] };

function fakeTx(results: unknown[][]) {
  const calls: Call[] = [];
  const queue = [...results];
  const tx = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ sql: strings.join("?"), values });
    return Promise.resolve(queue.shift() ?? []);
  }) as unknown as postgres.TransactionSql;
  return { tx, calls };
}

const SUBJECT = "11111111-1111-4111-8111-111111111111";

describe("readConsentChoice", () => {
  it("binds the subject, then calls consent_choice with the policy version and null", async () => {
    const { tx, calls } = fakeTx([[], []]);
    await readConsentChoice(tx, SUBJECT);
    expect(calls[0]!.sql).toContain("set_config('request.vamos.consent_subject'");
    expect(calls[0]!.values).toEqual([SUBJECT]);
    expect(calls[1]!.sql).toContain("consent_choice(");
    expect(calls[1]!.values).toEqual([CONSENT_POLICY_VERSION, null]);
  });

  it("passes an as-of Date through", async () => {
    const { tx, calls } = fakeTx([[], []]);
    const asOf = new Date("2026-09-01T10:00:00.000Z");
    await readConsentChoice(tx, SUBJECT, asOf);
    expect(calls[1]!.values).toEqual([CONSENT_POLICY_VERSION, asOf]);
  });

  it("returns null for zero rows", async () => {
    const { tx } = fakeTx([[], []]);
    expect(await readConsentChoice(tx, SUBJECT)).toBeNull();
  });

  it("normalises recorded_at (Date or string) to an ISO string and keeps booleans", async () => {
    const iso = "2026-09-30T08:15:00.000Z";
    for (const recorded_at of [new Date(iso), iso]) {
      const { tx } = fakeTx([
        [],
        [{ method: "accept_all", necessary: true, functional: true, analytics: false, marketing: true, recorded_at }],
      ]);
      expect(await readConsentChoice(tx, SUBJECT)).toEqual({
        method: "accept_all",
        functional: true,
        analytics: false,
        marketing: true,
        recordedAt: iso,
      });
    }
  });
});

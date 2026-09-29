import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  purgeExpiredUnpaidWithDeps,
  purgeOnSessionExpired,
  type PurgeSweepDeps,
} from "./purge-unpaid";

const EXP = { status: "expired", payment_status: "unpaid", metadata: {} } as const;
const OPEN = { status: "open", payment_status: "unpaid", metadata: {} } as const;
const PAID = { status: "complete", payment_status: "paid", metadata: {} } as const;

function sweep(sessions: Record<string, unknown>, rows: { booking_id: string; session_ids: string[] }[], purge = true) {
  const purgeFn = vi.fn(async () => purge);
  const emit = vi.fn();
  const deps = {
    candidates: async () => rows.map((r) => ({ ...r, reference: "VT-1" })),
    retrieve: async (id: string) => {
      const s = sessions[id];
      if (s instanceof Error) throw s;
      return s as never;
    },
    purge: purgeFn,
    emit,
  } as PurgeSweepDeps;
  return { deps, purgeFn, emit };
}

describe("purgeExpiredUnpaidWithDeps", () => {
  it("purges a booking whose sessions are all expired and unpaid", async () => {
    const t = sweep({ cs_1: EXP }, [{ booking_id: "b1", session_ids: ["cs_1"] }]);
    expect(await purgeExpiredUnpaidWithDeps(t.deps)).toEqual({ purged: 1, skipped: 0, errors: 0 });
    expect(t.purgeFn).toHaveBeenCalledWith("b1", "unpaid_expired");
  });
  it("skips when any session is open", async () => {
    const t = sweep({ cs_1: EXP, cs_2: OPEN }, [{ booking_id: "b1", session_ids: ["cs_1", "cs_2"] }]);
    expect((await purgeExpiredUnpaidWithDeps(t.deps)).skipped).toBe(1);
    expect(t.purgeFn).not.toHaveBeenCalled();
  });
  it("skips and reports a paid session", async () => {
    const t = sweep({ cs_1: PAID }, [{ booking_id: "b1", session_ids: ["cs_1"] }]);
    const r = await purgeExpiredUnpaidWithDeps(t.deps);
    expect(r.errors).toBe(1);
    expect(t.purgeFn).not.toHaveBeenCalled();
    expect(t.emit).toHaveBeenCalled();
  });
  it("skips a booking on a Stripe error and continues with the next", async () => {
    const t = sweep({ cs_1: new Error("boom"), cs_2: EXP }, [
      { booking_id: "b1", session_ids: ["cs_1"] },
      { booking_id: "b2", session_ids: ["cs_2"] },
    ]);
    const r = await purgeExpiredUnpaidWithDeps(t.deps);
    expect(r.purged).toBe(1);
    expect(t.purgeFn).toHaveBeenCalledTimes(1);
    expect(t.purgeFn).toHaveBeenCalledWith("b2", "unpaid_expired");
  });
  it("counts purge=false as skipped without an error", async () => {
    const t = sweep({ cs_1: EXP }, [{ booking_id: "b1", session_ids: ["cs_1"] }], false);
    expect(await purgeExpiredUnpaidWithDeps(t.deps)).toEqual({ purged: 0, skipped: 1, errors: 0 });
    expect(t.emit).not.toHaveBeenCalled();
  });
  it("never purges a booking with no Stripe session", async () => {
    const t = sweep({}, [{ booking_id: "b1", session_ids: [] }]);
    expect((await purgeExpiredUnpaidWithDeps(t.deps)).skipped).toBe(1);
    expect(t.purgeFn).not.toHaveBeenCalled();
  });
});

describe("purgeOnSessionExpired", () => {
  function hook(sessions: Record<string, unknown>, ids = ["cs_1", "cs_2"]) {
    const purge = vi.fn(async () => true);
    return {
      purge,
      deps: {
        sessionIdsFor: async () => ids,
        retrieve: async (id: string) => {
          const s = sessions[id];
          if (s instanceof Error) throw s;
          return s as never;
        },
        purge,
      },
    };
  }
  it("purges when every session is expired and unpaid", async () => {
    const h = hook({ cs_1: EXP, cs_2: EXP });
    expect(await purgeOnSessionExpired(h.deps, "cs_1", "b1")).toBe(true);
    expect(h.purge).toHaveBeenCalledWith("b1", "unpaid_expired");
  });
  it("never purges an ops extra session", async () => {
    const h = hook({ cs_1: { ...EXP, metadata: { kind: "extra" } }, cs_2: EXP });
    expect(await purgeOnSessionExpired(h.deps, "cs_1", "b1")).toBe(false);
    expect(h.purge).not.toHaveBeenCalled();
  });
  it("does not purge when a second session is complete but not settled", async () => {
    const h = hook({ cs_1: EXP, cs_2: PAID });
    expect(await purgeOnSessionExpired(h.deps, "cs_1", "b1")).toBe(false);
    expect(h.purge).not.toHaveBeenCalled();
  });
  it("does not purge when another session is open", async () => {
    const h = hook({ cs_1: EXP, cs_2: OPEN });
    expect(await purgeOnSessionExpired(h.deps, "cs_1", "b1")).toBe(false);
  });
  it("does not purge when any retrieve fails", async () => {
    const h = hook({ cs_1: EXP, cs_2: new Error("x") });
    expect(await purgeOnSessionExpired(h.deps, "cs_1", "b1")).toBe(false);
    expect(h.purge).not.toHaveBeenCalled();
  });
});

describe("D-45 silence", () => {
  it("has no mailer in the module", () => {
    const src = readFileSync(new URL("./purge-unpaid.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/sendConfirmation|sendPayLink|notifyExpired|resend/i);
  });
});

describe("one bad row never stops the sweep", () => {
  it("a row whose session list is not an array is counted as an error and the next row still runs", async () => {
    const t = sweep({ cs_2: EXP }, [
      { booking_id: "b1", session_ids: "{cs_1}" as unknown as string[] },
      { booking_id: "b2", session_ids: ["cs_2"] },
    ]);
    const r = await purgeExpiredUnpaidWithDeps(t.deps);
    expect(r).toEqual({ purged: 1, skipped: 0, errors: 1 });
    expect(t.emit).toHaveBeenCalledWith("purge_unpaid_failed", { bookingId: "b1" });
    expect(t.purgeFn).toHaveBeenCalledWith("b2", "unpaid_expired");
  });
});

describe("purgeOnSessionExpired failure log", () => {
  it("logs purge_unpaid_failed when the session-id read throws, and returns false", async () => {
    const emit = vi.fn();
    const ok = await purgeOnSessionExpired(
      {
        retrieve: async () => EXP as never,
        sessionIdsFor: async () => "{cs_1}" as unknown as string[],
        purge: async () => true,
        emit,
      },
      "cs_1",
      "b1",
    );
    expect(ok).toBe(false);
    expect(emit).toHaveBeenCalledWith("purge_unpaid_failed", { bookingId: "b1" });
  });
});

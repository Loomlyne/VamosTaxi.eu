// Phase 29 plan 05: orchestrator proof with injected fakes. No network, no database.
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendMetaPurchase, type ClaimRow, type MetaPurchaseDeps, type MetaPurchaseInput } from "./purchase";

const TOKEN = "fake-token-aaaa1111";
const FBP = "fb.1.1727771234567.1234567890";
const FBC = "fb.1.1727771234567.IwAR0abc_DEF-123";
const SUBJECT = "29a00000-0000-4000-8000-000000000099";
const GRAPH_MSG = "Invalid parameter secret graph words";
const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const CAPTURED = new Date("2026-10-03T10:00:00.789Z");

const base: MetaPurchaseInput = { bookingId: "b-1", paymentId: 7, livemode: true, refundRequired: false };
const sendRow: ClaimRow = {
  decision: "send",
  reason: null,
  eventId: EVENT_ID,
  fbp: FBP,
  fbc: FBC,
  chargedRappen: 12000,
  capturedAt: CAPTURED,
};

function okFetch() {
  return vi.fn(async () => new Response(JSON.stringify({ events_received: 1, fbtrace_id: "TRACE" }), { status: 200 }));
}

function make(over: Partial<MetaPurchaseDeps> = {}) {
  const emit = vi.fn();
  const deps: MetaPurchaseDeps = {
    measurementAllowed: () => true,
    token: () => TOKEN,
    testEventCode: () => null,
    claim: vi.fn(async () => sendRow),
    finish: vi.fn(async () => {}),
    clearIds: vi.fn(async () => {}),
    fetch: okFetch() as unknown as typeof fetch,
    emit,
    ...over,
  };
  return { deps, emit };
}

const consoleSpies = ["log", "error", "warn", "info"].map((m) =>
  vi.spyOn(console, m as "log").mockImplementation(() => {}),
);
afterEach(() => consoleSpies.forEach((s) => s.mockClear()));

function bodyOf(f: ReturnType<typeof vi.fn>): URLSearchParams {
  return (f.mock.calls[0] as unknown as [string, { body: URLSearchParams }])[1].body;
}

describe("sendMetaPurchase refusals", () => {
  it("gate closed", async () => {
    const { deps } = make({ measurementAllowed: () => false });
    await sendMetaPurchase(base, deps);
    expect(deps.claim).toHaveBeenCalledWith("b-1", 7, expect.any(String), false, false, "gate_closed");
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it.each([null, ""])("token %j", async (t) => {
    const { deps } = make({ token: () => t });
    await sendMetaPurchase(base, deps);
    expect(vi.mocked(deps.claim).mock.calls[0]![5]).toBe("no_token");
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it.each([null, ""])("test mode without a test code %j", async (c) => {
    const { deps } = make({ testEventCode: () => c });
    await sendMetaPurchase({ ...base, livemode: false }, deps);
    expect(vi.mocked(deps.claim).mock.calls[0]![3]).toBe(true);
    expect(vi.mocked(deps.claim).mock.calls[0]![5]).toBe("no_test_code");
    expect(deps.fetch).not.toHaveBeenCalled();
  });
});

describe("sendMetaPurchase test code by Stripe mode", () => {
  it("test mode with code sends test_event_code", async () => {
    const { deps } = make({ testEventCode: () => "TESTCODE" });
    await sendMetaPurchase({ ...base, livemode: false }, deps);
    expect(vi.mocked(deps.claim).mock.calls[0]!.slice(3)).toEqual([true, false, null]);
    expect(bodyOf(deps.fetch as never).get("test_event_code")).toBe("TESTCODE");
  });

  it("live never carries it", async () => {
    const { deps } = make({ testEventCode: () => "TESTCODE" });
    await sendMetaPurchase(base, deps);
    expect(vi.mocked(deps.claim).mock.calls[0]![3]).toBe(false);
    expect(bodyOf(deps.fetch as never).has("test_event_code")).toBe(false);
  });
});

describe("sendMetaPurchase decisions", () => {
  it("refund required never posts, even on a faulty send", async () => {
    const { deps } = make();
    await sendMetaPurchase({ ...base, refundRequired: true }, deps);
    expect(vi.mocked(deps.claim).mock.calls[0]![4]).toBe(true);
    expect(deps.fetch).not.toHaveBeenCalled();
    expect(deps.finish).not.toHaveBeenCalled();
  });

  it.each([
    ["already", null],
    ["skip", "consent_off"],
  ] as const)("%s: no fetch, no finish, one log line", async (decision, reason) => {
    const { deps, emit } = make({ claim: vi.fn(async () => ({ ...sendRow, decision, reason })) });
    await sendMetaPurchase(base, deps);
    expect(deps.fetch).not.toHaveBeenCalled();
    expect(deps.finish).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]![2]).toMatchObject({ outcome: decision === "skip" ? "skip" : "already", reason });
  });

  it("send: one fetch, one finish, event from the claim row", async () => {
    const { deps, emit } = make();
    await sendMetaPurchase(base, deps);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    const data = JSON.parse(bodyOf(deps.fetch as never).get("data")!)[0];
    expect(data).toMatchObject({
      event_id: EVENT_ID,
      event_time: Math.floor(CAPTURED.getTime() / 1000),
      user_data: { fbp: FBP, fbc: FBC },
      custom_data: { currency: "CHF", value: 120 },
    });
    expect(deps.finish).toHaveBeenCalledTimes(1);
    expect(deps.finish).toHaveBeenCalledWith("b-1", EVENT_ID, "sent", 200, null, null);
    expect(emit.mock.calls[0]![0]).toBe("info");
  });

  it("send but no event can be built: finish failed, no fetch", async () => {
    const { deps } = make({ claim: vi.fn(async () => ({ ...sendRow, chargedRappen: 0 })) });
    await sendMetaPurchase(base, deps);
    expect(deps.fetch).not.toHaveBeenCalled();
    expect(deps.finish).toHaveBeenCalledWith("b-1", EVENT_ID, "failed", null, null, null);
  });

  it("rejected 400 with a subcode logs code 100.2804050 and nothing else sensitive", async () => {
    const f = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: 100, error_subcode: 2804050, message: GRAPH_MSG, fbtrace_id: "TRACE" } }), {
          status: 400,
        }),
    );
    const { deps, emit } = make({ fetch: f as unknown as typeof fetch });
    await sendMetaPurchase(base, deps);
    expect(deps.finish).toHaveBeenCalledWith("b-1", EVENT_ID, "rejected", 400, 100, 2804050);
    expect(emit.mock.calls[0]![0]).toBe("error");
    expect(emit.mock.calls[0]![2]).toEqual({ bookingId: "b-1", outcome: "rejected", http: 400, code: "100.2804050" });
  });
});

describe("sendMetaPurchase quiet failures", () => {
  it("claim throws: logs claim_failed with the SQLSTATE, clears ids once, no fetch", async () => {
    const { deps, emit } = make({ claim: vi.fn(async () => Promise.reject({ code: "42883" })) });
    await sendMetaPurchase(base, deps);
    expect(emit.mock.calls[0]![2]).toMatchObject({ reason: "claim_failed", code: "42883" });
    expect(deps.clearIds).toHaveBeenCalledTimes(1);
    expect(deps.clearIds).toHaveBeenCalledWith("b-1");
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it("claim and clearIds both throw: still resolves", async () => {
    const { deps, emit } = make({
      claim: vi.fn(async () => Promise.reject(new Error("x"))),
      clearIds: vi.fn(async () => Promise.reject(new Error("y"))),
    });
    await expect(sendMetaPurchase(base, deps)).resolves.toBeUndefined();
    expect(emit.mock.calls.some((c) => (c[2] as { reason?: string }).reason === "clear_failed")).toBe(true);
  });

  it("finish throws: resolves and logs finish_failed", async () => {
    const { deps, emit } = make({ finish: vi.fn(async () => Promise.reject(new Error("z"))) });
    await expect(sendMetaPurchase(base, deps)).resolves.toBeUndefined();
    expect(emit.mock.calls[0]![2]).toMatchObject({ reason: "finish_failed" });
  });

  it("fetch rejects: finish failed, fetch called once", async () => {
    const f = vi.fn(async () => Promise.reject(new Error("timeout")));
    const { deps } = make({ fetch: f as unknown as typeof fetch });
    await sendMetaPurchase(base, deps);
    expect(f).toHaveBeenCalledTimes(1);
    expect(deps.finish).toHaveBeenCalledWith("b-1", EVENT_ID, "failed", null, null, null);
  });
});

describe("sendMetaPurchase log hygiene (D-06)", () => {
  it("emits only allowed fields and never a secret or id", async () => {
    const f = vi.fn(
      async () => new Response(JSON.stringify({ error: { code: 190, message: GRAPH_MSG, fbtrace_id: "TRACE" } }), { status: 401 }),
    );
    const cases: Partial<MetaPurchaseDeps>[] = [
      {},
      { fetch: f as unknown as typeof fetch },
      { measurementAllowed: () => false },
      { claim: vi.fn(async () => Promise.reject({ code: "42883", message: SUBJECT })) },
      { finish: vi.fn(async () => Promise.reject(new Error(TOKEN))) },
    ];
    const allowed = new Set(["bookingId", "outcome", "reason", "http", "code"]);
    for (const c of cases) {
      const { deps, emit } = make(c);
      await sendMetaPurchase({ ...base, livemode: false }, { ...deps, testEventCode: () => "TESTCODE" });
      for (const call of emit.mock.calls) {
        expect(call[1]).toBe("meta_purchase");
        for (const k of Object.keys(call[2] as object)) expect(allowed.has(k)).toBe(true);
      }
      const dump = JSON.stringify(emit.mock.calls);
      for (const needle of [TOKEN, FBP, FBC, SUBJECT, GRAPH_MSG, "TRACE", "TESTCODE"]) expect(dump).not.toContain(needle);
    }
    for (const s of consoleSpies) expect(s).not.toHaveBeenCalled();
  });
});

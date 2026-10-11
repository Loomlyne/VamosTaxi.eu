import { describe, expect, it } from "vitest";
import { CONSENT_POLICY_VERSION } from "@/lib/consent/policy";
import { initiateEventId, marketingConsentCached, type InitiateSelection } from "./initiate-id";

const SEL: InitiateSelection = { slug: "business", totalRappen: 12000, fid: "a", tid: "b", from: "X", to: "Y", when: "2026-11-01T10:00", pax: 2, bags: 1 };
function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), size: () => m.size };
}
function ids() {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
}

describe("initiateEventId", () => {
  it("reuses the id for the same selection (a reload)", () => {
    const s = mem();
    const make = ids();
    const a = initiateEventId(SEL, s, make);
    expect(initiateEventId({ ...SEL }, s, make)).toBe(a);
  });
  it("gives a new id when the selection changes", () => {
    const s = mem();
    const make = ids();
    const a = initiateEventId(SEL, s, make);
    expect(initiateEventId({ ...SEL, slug: "economy" }, s, make)).not.toBe(a);
    expect(initiateEventId({ ...SEL, totalRappen: 13000 }, s, make)).not.toBe(a);
    expect(initiateEventId({ ...SEL, when: "2026-11-02T10:00" }, s, make)).not.toBe(a);
  });
  it("writes no route text into the key", () => {
    const s = mem();
    const keys: string[] = [];
    initiateEventId(SEL, { getItem: () => null, setItem: (k) => void keys.push(k) }, ids());
    expect(keys[0]).toMatch(/^vamosInitiateId:[0-9a-z]+$/);
  });
  it("falls back to a fresh id when storage is missing or throws", () => {
    const make = ids();
    const a = initiateEventId(SEL, null, make);
    const bad = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    const b = initiateEventId(SEL, bad, make);
    expect(a).not.toBe(b);
    expect(b).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("ignores a stored value that is not a UUID", () => {
    const s = mem();
    const make = ids();
    initiateEventId(SEL, s, make);
    const store = { getItem: () => "junk", setItem: () => undefined };
    expect(initiateEventId(SEL, store, make)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("marketingConsentCached", () => {
  const box = (v: unknown) => ({ getItem: () => (v === undefined ? null : JSON.stringify(v)) });
  it("only the current policy version with Marketing on", () => {
    expect(marketingConsentCached(box({ v: CONSENT_POLICY_VERSION, marketing: true }))).toBe(true);
    expect(marketingConsentCached(box({ v: CONSENT_POLICY_VERSION, marketing: false }))).toBe(false);
    expect(marketingConsentCached(box({ v: "2020-01-01", marketing: true }))).toBe(false);
    expect(marketingConsentCached(box({ v: CONSENT_POLICY_VERSION, marketing: "true" }))).toBe(false);
    expect(marketingConsentCached(box(undefined))).toBe(false);
    expect(marketingConsentCached(null)).toBe(false);
    expect(marketingConsentCached({ getItem: () => "{not json" })).toBe(false);
    expect(marketingConsentCached({ getItem: () => { throw new Error("blocked"); } })).toBe(false);
  });
});

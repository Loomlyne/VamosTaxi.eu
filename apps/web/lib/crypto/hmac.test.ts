// apps/web/lib/crypto/hmac.test.ts
//
// Unit and property proofs for the shared HMAC + canonical-JSON primitive.
// Secrets here are obviously-fake fixed strings — never a value that could be
// mistaken for a real credential.

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import {
  base64urlDecode,
  base64urlEncode,
  canonicalJson,
  signHmac,
  verifyHmac,
} from "./hmac";

/** Obviously-fake test secret — not a real credential shape. */
const FAKE_SECRET = "test-hmac-secret-not-a-real-credential-00";

describe("canonicalJson", () => {
  it("produces identical strings for key-reordered plain objects", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("canonicalises nesting recursively; arrays keep order", () => {
    const nested = { z: { b: 1, a: [3, 1, 2] }, y: null };
    expect(canonicalJson(nested)).toBe('{"y":null,"z":{"a":[3,1,2],"b":1}}');
    expect(canonicalJson({ a: [1, 2] })).not.toBe(canonicalJson({ a: [2, 1] }));
  });

  it("omits undefined-valued keys but keeps explicit null", () => {
    expect(canonicalJson({ a: 1, b: undefined, c: null })).toBe('{"a":1,"c":null}');
  });

  it("contains no whitespace", () => {
    const s = canonicalJson({ hello: "world", n: 42, arr: [true, false] });
    expect(/\s/.test(s)).toBe(false);
  });

  it("throws TypeError on Date (caller must pin string form)", () => {
    expect(() => canonicalJson(new Date("2026-01-01T00:00:00Z"))).toThrow(TypeError);
    expect(() => canonicalJson({ t: new Date() })).toThrow(/Date/);
  });

  it("throws TypeError on Map, Set, function, BigInt", () => {
    expect(() => canonicalJson(new Map())).toThrow(TypeError);
    expect(() => canonicalJson(new Set([1]))).toThrow(TypeError);
    expect(() => canonicalJson(() => 1)).toThrow(TypeError);
    expect(() => canonicalJson(1n)).toThrow(TypeError);
  });

  it("throws TypeError on NaN, Infinity, and -0", () => {
    expect(() => canonicalJson(Number.NaN)).toThrow(TypeError);
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(() => canonicalJson(Number.NEGATIVE_INFINITY)).toThrow(TypeError);
    expect(() => canonicalJson(-0)).toThrow(TypeError);
  });

  it("serialises finite numbers, bools, null, strings", () => {
    expect(canonicalJson(0)).toBe("0");
    expect(canonicalJson(42)).toBe("42");
    expect(canonicalJson(true)).toBe("true");
    expect(canonicalJson(false)).toBe("false");
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson('a"b')).toBe(JSON.stringify('a"b'));
  });
});

describe("base64urlEncode / base64urlDecode", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array([0, 1, 255, 128, 64, 32, 16, 8, 4, 2, 3]);
    const enc = base64urlEncode(bytes);
    expect(enc).not.toMatch(/[+/=]/);
    expect(Array.from(base64urlDecode(enc))).toEqual(Array.from(bytes));
  });

  it("round-trips empty and multi-length payloads", () => {
    expect(Array.from(base64urlDecode(base64urlEncode(new Uint8Array(0))))).toEqual([]);
    for (const n of [1, 2, 3, 4, 5, 16, 31, 32]) {
      const bytes = new Uint8Array(n).map((_, i) => (i * 17) & 0xff);
      expect(Array.from(base64urlDecode(base64urlEncode(bytes)))).toEqual(Array.from(bytes));
    }
  });

  it("throws on a character outside the base64url alphabet", () => {
    expect(() => base64urlDecode("abc+def")).toThrow(TypeError);
    expect(() => base64urlDecode("abc/def")).toThrow(TypeError);
    expect(() => base64urlDecode("abc=def")).toThrow(TypeError);
    expect(() => base64urlDecode("abc def")).toThrow(TypeError);
  });
});

describe("signHmac / verifyHmac", () => {
  it("is stable: same pair always yields the same MAC", async () => {
    const msg = base64urlEncode(textBytes('{"a":1}'));
    const a = await signHmac(FAKE_SECRET, msg);
    const b = await signHmac(FAKE_SECRET, msg);
    expect(a).toBe(b);
    expect(a).not.toMatch(/[+/=]/);
  });

  it("verifyHmac is true for a matching pair", async () => {
    const msg = "payload-segment-already-encoded";
    const mac = await signHmac(FAKE_SECRET, msg);
    expect(await verifyHmac(FAKE_SECRET, msg, mac)).toBe(true);
  });

  it("verifyHmac is false for every mismatch, including wrong length and truncated", async () => {
    const msg = "payload-segment-already-encoded";
    const mac = await signHmac(FAKE_SECRET, msg);
    expect(await verifyHmac(FAKE_SECRET, msg, mac.slice(0, 10))).toBe(false);
    expect(await verifyHmac(FAKE_SECRET, msg, "")).toBe(false);
    expect(await verifyHmac(FAKE_SECRET, msg, "not-valid-mac!!!!")).toBe(false);
    expect(await verifyHmac(FAKE_SECRET, msg + "x", mac)).toBe(false);
    expect(await verifyHmac("other-fake-secret-xx", msg, mac)).toBe(false);
  });

  it("a one-bit change anywhere in the message flips verification to false", async () => {
    const msg = "ABCDEFGHIJKLMNOP";
    const mac = await signHmac(FAKE_SECRET, msg);
    const flipped = String.fromCharCode(msg.charCodeAt(0) ^ 1) + msg.slice(1);
    expect(await verifyHmac(FAKE_SECRET, flipped, mac)).toBe(false);
    expect(await verifyHmac(FAKE_SECRET, msg, mac)).toBe(true);
  });

  it("never throws for a malformed MAC", async () => {
    await expect(verifyHmac(FAKE_SECRET, "m", "@@@")).resolves.toBe(false);
    await expect(verifyHmac(FAKE_SECRET, "m", "ab")).resolves.toBe(false);
  });
});

describe("canonicalJson property: key-order invariant", () => {
  /** Shuffle own enumerable keys of plain objects recursively. */
  function shuffleKeys(value: unknown): unknown {
    if (value === null || typeof value !== "object") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(shuffleKeys);
    }
    const entries = Object.entries(value as Record<string, unknown>);
    // Fisher–Yates on a copy so key order differs from insertion order often.
    for (let i = entries.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = entries[i]!;
      entries[i] = entries[j]!;
      entries[j] = tmp;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) {
      out[k] = shuffleKeys(v);
    }
    return out;
  }

  it(
    "fc.assert: canonicalJson is invariant under key reordering for nested JSON-safe objects",
    () => {
      const jsonSafe: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
        leaf: fc.oneof(
          fc.constant(null),
          fc.boolean(),
          fc.integer({ min: -1_000_000, max: 1_000_000 }).filter((n) => !Object.is(n, -0)),
          fc.string({ maxLength: 16 }),
        ),
        node: fc.oneof(
          { maxDepth: 3 },
          tie("leaf"),
          fc.array(tie("node"), { maxLength: 4 }),
          fc.dictionary(
            fc
              .string({ minLength: 1, maxLength: 8 })
              .filter((s) => s !== "__proto__" && s !== "constructor"),
            tie("node"),
            { maxKeys: 5 },
          ),
        ),
      })).node;

      fc.assert(
        fc.property(jsonSafe, (value) => {
          const a = canonicalJson(value);
          const shuffled = shuffleKeys(value);
          const b = canonicalJson(shuffled);
          expect(a).toBe(b);
          // Parse + re-canonicalise is also byte-identical.
          expect(canonicalJson(JSON.parse(a) as unknown)).toBe(a);
        }),
        { numRuns: 100 },
      );
    },
  );
});

describe("verifyHmac property: mutated message fails", () => {
  it("fc.assert: verifyHmac is false for any mutated message", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 64 }),
        fc.integer({ min: 0, max: 255 }),
        async (bytes, xorByte) => {
          const message = base64urlEncode(bytes);
          const mac = await signHmac(FAKE_SECRET, message);
          const mutated = new Uint8Array(bytes);
          mutated[0] = (mutated[0]! ^ (xorByte === 0 ? 1 : xorByte)) & 0xff;
          const mutatedMsg = base64urlEncode(mutated);
          if (mutatedMsg === message) {
            return true;
          }
          return (await verifyHmac(FAKE_SECRET, mutatedMsg, mac)) === false;
        },
      ),
      { numRuns: 50 },
    );
  });
});

function textBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

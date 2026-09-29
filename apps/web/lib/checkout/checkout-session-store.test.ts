import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WEB_ROOT } from "../../tests/support/server-harness";
import { checkoutTraveler } from "./checkout-traveler";
import { clearCheckoutSession, readCheckoutSession, writeCheckoutSession } from "./checkout-session-store";

describe("checkout session for the card box", () => {
  it("uses the saved trip when the payment page's contact state is still empty", () => {
    expect(
      checkoutTraveler(
        { firstName: "", lastName: "", email: "", mobile: "" },
        { firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", mobile: "+41790000000" },
      ),
    ).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.test",
      mobile: "+41790000000",
    });
  });

  it("does not invent a traveler", () => {
    expect(
      checkoutTraveler({ firstName: "", lastName: "", email: "", mobile: "" }, null),
    ).toBeNull();
  });

  it("restores the secret for this quote only", () => {
    const mem = new Map<string, string>();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        sessionStorage: {
          getItem: (key: string) => mem.get(key) ?? null,
          setItem: (key: string, value: string) => {
            mem.set(key, value);
          },
        },
      },
    });
    writeCheckoutSession({
      quoteId: "q-1",
      lock: "lock-q1",
      clientSecret: "cs_test_secret",
      clientSecretHex: "6373",
      publishableKey: "pk_test_worker",
      reference: "VT-26-0001",
    });
    expect(readCheckoutSession("q-1", "lock-q1")?.clientSecret).toBe("cs_test_secret");
    expect(readCheckoutSession("q-2", "lock-q1")).toBeNull();
  });

  it("payment page keeps the secret and asks for it from the saved trip", () => {
    const client = readFileSync(join(WEB_ROOT, "app/[locale]/checkout/CheckoutClient.tsx"), "utf8");
    expect(client).toContain("readCheckoutSession");
    expect(client).toContain("writeCheckoutSession");
    expect(client).toContain("checkoutTraveler");
    const pay = client.slice(client.indexOf('step !== "payment"'));
    expect(pay).toContain("checkoutTraveler");
    expect(pay).not.toMatch(/!contact\.firstName\.trim\(\)[\s\S]{0,180}return;/);
    expect(pay).not.toContain("if (!draft.idempotencyKey) return;");
    expect(client).toContain("if (!idempotencyKey && quoteId)");
    expect(client).not.toContain('tCommon("loading")');
  });
});

/** A sessionStorage stand-in that also exposes the raw map. */
function installSessionStorage(): Map<string, string> {
  const mem = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage: {
        getItem: (key: string) => mem.get(key) ?? null,
        setItem: (key: string, value: string) => {
          mem.set(key, value);
        },
        removeItem: (key: string) => {
          mem.delete(key);
        },
      },
    },
  });
  return mem;
}

describe("stored payment session follows the lock on screen (quick 260928-rld)", () => {
  const LOCK_A = "v1.lock-without-coupon.sig-a";
  const LOCK_B = "v1.lock-with-coupon.sig-b";

  it("restores a stored session when its lock fingerprint matches the current lock", () => {
    const mem = installSessionStorage();
    writeCheckoutSession({ quoteId: "q-1", lock: LOCK_A, clientSecret: "cs_test_a", reference: "VT-26-0001" });
    // The fingerprint is recorded next to the secret.
    expect(JSON.parse(mem.get("vamosCheckoutSession") ?? "{}").lock).toBe(LOCK_A);
    const restored = readCheckoutSession("q-1", LOCK_A);
    expect(restored?.clientSecret).toBe("cs_test_a");
    expect(restored?.reference).toBe("VT-26-0001");
  });

  it("does not restore and deletes a stored session whose lock fingerprint differs", () => {
    const mem = installSessionStorage();
    writeCheckoutSession({ quoteId: "q-1", lock: LOCK_A, clientSecret: "cs_test_a" });
    expect(readCheckoutSession("q-1", LOCK_B)).toBeNull();
    expect(mem.size).toBe(0);
    // Gone for good: the old lock cannot bring it back either.
    expect(readCheckoutSession("q-1", LOCK_A)).toBeNull();
  });

  it("treats a stored session without a fingerprint as stale", () => {
    const mem = installSessionStorage();
    // Shape written before this change: no lock next to the secret.
    mem.set("vamosCheckoutSession", JSON.stringify({ quoteId: "q-1", clientSecret: "cs_test_old" }));
    expect(readCheckoutSession("q-1", LOCK_A)).toBeNull();
    expect(mem.size).toBe(0);
  });

  it("removes the stored session for a quote id on request", () => {
    const mem = installSessionStorage();
    writeCheckoutSession({ quoteId: "q-1", lock: LOCK_A, clientSecret: "cs_test_a" });
    clearCheckoutSession("q-2");
    expect(mem.size).toBe(1);
    clearCheckoutSession("q-1");
    expect(mem.size).toBe(0);
    expect(readCheckoutSession("q-1", LOCK_A)).toBeNull();
  });
});

describe("CheckoutClient stored session wiring (quick 260928-rld)", () => {
  const client = readFileSync(join(WEB_ROOT, "app/[locale]/checkout/CheckoutClient.tsx"), "utf8");

  it("every path that clears the in-memory client secret after re-signing the lock also clears the stored session", () => {
    expect(client).toMatch(
      /import \{[^}]*\bclearCheckoutSession\b[^}]*\} from "@\/lib\/checkout\/checkout-session-store";/,
    );
    const clears: number[] = [];
    for (let at = client.indexOf("clientSecretRef.current = null;"); at !== -1; ) {
      clears.push(at);
      at = client.indexOf("clientSecretRef.current = null;", at + 1);
    }
    // Quick 260928-lat: the one in-memory clear lives in dropPaymentSession, which
    // new quote, flight sync re-sign and coupon/extras reprice re-sign all call.
    expect(clears.length).toBe(1);
    for (const at of clears) {
      expect(client.slice(at, at + 160)).toMatch(/clearCheckoutSession\([^)]+\);/);
    }
    // The two re-sign paths store the new lock before clearing the session.
    for (const fn of ["async function syncFlightToLock(", "async function applyCouponCode("]) {
      const fnAt = client.indexOf(fn);
      const stored = client.indexOf("writeDraft({ quoteId: nextId, lock: json.lock });", fnAt);
      const cleared = client.indexOf("dropPaymentSession(quoteId);", fnAt);
      expect(stored).toBeGreaterThan(fnAt);
      expect(cleared).toBeGreaterThan(stored);
      expect(cleared).toBeLessThan(client.indexOf("return true;", stored));
    }
    // A new quote drops the old quote's session.
    const quoteChanged = client.slice(client.indexOf("if (quoteChanged) {"), client.indexOf("} else if (step !== \"trip\")"));
    expect(quoteChanged).toContain('dropPaymentSession(stored.quoteId ?? "");');
  });

  it("a restore_lock_coupon outcome clears the stored session in the startPayment refusal branch", () => {
    const startAt = client.indexOf("async function startPayment(");
    const body = client.slice(startAt, client.indexOf("async function syncFlightToLock(", startAt));
    // startPayment clears through dropPaymentSession (quick 260928-lat). The
    // checkout pay-link sender is gone (26.3 D-18), so there is one branch.
    expect(client).not.toContain("async function sendPayLink(");
    const at = body.indexOf('=== "restore_lock_coupon"');
    expect(at).toBeGreaterThan(-1);
    const restore = body.slice(at, body.indexOf("}", at));
    expect(restore).toContain("dropPaymentSession(quoteId);");
  });

  it("the restore effect passes the current lock to the session store", () => {
    expect(client.match(/readCheckoutSession\(/g)?.length).toBe(1);
    const readAt = client.indexOf("readCheckoutSession(incomingQuote, screenLock)");
    expect(readAt).toBeGreaterThan(-1);
    const lockAt = client.lastIndexOf("const screenLock = trip?.lock || readDraft().lock || \"\";", readAt);
    expect(lockAt).toBeGreaterThan(client.lastIndexOf('if (step === "payment" && incomingQuote) {', readAt));
    // The session is written with the exact lock the intent was created for.
    const write = client.slice(client.indexOf("writeCheckoutSession({"), client.indexOf("});", client.indexOf("writeCheckoutSession({")));
    expect(write).toContain("quoteId,");
    expect(write).toContain("lock,");
  });
});

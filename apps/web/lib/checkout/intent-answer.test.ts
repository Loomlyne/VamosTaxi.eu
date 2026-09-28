import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { intentAnswerAction } from "./intent-answer";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");

function source(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

describe("intentAnswerAction (quick 260928-lat)", () => {
  it("mounts the answer when the lock on screen is the lock the intent was sent with", () => {
    expect(intentAnswerAction({ sentLock: "lock-a.sig", currentLock: "lock-a.sig" })).toBe("mount");
  });

  it("discards the answer when the lock on screen changed while the intent was in flight", () => {
    expect(intentAnswerAction({ sentLock: "lock-a.sig", currentLock: "lock-b.sig" })).toBe("discard");
  });

  it("discards the answer when either lock is missing", () => {
    expect(intentAnswerAction({ sentLock: "", currentLock: "lock-a.sig" })).toBe("discard");
    expect(intentAnswerAction({ sentLock: "lock-a.sig", currentLock: "" })).toBe("discard");
    expect(intentAnswerAction({ sentLock: null, currentLock: "lock-a.sig" })).toBe("discard");
    expect(intentAnswerAction({ sentLock: "lock-a.sig", currentLock: undefined })).toBe("discard");
    expect(intentAnswerAction({ sentLock: "   ", currentLock: "   " })).toBe("discard");
    expect(intentAnswerAction({ sentLock: undefined, currentLock: null })).toBe("discard");
  });

  it("treats locks that differ only in surrounding whitespace as equal", () => {
    expect(intentAnswerAction({ sentLock: "  lock-a.sig\n", currentLock: "lock-a.sig" })).toBe("mount");
    expect(intentAnswerAction({ sentLock: "lock-a.sig", currentLock: "\tlock-a.sig " })).toBe("mount");
  });
});

describe("CheckoutClient late payment-session answer wiring (quick 260928-lat)", () => {
  const client = source("app/[locale]/checkout/CheckoutClient.tsx");
  const startAt = client.indexOf("async function startPayment(");
  const start = client.slice(startAt, client.indexOf("async function syncFlightToLock(", startAt));
  const answerAt = start.indexOf("const json = (await res.json())");
  const decideAt = start.indexOf("intentAnswerAction({", answerAt);
  const discardAt = start.indexOf('=== "discard"', decideAt);
  const discard = start.slice(discardAt, start.indexOf('return "stale";', discardAt) + 'return "stale";'.length);

  it("startPayment re-reads the lock when the answer arrives and decides with intentAnswerAction before setting the client secret", () => {
    expect(client).toMatch(/import \{[^}]*\bintentAnswerAction\b[^}]*\} from "@\/lib\/checkout\/intent-answer";/);
    expect(startAt).toBeGreaterThan(-1);
    expect(answerAt).toBeGreaterThan(-1);
    expect(decideAt).toBeGreaterThan(answerAt);
    // The lock is re-read after the answer, in the same order the function uses at start.
    expect(start).toContain("const lock = liveDraft.lock || draft.lock || trip?.lock;");
    const reread = start.indexOf("const answerLock = readDraft().lock || draft.lock || trip?.lock;", answerAt);
    expect(reread).toBeGreaterThan(answerAt);
    expect(reread).toBeLessThan(decideAt);
    const call = start.slice(decideAt, start.indexOf("})", decideAt));
    expect(call).toContain("sentLock: lock,");
    expect(call).toContain("currentLock: answerLock,");
    // The decision comes before anything the answer would set.
    for (const later of [
      "if (!res.ok) {",
      "if (json.publishable_key) setPublishable(json.publishable_key);",
      "if (json.reference) setReference(json.reference);",
      "clientSecretRef.current = secret;",
      "setClientSecret(secret);",
      "setClientSecretHex(json.client_secret_hex);",
      "writeCheckoutSession({",
    ]) {
      const at = start.indexOf(later, answerAt);
      expect(at, later).toBeGreaterThan(decideAt);
    }
    expect(start.match(/intentAnswerAction\(/g)?.length).toBe(1);
  });

  it("a discarded answer sets no client secret, stores no session and shows no refusal", () => {
    expect(discardAt).toBeGreaterThan(decideAt);
    expect(discard).toContain('return "stale";');
    for (const forbidden of [
      "setClientSecret",
      "clientSecretRef.current =",
      "setClientSecretHex",
      "setReference",
      "setPublishable",
      "setVatRateBps",
      "writeCheckoutSession",
      "setRefusal",
      "setCouponField",
      "setCouponInvalid",
    ]) {
      expect(discard, forbidden).not.toContain(forbidden);
    }
  });

  it("a discarded answer releases the in-flight gate, bumps the intent tick and does not count toward the attempt cap", () => {
    expect(discard).toContain("intentStarted.current = false;");
    expect(discard).toContain("intentGate.current = null;");
    expect(discard.match(/setIntentTick\(\(n\) => n \+ 1\);/g)?.length).toBe(1);
    expect(discard).not.toContain("intentAttempts");
    // "stale" is its own result, so no caller mistakes it for a failure.
    expect(client).toContain('async function startPayment(opts?: { silent?: boolean }): Promise<"ok" | "skip" | "fail" | "stale">');
    expect(client).toContain('const intentGate = useRef<Promise<"ok" | "skip" | "fail" | "stale"> | null>(null);');
    // The automatic intent effect counts only real failures toward the cap.
    const thenAt = client.indexOf("void startPayment({ silent: true }).then((result) => {");
    expect(thenAt).toBeGreaterThan(-1);
    const handler = client.slice(thenAt, client.indexOf("});", thenAt));
    const skip = handler.indexOf('if (result === "ok" || result === "stale") return;');
    expect(skip).toBeGreaterThan(-1);
    expect(skip).toBeLessThan(handler.indexOf("intentAttempts.current += 1;"));
    // Pay never turns a discarded answer into a refusal.
    const onPayAt = client.indexOf("async function onPay(");
    const onPay = client.slice(onPayAt, client.indexOf("const tripForPay", onPayAt));
    const started = onPay.indexOf("const started = await startPayment();");
    const staleAt = onPay.indexOf('if (started === "stale") {', started);
    expect(staleAt).toBeGreaterThan(started);
    expect(staleAt).toBeLessThan(onPay.indexOf('if (started !== "ok") {', started));
    const staleBlock = onPay.slice(staleAt, onPay.indexOf("}", staleAt));
    expect(staleBlock).not.toContain("setRefusal");
  });

  it("a late refusal for a lock that is no longer on screen does not run the coupon recovery", () => {
    expect(decideAt).toBeGreaterThan(answerAt);
    expect(discardAt).toBeGreaterThan(decideAt);
    const refusedAt = start.indexOf("if (!res.ok) {", answerAt);
    expect(refusedAt).toBeGreaterThan(discardAt);
    expect(start.indexOf("couponRefusalAction({", answerAt)).toBeGreaterThan(discardAt);
    expect(start.indexOf("await applyCouponCode(null);", answerAt)).toBeGreaterThan(discardAt);
    expect(start.indexOf("setCouponApplied(null);", answerAt)).toBeGreaterThan(discardAt);
    for (const forbidden of ["couponRefusalAction", "applyCouponCode", "setCouponApplied", "couponRecoveryAttempted"]) {
      expect(discard, forbidden).not.toContain(forbidden);
    }
  });
});

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { couponRecoveryOutcome, couponRefusalAction, payClickAction } from "./coupon-recovery";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");

function source(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

describe("couponRefusalAction (26.1-32, D-11)", () => {
  it("returns reprice_without_coupon when the refused lock priced a coupon and no recovery is already in flight", () => {
    expect(
      couponRefusalAction({
        code: "coupon_no_longer_valid",
        lockCoupon: "SAVE10",
        bodyCoupon: "SAVE10",
        alreadyRecovered: false,
      }),
    ).toBe("reprice_without_coupon");
  });

  it("returns drop_body_coupon when the refused lock priced no coupon but the client had one applied and no recovery is already in flight", () => {
    expect(
      couponRefusalAction({
        code: "coupon_no_longer_valid",
        lockCoupon: null,
        bodyCoupon: "SAVE10",
        alreadyRecovered: false,
      }),
    ).toBe("drop_body_coupon");
  });

  it("returns show_refusal when a recovery already ran once, even though the lock still priced a coupon", () => {
    expect(
      couponRefusalAction({
        code: "coupon_no_longer_valid",
        lockCoupon: "SAVE10",
        bodyCoupon: "SAVE10",
        alreadyRecovered: true,
      }),
    ).toBe("show_refusal");
    expect(
      couponRefusalAction({
        code: "coupon_no_longer_valid",
        lockCoupon: null,
        bodyCoupon: "SAVE10",
        alreadyRecovered: true,
      }),
    ).toBe("show_refusal");
  });

  it("returns show_refusal for a refusal code other than coupon_no_longer_valid", () => {
    expect(
      couponRefusalAction({
        code: "quote_expired",
        lockCoupon: "SAVE10",
        bodyCoupon: "SAVE10",
        alreadyRecovered: false,
      }),
    ).toBe("show_refusal");
  });

  it("returns show_refusal when neither the lock nor the client have a coupon", () => {
    expect(
      couponRefusalAction({
        code: "coupon_no_longer_valid",
        lockCoupon: null,
        bodyCoupon: null,
        alreadyRecovered: false,
      }),
    ).toBe("show_refusal");
  });
});

describe("couponRecoveryOutcome (quick 260928-cpn)", () => {
  it("returns recovered when the reprice without coupon succeeded", () => {
    expect(
      couponRecoveryOutcome({ action: "reprice_without_coupon", repriceOk: true, lockCoupon: null }),
    ).toBe("recovered");
    // A stale peek of the old lock does not matter once the reprice stored a new one.
    expect(
      couponRecoveryOutcome({ action: "reprice_without_coupon", repriceOk: true, lockCoupon: "SAVE10" }),
    ).toBe("recovered");
  });

  it("returns restore_lock_coupon when the reprice without coupon failed and the lock still prices a coupon", () => {
    expect(
      couponRecoveryOutcome({ action: "reprice_without_coupon", repriceOk: false, lockCoupon: "SAVE10" }),
    ).toBe("restore_lock_coupon");
  });

  it("returns recovered for drop_body_coupon, which needs no reprice", () => {
    expect(couponRecoveryOutcome({ action: "drop_body_coupon", repriceOk: false, lockCoupon: null })).toBe(
      "recovered",
    );
    expect(couponRecoveryOutcome({ action: "drop_body_coupon", repriceOk: true, lockCoupon: null })).toBe(
      "recovered",
    );
  });

  it("returns none for show_refusal", () => {
    expect(couponRecoveryOutcome({ action: "show_refusal", repriceOk: false, lockCoupon: "SAVE10" })).toBe("none");
    expect(couponRecoveryOutcome({ action: "show_refusal", repriceOk: true, lockCoupon: null })).toBe("none");
  });

  it("returns none when the reprice failed but the lock carries no coupon", () => {
    expect(
      couponRecoveryOutcome({ action: "reprice_without_coupon", repriceOk: false, lockCoupon: null }),
    ).toBe("none");
  });
});

describe("CheckoutClient coupon refusal recovery wiring (26.1-32)", () => {
  const client = source("app/[locale]/checkout/CheckoutClient.tsx");
  const BRANCH = 'if (json.code === "coupon_no_longer_valid") {';
  const PEEK = "lockCoupon: peekLockCoupon(readDraft().lock || draft.lock || trip?.lock)";

  const startAt = client.indexOf("async function startPayment(");
  const start = client.slice(startAt, client.indexOf("async function syncFlightToLock(", startAt));
  const startBranchAt = start.indexOf(BRANCH);
  const startBranch = start.slice(
    startBranchAt,
    start.indexOf('if (!opts?.silent || step === "payment") setRefusal(key);', startBranchAt),
  );

  const sendAt = client.indexOf("async function sendPayLink(");
  const send = client.slice(sendAt, client.indexOf("async function onPay(", sendAt));
  const sendFailAt = send.indexOf("if (!res.ok) {");
  const sendGenericAt = send.indexOf("setRefusal(key);", sendFailAt);
  const sendBranchAt = send.indexOf(BRANCH, sendFailAt);
  const sendBranch = send.slice(sendBranchAt, send.indexOf("const key = REFUSAL_KEYS", sendBranchAt));

  /** Assert one branch's reaction order for each couponRefusalAction result. */
  function expectRecoveryOrder(branch: string) {
    const reprice = branch.slice(
      branch.indexOf('if (recovery === "reprice_without_coupon") {'),
      branch.indexOf('if (recovery === "drop_body_coupon") {'),
    );
    const refSet = reprice.indexOf("couponRecoveryAttempted.current = true;");
    const firstInvalid = reprice.indexOf("setCouponInvalid(true);");
    const firstField = reprice.indexOf('setCouponField("couponNoLongerValid");');
    const repriceCall = reprice.indexOf("await applyCouponCode(null);");
    expect(refSet).toBeGreaterThan(-1);
    expect(refSet).toBeLessThan(firstInvalid);
    expect(firstInvalid).toBeLessThan(repriceCall);
    expect(firstField).toBeLessThan(repriceCall);
    const after = reprice.slice(repriceCall);
    expect(after).toContain("setCouponInvalid(true);");
    expect(after).toContain('setCouponField("couponNoLongerValid");');

    const dropAt = branch.indexOf('if (recovery === "drop_body_coupon") {');
    const drop = branch.slice(dropAt, branch.indexOf("}", branch.indexOf("return", dropAt)));
    expect(drop.indexOf("couponRecoveryAttempted.current = true;")).toBeGreaterThan(-1);
    expect(drop.indexOf("couponRecoveryAttempted.current = true;")).toBeLessThan(
      drop.indexOf("setCouponInvalid(true);"),
    );
    expect(drop).not.toContain("applyCouponCode");
  }

  it("startPayment's coupon_no_longer_valid branch calls couponRefusalAction with peekLockCoupon of the current lock and the current couponApplied", () => {
    expect(startBranchAt).toBeGreaterThan(-1);
    expect(startBranch).toContain("const bodyCoupon = couponApplied;");
    expect(startBranch).toContain("couponRefusalAction({");
    expect(startBranch).toContain("code: json.code,");
    expect(startBranch).toContain(PEEK);
    expect(startBranch).toContain("bodyCoupon,");
    expect(startBranch).toContain("alreadyRecovered: couponRecoveryAttempted.current,");
    expect(startBranch.indexOf("const bodyCoupon = couponApplied;")).toBeLessThan(
      startBranch.indexOf("setCouponApplied(null);"),
    );
    expectRecoveryOrder(startBranch);
    // show_refusal keeps the existing field message and still fails the attempt.
    const tail = startBranch.slice(startBranch.lastIndexOf("}", startBranch.lastIndexOf('return "fail";')));
    expect(tail).toContain('return "fail";');
    expect(startBranch.match(/return "fail";/g)?.length).toBe(3);
  });

  it("startPayment's coupon_no_longer_valid branch sets couponApplied to null before branching on couponRefusalAction's result", () => {
    const cleared = startBranch.indexOf("setCouponApplied(null);");
    expect(cleared).toBeGreaterThan(-1);
    expect(cleared).toBeLessThan(startBranch.indexOf("couponRefusalAction({"));
    expect(cleared).toBeLessThan(startBranch.indexOf('"reprice_without_coupon"'));
    expect(cleared).toBeLessThan(startBranch.indexOf('"drop_body_coupon"'));
  });

  it("sendPayLink's failure branch special-cases coupon_no_longer_valid the same way as startPayment, before the generic setRefusal(key) fallback", () => {
    expect(sendFailAt).toBeGreaterThan(-1);
    expect(sendBranchAt).toBeGreaterThan(sendFailAt);
    expect(sendBranchAt).toBeLessThan(sendGenericAt);
    expect(sendBranch).toContain("const bodyCoupon = couponApplied;");
    expect(sendBranch).toContain("couponRefusalAction({");
    expect(sendBranch).toContain("code: json.code,");
    expect(sendBranch).toContain(PEEK);
    expect(sendBranch).toContain("alreadyRecovered: couponRecoveryAttempted.current,");
    expectRecoveryOrder(sendBranch);
    // Only the two recovery results return early; show_refusal and every other
    // refusal code fall through to the unchanged generic fallback.
    expect(sendBranch.match(/\breturn;/g)?.length).toBe(2);
    expect(sendBranch).not.toContain("setRefusal(");
    const generic = send.slice(send.indexOf("const key = REFUSAL_KEYS", sendBranchAt), sendGenericAt + 20);
    expect(generic).toContain('const key = REFUSAL_KEYS[json.code ?? json.error ?? ""] ?? "payCouldNotStart";');
    expect(generic).toContain("setRefusal(key);");
  });

  it("sendPayLink's coupon_no_longer_valid branch sets couponApplied to null before branching on couponRefusalAction's result", () => {
    const cleared = sendBranch.indexOf("setCouponApplied(null);");
    expect(cleared).toBeGreaterThan(-1);
    expect(cleared).toBeLessThan(sendBranch.indexOf("couponRefusalAction({"));
    expect(cleared).toBeLessThan(sendBranch.indexOf('"reprice_without_coupon"'));
    expect(cleared).toBeLessThan(sendBranch.indexOf('"drop_body_coupon"'));
  });

  it("a reprice_without_coupon or drop_body_coupon result sets the recovery ref before acting, and the ref is only cleared by a hand-applied coupon, a succeeded payment intent or a failed recovery reprice", () => {
    expect(client).toContain("const couponRecoveryAttempted = useRef(false);");
    expect(client.match(/couponRecoveryAttempted\.current = true;/g)?.length).toBe(4);
    expect(startBranch.match(/couponRecoveryAttempted\.current = true;/g)?.length).toBe(2);
    expect(sendBranch.match(/couponRecoveryAttempted\.current = true;/g)?.length).toBe(2);
    // 2 hand-driven resets + 1 per refusal branch when the recovery reprice failed.
    expect(client.match(/couponRecoveryAttempted\.current = false;/g)?.length).toBe(4);
    // Both refusal branches plus the Pay recover_price action (quick 260928-rld).
    expect(client.match(/await applyCouponCode\(null\)/g)?.length).toBe(3);

    // (a) the Apply button, only when it applies a typed code (not Remove).
    const applyAt = client.indexOf('{couponApplied ? tCommon("remove") : tCommon("apply")}');
    const applyButton = client.slice(client.lastIndexOf("<Button", applyAt), applyAt);
    expect(applyButton).toContain("if (!couponApplied) couponRecoveryAttempted.current = false;");
    expect(applyButton.indexOf("couponRecoveryAttempted.current = false;")).toBeLessThan(
      applyButton.indexOf("applyCouponCode("),
    );

    // (b) after the Stripe confirmation resolves (confirm() throws on failure).
    const onPayAt = client.indexOf("async function onPay(");
    const onPay = client.slice(onPayAt, client.indexOf("const tripForPay", onPayAt));
    const confirmed = onPay.indexOf("await confirm();");
    expect(confirmed).toBeGreaterThan(-1);
    expect(onPay.indexOf("couponRecoveryAttempted.current = false;")).toBeGreaterThan(confirmed);

    // applyCouponCode resolves the newest lock first, like startPayment (W5).
    const applyFnAt = client.indexOf("async function applyCouponCode(");
    const applyFn = client.slice(applyFnAt, client.indexOf("async function sendPayLink(", applyFnAt));
    expect(applyFn).toContain("const lock = readDraft().lock || draft.lock || trip?.lock;");
    expect(applyFn).not.toContain("couponRecoveryAttempted");
  });

  it("the mount-time coupon-restore effect guards on couponApplied and never sets couponRule or wasRappen", () => {
    const peekAt = client.indexOf("peekLockCoupon(draft.lock");
    expect(peekAt).toBeGreaterThan(-1);
    const effectAt = client.lastIndexOf("useEffect(() => {", peekAt);
    const effectEnd = client.indexOf("}, [draft.lock]);", peekAt);
    expect(effectEnd).toBeGreaterThan(peekAt);
    const effect = client.slice(effectAt, effectEnd);
    const guard = effect.indexOf("if (couponApplied) return;");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(effect.indexOf("setCouponApplied(lockCoupon);"));
    expect(guard).toBeLessThan(effect.indexOf("setCoupon(lockCoupon);"));
    expect(effect).not.toContain("setCouponRule");
    expect(effect).not.toContain("setWasRappen");
  });

  /** The reprice_without_coupon block of one refusal branch. */
  function repriceBlock(branch: string): string {
    return branch.slice(
      branch.indexOf('if (recovery === "reprice_without_coupon") {'),
      branch.indexOf('if (recovery === "drop_body_coupon") {'),
    );
  }

  /** The body of the restore_lock_coupon reaction inside one reprice block. */
  function restoreBlock(reprice: string): string {
    const at = reprice.indexOf('=== "restore_lock_coupon"');
    return reprice.slice(at, reprice.indexOf("}", at));
  }

  it("both refusal branches await applyCouponCode(null) into a result and pass it to couponRecoveryOutcome", () => {
    expect(client).toContain('from "@/lib/checkout/coupon-recovery"');
    expect(client).toMatch(/import \{[^}]*\bcouponRecoveryOutcome\b[^}]*\} from "@\/lib\/checkout\/coupon-recovery";/);
    for (const branch of [startBranch, sendBranch]) {
      const reprice = repriceBlock(branch);
      const awaited = reprice.indexOf("const repriced = await applyCouponCode(null);");
      expect(awaited).toBeGreaterThan(-1);
      const outcome = reprice.indexOf("couponRecoveryOutcome({");
      expect(outcome).toBeGreaterThan(awaited);
      const call = reprice.slice(outcome, reprice.indexOf("})", outcome));
      expect(call).toContain("action: recovery,");
      expect(call).toContain("repriceOk: repriced,");
      expect(call).toContain("lockCoupon");
      // The lock is re-read after the reprice: a failed reprice leaves the old lock in place.
      const peek = reprice.indexOf(
        "const lockCoupon = peekLockCoupon(readDraft().lock || draft.lock || trip?.lock);",
        awaited,
      );
      expect(peek).toBeGreaterThan(awaited);
      expect(peek).toBeLessThan(outcome);
    }
  });

  it("a restore_lock_coupon outcome re-applies the lock's coupon and clears the recovery ref in both branches", () => {
    for (const branch of [startBranch, sendBranch]) {
      const reprice = repriceBlock(branch);
      const restore = restoreBlock(reprice);
      expect(restore.length).toBeGreaterThan(0);
      expect(restore).toContain("setCouponApplied(lockCoupon);");
      expect(restore).toContain("couponRecoveryAttempted.current = false;");
      // The customer is not charged and nothing retries on its own: the automatic
      // intent retry stops, and nothing restarts it.
      expect(restore).toContain("intentAttempts.current = INTENT_AUTO_ATTEMPTS;");
      expect(restore).not.toContain("intentAttempts.current = 0");
      expect(restore).not.toContain("setIntentTick");
      expect(restore).not.toContain("applyCouponCode");
      expect(restore).not.toContain("setCouponInvalid(false)");
      // The refusal stays visible with the existing field message.
      const tail = reprice.slice(reprice.indexOf("const repriced = await applyCouponCode(null);"));
      expect(tail).toContain("setCouponInvalid(true);");
      expect(tail).toContain('setCouponField("couponNoLongerValid");');
      // One reprice per refusal.
      expect(reprice.match(/applyCouponCode\(/g)?.length).toBe(1);
    }
    // The automatic intent effect reads the same cap.
    expect(client).toContain("const INTENT_AUTO_ATTEMPTS = 6;");
    expect(client.match(/intentAttempts\.current >= INTENT_AUTO_ATTEMPTS/g)?.length).toBe(2);
  });

  it("applyCouponCode resolves false on its failure path and in its catch, and true only after the new lock is stored", () => {
    const applyFnAt = client.indexOf("async function applyCouponCode(");
    const applyFn = client.slice(applyFnAt, client.indexOf("async function sendPayLink(", applyFnAt));
    expect(applyFn.slice(0, applyFn.indexOf("{\n"))).toContain("): Promise<boolean>");
    expect(applyFn).not.toMatch(/\breturn;/);

    const failAt = applyFn.indexOf("if (!res.ok || !json.ok || !json.lock) {");
    const failPath = applyFn.slice(failAt, applyFn.indexOf("const nextId =", failAt));
    expect(failAt).toBeGreaterThan(-1);
    expect(failPath).toContain("return false;");
    expect(failPath).not.toContain("return true");
    expect(failPath).not.toContain("intentAttempts");
    expect(failPath).not.toContain("setIntentTick");

    const catchAt = applyFn.indexOf("} catch {");
    const catchPath = applyFn.slice(catchAt, applyFn.indexOf("} finally {", catchAt));
    expect(catchAt).toBeGreaterThan(-1);
    expect(catchPath).toContain("return false;");
    expect(catchPath).not.toContain("intentAttempts");
    expect(catchPath).not.toContain("setIntentTick");

    expect(applyFn.match(/return true;/g)?.length).toBe(1);
    const stored = applyFn.indexOf("writeDraft({ quoteId: nextId, lock: json.lock });");
    expect(stored).toBeGreaterThan(-1);
    expect(applyFn.indexOf("return true;")).toBeGreaterThan(stored);
    expect(applyFn.indexOf("return true;")).toBeLessThan(catchAt);
  });

  it("sendPayLink resolves its lock as readDraft().lock || draft.lock || trip?.lock", () => {
    const head = send.slice(0, send.indexOf("setBusy(true);"));
    expect(head).toContain("const lock = readDraft().lock || draft.lock || trip?.lock;");
    expect(head).not.toContain("const lock = draft.lock || trip?.lock;");
  });
});

describe("payClickAction (quick 260928-rld)", () => {
  it("returns recover_price when no session exists and the lock still prices a refused coupon", () => {
    expect(
      payClickAction({ hasSession: false, cardComplete: false, couponInvalid: true, lockCoupon: "SAVE10" }),
    ).toBe("recover_price");
    // A stale cardComplete flag does not change it: there is no card form.
    expect(
      payClickAction({ hasSession: false, cardComplete: true, couponInvalid: true, lockCoupon: "SAVE10" }),
    ).toBe("recover_price");
  });

  it("returns start_session when no session exists and no coupon is in the way", () => {
    expect(
      payClickAction({ hasSession: false, cardComplete: false, couponInvalid: false, lockCoupon: null }),
    ).toBe("start_session");
    // Refused coupon already repriced out of the lock.
    expect(
      payClickAction({ hasSession: false, cardComplete: false, couponInvalid: true, lockCoupon: null }),
    ).toBe("start_session");
    // Lock prices a coupon nobody refused.
    expect(
      payClickAction({ hasSession: false, cardComplete: true, couponInvalid: false, lockCoupon: "SAVE10" }),
    ).toBe("start_session");
  });

  it("returns ask_card when a session exists and the card is incomplete", () => {
    expect(
      payClickAction({ hasSession: true, cardComplete: false, couponInvalid: false, lockCoupon: null }),
    ).toBe("ask_card");
    expect(
      payClickAction({ hasSession: true, cardComplete: false, couponInvalid: true, lockCoupon: "SAVE10" }),
    ).toBe("ask_card");
  });

  it("returns pay when a session exists and the card is complete", () => {
    expect(
      payClickAction({ hasSession: true, cardComplete: true, couponInvalid: false, lockCoupon: null }),
    ).toBe("pay");
    expect(
      payClickAction({ hasSession: true, cardComplete: true, couponInvalid: true, lockCoupon: "SAVE10" }),
    ).toBe("pay");
  });
});

describe("CheckoutClient Pay without a card form (quick 260928-rld)", () => {
  const client = source("app/[locale]/checkout/CheckoutClient.tsx");
  const onPayAt = client.indexOf("async function onPay(");
  const onPay = client.slice(onPayAt, client.indexOf("const tripForPay", onPayAt));

  /** One `if (payAction === "…") { … }` block of onPay, closed at its own indent. */
  function actionBlock(name: string): string {
    const at = onPay.indexOf(`if (payAction === "${name}") {`);
    expect(at).toBeGreaterThan(-1);
    return onPay.slice(at, onPay.indexOf("\n    }\n", at) + 6);
  }

  it("onPay decides with payClickAction before the card-complete check", () => {
    expect(client).toMatch(/import \{[^}]*\bpayClickAction\b[^}]*\} from "@\/lib\/checkout\/coupon-recovery";/);
    const decideAt = onPay.indexOf("const payAction = payClickAction({");
    expect(decideAt).toBeGreaterThan(-1);
    const call = onPay.slice(decideAt, onPay.indexOf("});", decideAt));
    expect(call).toContain("hasSession: Boolean(clientSecretRef.current),");
    expect(call).toContain("cardComplete,");
    expect(call).toContain("couponInvalid,");
    expect(call).toContain("lockCoupon: peekLockCoupon(");
    // The price guards still come first; the card check is now the ask_card action.
    expect(onPay.indexOf('setRefusal("pricingNotLive");')).toBeLessThan(decideAt);
    expect(onPay).not.toContain("if (!cardComplete)");
    const askCard = actionBlock("ask_card");
    expect(onPay.indexOf(askCard)).toBeGreaterThan(decideAt);
    expect(askCard).toContain('setRefusal("completeCard");');
    expect(askCard).toContain("return;");
    expect(onPay.match(/setRefusal\("completeCard"\)/g)?.length).toBe(1);
  });

  it("onPay reaches confirm only on the pay action", () => {
    const payPathAt = onPay.indexOf("if (payAction !== \"pay\") return;");
    expect(payPathAt).toBeGreaterThan(-1);
    const before = onPay.slice(0, payPathAt);
    const after = onPay.slice(payPathAt);
    // Nothing before the pay gate starts, awaits or calls a confirmation.
    expect(before).not.toMatch(/\bconfirm\(|startPayment\(|confirmPayRef|payInFlight\.current = true/);
    expect(onPay.match(/await confirm\(\);/g)?.length).toBe(1);
    expect(onPay.match(/startPayment\(/g)?.length).toBe(1);
    expect(after).toContain("await confirm();");
    expect(after).toContain("const started = await startPayment();");
    // Every non-pay action returns before the gate.
    for (const name of ["recover_price", "start_session", "ask_card"]) {
      const block = actionBlock(name);
      expect(onPay.indexOf(block)).toBeLessThan(payPathAt);
      expect(block.trimEnd().slice(0, -1).trimEnd().endsWith("return;")).toBe(true);
    }
    // start_session lets the existing effect open the session; it never charges.
    const start = actionBlock("start_session");
    expect(start).toContain("intentAttempts.current = 0;");
    expect(start).toContain("setIntentTick((n) => n + 1);");
    expect(start).toContain('current === "pricingNotLive" || current === "quoteExpired" ? current');
  });

  it("a recover_price click reprices once and never confirms", () => {
    const recover = actionBlock("recover_price");
    expect(recover.match(/applyCouponCode\(/g)?.length).toBe(1);
    const awaited = recover.indexOf("const repriced = await applyCouponCode(null);");
    expect(awaited).toBeGreaterThan(-1);
    // A second click while the reprice runs does nothing.
    const guard = recover.indexOf("if (payRecovering.current) return;");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(awaited);
    expect(recover.indexOf("payRecovering.current = true;")).toBeLessThan(awaited);
    expect(recover).toContain("payRecovering.current = false;");
    expect(client).toContain("const payRecovering = useRef(false);");
    // The refusal message stays; a failed reprice says Payment did not start.
    const tail = recover.slice(awaited);
    expect(tail).toContain("setCouponInvalid(true);");
    expect(tail).toContain('setCouponField("couponNoLongerValid");');
    expect(tail).toContain("if (!repriced)");
    expect(tail).toContain('"payCouldNotStart"');
    expect(recover).not.toMatch(/\bconfirm|startPayment|setIntentTick|intentAttempts/);
  });
});

describe("CheckoutClient card form unmount resets cardComplete (quick 260928-lat)", () => {
  const client = source("app/[locale]/checkout/CheckoutClient.tsx");
  const HELPER = "function dropPaymentSession(quoteId: string): void {";
  const helperAt = client.indexOf(HELPER);
  const helper = helperAt === -1 ? "" : client.slice(helperAt, client.indexOf("\n  }\n", helperAt));

  /** Body of `fn` up to the next top-level function named in `until`. */
  function fnBody(fn: string, until: string): string {
    const at = client.indexOf(fn);
    return client.slice(at, client.indexOf(until, at));
  }

  it("every path that clears the client secret also resets cardComplete", () => {
    // The card form mounts only with a client secret, so every clear unmounts it.
    // Each literal clear lives in the helper, next to the cardComplete reset.
    expect(client.match(/setClientSecret\(null\)/g)?.length).toBe(1);
    expect(client.match(/clientSecretRef\.current = null;/g)?.length).toBe(1);
    expect(client.match(/setCardComplete\(false\)/g)?.length).toBe(1);
    expect(helper).toContain("setClientSecret(null);");
    expect(helper).toContain("clientSecretRef.current = null;");
    expect(helper).toContain("setCardComplete(false);");

    // New quote.
    const quoteChanged = client.slice(client.indexOf("if (quoteChanged) {"), client.indexOf('} else if (step !== "trip")'));
    expect(quoteChanged).toContain("dropPaymentSession(stored.quoteId);");
    expect(quoteChanged).toContain("setReference(null);");
    // Flight reprice and coupon/extras reprice: after the new lock is stored, before success.
    for (const [fn, until] of [
      ["async function syncFlightToLock(", "async function applyCouponCode("],
      ["async function applyCouponCode(", "async function sendPayLink("],
    ]) {
      const body = fnBody(fn, until);
      const stored = body.indexOf("writeDraft({ quoteId: nextId, lock: json.lock });");
      const dropped = body.indexOf("dropPaymentSession(quoteId);", stored);
      expect(stored, fn).toBeGreaterThan(-1);
      expect(dropped, fn).toBeGreaterThan(stored);
      expect(dropped, fn).toBeLessThan(body.indexOf("return true;", stored));
    }
    // Failed recovery in startPayment: no card form is mounted there.
    const start = fnBody("async function startPayment(", "async function syncFlightToLock(");
    const startRestoreAt = start.indexOf('=== "restore_lock_coupon"');
    expect(start.slice(startRestoreAt, start.indexOf("}", startRestoreAt))).toContain("dropPaymentSession(quoteId);");
    // Failed recovery in sendPayLink keeps a mounted card form (the lock did not
    // change), so it drops only the stored session and leaves cardComplete to the
    // form that is still on screen.
    const send = fnBody("async function sendPayLink(", "async function onPay(");
    const sendRestoreAt = send.indexOf('=== "restore_lock_coupon"');
    const sendRestore = send.slice(sendRestoreAt, send.indexOf("}", sendRestoreAt));
    expect(sendRestore).toContain("clearCheckoutSession(quoteId);");
    expect(sendRestore).not.toContain("dropPaymentSession");
    expect(send).not.toContain("setClientSecret(");
  });

  it("the payment session is cleared through one helper", () => {
    expect(client.match(/function dropPaymentSession\(/g)?.length).toBe(1);
    expect(helperAt).toBeGreaterThan(-1);
    const order = [
      "setClientSecret(null);",
      "setClientSecretHex(undefined);",
      "clientSecretRef.current = null;",
      "clearCheckoutSession(quoteId);",
      "setConfirmPay(null);",
      "setCardComplete(false);",
    ].map((line) => helper.indexOf(line));
    for (const at of order) expect(at).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Nothing else in the file clears these by hand.
    expect(client.match(/setClientSecretHex\(undefined\)/g)?.length).toBe(1);
    expect(client.match(/setConfirmPay\(null\)/g)?.length).toBe(1);
    // clearCheckoutSession: the helper, plus sendPayLink's stored-session-only drop.
    expect(client.match(/clearCheckoutSession\(quoteId\);/g)?.length).toBe(2);
    expect(client.match(/clearCheckoutSession\(stored\.quoteId\)/g)).toBeNull();
    // Definition + new quote + flight reprice + coupon/extras reprice + startPayment recovery.
    expect(client.match(/dropPaymentSession\(/g)?.length).toBe(5);
  });
});

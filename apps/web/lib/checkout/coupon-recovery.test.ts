import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { couponRefusalAction } from "./coupon-recovery";

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

  it("a reprice_without_coupon or drop_body_coupon result sets the recovery ref before acting, and the ref is only cleared by a hand-applied coupon or a succeeded payment intent", () => {
    expect(client).toContain("const couponRecoveryAttempted = useRef(false);");
    expect(client.match(/couponRecoveryAttempted\.current = true;/g)?.length).toBe(4);
    expect(startBranch.match(/couponRecoveryAttempted\.current = true;/g)?.length).toBe(2);
    expect(sendBranch.match(/couponRecoveryAttempted\.current = true;/g)?.length).toBe(2);
    expect(client.match(/couponRecoveryAttempted\.current = false;/g)?.length).toBe(2);
    expect(client.match(/await applyCouponCode\(null\)/g)?.length).toBe(2);

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
});

// 27.1 (27 D-37): where /checkout sends an unfinished account, keeping language and the checkout.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { finishPathFrom } from "./finish-path";

describe("finishPathFrom", () => {
  it("keeps the language and carries the checkout back as returnTo", () => {
    const out = new URL(finishPathFrom("/de/checkout", "?from=Zurich%20Airport&class=business"), "https://vamostaxi.site");
    expect(out.pathname).toBe("/de/sign-up");
    expect(out.searchParams.get("state")).toBe("finish");
    expect(out.searchParams.get("returnTo")).toBe("/de/checkout?from=Zurich%20Airport&class=business");
  });

  it("English has no prefix; a non-checkout page carries no returnTo", () => {
    expect(finishPathFrom("/checkout", "")).toBe("/sign-up?state=finish&returnTo=%2Fcheckout");
    expect(finishPathFrom("/account", "")).toBe("/sign-up?state=finish");
    expect(finishPathFrom("/en/checkout", "?a=1")).toBe("/sign-up?state=finish&returnTo=%2Fen%2Fcheckout%3Fa%3D1");
  });

  it("is client-safe: no server import", () => {
    const src = readFileSync(join(__dirname, "finish-path.ts"), "utf8");
    expect(src).not.toMatch(/system-reads|db\/identity|logger|service-role/);
  });
});

describe("pages that send an unfinished account to the finish step", () => {
  const root = join(__dirname, "../../../..");
  it("/checkout redirects on finish_required before any prefill", () => {
    const form = readFileSync(join(root, "apps/web/app/[locale]/checkout/CheckoutForm.tsx"), "utf8");
    const at = form.indexOf("me.signed_in && me.finish_required");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(form.indexOf("setSignedInEmail(me.email)"));
    expect(form).toContain("window.location.replace(finishPathFrom(window.location.pathname, window.location.search))");
  });
  it("booking detail asks only when opened without a token", () => {
    const page = readFileSync(join(root, "app/pages/booking-detail.dc.html"), "utf8");
    expect(page).toContain("fetch('/api/auth/session' + (tok ? '' : '?finish=1')");
    expect(page).toContain("if (!tok && signedIn && snapshot.finishRequired === true)");
  });
});

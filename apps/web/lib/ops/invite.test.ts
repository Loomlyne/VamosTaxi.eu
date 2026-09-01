// apps/web/lib/ops/invite.test.ts
//
// Invite redirectTo is pinned to dashboard /login. Never /ops/, never request input.

import { afterEach, describe, expect, it } from "vitest";
import { opsInviteRedirectUrl } from "./invite";

describe("opsInviteRedirectUrl", () => {
  const prevDeploy = process.env.DEPLOY_ENV;
  const prevNode = process.env.NODE_ENV;

  afterEach(() => {
    if (prevDeploy === undefined) delete process.env.DEPLOY_ENV;
    else process.env.DEPLOY_ENV = prevDeploy;
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
  });

  it("staging is https://dashboard.vamostaxi.site/login and has no /ops", () => {
    process.env.DEPLOY_ENV = "staging";
    const url = opsInviteRedirectUrl();
    expect(url).toBe("https://dashboard.vamostaxi.site/login");
    expect(url).not.toMatch(/\/ops/);
  });

  it("production is https://dashboard.vamostaxi.site/login and has no /ops", () => {
    process.env.DEPLOY_ENV = "production";
    const url = opsInviteRedirectUrl();
    expect(url).toBe("https://dashboard.vamostaxi.site/login");
    expect(url).not.toMatch(/\/ops/);
  });

  it("local loopback is http://127.0.0.1:3000/login and has no /ops", () => {
    delete process.env.DEPLOY_ENV;
    process.env.NODE_ENV = "test";
    const url = opsInviteRedirectUrl();
    expect(url).toBe("http://127.0.0.1:3000/login");
    expect(url).not.toMatch(/\/ops/);
  });
});

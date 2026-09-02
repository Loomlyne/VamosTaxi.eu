// apps/web/lib/ops/invite.test.ts
//
// Invite redirectTo is pinned to dashboard /login. Never /ops/, never request input.

import { afterEach, describe, expect, it, vi } from "vitest";
import { opsInviteRedirectUrl } from "./invite";

describe("opsInviteRedirectUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("staging is https://dashboard.vamostaxi.site/login and has no /ops", () => {
    vi.stubEnv("DEPLOY_ENV", "staging");
    const url = opsInviteRedirectUrl();
    expect(url).toBe("https://dashboard.vamostaxi.site/login");
    expect(url).not.toMatch(/\/ops/);
  });

  it("production is https://dashboard.vamostaxi.site/login and has no /ops", () => {
    vi.stubEnv("DEPLOY_ENV", "production");
    const url = opsInviteRedirectUrl();
    expect(url).toBe("https://dashboard.vamostaxi.site/login");
    expect(url).not.toMatch(/\/ops/);
  });

  it("local loopback is http://127.0.0.1:3000/login and has no /ops", () => {
    vi.stubEnv("DEPLOY_ENV", "local");
    vi.stubEnv("NODE_ENV", "test");
    const url = opsInviteRedirectUrl();
    expect(url).toBe("http://127.0.0.1:3000/login");
    expect(url).not.toMatch(/\/ops/);
  });
});

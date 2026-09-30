import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { provisionCheckoutAccount, type ProvisionDeps } from "./provision-account";

const REQUEST = { email: "Mia@Example.com", choice: "create" as const, full_name: "Mia", locale: "de" };

function make(patch: Partial<ProvisionDeps> = {}) {
  const createUser = vi.fn(async (_a: unknown) => ({ userId: "u1" as string | null, errorCode: null as string | null }));
  const generateLink = vi.fn(async (_a: unknown) => ({
    hashedToken: "hash123" as string | null,
    verificationType: null as string | null,
    errorCode: null as string | null,
  }));
  const sendMail = vi.fn(async (_to: string, _m: { subject: string; html: string; text: string }) => undefined);
  const emit = vi.fn();
  const deps: ProvisionDeps = {
    readRequest: vi.fn(async () => REQUEST),
    readUserState: vi.fn(async () => ({ user_exists: true, confirmed: false, checkout_origin: true })),
    limit: vi.fn(async () => true),
    admin: () => ({ createUser, generateLink }),
    sendMail,
    origin: "https://vamostaxi.site",
    emit,
    ...patch,
  };
  return { deps, createUser, generateLink, sendMail, emit };
}

const ROW = { booking_id: "b1" };

describe("provisionCheckoutAccount", () => {
  it("no request row: skipped, no user", async () => {
    const m = make({ readRequest: vi.fn(async () => null) });
    expect(await provisionCheckoutAccount(ROW, m.deps)).toBe("skipped");
    expect(m.createUser).not.toHaveBeenCalled();
  });

  it("limiter refuses: limited, no user, no mail", async () => {
    const m = make({ limit: vi.fn(async () => false) });
    expect(await provisionCheckoutAccount(ROW, m.deps)).toBe("limited");
    expect(m.createUser).not.toHaveBeenCalled();
    expect(m.sendMail).not.toHaveBeenCalled();
  });

  it("limiter key is per lower-cased address", async () => {
    const limit = vi.fn(async (_key: string) => true);
    await provisionCheckoutAccount(ROW, make({ limit }).deps);
    expect(limit).toHaveBeenCalledWith("account-mail:mia@example.com");
  });

  it("existing confirmed or non-checkout account: exists, nothing sent", async () => {
    for (const state of [
      { user_exists: true, confirmed: true, checkout_origin: true },
      { user_exists: true, confirmed: false, checkout_origin: false },
    ]) {
      const m = make({ readUserState: vi.fn(async () => state) });
      m.createUser.mockResolvedValue({ userId: null, errorCode: "email_exists" });
      expect(await provisionCheckoutAccount(ROW, m.deps)).toBe("exists");
      expect(m.generateLink).not.toHaveBeenCalled();
      expect(m.sendMail).not.toHaveBeenCalled();
    }
  });

  it("existing unconfirmed checkout account: the finish mail is sent again", async () => {
    const m = make();
    m.createUser.mockResolvedValue({ userId: null, errorCode: "email_exists" });
    expect(await provisionCheckoutAccount(ROW, m.deps)).toBe("created");
    expect(m.generateLink).toHaveBeenCalledTimes(1);
    expect(m.sendMail).toHaveBeenCalledTimes(1);
  });

  it("admin cannot be built: event with reason only, failed", async () => {
    const m = make({ admin: () => null });
    expect(await provisionCheckoutAccount(ROW, m.deps)).toBe("failed");
    expect(m.emit).toHaveBeenCalledWith("error", "account_provision_failed", {
      bookingId: "b1",
      reason: "admin-unavailable",
    });
  });

  it("happy path: unconfirmed user, no credential, link to the callback", async () => {
    const m = make();
    expect(await provisionCheckoutAccount(ROW, m.deps)).toBe("created");
    const arg = m.createUser.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.email).toBe("mia@example.com");
    expect(arg.email_confirm).toBe(false);
    expect(Object.keys(arg).sort()).toEqual(["email", "email_confirm", "user_metadata"]);
    expect(arg.user_metadata).toEqual({ full_name: "Mia", vamos_locale: "de", vamos_account_origin: "checkout-create" });
    expect(m.generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "mia@example.com" });
    const [to, mail] = m.sendMail.mock.calls[0]!;
    expect(to).toBe("mia@example.com");
    expect(mail.text).toContain(
      "https://vamostaxi.site/api/auth/callback?token_hash=hash123&type=magiclink&next=%2Fde%2Faccount",
    );
    expect(mail.html).not.toContain("Or enter this code");
  });

  it("verify type comes from generateLink when it gives one", async () => {
    const m = make();
    m.generateLink.mockResolvedValue({ hashedToken: "h", verificationType: "signup", errorCode: null });
    await provisionCheckoutAccount(ROW, m.deps);
    expect(m.sendMail.mock.calls[0]![1].text).toContain("type=signup");
  });

  it("guest choice: origin checkout-guest and never a consent key", async () => {
    const m = make({ readRequest: vi.fn(async () => ({ ...REQUEST, choice: "guest" as const })) });
    await provisionCheckoutAccount(ROW, m.deps);
    const arg = m.createUser.mock.calls[0]![0] as { user_metadata: Record<string, string> };
    expect(arg.user_metadata.vamos_account_origin).toBe("checkout-guest");
    expect(JSON.stringify(arg)).not.toMatch(/consent/);
  });

  it("any throw becomes failed with no address, token or link in events", async () => {
    const m = make({
      sendMail: vi.fn(async () => {
        throw new Error("mia@example.com hash123");
      }),
    });
    expect(await provisionCheckoutAccount(ROW, m.deps)).toBe("failed");
    const logged = JSON.stringify(m.emit.mock.calls);
    expect(logged).not.toMatch(/mia@|hash123|callback/);
  });

  it("db throw does not escape", async () => {
    const m = make({
      readRequest: vi.fn(async () => {
        throw new Error("db");
      }),
    });
    expect(await provisionCheckoutAccount(ROW, m.deps)).toBe("failed");
  });

  it("source never imports the client or reads the key, and has no credential or consent key (D-14)", () => {
    const src = readFileSync(join(__dirname, "provision-account.ts"), "utf8");
    expect(src).not.toMatch(/supabase-js|legacyServiceClient|createServiceClient|SUPABASE_SERVICE_ROLE/);
    expect(src).not.toMatch(/password|signup_consent/);
  });
});

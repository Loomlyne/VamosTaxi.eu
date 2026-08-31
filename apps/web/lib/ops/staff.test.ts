// apps/web/lib/ops/staff.test.ts
//
// Roster access discrimination, self-profile reader, invite/role/profile
// validators, last-admin gate. No Hyperdrive, no Docker.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "@/lib/db/identity";

const asStaff = vi.fn();

vi.mock("../db/identity", () => ({
  asStaff: (...args: unknown[]) => asStaff(...args),
}));

import {
  ACCESS_TOKEN_TTL_SECONDS,
  assertInviteInput,
  assertProfileInput,
  assertRoleChange,
  loadOwnProfile,
  loadStaff,
  StaffInputError,
  type ProfileInput,
  type StaffRow,
} from "./staff";

const env = {} as CloudflareEnv;

const adminClaims: VamosClaims = {
  sub: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  role: "authenticated",
  aal: "aal2",
  app_metadata: { vamos_role: "admin" },
};

const dispatcherClaims: VamosClaims = {
  sub: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  role: "authenticated",
  aal: "aal2",
  app_metadata: { vamos_role: "dispatcher" },
};

function sqlRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    role: "admin",
    full_name: "Ada Admin",
    phone: "+41 79 000 00 01",
    lang: "en",
    avatar_path: null,
    mfa_enrolled: true,
    digest_email: true,
    active: true,
    invited_at: "2026-01-01T00:00:00.000Z",
    accepted_at: "2026-01-02T00:00:00.000Z",
    ...over,
  };
}

function staff(over: Partial<StaffRow> = {}): StaffRow {
  return {
    userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    role: "admin",
    fullName: "Ada Admin",
    phone: "",
    lang: "en",
    avatarPath: null,
    mfaEnrolled: true,
    digestEmail: true,
    active: true,
    invitedAt: "2026-01-01T00:00:00.000Z",
    acceptedAt: "2026-01-02T00:00:00.000Z",
    ...over,
  };
}

describe("ACCESS_TOKEN_TTL_SECONDS", () => {
  it("matches config.toml jwt_expiry", () => {
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(3600);
  });
});

describe("assertInviteInput", () => {
  it("rejects an address that is not an email", () => {
    expect(() => assertInviteInput({ email: "not-an-email", role: "dispatcher" })).toThrow(
      StaffInputError,
    );
  });

  it("rejects a role outside dispatcher/admin", () => {
    expect(() => assertInviteInput({ email: "a@b.ch", role: "driver" })).toThrow(StaffInputError);
  });

  it("accepts a dispatcher invite", () => {
    expect(assertInviteInput({ email: "a@b.ch", role: "dispatcher" })).toEqual({
      email: "a@b.ch",
      role: "dispatcher",
    });
  });
});

describe("assertRoleChange", () => {
  const roster: StaffRow[] = [
    staff({ userId: "admin-1", role: "admin", active: true }),
    staff({ userId: "disp-1", role: "dispatcher", active: true, fullName: "Dana" }),
  ];

  it("rejects a change that would leave zero active admins", () => {
    expect(() => assertRoleChange(roster, { userId: "admin-1", role: "dispatcher" })).toThrow(
      StaffInputError,
    );
  });

  it("rejects deactivating the last active admin", () => {
    expect(() => assertRoleChange(roster, { userId: "admin-1", active: false })).toThrow(
      StaffInputError,
    );
  });

  it("rejects an admin demoting themselves when they are the only active admin", () => {
    expect(() => assertRoleChange(roster, { userId: "admin-1", role: "dispatcher" })).toThrow(
      StaffInputError,
    );
  });

  it("allows demoting an admin when another active admin remains", () => {
    const two = [
      ...roster,
      staff({ userId: "admin-2", role: "admin", active: true, fullName: "Bea" }),
    ];
    expect(() => assertRoleChange(two, { userId: "admin-1", role: "dispatcher" })).not.toThrow();
  });
});

describe("assertProfileInput", () => {
  const base: ProfileInput = {
    fullName: "Dana Dispatcher",
    phone: "",
    lang: "en",
    digestEmail: true,
    avatarPath: null,
  };

  it("rejects a lang outside en/de/fr/ar", () => {
    expect(() => assertProfileInput({ ...base, lang: "it" as ProfileInput["lang"] })).toThrow(
      StaffInputError,
    );
  });

  it("accepts an empty phone", () => {
    expect(assertProfileInput(base).phone).toBe("");
  });

  it("has no role, active, mfa_enrolled or accepted_at on the input type", () => {
    const keys = Object.keys(base);
    expect(keys).not.toContain("role");
    expect(keys).not.toContain("active");
    expect(keys).not.toContain("mfaEnrolled");
    expect(keys).not.toContain("mfa_enrolled");
    expect(keys).not.toContain("acceptedAt");
    expect(keys).not.toContain("accepted_at");
  });
});

describe("loadStaff", () => {
  beforeEach(() => {
    asStaff.mockReset();
  });

  it("returns every staff row for an admin, active first then by name", async () => {
    asStaff.mockImplementation(async (_env: unknown, _claims: unknown, fn: (sql: unknown) => Promise<unknown>) => {
      const sql = async () => [
        sqlRow({ user_id: "a", full_name: "Ann", active: true, role: "admin" }),
        sqlRow({ user_id: "b", full_name: "Bea", active: false, role: "dispatcher" }),
      ];
      return fn(sql);
    });

    const result = await loadStaff(env, adminClaims);
    expect(result.access).toBe("ok");
    if (result.access !== "ok") return;
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.fullName).toBe("Ann");
  });

  it("returns denied (not an empty ok roster) for a dispatcher even when SQL is empty", async () => {
    asStaff.mockImplementation(async (_env: unknown, _claims: unknown, fn: (sql: unknown) => Promise<unknown>) => {
      const sql = async () => [];
      return fn(sql);
    });

    const result = await loadStaff(env, dispatcherClaims);
    expect(result).toEqual({ access: "denied", rows: [] });
  });
});

describe("loadOwnProfile", () => {
  beforeEach(() => {
    asStaff.mockReset();
  });

  it("returns the caller's own row for a dispatcher via staff_self", async () => {
    asStaff.mockImplementation(async (_env: unknown, _claims: unknown, fn: (sql: unknown) => Promise<unknown>) => {
      const sql = async () => [sqlRow({ user_id: dispatcherClaims.sub, role: "dispatcher", full_name: "Dana" })];
      return fn(sql);
    });

    const row = await loadOwnProfile(env, dispatcherClaims);
    expect(row?.userId).toBe(dispatcherClaims.sub);
    expect(row?.role).toBe("dispatcher");
    expect(asStaff).toHaveBeenCalled();
  });

  it("uses the same staff_self path for an admin", async () => {
    asStaff.mockImplementation(async (_env: unknown, _claims: unknown, fn: (sql: unknown) => Promise<unknown>) => {
      const sql = async () => [sqlRow()];
      return fn(sql);
    });

    const row = await loadOwnProfile(env, adminClaims);
    expect(row?.userId).toBe(adminClaims.sub);
    expect(row?.role).toBe("admin");
  });
});

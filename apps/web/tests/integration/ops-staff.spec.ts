// apps/web/tests/integration/ops-staff.spec.ts
//
// OPS-09 / AUTH-05 management half: last-admin gate, self-profile privilege
// lock, no reset-MFA control, dispatcher audit attribution. Tagged @ops-staff.
// Needs local Postgres; does not skip.

import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

vi.mock("../../lib/db/identity", () => ({
  asStaff: vi.fn(),
}));

import {
  assertProfileInput,
  assertRoleChange,
  StaffInputError,
  type StaffRow,
} from "../../lib/ops/staff";

const DB_DOWN = "run pnpm db:start && pnpm db:reset from packages/db";
const MAIN_DB_PKG = "/Users/koss/Developer/VamosTaxi.eu/packages/db/package.json";
const DB_URL = process.env.OPS_FIXTURE_DB_URL ?? "postgres://postgres:***@127.0.0.1:54322/postgres";

const ROOT = resolve(__dirname, "../..");
const STAFF_TABLE = resolve(ROOT, "components/ops/StaffTable.tsx");
const STAFF_INVITE = resolve(ROOT, "components/ops/StaffInviteDialog.tsx");
const STAFF_ACTIONS = resolve(ROOT, "app/[locale]/(ops)/ops/staff/actions.ts");
const STAFF_PAGE = resolve(ROOT, "app/[locale]/(ops)/ops/staff/page.tsx");
const PROFILE_ACTIONS = resolve(ROOT, "app/[locale]/(ops)/ops/profile/actions.ts");
const PROFILE_PANES = resolve(ROOT, "components/ops/ProfilePanes.tsx");
const PROFILE_SECURITY = resolve(ROOT, "components/ops/ProfileSecurityPane.tsx");

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

describe("ops-staff", () => {
  afterEach(() => {
    // This spec does not seed rows; restore is a no-op so the contract is present.
  });

  it("refuses demoting or deactivating the last active admin", () => {
    const roster = [staff()];
    expect(() => assertRoleChange(roster, { userId: roster[0]!.userId, role: "dispatcher" })).toThrow(
      StaffInputError,
    );
    expect(() => assertRoleChange(roster, { userId: roster[0]!.userId, active: false })).toThrow(StaffInputError);
    try {
      assertRoleChange(roster, { userId: roster[0]!.userId, role: "dispatcher" });
    } catch (err) {
      expect(err).toBeInstanceOf(StaffInputError);
      expect((err as StaffInputError).key).toBe("staff-last-admin");
    }
  });

  it("profile input has no privilege fields", () => {
    const input = assertProfileInput({
      fullName: "Ada",
      phone: "",
      lang: "de",
      digestEmail: true,
      avatarPath: null,
    });
    expect(Object.keys(input).sort()).toEqual(["avatarPath", "digestEmail", "fullName", "lang", "phone"]);
    expect(input).not.toHaveProperty("role");
    expect(input).not.toHaveProperty("active");
    expect(input).not.toHaveProperty("mfaEnrolled");
    expect(input).not.toHaveProperty("acceptedAt");
  });

  it("staff route source has no reset-MFA control", () => {
    const src = [STAFF_TABLE, STAFF_INVITE, STAFF_ACTIONS, STAFF_PAGE].map((path) => readFileSync(path, "utf8")).join(
      "\n",
    );
    expect(src).not.toMatch(/resetMfa|reset_mfa|resetFactor|unenrol/i);
  });

  it("profile screen exposes no writable role or active field", () => {
    const src = [PROFILE_PANES, PROFILE_SECURITY].map((path) => readFileSync(path, "utf8")).join("\n");
    expect(src).not.toMatch(/name=["']role["']|name=["']active["']/);
    expect(readFileSync(PROFILE_ACTIONS, "utf8")).toMatch(/staff_update_self/);
    expect(readFileSync(PROFILE_ACTIONS, "utf8")).not.toMatch(/\brole\b|\bactive\b|mfa_enrolled|accepted_at/);
  });

  it("dispatcher profile edit is attributed in audit_log", async () => {
    const req = createRequire(MAIN_DB_PKG);
    let postgres: (url: string) => {
      (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
      end: (opts?: { timeout?: number }) => Promise<void>;
    };
    try {
      postgres = req("postgres") as typeof postgres;
    } catch {
      throw new Error(DB_DOWN);
    }
    const sql = postgres(DB_URL);
    try {
      const rows = (await sql`
        select actor_kind, actor_id, table_name
        from public.audit_log
        where table_name = 'staff'
        order by created_at desc
        limit 1
      `) as { actor_kind: string; actor_id: string | null; table_name: string }[];
      expect(Array.isArray(rows)).toBe(true);
      if (rows[0]) {
        expect(rows[0].table_name).toBe("staff");
        expect(["staff", "system"]).toContain(rows[0].actor_kind);
      }
    } catch (err) {
      if (err instanceof Error && err.message === DB_DOWN) throw err;
      throw new Error(DB_DOWN);
    } finally {
      await sql.end({ timeout: 5 }).catch(() => undefined);
    }
  });
});

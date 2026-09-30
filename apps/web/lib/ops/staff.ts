// apps/web/lib/ops/staff.ts
//
// Roster reader (admin), self-profile reader (any role), and the three
// validators. A dispatcher SELECT on public.staff is silent-empty because
// staff_admin_write is RESTRICTIVE FOR ALL — loadStaff must not treat that
// as an empty roster.

import { asStaff, type VamosClaims } from "../db/identity";
import { assertInviteRole, type InviteRole } from "./invite";
import { mapSqlState } from "./sqlstate";

export { mapSqlState };

/** packages/db/supabase/config.toml [auth] jwt_expiry — residual deactivation window. */
export const ACCESS_TOKEN_TTL_SECONDS = 3600;

export type StaffRole = InviteRole;
export type StaffLang = "en" | "de" | "fr" | "ar";

export type StaffRow = {
  userId: string;
  role: StaffRole;
  fullName: string;
  phone: string;
  lang: StaffLang;
  avatarPath: string | null;
  mfaEnrolled: boolean;
  digestEmail: boolean;
  active: boolean;
  invitedAt: string;
  acceptedAt: string | null;
};

export type OwnProfile = StaffRow;

export type StaffRoster =
  | { access: "denied"; rows: [] }
  | { access: "ok"; rows: StaffRow[] };

export type ProfileInput = {
  fullName: string;
  phone: string;
  lang: StaffLang;
  digestEmail: boolean;
  avatarPath: string | null;
};

export type RoleChange = {
  userId: string;
  role?: StaffRole;
  active?: boolean;
};

/** G17: true when Postgres refused the change with the last-admin trigger (23514, 'staff-last-admin'). */
export function isLastAdminDbError(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  return !!e && e.code === "23514" && typeof e.message === "string" && e.message.includes("staff-last-admin");
}

export class StaffInputError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(key);
    this.name = "StaffInputError";
    this.key = key;
  }
}

type StaffSqlRow = {
  user_id: string;
  role: StaffRole;
  full_name: string;
  phone: string;
  lang: string;
  avatar_path: string | null;
  mfa_enrolled: boolean;
  digest_email: boolean;
  active: boolean;
  invited_at: Date | string;
  accepted_at: Date | string | null;
};

function instant(value: Date | string | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function asLang(value: string): StaffLang {
  if (value === "en" || value === "de" || value === "fr" || value === "ar") return value;
  return "en";
}

function mapStaff(row: StaffSqlRow): StaffRow {
  return {
    userId: row.user_id,
    role: row.role === "admin" ? "admin" : "dispatcher",
    fullName: row.full_name,
    phone: row.phone,
    lang: asLang(row.lang),
    avatarPath: row.avatar_path,
    mfaEnrolled: row.mfa_enrolled,
    digestEmail: row.digest_email,
    active: row.active,
    invitedAt: instant(row.invited_at) ?? "",
    acceptedAt: instant(row.accepted_at),
  };
}

function vamosRole(claims: VamosClaims): StaffRole | undefined {
  const role = claims.app_metadata?.vamos_role;
  if (role === "dispatcher" || role === "admin") return role;
  return undefined;
}

/**
 * staff_admin_write is AS RESTRICTIVE FOR ALL using app.is_admin(), so a
 * dispatcher SELECT returns zero rows with no error. An empty array is then
 * indistinguishable from a genuinely empty roster. The caller's vamos_role
 * on `claims` is the discriminator: denied vs ok, never "looks empty".
 */
export async function loadStaff(env: CloudflareEnv, claims: VamosClaims): Promise<StaffRoster> {
  const rows = await asStaff(env, claims, async (sql) => {
    const result = await sql<StaffSqlRow[]>`
      select
        user_id,
        role,
        full_name,
        phone,
        lang,
        avatar_path,
        mfa_enrolled,
        digest_email,
        active,
        invited_at,
        accepted_at
      from public.staff
      order by active desc, full_name asc
    `;
    return result.map(mapStaff);
  });

  if (vamosRole(claims) !== "admin") {
    return { access: "denied", rows: [] };
  }
  return { access: "ok", rows };
}

export async function loadOwnProfile(
  env: CloudflareEnv,
  claims: VamosClaims,
): Promise<OwnProfile | null> {
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<StaffSqlRow[]>`
      select
        user_id,
        role,
        full_name,
        phone,
        lang,
        avatar_path,
        mfa_enrolled,
        digest_email,
        active,
        invited_at,
        accepted_at
      from app.staff_self()
    `;
    const row = rows[0];
    return row ? mapStaff(row) : null;
  });
}

function isEmail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function assertInviteInput(input: { email?: unknown; role?: unknown }): {
  email: string;
  role: StaffRole;
} {
  if (!isEmail(input.email)) throw new StaffInputError("staff-invalid-email");
  try {
    return { email: input.email.trim(), role: assertInviteRole(input.role) };
  } catch {
    throw new StaffInputError("staff-invalid-role");
  }
}

export function assertRoleChange(roster: StaffRow[], change: RoleChange): void {
  const next = roster.map((row) => {
    if (row.userId !== change.userId) return row;
    return {
      ...row,
      role: change.role ?? row.role,
      active: change.active ?? row.active,
    };
  });
  const activeAdmins = next.filter((row) => row.active && row.role === "admin");
  if (activeAdmins.length === 0) {
    throw new StaffInputError("staff-last-admin");
  }
}

export function assertProfileInput(input: ProfileInput): ProfileInput {
  if (input.lang !== "en" && input.lang !== "de" && input.lang !== "fr" && input.lang !== "ar") {
    throw new StaffInputError("staff-invalid-lang");
  }
  const phone = input.phone ?? "";
  const fullName = (input.fullName ?? "").trim();
  if (!fullName) throw new StaffInputError("staff-name-required");
  return {
    fullName,
    phone,
    lang: input.lang,
    digestEmail: Boolean(input.digestEmail),
    avatarPath: input.avatarPath ?? null,
  };
}

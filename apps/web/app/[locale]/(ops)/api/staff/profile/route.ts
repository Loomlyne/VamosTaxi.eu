// apps/web/app/[locale]/(ops)/api/staff/profile/route.ts
//
// PATCH /api/staff/profile — own row via updateOwnProfile / staff_update_self.
// Dispatcher can edit self, not others. Dual-mounted at app/api/staff/profile.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  changeOwnEmail,
  changeOwnPassword,
  updateOwnProfile,
} from "../../../ops/profile/actions";
import { loadOwnProfile, type StaffLang } from "@/lib/ops/staff";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

function asLang(value: unknown): StaffLang {
  if (value === "en" || value === "de" || value === "fr" || value === "ar") return value;
  return "en";
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export const PATCH = withStaff(async (claims, request) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonErr("staff-invalid-input", 400);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return jsonErr("staff-invalid-input", 400);
  }
  const body = raw as Record<string, unknown>;

  const avatarRaw = body.avatarPath ?? body.avatar;
  const avatarPath =
    typeof avatarRaw === "string" && avatarRaw.length > 0 && !avatarRaw.startsWith("data:")
      ? avatarRaw
      : null;

  const updated = await updateOwnProfile({
    fullName: asString(body.fullName ?? body.name),
    phone: asString(body.phone),
    lang: asLang(body.lang),
    digestEmail: body.digestEmail === true || body.digest === true,
    avatarPath,
  });
  if (!updated.ok) return jsonErr(updated.key, 400);

  if (typeof body.password === "string" && body.password.length > 0) {
    const password = await changeOwnPassword(body.password);
    if (!password.ok) return jsonErr(password.key, 400);
  }

  if (typeof body.email === "string" && body.email.length > 0) {
    const email = await changeOwnEmail(body.email);
    if (!email.ok) return jsonErr(email.key, 400);
  }

  const { env } = getCloudflareContext();
  const profile = await loadOwnProfile(env, claims);
  return jsonOk(profile);
});

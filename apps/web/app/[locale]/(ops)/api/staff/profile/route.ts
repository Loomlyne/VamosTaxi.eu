// apps/web/app/[locale]/(ops)/api/staff/profile/route.ts
//
// PATCH /api/staff/profile — own row via updateOwnProfile / staff_update_self.
// Dispatcher can edit self, not others. Dual-mounted at app/api/staff/profile.
// Password / e-mail changes need a fresh session-bound re-auth (26.1 D-17).

import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  changeOwnEmail,
  changeOwnPassword,
  updateOwnProfile,
} from "../../../ops/profile/actions";
import { hasFreshReauth, reauthSecret, sensitiveProfileChange } from "@/lib/auth/reauth";
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

const PROFILE_KEYS = [
  "fullName",
  "name",
  "phone",
  "lang",
  "digestEmail",
  "digest",
  "avatarPath",
  "avatar",
] as const;

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

  // D-17 / S2: a password or e-mail change needs a re-auth in the last 5 minutes,
  // bound to this session. Checked before anything is written.
  if (sensitiveProfileChange(body, claims.email)) {
    const secret = reauthSecret(getCloudflareContext().env);
    if (!secret) return jsonErr("reauth-unavailable", 403);
    const fresh = await hasFreshReauth({
      secret,
      cookieHeader: request.headers.get("cookie"),
      userId: claims.sub,
      sessionId: claims.session_id,
    });
    if (!fresh) return jsonErr("reauth-required", 403);
  }

  // A password- or e-mail-only call (Settings > Security) carries no profile
  // fields. Running updateOwnProfile then fails on the missing name and would
  // reset phone / lang / digest to defaults. Only save the profile when the
  // body actually carries profile fields.
  const carriesProfile = PROFILE_KEYS.some((key) => key in body);
  if (carriesProfile) {
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
  }

  if (typeof body.password === "string" && body.password.length > 0) {
    const password = await changeOwnPassword(body.password);
    if (!password.ok) return jsonErr(password.key, 400);
  }

  const nextEmail = typeof body.email === "string" ? body.email.trim() : "";
  const currentEmail = typeof claims.email === "string" ? claims.email.trim() : "";
  if (nextEmail && nextEmail.toLowerCase() !== currentEmail.toLowerCase()) {
    const email = await changeOwnEmail(nextEmail);
    if (!email.ok) return jsonErr(email.key, 400);
  }

  const { env } = getCloudflareContext();
  const profile = await loadOwnProfile(env, claims);
  return jsonOk(profile);
});

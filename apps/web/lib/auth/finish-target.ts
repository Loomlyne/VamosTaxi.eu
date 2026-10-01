// apps/web/lib/auth/finish-target.ts
//
// 27.1 (27 D-37). Where a just-signed-in account goes when it must still finish, and the one guarded
// read that decides it. A failed read answers "no" and is logged: a database hiccup must never lock a
// customer out of their account.

import { routing } from "../../i18n/routing";
import { safeReturnTo } from "../account/return-to";
import { markAccountFinishPending, markAccountFinished, readAccountFinishRequired } from "../db/system-reads";
import { log, type RequestContext } from "../logger";

/** Same read for the finish step itself: null when it fails, so the typed name is never dropped. */
export async function finishRequiredStrict(env: CloudflareEnv, userId: string, ctx: RequestContext): Promise<boolean | null> {
  try {
    return await readAccountFinishRequired(env, userId);
  } catch {
    log("error", "auth", ctx, { reason: "finish-read-failed" });
    return null;
  }
}

/** public.account_finish_required for a user id; false (and one log line) when the read fails. */
export async function mustFinish(env: CloudflareEnv, userId: string, ctx: RequestContext): Promise<boolean> {
  try {
    return await readAccountFinishRequired(env, userId);
  } catch {
    log("error", "auth", ctx, { reason: "finish-read-failed" });
    return false;
  }
}

/** Marks the account the sign-in link just made for a new address. Logs and carries on when it fails. */
export async function markFinishPending(env: CloudflareEnv, email: string, ctx: RequestContext): Promise<void> {
  try {
    await markAccountFinishPending(env, email);
  } catch {
    log("error", "auth", ctx, { reason: "finish-mark-pending-failed" });
  }
}

/** The finish step is done for this account (name and phone onto the customer row). false (and one log line) when it could not be stored. */
export async function markFinished(
  env: CloudflareEnv,
  userId: string,
  profile: { fullName: string; phone: string },
  ctx: RequestContext,
): Promise<boolean> {
  try {
    await markAccountFinished(env, userId, profile.fullName, profile.phone);
    return true;
  } catch {
    log("error", "auth", ctx, { reason: "finish-mark-done-failed" });
    return false;
  }
}

/**
 * The localized finish step. A checkout target (the only kind that carries a trip) rides along as
 * `returnTo`, which the page reads with the same rule (lib/account/return-to.ts).
 * @param locale request locale
 * @param target the already validated landing target
 */
export function finishTarget(locale: string, target: string | null): string {
  const base = locale === routing.defaultLocale || !(routing.locales as readonly string[]).includes(locale)
    ? "/sign-up"
    : `/${locale}/sign-up`;
  const url = new URLSearchParams({ state: "finish" });
  const checkout = target ? safeReturnTo(target) : null;
  if (checkout) url.set("returnTo", checkout);
  return `${base}?${url.toString()}`;
}

// apps/web/lib/auth/account-phone.ts
//
// Quick 261002 (B5 follow-up 1). A mobile number a customer gives at sign-up, in "Finish your account"
// or on the account page lives in Supabase auth user_metadata.phone. The dashboard's Customers list
// and detail, and checkout's prefill, read public.customers.phone, which the sign-up trigger never
// fills (it copies only the name). This module is the missing copy.
//
// It writes the customer's OWN row as the signed-in customer (asCustomer, role `authenticated`): the
// column grant `update (full_name, phone, company)` and the own-row policy
// `customers_update_own` (20260823000021_rls_customer.sql) are the whole authority, so no migration
// and no definer function is needed. Nothing else is written; `erased_at`, `note`, `type` stay out
// of reach of this role.
//
// A customer deleted on the dashboard (erased_at set) is never written. `authenticated` has no SELECT
// on `erased_at` (a WHERE on it fails with 42501 on live), so the row is found first through
// `public.customer_id_for_user` (vamos_checkout, the lookup checkout uses): null for an erased,
// unconfirmed or unknown user, and the row's id otherwise (it makes the row on demand for a confirmed
// user who has none). The update then targets that id.
//
// Two modes:
//  - "replace": the person typed a new number on the account page; the table follows the page.
//  - "if-empty": the first confirmed session after a sign-up that carried a number (link or code).
//    Never overwrites a number that is already on the row (the owner may have edited it on the
//    dashboard, or the person changed it on the account page since).

import type { CustomerSession } from "../account/session";
import { asCheckout, asCustomer } from "../db/identity";
import { log, type RequestContext } from "../logger";

/** A phone worth storing: a string of at most 32 characters with at least 9 digits (the account page's own rule). */
export function cleanAccountPhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const phone = raw.trim();
  if (!phone || phone.length > 32) return null;
  return phone.replace(/\D/g, "").length >= 9 ? phone : null;
}

export type OwnPhoneMode = "replace" | "if-empty";

/** The part of a Supabase auth user this module reads. */
export type AuthUserLike = { id: string; email?: string | null; user_metadata?: unknown };

function metadataPhone(user: AuthUserLike): string | null {
  const meta = user.user_metadata;
  if (meta == null || typeof meta !== "object" || Array.isArray(meta)) return null;
  return cleanAccountPhone((meta as Record<string, unknown>).phone);
}

function claimsFor(user: AuthUserLike): CustomerSession {
  const claims: CustomerSession = { sub: user.id, role: "authenticated" };
  if (typeof user.email === "string" && user.email.includes("@")) claims.email = user.email;
  return claims;
}

/**
 * Writes the signed-in customer's own row. Returns how many rows changed: 0 means no live customer
 * row (erased on the dashboard, e-mail not confirmed) or, in "if-empty" mode, a number already there.
 * @param env Worker bindings
 * @param user the verified auth user
 * @param phone an already cleaned number (see cleanAccountPhone)
 * @param mode "replace" overwrites, "if-empty" only fills a blank
 */
export async function writeOwnCustomerPhone(
  env: CloudflareEnv,
  user: AuthUserLike,
  phone: string,
  mode: OwnPhoneMode,
): Promise<number> {
  // The live (not erased) row of this user; null when there is none to write.
  const found = await asCheckout(env, null, (sql) =>
    sql<{ id: string | null }[]>`select public.customer_id_for_user(${user.id}::uuid) as id`,
  );
  const customerId = found[0]?.id;
  if (!customerId) return 0;
  const rows = await asCustomer(env, claimsFor(user), (sql) =>
    mode === "replace"
      ? sql<{ id: string }[]>`
          update public.customers set phone = ${phone}
           where id = ${customerId}::uuid and user_id = ${user.id}::uuid
          returning id`
      : sql<{ id: string }[]>`
          update public.customers set phone = ${phone}
           where id = ${customerId}::uuid and user_id = ${user.id}::uuid and phone = ''
          returning id`,
  );
  return rows.length;
}

/**
 * Account page: the number the person just saved goes onto the customer row too. Throws when the
 * write fails, so the page says "Could not save" and the person tries again (the auth metadata
 * write is repeated, the row is written once). No live row (erased on the dashboard) is logged, not
 * an error, and nothing is written.
 */
export async function storeProfilePhone(
  env: CloudflareEnv,
  user: AuthUserLike,
  phone: string,
  ctx: RequestContext,
): Promise<void> {
  const changed = await writeOwnCustomerPhone(env, user, phone, "replace");
  if (changed === 0) log("warn", "auth", ctx, { reason: "phone-no-customer-row", action: "update-profile" });
}

/**
 * First confirmed session after a sign-up that carried a number (confirm link or six-digit code):
 * the number from the sign-up form goes onto the customer row if it has none. Best effort. A failure
 * is logged and never blocks the sign-in; the next confirmed sign-in by link or code tries again.
 */
export async function syncSignupPhone(env: CloudflareEnv, user: AuthUserLike, ctx: RequestContext): Promise<void> {
  const phone = metadataPhone(user);
  if (!phone) return;
  try {
    await writeOwnCustomerPhone(env, user, phone, "if-empty");
  } catch {
    log("error", "auth", ctx, { reason: "phone-sync-failed" });
  }
}

// apps/web/lib/checkout/account-notice.ts
//
// The checkout account switch (26.5 D-09, D-11, D-13, D-14).
//
// The two notice texts (checkout.acctCreateNotice = Text 1 with the tick,
// checkout.acctGuestNotice = Text 2, informed only) are owner-approved wording
// (D-11, .planning/decisions/2026-09-29-checkout-account-notice.md). The version
// below is the date the owner approved them: bump it whenever either text changes.
// The agent never writes or edits those texts.
//
// The guest switch is the database flag read by checkout_account_settings(); the
// control session sets it at ship (D-13). This file only reads it and never sets it.
// The service-role presence comes only from lib/supabase/service-role.ts (D-14):
// this file receives a boolean and never a value.

import de from "../../i18n/messages/de.json";
import en from "../../i18n/messages/en.json";
import fr from "../../i18n/messages/fr.json";
import ar from "../../i18n/messages/ar.json";
import { asCheckout } from "../db/identity";
import { serviceRoleConfigured } from "../supabase/service-role";

/** The date the owner approved Text 1 and Text 2. Bump when either text changes. */
export const ACCOUNT_NOTICE_VERSION = "2026-09-29";

type Messages = { checkout?: Record<string, unknown> };
const LOCALES: Record<string, Messages> = { en, de, fr, ar } as never;
const NOTICE_KEYS = ["acctCreateNotice", "acctGuestNotice"] as const;

/**
 * True only when the version is set and both notice texts are non-empty in all
 * four languages. `injected` is for tests.
 */
export function accountNoticeReady(
  injected?: { version: string | null; messages: Record<string, Messages> },
): boolean {
  const version = injected ? injected.version : ACCOUNT_NOTICE_VERSION;
  if (typeof version !== "string" || version.trim() === "") return false;
  const messages = injected ? injected.messages : LOCALES;
  for (const locale of ["en", "de", "fr", "ar"]) {
    const checkout = messages[locale]?.checkout;
    for (const key of NOTICE_KEYS) {
      const text = checkout?.[key];
      if (typeof text !== "string" || text.trim() === "") return false;
    }
  }
  return true;
}

/** The database guest switch. False on any error or null. */
export async function loadGuestAccountsLive(env: CloudflareEnv): Promise<boolean> {
  try {
    const rows = await asCheckout(env, null, (sql) =>
      sql<{ live: boolean | null }[]>`select public.checkout_account_settings() as live`,
    );
    return rows[0]?.live === true;
  } catch {
    return false;
  }
}

/** Create-an-account is possible only with the approved texts and a service-role key on this Worker. */
export function accountCreateAvailable(env: CloudflareEnv): boolean {
  return accountNoticeReady() && serviceRoleConfigured(env) === true;
}

/** Guest accounts: approved texts, service role, and the database switch. */
export async function guestAccountsOn(env: CloudflareEnv): Promise<boolean> {
  if (!accountCreateAvailable(env)) return false;
  return (await loadGuestAccountsLive(env)) === true;
}

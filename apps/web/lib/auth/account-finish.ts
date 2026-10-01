// apps/web/lib/auth/account-finish.ts
//
// 27.1 (27 D-37, owner 2026-10-01). A sign-in link for a new address makes the account; after the
// confirm button the person lands on "Finish your account" (name, optional mobile, the account tick).
// This is that step's server side. The e-mail is always the session's own (getUser), never a value
// the client sent. Order: the agreement record first, then the profile; no record, nothing written.
// Logs reasons only, never the address.

import { finishAccountSchema } from "./schemas";
import { CONSENT_REQUIRED, SIGNUP_UNAVAILABLE } from "./signup-agreement";
import { fullName, type ProfileRunResult } from "./run";

export type FinishAccountDeps = {
  /** The verified signed-in user, or null. */
  getUser: () => Promise<{ id: string; email: string | null } | null>;
  /** public.account_finish_required through asSystem. */
  finishRequired: (userId: string) => Promise<boolean>;
  /** recordSignupAgreement for the session's own e-mail. true = stored. */
  record: (email: string) => Promise<boolean>;
  /** supabase.auth.updateUser({ data }). Returns an error code or null. */
  updateProfile: (data: Record<string, string>) => Promise<string | null>;
};

export const NOT_SIGNED_IN: ProfileRunResult = { ok: false, reason: "no-user" };
export const FINISH_INVALID: ProfileRunResult = { ok: false, reason: "invalid" };

/**
 * Runs the finish step. A body without the tick answers consent-required before anything is read.
 * An account that no longer has to finish answers ok and writes nothing (a second press is harmless).
 * @returns the answer for the page and a log reason (null when nothing went wrong)
 */
export async function finishAccount(
  deps: FinishAccountDeps,
  fields: Record<string, unknown>,
): Promise<{ result: ProfileRunResult; reason: string | null }> {
  if (fields.consent !== true) return { result: CONSENT_REQUIRED, reason: null };
  const parsed = finishAccountSchema.safeParse(fields);
  if (!parsed.success) return { result: FINISH_INVALID, reason: null };

  const user = await deps.getUser();
  if (!user?.email) return { result: NOT_SIGNED_IN, reason: "no-user" };

  if (!(await deps.finishRequired(user.id))) return { result: { ok: true }, reason: null };

  if (!(await deps.record(user.email))) return { result: SIGNUP_UNAVAILABLE, reason: "record-failed" };

  const { firstName, lastName, phone } = parsed.data;
  const data: Record<string, string> = {
    first_name: firstName,
    last_name: lastName,
    full_name: fullName(firstName, lastName),
  };
  if (phone) data.phone = phone;
  const code = await deps.updateProfile(data);
  // The record is stored, so the account counts as finished; a lost name is fixed on /account.
  if (code) return { result: { ok: true }, reason: code };
  return { result: { ok: true }, reason: null };
}

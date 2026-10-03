// apps/web/lib/consent/read.ts
//
// D-19 / D-20: the one reader for "latest consent choice under the current policy
// version, optionally as of a time T". Phase 29 passes the paid time as asOf.
// Goes through public.consent_choice only: anon has no table grant on consent_log
// (raw select is 42501 on live). Under fetch_types:false recorded_at is a JS Date.

import type postgres from "postgres";
import { CONSENT_POLICY_VERSION } from "./policy";

export type ConsentChoice = {
  method: string;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
  recordedAt: string;
};

type Row = {
  method: string;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
  recorded_at: Date | string;
};

/**
 * Bind the subject GUC on this transaction, then read the latest row.
 * @param tx transaction from asAnon/asCustomer
 * @param subject consent_subject UUID (already validated by the caller)
 * @param asOf only rows recorded at or before this time; null/omitted means now
 * @returns the choice, or null when the subject has no row under the current version
 */
export async function readConsentChoice(
  tx: postgres.TransactionSql,
  subject: string,
  asOf?: Date | null,
): Promise<ConsentChoice | null> {
  await tx`select set_config('request.vamos.consent_subject', ${subject}, true)`;
  const rows = (await tx`select method, functional, analytics, marketing, recorded_at
    from public.consent_choice(${CONSENT_POLICY_VERSION}, ${asOf ?? null})`) as unknown as Row[];
  const row = rows[0];
  if (!row) return null;
  return {
    method: row.method,
    functional: row.functional,
    analytics: row.analytics,
    marketing: row.marketing,
    recordedAt: new Date(row.recorded_at).toISOString(),
  };
}

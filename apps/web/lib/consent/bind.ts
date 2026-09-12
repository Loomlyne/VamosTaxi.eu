// apps/web/lib/consent/bind.ts
//
// D-03 / D-04: set_config request.vamos.consent_subject then public.record_consent
// on the same asAnon/asCustomer transaction. Subject is never an RPC argument.
// Accept → accept_all, Dismiss → reject_all, /cookies → settings_change.

import type postgres from "postgres";
import { CONSENT_POLICY_VERSION } from "./policy";

export type ConsentMethod = "accept_all" | "reject_all" | "settings_change";
export type ConsentLocale = "en" | "de" | "fr" | "ar";

export const CONSENT_METHOD = {
  accept: "accept_all",
  dismiss: "reject_all",
  settings: "settings_change",
} as const;

const CATEGORIES = {
  necessary: true,
  functional: false,
  analytics: false,
  marketing: false,
} as const;

export type RecordConsentInput = {
  subject: string;
  method: ConsentMethod;
  locale: ConsentLocale;
  policyVersion?: string;
  userAgent?: string | null;
  ipTruncated?: string | null;
  bookingId?: string | null;
};

/**
 * Bind the Worker-minted subject GUC, then call record_consent.
 * Does not open Hyperdrive — caller already has tx from asAnon/asCustomer.
 */
export async function recordConsent(
  tx: postgres.TransactionSql,
  input: RecordConsentInput,
): Promise<void> {
  await tx`select set_config('request.vamos.consent_subject', ${input.subject}, true)`;
  const policyVersion = input.policyVersion ?? CONSENT_POLICY_VERSION;
  await tx`select public.record_consent(
    ${CATEGORIES.necessary},
    ${CATEGORIES.functional},
    ${CATEGORIES.analytics},
    ${CATEGORIES.marketing},
    ${input.method},
    ${input.locale},
    ${policyVersion},
    ${input.bookingId ?? null},
    ${input.userAgent ?? null},
    ${input.ipTruncated ?? null}
  )`;
}

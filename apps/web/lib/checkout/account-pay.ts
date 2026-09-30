// apps/web/lib/checkout/account-pay.ts
//
// 26.5 plan 06: the pure halves of PAY's account handling, so the body that goes to
// /api/checkout/intent and the mapping of the server's answers are unit-tested outside
// the component. Client-safe: must not import account-notice.ts or anything under
// lib/supabase (D-14).

import type { AccountChoiceValue } from "@/components/checkout/AccountChoice";

/** The `account` block plan 04's intent schema accepts (strict). */
export type IntentAccountBlock = {
  choice: "guest" | "create";
  consent: boolean;
  turnstile_token?: string;
  idempotency_key?: string;
  return_to?: string;
};

export type AccountIntentInput = {
  signedIn: boolean;
  choice: AccountChoiceValue;
  guestAccountsOn: boolean;
  createAvailable: boolean;
  createConsent: boolean;
  turnstileToken?: string;
  idempotencyKey?: string;
  /** Path (or a full URL, reduced to its path) of this checkout, so trip, class and extras survive (D-07). */
  returnTo?: string;
};

/** Only pathname + search survive: the server validates too, this never lets a foreign origin ride (T-26.5-29). */
export function returnToPath(input: string | undefined): string | undefined {
  if (!input) return undefined;
  try {
    const url = new URL(input, "https://checkout.invalid");
    // A foreign origin or "//host/x" is reduced to its path; only pathname + search survive.
    return `${url.pathname}${url.search}`;
  } catch {
    return undefined;
  }
}

/**
 * The account block for the intent body, or undefined when today's flow applies:
 * signed in (D-01), Sign in chosen (the sign-in happens before PAY), guest with the
 * switch off (D-09), create when the server cannot create.
 */
export function accountIntentBlock(input: AccountIntentInput): IntentAccountBlock | undefined {
  if (input.signedIn) return undefined;
  let choice: "guest" | "create";
  let consent: boolean;
  if (input.choice === "guest") {
    if (!input.guestAccountsOn) return undefined;
    choice = "guest";
    consent = false; // informed, not consent (D-13)
  } else if (input.choice === "create") {
    if (!input.createAvailable) return undefined;
    choice = "create";
    consent = input.createConsent;
  } else {
    return undefined;
  }
  const block: IntentAccountBlock = { choice, consent };
  if (input.turnstileToken) block.turnstile_token = input.turnstileToken;
  if (input.idempotencyKey) block.idempotency_key = input.idempotencyKey;
  const returnTo = returnToPath(input.returnTo);
  if (returnTo) block.return_to = returnTo;
  return block;
}

/** What the form does with a server answer. Message keys live in the `checkout` namespace. */
export type AccountCodeEffect = {
  stage?: "sent";
  createConsentError?: "acctCreateConsentError";
  payError?: "payStartFailed" | "payRateLimited" | "payLimit";
  resetTurnstile?: boolean;
  hideCreate?: boolean;
  choice?: "guest";
};

/** Server code -> effect; null means the existing handling applies. */
export function mapAccountCode(code: string | undefined | null): AccountCodeEffect | null {
  switch (code) {
    case "sign_in_first":
      // Neutral: the same sent stage as the Sign in option (D-04).
      return { stage: "sent" };
    case "account_consent_required":
      return { createConsentError: "acctCreateConsentError" };
    case "account_check_failed":
      return { payError: "payStartFailed", resetTurnstile: true };
    case "account_create_unavailable":
      return { payError: "payStartFailed", hideCreate: true, choice: "guest" };
    case "rate_limited":
      // D-20 (b): 8 presses a minute per connection.
      return { payError: "payRateLimited" };
    case "pay_limit":
      // D-20 (a): 5 presses per price.
      return { payError: "payLimit" };
    default:
      return null;
  }
}

// apps/web/lib/auth/checkout-sign-in.ts
//
// Sign-in link sent from the checkout ("This e-mail already has an account").
//
// The checkout path NEVER creates an account (createUser: false, checker rec. 1):
// a guest who types an unknown address gets exactly the same answer as a customer.
// Enumeration is closed three ways: Supabase's "otp_disabled" for an unknown
// address is swallowed, the body is always { stage: "sent" }, and the answer is
// held until a fixed floor (plus jitter) has passed since the request started.
//
// Why a floor and not waitUntil: the PKCE verifier cookie set by signInWithOtp
// must ride on this response, so the send cannot be moved off the request
// (26.5-RESEARCH §2). The floor hides the difference between a send and a no-send.

import { emailNext, runOtp, SENT, type AuthClient } from "./run";

/** The answer never arrives sooner than this after the request started. */
export const CHECKOUT_SEND_FLOOR_MS = 1200;
const JITTER_MAX_MS = 150;

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const defaultJitter = (): number => Math.floor(Math.random() * (JITTER_MAX_MS + 1));

export type CheckoutSendInput = {
  email: string;
  locale: string;
  origin: string;
  returnTo: unknown;
  home: string;
  /** Date.now() captured at the very top of the request. */
  startedAt: number;
  sleep?: (ms: number) => Promise<void>;
  jitter?: () => number;
  now?: () => number;
};

/** Waits until startedAt + floor + jitter. Never sleeps a negative time. */
export async function holdCheckoutFloor(
  input: Pick<CheckoutSendInput, "startedAt" | "sleep" | "jitter" | "now">,
): Promise<void> {
  const now = input.now ?? Date.now;
  const wait = input.startedAt + CHECKOUT_SEND_FLOOR_MS + (input.jitter ?? defaultJitter)() - now();
  if (wait > 0) await (input.sleep ?? defaultSleep)(wait);
}

/**
 * Sends a sign-in link to an existing customer without creating anyone.
 * `reason` is null for a sent link AND for an unknown address; it is only set
 * for a real send failure, and is for the caller's own log (no e-mail in it).
 */
export async function sendCheckoutSignInLink(
  supabase: AuthClient,
  input: CheckoutSendInput,
): Promise<{ result: typeof SENT; reason: string | null }> {
  let reason: string | null;
  try {
    const out = await runOtp(
      supabase,
      { mode: "signin", email: input.email, locale: input.locale, createUser: false },
      input.origin,
      emailNext(input.returnTo, input.home),
    );
    reason = out.reason;
  } catch {
    reason = "send-failed";
  }
  if (reason === "otp_disabled") reason = null;
  await holdCheckoutFloor(input);
  return { result: SENT, reason };
}

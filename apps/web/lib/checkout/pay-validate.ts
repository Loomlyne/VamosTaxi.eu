// apps/web/lib/checkout/pay-validate.ts
//
// D-17 / D-23: PAY validates in the order the page reads: class, first name, last name,
// e-mail, mobile, flight (airport pickups), company name (only when the company
// disclosure is open and any company field is filled). The first failure wins; the
// caller scrolls to it, focuses it and announces the message. Pure: no DOM, no i18n.

import { isCheckoutEmail } from "./contact-validate";
import { normaliseFlight } from "./trip-url";

export type PayField = "class" | "firstName" | "lastName" | "email" | "mobile" | "flight" | "companyName";

/** Keys of the `checkout` message namespace (all exist since plan 15). */
export type PayErrorKey =
  | "chooseClass"
  | "enter-a-first-name"
  | "enter-a-last-name"
  | "enter-an-email-address"
  | "errEmailCheck"
  | "enter-a-mobile-number"
  | "errMobileCheck"
  | "errFlight"
  | "errFlightCheck"
  | "errCompanyName";

export type PayFormState = {
  classChosen: boolean;
  firstName: string;
  lastName: string;
  email: string;
  /** E.164 as PhoneField keeps it (`+41796267082`), or "". */
  mobile: string;
  airport: boolean;
  flight: string;
  companyOpen: boolean;
  companyName: string;
  companyAddress: string;
  companyVat: string;
};

export type PayError = { field: PayField; messageKey: PayErrorKey };

/** E.164 has 8..15 digits after the plus; anything shorter cannot be dialled. */
export function isMobileNumber(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

export function firstPayError(state: PayFormState): PayError | null {
  if (!state.classChosen) return { field: "class", messageKey: "chooseClass" };
  if (!state.firstName.trim()) return { field: "firstName", messageKey: "enter-a-first-name" };
  if (!state.lastName.trim()) return { field: "lastName", messageKey: "enter-a-last-name" };
  const email = state.email.trim();
  if (!email) return { field: "email", messageKey: "enter-an-email-address" };
  if (!isCheckoutEmail(email)) return { field: "email", messageKey: "errEmailCheck" };
  const mobile = state.mobile.trim();
  if (!mobile) return { field: "mobile", messageKey: "enter-a-mobile-number" };
  if (!isMobileNumber(mobile)) return { field: "mobile", messageKey: "errMobileCheck" };
  const flight = state.flight.trim();
  if (state.airport && !flight) return { field: "flight", messageKey: "errFlight" };
  // D-09: a filled flight is format-checked whether or not the pickup is an airport.
  if (flight && !normaliseFlight(flight)) return { field: "flight", messageKey: "errFlightCheck" };
  const anyCompany = [state.companyName, state.companyAddress, state.companyVat].some((v) => v.trim() !== "");
  if (state.companyOpen && anyCompany && !state.companyName.trim()) {
    return { field: "companyName", messageKey: "errCompanyName" };
  }
  return null;
}

// ── 26.5 section-2 account rules (plan 06) ─────────────────────────────────────────────
// Kept apart from PayField / PayErrorKey / firstPayError so the existing contact rules and
// their callers keep their types; the form calls firstSectionError instead of firstPayError
// once the panel is wired. Order: class, then the account choice, then the contact rules.

export type AccountPayField = "account" | "accountSent" | "accountConsent";
export type AccountPayErrorKey = "acctPayBlockSignIn" | "acctPayBlockSent" | "acctCreateConsentError";
export type AccountPayError = { field: AccountPayField; messageKey: AccountPayErrorKey };

/** D-01/D-12/D-13: what section 2 knows about the account choice. */
export type PayAccountState = {
  signedIn: boolean;
  choice: "guest" | "signin" | "create";
  stage: "form" | "sent";
  /** The Text 1 tick. Only "create" reads it; guest never has a consent rule (D-13). */
  createConsent: boolean;
};

export type SectionFormState = PayFormState & { account?: PayAccountState };

/**
 * The account rule alone. The button is never disabled (D-12): an unfinished choice is
 * named here and the caller scrolls, focuses and announces it. Signed in or absent: null.
 */
export function firstAccountError(account: PayAccountState | undefined): AccountPayError | null {
  if (!account || account.signedIn) return null;
  if (account.choice === "signin") {
    return account.stage === "sent"
      ? { field: "accountSent", messageKey: "acctPayBlockSent" }
      : { field: "account", messageKey: "acctPayBlockSignIn" };
  }
  if (account.choice === "create" && !account.createConsent) {
    return { field: "accountConsent", messageKey: "acctCreateConsentError" };
  }
  return null;
}

/** class, then account (26.5), then the contact rules of firstPayError. */
export function firstSectionError(state: SectionFormState): PayError | AccountPayError | null {
  if (!state.classChosen) return { field: "class", messageKey: "chooseClass" };
  return firstAccountError(state.account) ?? firstPayError(state);
}

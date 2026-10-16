"use client";

import { createContext, useContext, type ReactNode } from "react";

export type CheckoutSettings = {
  locale: string;
  freeCancelHours: number | null;
  /** Hours shown on checkout for the price hold; display only, the server clocks decide. */
  priceHoldMinutes: number | null;
  turnstileSiteKey: string | undefined;
  /**
   * J8 (W3-08): the Stripe page offers TWINT only while `STRIPE_CHECKOUT_TWINT` is "on" (server flag,
   * `checkoutPaymentMethodTypes`). The method note names TWINT only then.
   */
  twintOn: boolean;
  /** 26.5: server-decided booleans only (D-14). */
  guestAccountsOn: boolean;
  accountCreateAvailable: boolean;
};

const CheckoutSettingsContext = createContext<CheckoutSettings | null>(null);

export function CheckoutSettingsProvider({
  value,
  children,
}: {
  value: CheckoutSettings;
  children: ReactNode;
}) {
  return <CheckoutSettingsContext.Provider value={value}>{children}</CheckoutSettingsContext.Provider>;
}

export function useCheckoutSettings(): CheckoutSettings {
  const value = useContext(CheckoutSettingsContext);
  if (!value) {
    throw new Error("useCheckoutSettings requires CheckoutSettingsProvider");
  }
  return value;
}

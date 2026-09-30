"use client";

import { createContext, useContext, type ReactNode } from "react";

export type CheckoutSettings = {
  locale: string;
  freeCancelHours: number | null;
  checkoutWindowMinutes: number | null;
  turnstileSiteKey: string | undefined;
  publishableKey: string;
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

"use client";

import type { ReactNode } from "react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { LenisProvider } from "@/lib/lenis-provider";
import { LocaleShimBootstrap } from "@/lib/locale-shim";

/**
 * The single client-boundary seam every later provider mounts into. Plan 12 (D-16,
 * ADR-001 point 5) adds `LocaleShimBootstrap` here — it keeps the `VamosLocale`
 * compatibility shim's module-scoped router/pathname/locale refs current, so no page
 * has to wire it and no later phase has to remember to. The client-only currency store
 * (`apps/web/lib/currency-store.ts`) needs no provider of its own: it lazily hydrates
 * from `localStorage` the first time any component calls `useCurrency()`.
 */
export function Providers({
  locale,
  messages,
  children,
}: {
  locale: string;
  messages: AbstractIntlMessages;
  children: ReactNode;
}) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LocaleShimBootstrap />
      <LenisProvider>{children}</LenisProvider>
    </NextIntlClientProvider>
  );
}

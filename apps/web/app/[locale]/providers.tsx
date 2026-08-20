"use client";

import type { ReactNode } from "react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";

/**
 * The single client-boundary seam every later provider mounts into — Lenis
 * (Plan 11) and the client-only currency store (Plan 13, D-16) both add
 * their own provider here, wrapped around `children`, without touching
 * `layout.tsx` again.
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
      {children}
    </NextIntlClientProvider>
  );
}

import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { Providers } from "./providers";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "Vamos Taxi",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Pitfall 2 (01-RESEARCH.md): setRequestLocale must be the first
  // statement in this layout — calling it after an early return, or not at
  // all, silently forces the whole route to dynamic rendering and defeats
  // generateStaticParams/edge caching (the Phase 10 10k-visitor target
  // depends on public pages being static/ISR).
  setRequestLocale(locale);

  // T-01-02 (Tampering): reject any segment outside the fixed four-locale
  // list before it reaches a page. The `[locale]` dynamic segment matches
  // any string, so this is the boundary that turns an arbitrary URL
  // segment into a 404 rather than an attempt to render with it.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = await getMessages();
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir}>
      <body>
        <Providers locale={locale} messages={messages}>
          {children}
        </Providers>
      </body>
    </html>
  );
}

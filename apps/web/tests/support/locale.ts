// apps/web/tests/support/locale.ts
//
// D-47 helper: open an unprefixed Next page the way a returning customer does, having
// chosen a language on home. `VamosLocale.setLang` (app/vamos-locale.js) mirrors the
// choice into the NEXT_LOCALE cookie (Path=/, SameSite=Lax, 1 year); this sets the same
// cookie on the context, then opens the unprefixed path. Never a /de/... URL.

import type { Page, Response } from "@playwright/test";

export type Lang = "en" | "de" | "fr" | "ar";

export async function setChosenLanguage(page: Page, baseURL: string, value: string): Promise<void> {
  await page.context().addCookies([
    { name: "NEXT_LOCALE", value, url: baseURL, sameSite: "Lax", httpOnly: false, secure: false },
  ]);
}

export async function openInLocale(
  page: Page,
  baseURL: string,
  path: string,
  lang: Lang | string,
): Promise<Response | null> {
  await setChosenLanguage(page, baseURL, lang);
  return page.goto(`${baseURL}${path}`);
}

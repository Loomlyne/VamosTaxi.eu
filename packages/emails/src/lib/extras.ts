// packages/emails/src/lib/extras.ts
//
// Extra names come from data (the booking's snapshot lines), never from a
// closed list of codes (D-35, D-44).

import type { EmailExtraLine, EmailLocale } from "./types";

export function extraName(locale: EmailLocale, line: EmailExtraLine): string {
  return line.names?.[locale] || line.names?.en || line.name;
}

export function extraNames(locale: EmailLocale, extras: EmailExtraLine[] | undefined): string[] {
  return (extras ?? []).map((line) => extraName(locale, line));
}

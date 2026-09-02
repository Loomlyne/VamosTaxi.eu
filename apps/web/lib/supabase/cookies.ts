export type CookiePair = { name: string; value: string };

export function cookieListFromHeader(header: string | null | undefined): CookiePair[] {
  if (!header) return [];
  const out: CookiePair[] = [];
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    if (!name) continue;
    out.push({ name, value: part.slice(idx + 1).trim() });
  }
  return out;
}

export function authCookiesFrom(store: CookiePair[], header: string | null | undefined): CookiePair[] {
  const fromHeader = cookieListFromHeader(header);
  return fromHeader.length > 0 ? fromHeader : store;
}

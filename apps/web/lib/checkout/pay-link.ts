// apps/web/lib/checkout/pay-link.ts
//
// D-34…D-38 helpers. No identity, no db, no Stripe.

export function payLinkPath(locale: string, rawToken: string): string {
  const prefix = !locale || locale === "en" ? "" : `/${locale}`;
  return `${prefix}/checkout/pay/${encodeURIComponent(rawToken)}`;
}

/** D-37: first send wins the 24h clock. */
export function payLinkSentAt(existing: string | null | undefined, nowIso: string): string {
  return existing || nowIso;
}

export function confirmationRecipients(passenger: string, payer: string | null | undefined): string[] {
  const a = passenger.trim().toLowerCase();
  const out = a ? [a] : [];
  const b = (payer ?? "").trim().toLowerCase();
  if (b && b !== a) out.push(b);
  return out;
}

export function companyReady(input: {
  kind: "individual" | "company";
  name: string;
  address: string;
  vat: string;
}): boolean {
  if (input.kind === "individual") return true;
  return Boolean(input.name.trim() && input.address.trim() && input.vat.trim());
}

export const CHECKOUT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

export function isCheckoutEmail(value: string): boolean {
  return CHECKOUT_EMAIL_RE.test(value.trim());
}

export function e164Phone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? `+${digits}` : "";
}

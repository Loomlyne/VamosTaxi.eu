import { escapeHtml } from "./escape";
import { layoutHtml, layoutText } from "./layout";
import { t, type EmailLocale } from "./messages";

export type AuthEmailType = "signup" | "recovery" | "otp";
export type AuthEmailData = { code: string; link: string; name: string };

const KEYS: Record<AuthEmailType, { subject: string; body: string }> = {
  signup: { subject: "email-signup-subject", body: "email-signup-body" },
  recovery: { subject: "email-recovery-subject", body: "email-recovery-body" },
  otp: { subject: "email-otp-subject", body: "email-otp-body" },
};

export function renderAuthEmail(
  type: AuthEmailType,
  locale: EmailLocale,
  data: AuthEmailData,
): { subject: string; html: string; text: string } {
  // auth.email signup
  // auth.email recovery
  // auth.email otp
  const keys = KEYS[type];
  const params = {
    name: escapeHtml(data.name),
    link: escapeHtml(data.link),
    code: escapeHtml(data.code),
  };
  const subject = t(locale, "auth", keys.subject, params);
  const body = t(locale, "auth", keys.body, params);
  const codeLtr = `<span dir="ltr">${escapeHtml(data.code)}</span>`;
  const inner = `<p>${body.replace(escapeHtml(data.code), codeLtr)}</p><p><a href="${escapeHtml(data.link)}">${escapeHtml(data.link)}</a></p>`;
  return {
    subject,
    html: layoutHtml(locale, inner),
    text: layoutText(body),
  };
}

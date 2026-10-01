import { escapeHtml } from "./escape";
import { codeBlock, ctaButton, layoutHtml, layoutText } from "./layout";
import { t, type EmailLocale } from "./messages";

export type AuthEmailType = "signup" | "recovery" | "otp" | "email_change" | "email_change_current" | "invite" | "reauthentication" | "account_ready" | "account_signin";
export type AuthEmailData = { code: string; link: string; name: string };

const KEYS: Record<AuthEmailType, { subject: string; heading: string; body: string; cta: string }> = {
  signup: {
    subject: "email-signup-subject",
    heading: "email-signup-heading",
    body: "email-signup-lead",
    cta: "email-signup-cta",
  },
  invite: {
    subject: "email-invite-subject",
    heading: "email-invite-heading",
    body: "email-invite-lead",
    cta: "email-invite-cta",
  },
  recovery: {
    subject: "email-recovery-subject",
    heading: "email-recovery-heading",
    body: "email-recovery-lead",
    cta: "email-recovery-cta",
  },
  otp: {
    subject: "email-otp-subject",
    heading: "email-otp-heading",
    body: "email-otp-lead",
    cta: "email-otp-cta",
  },
  email_change: {
    subject: "email-change-subject",
    heading: "email-change-heading",
    body: "email-change-lead",
    cta: "email-change-cta",
  },
  email_change_current: {
    subject: "email-change-current-subject",
    heading: "email-change-current-heading",
    body: "email-change-current-lead",
    cta: "email-change-current-cta",
  },
  account_ready: {
    subject: "email-account-ready-subject",
    heading: "email-account-ready-heading",
    body: "email-account-ready-lead",
    cta: "email-account-ready-cta",
  },
  account_signin: {
    subject: "email-account-signin-subject",
    heading: "email-account-signin-heading",
    body: "email-account-signin-lead",
    cta: "email-account-signin-cta",
  },
  reauthentication: {
    subject: "email-reauth-subject",
    heading: "email-reauth-heading",
    body: "email-reauth-lead",
    cta: "email-reauth-cta",
  },
};

export function renderAuthEmail(
  type: AuthEmailType,
  locale: EmailLocale,
  data: AuthEmailData,
): { subject: string; html: string; text: string } {
  const keys = KEYS[type];
  const name = escapeHtml(data.name.trim());
  const link = escapeHtml(data.link);
  const code = escapeHtml(data.code);
  const params = { name, link, code };
  const subject = t(locale, "auth", keys.subject, params);
  const heading = t(locale, "auth", keys.heading, params);
  const lead = t(locale, "auth", keys.body, params);
  const cta = t(locale, "auth", keys.cta, params);
  const hello = name ? `<p style="margin:0 0 16px 0;">${t(locale, "auth", "email-hello", { name })}</p>` : "";
  const inner = `${hello}<p style="margin:0 0 8px 0;font-size:22px;line-height:28px;font-weight:700;">${heading}</p><p style="margin:0;">${lead}</p>${ctaButton(link, cta)}${code ? codeBlock(code, locale) : ""}`;
  const textLead = name ? `${t(locale, "auth", "email-hello", { name: data.name.trim() })}\n\n` : "";
  return {
    subject,
    html: layoutHtml(locale, inner),
    text: layoutText(`${textLead}${heading}\n\n${t(locale, "auth", keys.body, { name: data.name.trim(), link: data.link, code: data.code })}\n\n${cta}: ${data.link}\n${data.code}`, { locale }),
  };
}

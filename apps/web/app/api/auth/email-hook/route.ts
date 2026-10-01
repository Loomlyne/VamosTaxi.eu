// Unauthenticated internet endpoint until Webhook#verify succeeds.
// Never return or log token, token_hash, action link, or recipient address.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Webhook } from "standardwebhooks";
import { z } from "zod";
import { Resend } from "resend";
import { renderAuthEmail, type AuthEmailType } from "@vamos/emails";
import { AUTH_LOCALE_METADATA_KEY } from "@/lib/supabase/constants";
import { routing } from "@/i18n/routing";
import { buildConfirmLink, siteFromRedirect } from "@/lib/auth/confirm-link";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

const FROM_EMAIL = "noreply@vamostaxi.site";
const FROM_NAME = "Vamos Taxi";

const Body = z.object({
  user: z.object({
    email: z.string().email(),
    new_email: z.string().email().optional(),
    user_metadata: z.record(z.string(), z.unknown()).optional(),
  }),
  email_data: z.object({
    token: z.string(),
    token_hash: z.string(),
    redirect_to: z.string(),
    site_url: z.string(),
    email_action_type: z.enum([
      "signup",
      "recovery",
      "magiclink",
      "email_change",
      "email_otp",
      "invite",
      "reauthentication",
    ]),
  }),
});

function mapType(action: string): AuthEmailType | null {
  if (action === "signup") return "signup";
  if (action === "invite") return "invite";
  if (action === "recovery") return "recovery";
  if (action === "magiclink" || action === "email_otp") return "otp";
  if (action === "email_change") return "email_change";
  if (action === "reauthentication") return "reauthentication";
  return null;
}

function verifyLink(supabaseUrl: string, emailData: {
  site_url: string;
  token_hash: string;
  email_action_type: string;
  redirect_to: string;
}): string {
  const raw = (supabaseUrl || emailData.site_url).replace(/\/$/, "");
  const origin = raw.replace(/\/auth\/v1$/i, "");
  const redirect = encodeURIComponent(emailData.redirect_to);
  return `${origin}/auth/v1/verify?token=${emailData.token_hash}&type=${emailData.email_action_type}&redirect_to=${redirect}`;
}

/** Link types that start a session. The staff invite stays confirm-only (owner decision, F12 section 6). */
const CONFIRM_TYPES: readonly string[] = Object.freeze(["signup", "magiclink", "email_otp", "recovery", "email_change"]);

/**
 * F12: the mailed link is the site's confirm page with the recipient sealed in `e`. The token is only
 * spent when the person presses the button there, so mail scanners and look-alike links do nothing.
 */
async function mailedLink(
  env: CloudflareEnv,
  secret: string,
  parsed: { user: { email: string }; email_data: { token_hash: string; email_action_type: string; redirect_to: string; site_url: string } },
): Promise<string | null> {
  const data = parsed.email_data;
  if (!CONFIRM_TYPES.includes(data.email_action_type)) return verifyLink(env.SUPABASE_URL, data);
  const site = siteFromRedirect(data.redirect_to);
  return buildConfirmLink({
    origin: site.origin,
    tokenHash: data.token_hash,
    type: data.email_action_type === "email_otp" ? "email" : data.email_action_type,
    email: parsed.user.email,
    secret,
    next: site.next,
    nextb: site.nextb,
  });
}

function hookVerifySecret(raw: string): string {
  return raw.startsWith("v1,whsec_") ? raw.slice("v1,whsec_".length) : raw.replace(/^v1,/, "");
}

async function sendBranded(
  env: CloudflareEnv,
  to: string,
  rendered: { subject: string; html: string; text: string },
): Promise<void> {
  if (env.EMAIL?.send) {
    await env.EMAIL.send({
      to,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    return;
  }
  const key = env.RESEND_API_KEY;
  if (!key) throw new Error("no-sender");
  const { error } = await new Resend(key).emails.send({
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
  if (error) throw error;
}

const HOOK_HEADERS = {
  "cache-control": "private, no-store",
  "content-type": "application/json",
} as const;

/**
 * Supabase Auth rejects a hook answer without `Content-Type: application/json`
 * and then rolls back the sign-up or token it just mailed, so the link in the
 * e-mail is dead. Success is `{}`; failures use the hook error shape.
 */
function empty(status: number): Response {
  const body = status === 200 ? {} : { error: { http_code: status, message: "email-hook" } };
  return new Response(JSON.stringify(body), { status, headers: HOOK_HEADERS });
}

export async function POST(request: Request) {
  let env: CloudflareEnv;
  try {
    env = getCloudflareContext().env;
  } catch {
    return empty(500);
  }
  const secret = env.SEND_EMAIL_HOOK_SECRET ?? process.env.SEND_EMAIL_HOOK_SECRET;
  const ctx = { requestId: crypto.randomUUID(), route: "/api/auth/email-hook", locale: null as string | null };

  if (!secret) {
    log("error", "email-hook", ctx, { reason: "missing-secret" });
    return empty(500);
  }

  const payload = await request.text();
  const headers: Record<string, string> = {
    "webhook-id": request.headers.get("webhook-id") ?? "",
    "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
    "webhook-signature": request.headers.get("webhook-signature") ?? "",
  };

  try {
    new Webhook(hookVerifySecret(secret)).verify(payload, headers);
  } catch {
    return empty(401);
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(JSON.parse(payload));
  } catch {
    return empty(400);
  }

  const rawLocale = parsed.user.user_metadata?.[AUTH_LOCALE_METADATA_KEY];
  const locale = routing.locales.includes(rawLocale as (typeof routing.locales)[number])
    ? (rawLocale as (typeof routing.locales)[number])
    : "en";
  if (locale === "en" && rawLocale !== "en") {
    log("info", "email-hook", { ...ctx, locale }, { fallback: "en" });
  }

  const kind = mapType(parsed.email_data.email_action_type);
  if (!kind) {
    log("info", "email-hook", { ...ctx, locale }, { skipped: parsed.email_data.email_action_type });
    return empty(200);
  }

  const origin = parsed.user.user_metadata?.vamos_account_origin;
  const finalKind =
    kind === "signup" && typeof origin === "string" && origin.startsWith("checkout") ? "account_signin" : kind;

  const link = await mailedLink(env, secret, parsed);
  if (!link) {
    log("error", "email-hook", { ...ctx, locale }, { reason: "seal-failed" });
    return empty(500);
  }
  const name =
    typeof parsed.user.user_metadata?.full_name === "string"
      ? parsed.user.user_metadata.full_name
      : "";
  const rendered = renderAuthEmail(finalKind, locale, {
    code: parsed.email_data.token,
    link,
    name,
  });

  try {
    await sendBranded(env, parsed.user.email, rendered);
  } catch {
    return empty(502);
  }

  return empty(200);
}

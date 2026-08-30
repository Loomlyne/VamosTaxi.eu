// Unauthenticated internet endpoint until Webhook#verify succeeds.
// Never return or log token, token_hash, action link, or recipient address.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Webhook } from "standardwebhooks";
import { z } from "zod";
import { Resend } from "resend";
import { renderAuthEmail, type AuthEmailType } from "@vamos/emails";
import { AUTH_LOCALE_METADATA_KEY } from "@/lib/supabase/constants";
import { routing } from "@/i18n/routing";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

const Body = z.object({
  user: z.object({
    email: z.string().email(),
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
    ]),
  }),
});

function mapType(action: string): AuthEmailType | null {
  if (action === "signup") return "signup";
  if (action === "recovery") return "recovery";
  if (action === "magiclink" || action === "email_otp") return "otp";
  return null;
}

export async function POST(request: Request) {
  const { env } = getCloudflareContext();
  const secret = env.SEND_EMAIL_HOOK_SECRET ?? process.env.SEND_EMAIL_HOOK_SECRET;
  const ctx = { requestId: crypto.randomUUID(), route: "/api/auth/email-hook", locale: null as string | null };

  if (!secret) {
    log("error", "email-hook", ctx, { reason: "missing-secret" });
    return new Response(null, { status: 500 });
  }

  const payload = await request.text();
  const headers: Record<string, string> = {
    "webhook-id": request.headers.get("webhook-id") ?? "",
    "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
    "webhook-signature": request.headers.get("webhook-signature") ?? "",
  };

  try {
    new Webhook(secret).verify(payload, headers);
  } catch {
    return new Response(null, { status: 401 });
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(JSON.parse(payload));
  } catch {
    return new Response(null, { status: 400 });
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
    return new Response(null, { status: 200 });
  }

  const site = parsed.email_data.site_url.replace(/\/$/, "");
  const link = `${site}/auth/v1/verify?token=${parsed.email_data.token_hash}&type=${parsed.email_data.email_action_type}&redirect_to=${encodeURIComponent(parsed.email_data.redirect_to)}`;
  const name =
    typeof parsed.user.user_metadata?.full_name === "string"
      ? parsed.user.user_metadata.full_name
      : "";
  const rendered = renderAuthEmail(kind, locale, {
    code: parsed.email_data.token,
    link,
    name,
  });

  const key = env.RESEND_API_KEY;
  if (key) {
    try {
      await new Resend(key).emails.send({
        from: "Vamos Taxi <noreply@vamostaxi.eu>",
        to: parsed.user.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
    } catch {
      return new Response(null, { status: 502 });
    }
  } else {
    log("info", "email-hook", { ...ctx, locale }, { subject: rendered.subject, body: "[redacted]" });
  }

  return new Response(null, { status: 200 });
}

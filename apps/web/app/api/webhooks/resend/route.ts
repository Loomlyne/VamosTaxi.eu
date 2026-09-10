// apps/web/app/api/webhooks/resend/route.ts
//
// Public Resend webhook. email.received only — unmatched To is dropped.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Webhook } from "standardwebhooks";
import { ingestInboundEmail, readInboundPayload } from "@/lib/ops/ticket-inbound";

export const dynamic = "force-dynamic";

function verifyResend(secret: string, body: string, request: Request): boolean {
  try {
    new Webhook(secret).verify(body, {
      "webhook-id": request.headers.get("svix-id") ?? "",
      "webhook-timestamp": request.headers.get("svix-timestamp") ?? "",
      "webhook-signature": request.headers.get("svix-signature") ?? "",
    });
    return true;
  } catch {
    return false;
  }
}

async function receivedBody(
  apiKey: string | undefined,
  payload: { emailId: string; text?: string; html?: string; subject?: string },
): Promise<{ text?: string; html?: string; subject?: string }> {
  if (payload.text || payload.html) {
    return { text: payload.text, html: payload.html, subject: payload.subject };
  }
  if (!apiKey) return payload;
  try {
    const response = await fetch(`https://api.resend.com/emails/receiving/${payload.emailId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) return payload;
    const json = (await response.json()) as { text?: string; html?: string; subject?: string };
    return {
      text: typeof json.text === "string" ? json.text : payload.text,
      html: typeof json.html === "string" ? json.html : payload.html,
      subject: typeof json.subject === "string" ? json.subject : payload.subject,
    };
  } catch {
    return payload;
  }
}

export async function POST(request: Request) {
  const { env } = getCloudflareContext();
  const secret = env.RESEND_WEBHOOK_SECRET;
  if (!secret) return new Response("unavailable", { status: 503 });
  const body = await request.text();
  if (!verifyResend(secret, body, request)) return new Response("invalid", { status: 400 });

  let event: { type?: string; data?: unknown };
  try {
    event = JSON.parse(body) as { type?: string; data?: unknown };
  } catch {
    return new Response("invalid", { status: 400 });
  }
  if (event.type !== "email.received") return new Response("ok", { status: 200 });

  const parsed = readInboundPayload(event.data);
  if (!parsed) return new Response("ok", { status: 200 });
  const filled = await receivedBody(env.RESEND_API_KEY, parsed);
  const result = await ingestInboundEmail(env, { ...parsed, ...filled });
  if (result === "unavailable") return new Response("unavailable", { status: 503 });
  return new Response("ok", { status: 200 });
}

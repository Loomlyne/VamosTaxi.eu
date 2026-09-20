// apps/web/app/api/webhooks/resend/route.ts
//
// Public Resend webhook. email.received only — unmatched To is dropped.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Webhook } from "standardwebhooks";
import { ingestInboundEmail, readInboundPayload } from "@/lib/ops/ticket-inbound";
import type { InboundPayload } from "@/lib/ops/ticket-mail";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" } as const;

function hookText(body: string, status: number): Response {
  return new Response(body, { status, headers: NO_STORE });
}

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

function asRecord(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

function mapAttachments(raw: unknown): unknown[] {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(asRecord(raw).data)
      ? (asRecord(raw).data as unknown[])
      : [];
  const out: unknown[] = [];
  for (const item of list) {
    const rec = asRecord(item);
    if (Object.keys(rec).length === 0) continue;
    out.push({
      id: rec.id,
      filename: rec.filename,
      content_type: rec.content_type ?? rec.contentType,
      contentType: rec.content_type ?? rec.contentType,
      content_disposition: rec.content_disposition ?? rec.contentDisposition,
      contentDisposition: rec.content_disposition ?? rec.contentDisposition,
      content_id: rec.content_id ?? rec.contentId,
      download_url: rec.download_url ?? rec.downloadUrl,
      size: rec.size ?? rec.byte_size,
    });
  }
  return out;
}

async function hydrateReceiving(
  apiKey: string,
  parsed: InboundPayload,
  data: unknown,
): Promise<InboundPayload> {
  const headers = { Authorization: `Bearer ${apiKey}` };
  let merged: Record<string, unknown> = { ...asRecord(data), email_id: parsed.emailId };
  try {
    const response = await fetch(`https://api.resend.com/emails/receiving/${parsed.emailId}`, {
      headers,
    });
    if (response.ok) {
      const json: unknown = await response.json();
      merged = { ...merged, ...asRecord(json), email_id: parsed.emailId };
    }
  } catch {
    /* keep webhook metadata */
  }
  const payload = readInboundPayload(merged) ?? parsed;
  try {
    const response = await fetch(
      `https://api.resend.com/emails/receiving/${parsed.emailId}/attachments`,
      { headers },
    );
    if (response.ok) {
      payload.attachments = mapAttachments(await response.json());
    }
  } catch {
    /* ingest text without files */
  }
  return payload;
}

export async function POST(request: Request) {
  const { env } = getCloudflareContext();
  const secret = env.RESEND_WEBHOOK_SECRET;
  if (!secret) return hookText("unavailable", 503);
  const body = await request.text();
  if (!verifyResend(secret, body, request)) return hookText("invalid", 400);

  let event: { type?: string; data?: unknown };
  try {
    event = JSON.parse(body) as { type?: string; data?: unknown };
  } catch {
    return hookText("invalid", 400);
  }
  if (event.type !== "email.received") return hookText("ok", 200);

  const parsed = readInboundPayload(event.data);
  if (!parsed) return hookText("ok", 200);
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) return hookText("unavailable", 503);

  const payload = await hydrateReceiving(apiKey, parsed, event.data);
  const result = await ingestInboundEmail(env, payload);
  if (result === "unavailable") return hookText("unavailable", 503);
  return hookText("ok", 200);
}

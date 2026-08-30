// apps/web/app/api/contact/route.ts
//
// SITE-04 contact submission. Order is the security property:
// verify Turnstile -> zod -> asAnon RPC -> notify. A code, never a message.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asAnon } from "@/lib/db/identity";
import { log } from "@/lib/logger";
import { contactSchema } from "@/lib/forms/schemas";
import { formFailure, formSuccess, renderOwnerNotice, sendOwnerNotice } from "@/lib/forms/notify";
import { verifyTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { env } = getCloudflareContext();
  const ctx = {
    requestId: crypto.randomUUID(),
    route: "/api/contact",
    locale: null as string | null,
  };

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return formFailure("invalid_input", 400);
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return formFailure("invalid_input", 400);
  }
  const body = raw as Record<string, unknown>;
  const token = typeof body.turnstileToken === "string" ? body.turnstileToken : "";
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";

  const challenge = await verifyTurnstile(
    env.TURNSTILE_SECRET_KEY ?? process.env.TURNSTILE_SECRET_KEY,
    token,
    {
      action: "contact",
      idempotencyKey,
      remoteip: request.headers.get("cf-connecting-ip") ?? undefined,
    },
  );
  if (!challenge.ok) {
    return formFailure("challenge_failed", 403);
  }

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return formFailure("invalid_input", 400);
  }
  const input = parsed.data;
  ctx.locale = input.locale;

  let created: boolean;
  try {
    const rows = await asAnon(env, (tx) => tx`
      select * from public.submit_contact_message(
        ${input.idempotencyKey},
        ${input.name},
        ${input.email},
        ${input.phone},
        ${input.bookingRef},
        ${input.message},
        ${input.locale}
      )
    `);
    const row = rows[0] as { created?: boolean } | undefined;
    if (!row) {
      log("error", "contact", ctx, { sqlstate: "unknown" });
      return formFailure("unavailable", 503);
    }
    created = row.created === true;
  } catch (err) {
    log("error", "contact", ctx, { sqlstate: (err as { code?: string })?.code ?? "unknown" });
    return formFailure("unavailable", 503);
  }

  if (created) {
    await sendOwnerNotice(
      env.RESEND_API_KEY ?? process.env.RESEND_API_KEY,
      renderOwnerNotice(`Contact form (${input.locale})`, [
        `Submitter locale: ${input.locale}`,
        `Name: ${input.name}`,
        `Email: ${input.email}`,
        `Phone: ${input.phone}`,
        `Booking ref: ${input.bookingRef}`,
        `Message: ${input.message}`,
      ]),
      ctx,
      "contact",
    );
  }

  return formSuccess(created);
}

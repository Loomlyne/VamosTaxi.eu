// apps/web/app/api/partner-application/route.ts
//
// SITE-04 partner-application endpoint. Same five-step order as /api/contact.
// V1 has no public become-a-partner page; the API is in scope for SITE-04.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asAnon } from "@/lib/db/identity";
import { log } from "@/lib/logger";
import { partnerApplicationSchema } from "@/lib/forms/schemas";
import { formFailure, formSuccess, renderOwnerNotice, sendOwnerNotice } from "@/lib/forms/notify";
import { verifyTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { env } = getCloudflareContext();
  const ctx = {
    requestId: crypto.randomUUID(),
    route: "/api/partner-application",
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
      action: "partner-application",
      idempotencyKey,
      remoteip: request.headers.get("cf-connecting-ip") ?? undefined,
    },
  );
  if (!challenge.ok) {
    return formFailure("challenge_failed", 403);
  }

  const parsed = partnerApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return formFailure("invalid_input", 400);
  }
  const input = parsed.data;
  ctx.locale = input.locale;

  let created: boolean;
  try {
    const rows = await asAnon(env, (tx) => tx`
      select * from public.submit_partner_application(
        ${input.idempotencyKey},
        ${input.name},
        ${input.city},
        ${input.phone},
        ${input.email},
        ${input.vehicle},
        ${input.permit},
        ${input.locale}
      )
    `);
    const row = rows[0] as { created?: boolean } | undefined;
    if (!row) {
      log("error", "partner-application", ctx, { sqlstate: "unknown" });
      return formFailure("unavailable", 503);
    }
    created = row.created === true;
  } catch (err) {
    log("error", "partner-application", ctx, {
      sqlstate: (err as { code?: string })?.code ?? "unknown",
    });
    return formFailure("unavailable", 503);
  }

  if (created) {
    await sendOwnerNotice(
      env.RESEND_API_KEY ?? process.env.RESEND_API_KEY,
      renderOwnerNotice(`Partner application (${input.locale})`, [
        `Submitter locale: ${input.locale}`,
        `Name: ${input.name}`,
        `City: ${input.city}`,
        `Phone: ${input.phone}`,
        `Email: ${input.email}`,
        `Vehicle: ${input.vehicle}`,
        `Permit: ${input.permit}`,
      ]),
      ctx,
      "partner-application",
    );
  }

  return formSuccess(created);
}

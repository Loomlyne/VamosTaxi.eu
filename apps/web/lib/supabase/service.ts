import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import type { DigestDependencies, DigestLeg, DigestRecipient } from "../ops/digest";

function requireData<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("digest database returned no data");
  return result.data;
}

function requireOk(result: { error: { message: string } | null }): void {
  if (result.error) throw new Error(result.error.message);
}

/**
 * The service-role client is deliberately created only by Worker scheduled code. Fetch/RSC
 * paths keep using the identity doors; this client reaches SECURITY DEFINER digest RPCs only.
 */
export function createServiceClient(env: CloudflareEnv): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("missing scheduled digest service credentials");
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createDigestDependencies(env: CloudflareEnv): DigestDependencies {
  const client = createServiceClient(env);

  return {
    recipients: async (): Promise<DigestRecipient[]> =>
      requireData(await client.rpc("staff_digest_recipients")),
    legs: async (date): Promise<DigestLeg[]> => requireData(await client.rpc("staff_digest_legs", { p_digest_date: date })),
    claim: async (staffUserId, date): Promise<boolean> =>
      requireData(await client.rpc("staff_digest_claim", { p_staff_user_id: staffUserId, p_digest_date: date })),
    markSent: async (staffUserId, date): Promise<void> => {
      requireOk(await client.rpc("staff_digest_mark_sent", { p_staff_user_id: staffUserId, p_digest_date: date }));
    },
    markFailed: async (staffUserId, date): Promise<void> => {
      requireOk(await client.rpc("staff_digest_mark_failed", { p_staff_user_id: staffUserId, p_digest_date: date }));
    },
    send: (recipient, digest) => sendDigest(env, recipient, digest),
  };
}

async function sendDigest(
  env: CloudflareEnv,
  recipient: DigestRecipient,
  digest: { subject: string; html: string; text: string },
): Promise<void> {
  const from = { email: "noreply@vamostaxi.site", name: "Vamos Taxi" };
  if (env.EMAIL?.send) {
    await env.EMAIL.send({ to: recipient.email, from, ...digest });
    return;
  }

  if (!env.RESEND_API_KEY) throw new Error("no scheduled digest sender");
  const { error } = await new Resend(env.RESEND_API_KEY).emails.send({
    from: `${from.name} <${from.email}>`,
    to: recipient.email,
    ...digest,
  });
  if (error) throw new Error("scheduled digest sender rejected message");
}

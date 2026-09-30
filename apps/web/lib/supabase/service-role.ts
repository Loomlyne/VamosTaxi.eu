/**
 * Server-only. The only file that reads SUPABASE_SERVICE_ROLE_KEY (26.5 D-14).
 * Every other file gets a boolean, a narrow auth-admin object, or (pre-26.5 staff callers) the full client.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

if (typeof window !== "undefined") throw new Error("server-only module");

function readCredentials(env: CloudflareEnv): { url: string; key: string } | null {
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = env.SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!key || !url) return null;
  return { url, key };
}

function buildClient(creds: { url: string; key: string }): SupabaseClient {
  return createClient(creds.url, creds.key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** True when both the key and the URL are present. Never throws. */
export function serviceRoleConfigured(env: CloudflareEnv): boolean {
  try {
    return readCredentials(env) !== null;
  } catch {
    return false;
  }
}

export type CheckoutAuthAdmin = {
  createUser(args: {
    email: string;
    email_confirm: false;
    user_metadata: Record<string, string>;
  }): Promise<{ userId: string | null; errorCode: string | null }>;
  generateLink(args: {
    type: "magiclink";
    email: string;
  }): Promise<{ hashedToken: string | null; verificationType: string | null; errorCode: string | null }>;
};

function codeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && code ? code : "unknown";
}

/**
 * Auth-admin only: create a user and generate a link. No table access is reachable from the
 * returned object. Errors are reduced to `error.code` (messages may echo input).
 */
export function checkoutAuthAdmin(env: CloudflareEnv): CheckoutAuthAdmin | null {
  const creds = readCredentials(env);
  if (!creds) return null;
  const client = buildClient(creds);
  return Object.freeze({
    async createUser(args) {
      try {
        const res = await client.auth.admin.createUser(args);
        if (res.error) return { userId: null, errorCode: codeOf(res.error) };
        return { userId: res.data.user?.id ?? null, errorCode: null };
      } catch {
        return { userId: null, errorCode: "unknown" };
      }
    },
    async generateLink(args) {
      try {
        const res = await client.auth.admin.generateLink(args);
        if (res.error) return { hashedToken: null, verificationType: null, errorCode: codeOf(res.error) };
        const props = res.data?.properties;
        return {
          hashedToken: props?.hashed_token ?? null,
          verificationType: props?.verification_type ?? null,
          errorCode: null,
        };
      } catch {
        return { hashedToken: null, verificationType: null, errorCode: "unknown" };
      }
    },
  } satisfies CheckoutAuthAdmin);
}

/** Full client for the two pre-26.5 staff callers only (digest, staff invite). */
export function legacyServiceClient(env: CloudflareEnv): SupabaseClient {
  const creds = readCredentials(env);
  if (!creds) throw new Error("service role not configured");
  return buildClient(creds);
}

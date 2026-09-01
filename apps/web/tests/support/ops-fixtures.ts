// apps/web/tests/support/ops-fixtures.ts
//
// Local-stack staff fixtures for ops gate specs. Throws unless the Auth URL is
// loopback so a mistyped env cannot create users on the hosted project.

import { createHmac } from "node:crypto";
import { createRequire } from "node:module";

const AUTH_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const DB_URL = process.env.OPS_FIXTURE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const MAIN_WEB_PKG = "/Users/koss/Developer/VamosTaxi.eu/apps/web/package.json";
const MAIN_DB_PKG = "/Users/koss/Developer/VamosTaxi.eu/packages/db/package.json";

function assertLoopback(url: string, label: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${label} is not a URL`);
  }
  const host = parsed.hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`${label} must be loopback (127.0.0.1/localhost), got ${host}`);
  }
  return parsed;
}

assertLoopback(AUTH_URL, "SUPABASE_URL");
assertLoopback(DB_URL, "OPS_FIXTURE_DB_URL");

export type StaffRole = "dispatcher" | "admin";

export type StaffFixture = {
  userId: string;
  email: string;
  password: string;
  role: StaffRole;
  factorSecret: string | null;
};

const createdUserIds: string[] = [];

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = input.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = "";
  for (const c of cleaned) {
    const val = alphabet.indexOf(c);
    if (val < 0) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function totpCode(secret: string, nowMs = Date.now()): string {
  const key = base32Decode(secret);
  const counter = Math.floor(nowMs / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const bin =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(bin % 1_000_000).padStart(6, "0");
}

function loadCreateClient() {
  const req = createRequire(MAIN_WEB_PKG);
  const mod = req("@supabase/supabase-js") as {
    createClient: (
      url: string,
      key: string,
      opts?: object,
    ) => {
      auth: {
        signInWithPassword: (creds: { email: string; password: string }) => Promise<{
          data: { session: { access_token: string; refresh_token: string } | null };
          error: { message: string } | null;
        }>;
        mfa: {
          enroll: (opts: { factorType: "totp" }) => Promise<{
            data: { id: string; totp: { secret: string } } | null;
            error: { message: string } | null;
          }>;
          challenge: (opts: { factorId: string }) => Promise<{
            data: { id: string } | null;
            error: { message: string } | null;
          }>;
          verify: (opts: {
            factorId: string;
            challengeId: string;
            code: string;
          }) => Promise<{ data: unknown; error: { message: string } | null }>;
        };
      };
    };
  };
  return mod.createClient;
}

function loadSql() {
  const req = createRequire(MAIN_DB_PKG);
  const postgres = req("postgres") as (url: string) => {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
    end: (opts?: { timeout?: number }) => Promise<void>;
  };
  return postgres;
}

async function adminCreateUser(email: string, password: string, serviceKey: string): Promise<string> {
  const res = await fetch(`${AUTH_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`admin create user ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { id: string };
  createdUserIds.push(body.id);
  return body.id;
}

export async function createStaffFixture(opts: {
  role: StaffRole;
  enrolTotp?: boolean;
}): Promise<StaffFixture> {
  const anonKey = process.env.SUPABASE_ANON_KEY ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!anonKey || !serviceKey) {
    throw new Error("SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY required for ops fixtures");
  }

  const stamp = Date.now();
  const email = `ops-${opts.role}-${stamp}@vamos.test`;
  const password = "localpass";
  const userId = await adminCreateUser(email, password, serviceKey);

  const postgres = loadSql();
  const sql = postgres(DB_URL);
  try {
    await sql`
      insert into public.staff (user_id, role, full_name, accepted_at)
      values (${userId}::uuid, ${opts.role}, ${opts.role}, now())
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }

  let factorSecret: string | null = null;
  if (opts.enrolTotp) {
    const createClient = loadCreateClient();
    const supabase = createClient(AUTH_URL, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signedIn = await supabase.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session) {
      throw new Error(`fixture sign-in failed: ${signedIn.error?.message ?? "no session"}`);
    }
    const enrolled = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (enrolled.error || !enrolled.data) {
      throw new Error(`fixture enroll failed: ${enrolled.error?.message ?? "no data"}`);
    }
    const challenged = await supabase.auth.mfa.challenge({ factorId: enrolled.data.id });
    if (challenged.error || !challenged.data) {
      throw new Error(`fixture challenge failed: ${challenged.error?.message ?? "no data"}`);
    }
    const code = totpCode(enrolled.data.totp.secret);
    const verified = await supabase.auth.mfa.verify({
      factorId: enrolled.data.id,
      challengeId: challenged.data.id,
      code,
    });
    if (verified.error) {
      throw new Error(`fixture verify failed: ${verified.error.message}`);
    }
    factorSecret = enrolled.data.totp.secret;
  }

  return { userId, email, password, role: opts.role, factorSecret };
}

export async function createCustomerFixture(): Promise<{ email: string; password: string; userId: string }> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY required for ops fixtures");
  const stamp = Date.now();
  const email = `ops-cust-${stamp}@vamos.test`;
  const password = "localpass";
  const userId = await adminCreateUser(email, password, serviceKey);
  return { email, password, userId };
}

export async function resetStaffFixtures(): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!serviceKey) return;
  const ids = createdUserIds.splice(0, createdUserIds.length);
  for (const id of ids) {
    try {
      await fetch(`${AUTH_URL}/auth/v1/admin/users/${id}`, {
        method: "DELETE",
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
    } catch {
      // Best-effort cleanup.
    }
  }
}

export async function localAuthUp(): Promise<boolean> {
  try {
    const res = await fetch(`${AUTH_URL}/auth/v1/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

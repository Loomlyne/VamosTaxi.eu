// apps/web/lib/ops/staff-active.test.ts
//
// Security S13 (2026-10-05): the staff gate asks the database whether the caller's staff row is
// still active (app.is_staff(), the rule the row policies use), and the photo upload, a write, needs
// the admin and an active row.

import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ texts: [] as string[], claims: [] as unknown[], answer: [{ active: true }] as unknown[] }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: { PHOTOS: { put: async () => undefined } } }) }));
vi.mock("@/lib/db/identity", () => ({
  asStaff: async (_env: unknown, claims: unknown, fn: (sql: unknown) => unknown) => {
    db.claims.push(claims);
    return fn(async (strings: TemplateStringsArray) => {
      db.texts.push(strings.join("?"));
      return db.answer;
    });
  },
}));

const client = vi.hoisted(() => ({ role: "admin" as string | null }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => {
    const payload = Buffer.from(
      JSON.stringify(client.role ? { app_metadata: { vamos_role: client.role } } : {}),
    ).toString("base64url");
    const user = client.role
      ? { id: "88888888-8888-4888-8888-888888888888", email: "a@vamos.test", app_metadata: { vamos_role: client.role } }
      : null;
    return {
      auth: {
        getUser: async () => ({ data: { user }, error: null }),
        getSession: async () => ({ data: { session: user ? { access_token: `h.${payload}.s` } : null } }),
        mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1" } }) },
      },
    };
  },
  createSupabaseServerClient: async () => {
    throw new Error("unused");
  },
}));

import { staffRowActive } from "./staff-active";
import { POST as upload } from "../../app/[locale]/(ops)/api/photos/upload/route";

function uploadRequest(): Request {
  const form = new FormData();
  form.set("kind", "vehicle");
  form.set("recordId", "99999999-9999-4999-8999-999999999999");
  return new Request("https://dashboard.vamostaxi.site/api/photos/upload", {
    method: "POST",
    headers: { origin: "https://dashboard.vamostaxi.site" },
    body: form,
  });
}

beforeEach(() => {
  db.texts = [];
  db.claims = [];
  db.answer = [{ active: true }];
  client.role = "admin";
});

describe("staffRowActive", () => {
  it("asks app.is_staff() as the caller and is true only for a true answer", async () => {
    const claims = { sub: "u1", role: "authenticated" } as never;
    expect(await staffRowActive(claims, {} as CloudflareEnv)).toBe(true);
    expect(db.texts[0]).toMatch(/select app\.is_staff\(\) as active/);
    expect(db.claims[0]).toBe(claims);
    for (const answer of [[{ active: false }], [{ active: null }], []]) {
      db.answer = answer;
      expect(await staffRowActive(claims, {} as CloudflareEnv), JSON.stringify(answer)).toBe(false);
    }
  });
});

describe("S13: photo upload needs the admin and an active staff row", () => {
  it("a switched-off staff row is refused 403 before the file is read", async () => {
    db.answer = [{ active: false }];
    const res = await upload(uploadRequest());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "not-staff" });
  });

  it("a dispatcher cannot upload (a write needs the admin)", async () => {
    client.role = "dispatcher";
    const res = await upload(uploadRequest());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "not-admin" });
    expect(db.texts).toEqual([]);
  });

  it("an active admin gets past the gate to the file check", async () => {
    const res = await upload(uploadRequest());
    // No file in the form: the route's own 400 shows the gate let the admin through.
    expect(res.status).toBe(400);
    expect(db.texts.length).toBe(1);
  });
});

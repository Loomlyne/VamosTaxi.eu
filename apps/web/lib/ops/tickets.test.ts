import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";

const asStaff = vi.fn();

vi.mock("@/lib/db/identity", () => ({
  asStaff: (...args: unknown[]) => asStaff(...args),
}));
vi.mock("@/lib/ops/tickets-map", async () => import("./tickets-map"));
vi.mock("@/lib/ops/staff-json", async () => {
  const actual = await vi.importActual<typeof import("./staff-json")>("./staff-json");
  return {
    ...actual,
    withStaff: (handler: (claims: unknown, request: Request) => Promise<Response> | Response) =>
      (request: Request) => handler({ sub: "s" }, request),
  };
});
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: {} }) }));

import { loadTickets } from "./tickets";
import { GET } from "../../app/[locale]/(ops)/api/staff/tickets/route";

const claims: VamosClaims = {
  sub: "11111111-1111-4111-8111-111111111111",
  role: "authenticated",
  aal: "aal2",
  app_metadata: { vamos_role: "dispatcher" },
};

const env = {} as CloudflareEnv;

const submission = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Ada",
  email: "ada@example.test",
  phone: "+41",
  booking_ref: "VT-10001",
  message: "hello",
  locale: "en",
  ticket_status: "open",
  created_at: "2026-01-01T12:00:00.000Z",
  last_activity_at: null,
};

const message = {
  id: "msg-1",
  submission_id: submission.id,
  direction: "inbound",
  body_text: "hello",
  created_at: "2026-01-01T12:01:00.000Z",
};

function makeSql(handler: (text: string, values: unknown[]) => unknown) {
  return (first: TemplateStringsArray | unknown[], ...values: unknown[]) => {
    if (!Object.prototype.hasOwnProperty.call(first, "raw")) return first;
    return handler((first as TemplateStringsArray).join(" "), values);
  };
}

beforeEach(() => {
  asStaff.mockReset();
});

describe("loadTickets optional support_message_files", () => {
  it("returns [] when there are no submissions", async () => {
    asStaff.mockImplementation(async (_env: unknown, _claims: unknown, fn: (sql: unknown) => Promise<unknown>) => {
      return fn(makeSql(() => []));
    });
    await expect(loadTickets(env, claims)).resolves.toEqual([]);
  });

  it("attaches files when the files select succeeds", async () => {
    asStaff.mockImplementation(async (_env: unknown, _claims: unknown, fn: (sql: unknown) => Promise<unknown>) => {
      return fn(
        makeSql((text) => {
          if (/contact_submissions/i.test(text)) return [submission];
          if (/support_messages/i.test(text) && !/support_message_files/i.test(text)) return [message];
          if (/support_message_files/i.test(text)) {
            return [
              {
                id: "f1",
                message_id: "msg-1",
                filename: "a.png",
                content_type: "image/png",
                kept: true,
              },
            ];
          }
          return [];
        }),
      );
    });
    const rows = await loadTickets(env, claims);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.messages[0]?.files).toEqual([
      { id: "f1", filename: "a.png", contentType: "image/png", kept: true },
    ]);
  });

  it("swallows 42P01 / missing support_message_files and still hydrates tickets", async () => {
    asStaff.mockImplementation(async (_env: unknown, _claims: unknown, fn: (sql: unknown) => Promise<unknown>) => {
      return fn(
        makeSql((text) => {
          if (/contact_submissions/i.test(text)) return [submission];
          if (/support_messages/i.test(text) && !/support_message_files/i.test(text)) return [message];
          if (/support_message_files/i.test(text)) {
            const err = new Error('relation "public.support_message_files" does not exist') as Error & {
              code?: string;
            };
            err.code = "42P01";
            throw err;
          }
          return [];
        }),
      );
    });
    const rows = await loadTickets(env, claims);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.messages[0]?.body).toBe("hello");
    expect(rows[0]?.messages[0]?.files).toEqual([]);
  });
});

describe("Phase 32 plan 07: translations in the ticket read model", () => {
  function install(seen: { text: string; values: unknown[] }[], rows: Record<string, unknown>[]) {
    asStaff.mockImplementation(async (_env: unknown, _claims: unknown, fn: (sql: unknown) => Promise<unknown>) =>
      fn(
        makeSql((text, values) => {
          if (/contact_submissions/i.test(text)) return [submission];
          if (/support_message_files/i.test(text)) return [];
          if (/support_messages/i.test(text)) {
            seen.push({ text, values });
            return rows;
          }
          return [];
        }),
      ),
    );
  }

  it("selects detected_lang and left-joins the staff-only translations for the requested language", async () => {
    const seen: { text: string; values: unknown[] }[] = [];
    install(seen, [{ ...message, detected_lang: "de", tr_body: "Hello there", tr_status: "done" }]);
    const rows = await loadTickets(env, claims, "en");
    expect(seen).toHaveLength(1);
    expect(seen[0]?.text).toMatch(/m\.detected_lang/);
    expect(seen[0]?.text).toMatch(/left join public\.support_message_translations t/);
    expect(seen[0]?.text).toMatch(/t\.target_lang = /);
    expect(seen[0]?.values).toContain("en");
    expect(rows[0]?.messages[0]?.lang).toBe("de");
    expect(rows[0]?.messages[0]?.translation).toEqual({ status: "ready", text: "Hello there" });
    expect(rows[0]?.messages[0]?.body).toBe("hello");
  });

  it("defaults to en and coerces an unknown language to en", async () => {
    const seen: { text: string; values: unknown[] }[] = [];
    install(seen, [message]);
    await loadTickets(env, claims);
    await loadTickets(env, claims, "it");
    expect(seen[0]?.values).toContain("en");
    expect(seen[1]?.values).toContain("en");
    expect(seen[1]?.values).not.toContain("it");
  });

  it.each([
    ["de", "de"],
    ["fr", "fr"],
    ["ar", "ar"],
    ["en", "en"],
    ["it", "en"],
    ["", "en"],
    ["DE", "en"],
    [null, "en"],
  ])("GET /api/staff/tickets?lang=%s asks for %s", async (q, expected) => {
    const seen: { text: string; values: unknown[] }[] = [];
    install(seen, [message]);
    const url = q === null ? "https://dashboard.vamostaxi.site/api/staff/tickets" : `https://dashboard.vamostaxi.site/api/staff/tickets?lang=${q}`;
    const res = await (GET as unknown as (r: Request) => Promise<Response>)(new Request(url));
    expect(res.status).toBe(200);
    expect(seen[0]?.values).toContain(expected);
    const body = (await res.json()) as { ok: boolean; data: Array<{ messages: Array<{ translation: unknown }> }> };
    expect(body.ok).toBe(true);
    expect(body.data[0]?.messages[0]).toHaveProperty("translation");
  });
});

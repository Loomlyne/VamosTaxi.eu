import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";

const asStaff = vi.fn();

vi.mock("@/lib/db/identity", () => ({
  asStaff: (...args: unknown[]) => asStaff(...args),
}));

import { loadTickets } from "./tickets";

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

function makeSql(handler: (text: string) => unknown) {
  return (first: TemplateStringsArray | unknown[], ..._values: unknown[]) => {
    if (!Object.prototype.hasOwnProperty.call(first, "raw")) return first;
    return handler((first as TemplateStringsArray).join(" "));
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

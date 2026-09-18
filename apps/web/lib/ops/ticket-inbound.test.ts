import { beforeEach, describe, expect, it, vi } from "vitest";
import { inboundBody, readInboundPayload, type InboundPayload } from "./ticket-mail";

const asSystem = vi.fn();

vi.mock("@/lib/db/identity", () => ({
  asSystem: (...args: unknown[]) => asSystem(...args),
}));

const TOKEN = "0123456789abcdef0123456789abcdef";
const PLUS = `ticket+${TOKEN}@replies.vamostaxi.site`;
const TICKET_ID = "11111111-1111-4111-8111-111111111111";
const RFC_STAFF = "<s.22222222222222222222222222222222@vamostaxi.site>";
const ENV = {} as CloudflareEnv;
const UNREADABLE = "Message could not be read.";
const KEPT_FILES_BODY = "Attachment received.";

type Wave0Payload = InboundPayload & {
  receivedFor?: unknown;
  messageId?: string;
  headers?: unknown;
  attachments?: unknown;
};

type DbState = {
  events: Set<string>;
  messages: Array<{ submission_id: string; from_address: string; body_text: string }>;
  updates: Array<{ ticket_status: string; id: string }>;
  tickets: Array<{ id: string; reply_token: string; ticket_status: string }>;
  rfc: Array<{ rfc_message_id: string; submission_id: string }>;
};

function makeState(partial?: Partial<DbState>): DbState {
  return {
    events: new Set(),
    messages: [],
    updates: [],
    tickets: [
      { id: TICKET_ID, reply_token: TOKEN, ticket_status: "open" },
    ],
    rfc: [{ rfc_message_id: RFC_STAFF, submission_id: TICKET_ID }],
    ...partial,
  };
}

function installSql(state: DbState) {
  asSystem.mockImplementation(async (_env: CloudflareEnv, fn: (sql: unknown) => unknown) => {
    const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join(" ").replace(/\s+/g, " ").toLowerCase();
      if (text.includes("support_inbound_events") && text.includes("insert")) {
        const emailId = String(values[0] ?? "");
        if (state.events.has(emailId)) return [];
        state.events.add(emailId);
        return [{ email_id: emailId }];
      }
      if (text.includes("contact_submissions") && text.includes("reply_token")) {
        const token = String(values[0] ?? "");
        return state.tickets
          .filter((row) => row.reply_token === token)
          .map((row) => ({ id: row.id, ticket_status: row.ticket_status }));
      }
      if (text.includes("support_messages") && text.includes("rfc_message_id") && text.includes("select")) {
        const ids = values.map((value) => String(value));
        return state.rfc.filter((row) => ids.includes(row.rfc_message_id));
      }
      if (text.includes("insert") && text.includes("support_messages")) {
        state.messages.push({
          submission_id: String(values[0] ?? ""),
          from_address: String(values[1] ?? ""),
          body_text: String(values[2] ?? ""),
        });
        return [];
      }
      if (text.includes("update") && text.includes("contact_submissions")) {
        state.updates.push({ ticket_status: String(values[0] ?? ""), id: String(values[1] ?? "") });
        return [];
      }
      return [];
    };
    return fn(sql);
  });
}

describe("ticket-inbound parse", () => {
  it("reads Resend email.received payloads", () => {
    expect(readInboundPayload({ email_id: "em_1", to: "ticket+a@x" })).toEqual({
      emailId: "em_1",
      to: "ticket+a@x",
      from: undefined,
      text: undefined,
      html: undefined,
      subject: undefined,
    });
    expect(readInboundPayload({ id: "em_2", to: ["x@y"] })?.emailId).toBe("em_2");
    expect(readInboundPayload({})).toBeNull();
  });

  it("prefers text then html then subject", () => {
    expect(inboundBody({ emailId: "1", to: "x", text: " hello " })).toBe("hello");
    expect(inboundBody({ emailId: "1", to: "x", html: "<p>Hi<br/>there</p>" })).toBe("Hi\nthere");
    expect(inboundBody({ emailId: "1", to: "x", subject: "Re: ping" })).toBe("Re: ping");
  });
});

describe("INB-02 D-01 D-02 D-04 D-12 Wave 0 ingest (RED until 14-03)", () => {
  beforeEach(() => {
    asSystem.mockReset();
  });

  it("plus-token on to appends a support_messages row", async () => {
    const { ingestInboundEmail } = await import("./ticket-inbound");
    const state = makeState();
    installSql(state);
    const result = await ingestInboundEmail(ENV, {
      emailId: "em_to",
      to: PLUS,
      from: "guest@example.com",
      text: "Need the driver at T2.",
    });
    expect(result).toBe("ok");
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.body_text).toContain("Need the driver at T2.");
  });

  it("plus-token only on received_for (empty/unrelated to) still appends", async () => {
    const { ingestInboundEmail } = await import("./ticket-inbound");
    const state = makeState();
    installSql(state);
    const payload: Wave0Payload = {
      emailId: "em_received_for",
      to: "unrelated@gmail.com",
      receivedFor: [PLUS],
      from: "guest@example.com",
      text: "Token is only on received_for.",
    };
    const result = await ingestInboundEmail(ENV, payload);
    expect(result).toBe("ok");
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.submission_id).toBe(TICKET_ID);
  });

  it("RFC In-Reply-To match when token absent still appends", async () => {
    const { ingestInboundEmail } = await import("./ticket-inbound");
    const state = makeState();
    installSql(state);
    const payload: Wave0Payload = {
      emailId: "em_rfc",
      to: "unrelated@gmail.com",
      from: "guest@example.com",
      text: "Threading via RFC.",
      headers: { "In-Reply-To": RFC_STAFF },
    };
    const result = await ingestInboundEmail(ENV, payload);
    expect(result).toBe("ok");
    expect(state.messages).toHaveLength(1);
  });

  it("D-01 never match on From — spoofed From equal to a ticket email with no token and no RFC does not insert support_messages", async () => {
    const { ingestInboundEmail } = await import("./ticket-inbound");
    const state = makeState();
    installSql(state);
    const result = await ingestInboundEmail(ENV, {
      emailId: "em_from_spoof",
      to: "info@vamostaxi.site",
      from: "guest@example.com",
      text: "I am spoofing a known ticket email.",
    });
    expect(result).toBe("drop");
    expect(state.messages).toHaveLength(0);
  });

  it("D-02 unmatched inserts no message", async () => {
    const { ingestInboundEmail } = await import("./ticket-inbound");
    const state = makeState({ tickets: [], rfc: [] });
    installSql(state);
    const result = await ingestInboundEmail(ENV, {
      emailId: "em_unmatched",
      to: "someone@else.example",
      from: "stranger@example.com",
      text: "Please open a new ticket.",
    });
    expect(result).toBe("drop");
    expect(state.messages).toHaveLength(0);
  });

  it("D-12 second same email_id does not insert a second message", async () => {
    const { ingestInboundEmail } = await import("./ticket-inbound");
    const state = makeState();
    installSql(state);
    const payload: InboundPayload = {
      emailId: "em_idempotent",
      to: PLUS,
      from: "guest@example.com",
      text: "First copy.",
    };
    expect(await ingestInboundEmail(ENV, payload)).toBe("ok");
    expect(await ingestInboundEmail(ENV, payload)).toBe("ok");
    expect(state.messages).toHaveLength(1);
  });

  it("D-04 Closed ticket matched inbound updates status responded and closed_at null", async () => {
    const { ingestInboundEmail } = await import("./ticket-inbound");
    const state = makeState({
      tickets: [{ id: TICKET_ID, reply_token: TOKEN, ticket_status: "closed" }],
    });
    installSql(state);
    const result = await ingestInboundEmail(ENV, {
      emailId: "em_closed",
      to: PLUS,
      from: "guest@example.com",
      text: "Still need this trip.",
    });
    expect(result).toBe("ok");
    expect(state.messages).toHaveLength(1);
    expect(state.updates[0]?.ticket_status).toBe("responded");
    expect(state.updates.some((row) => row.ticket_status === "responded")).toBe(true);
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./ticket-inbound.ts", import.meta.url), "utf8"),
    );
    expect(src).toMatch(/closed_at = null/);
  });

  it("D-07 matched empty body with no files uses Message could not be read.", async () => {
    const { ingestInboundEmail } = await import("./ticket-inbound");
    const state = makeState();
    installSql(state);
    const result = await ingestInboundEmail(ENV, {
      emailId: "em_empty",
      to: PLUS,
      from: "guest@example.com",
      text: "",
      html: "",
      subject: "",
    });
    expect(result).toBe("ok");
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.body_text).toBe(UNREADABLE);
  });

  it("D-07 kept files no text uses Attachment received.", async () => {
    const { ingestInboundEmail } = await import("./ticket-inbound");
    const state = makeState();
    installSql(state);
    const payload: Wave0Payload = {
      emailId: "em_files_only",
      to: PLUS,
      from: "guest@example.com",
      text: "",
      attachments: [{ filename: "gate.jpg", contentType: "image/jpeg", size: 100 }],
    };
    const result = await ingestInboundEmail(ENV, payload);
    expect(result).toBe("ok");
    expect(state.messages[0]?.body_text).toBe(KEPT_FILES_BODY);
  });
});

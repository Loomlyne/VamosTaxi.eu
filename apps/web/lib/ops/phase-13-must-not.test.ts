// apps/web/lib/ops/phase-13-must-not.test.ts
//
// Phase 13-10: source-read must-nots for the staff send path.
// No Hyperdrive. No wrangler. No DNS.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

const FILES = {
  ticketsWrite: "apps/web/lib/ops/tickets-write.ts",
  notify: "apps/web/lib/forms/notify.ts",
  ticketMail: "apps/web/lib/ops/ticket-mail.ts",
  contact: "apps/web/app/api/contact/route.ts",
  overlay: "app/ops/OpsSupportTicket.dc.html",
  sidebar: "app/ops/OpsSidebar.dc.html",
  send: "packages/emails/src/lib/send.ts",
  ticketsMap: "apps/web/lib/ops/tickets-map.ts",
} as const;

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

function stripLineComments(src: string): string {
  return src
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line) && !/^\s*\*/.test(line))
    .join("\n");
}

const listed = Object.values(FILES);

describe("phase 13 must-not greps (RPLY-01 RPLY-02 D-01 D-05 D-08 D-09)", () => {
  it("RPLY-01 RPLY-02 tickets-write bccs SUPPORT_EMAIL with allowEmailFallback false and no EMAIL/Message-ID", () => {
    const src = read(FILES.ticketsWrite);
    const code = stripLineComments(src);
    expect(code).toMatch(/allowEmailFallback:\s*false/);
    expect(code).toMatch(/bcc:\s*SUPPORT_EMAIL/);
    expect(code).not.toMatch(/env\.EMAIL/);
    expect(code).not.toMatch(/Message-ID/);
  });

  // 16-03 owns inverting D-09 to true after Resend Verified. Do not invert here.
  it("D-09 ticket-mail keeps REPLIES_DOMAIN_VERIFIED false and does not assign Message-ID", () => {
    const src = read(FILES.ticketMail);
    const code = stripLineComments(src);
    expect(code).toMatch(/REPLIES_DOMAIN_VERIFIED\s*=\s*false/);
    expect(src).not.toContain('"Message-ID":');
    expect(code).not.toMatch(/headers\s*\[\s*["']Message-ID["']\s*\]\s*=/);
  });

  it("D-08 notify still has emails.get and EMAIL fallback; contact route uses env.EMAIL", () => {
    const notify = stripLineComments(read(FILES.notify));
    const contact = stripLineComments(read(FILES.contact));
    expect(notify).toMatch(/emails\.get/);
    expect(notify).toMatch(/CloudflareEnv\["EMAIL"\]/);
    expect(notify).toMatch(/email\?\.send/);
    expect(contact).toMatch(/env\.EMAIL/);
    expect(contact).not.toMatch(/Message-ID/);
  });

  it("D-01 overlay sendError PATCH { reply: body } with no FIXTURES; OpsSidebar has no Staff tab", () => {
    const overlay = stripLineComments(read(FILES.overlay));
    const sidebar = read(FILES.sidebar);
    expect(overlay).toMatch(/sendError/);
    expect(overlay).toMatch(/PATCH/);
    expect(overlay).toMatch(/\{\s*reply:\s*body\s*\}/);
    expect(overlay).not.toMatch(/FIXTURES/);
    expect(sidebar).not.toMatch(/key:'staff'/);
    expect(sidebar).not.toMatch(/#staff/);
  });

  it("D-05 send.ts lifecycle stays bookings@ and noreply@, never info@", () => {
    const src = read(FILES.send);
    const code = stripLineComments(src);
    expect(code).toMatch(/bookings@vamostaxi\.site/);
    expect(code).toMatch(/noreply@vamostaxi\.site/);
    expect(code).not.toMatch(/info@vamostaxi\.site/);
  });

  it("RPLY-01 D-01 listed send-path files have no sk_live_, vamostaxi.eu, or POST /api/quote", () => {
    for (const rel of listed) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/sk_live_/);
      expect(src, rel).not.toMatch(/vamostaxi\.eu/);
      expect(src, rel).not.toMatch(/POST \/api\/quote/);
    }
  });
});

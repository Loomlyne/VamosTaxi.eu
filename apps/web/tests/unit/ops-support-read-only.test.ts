// apps/web/tests/unit/ops-support-read-only.test.ts
//
// Phase 20 F2 (owner decision 2026-09-30): dashboard Support sends nothing. No PDF viewer
// (CVE-2024-4367), no file opened in the dashboard, no reply sent from it; the admin
// answers from his own e-mail.
// Phase 32 plan 10: he now writes the reply in the ticket and ANSWER BY E-MAIL opens his own mail app
// (or Gmail) with it translated. The page still sends nothing: its only calls are GET tickets, PATCH
// status / note as before, and POST reply-translate (text in, text out, nothing stored or mailed).

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const ticket = readFileSync(join(repoRoot, "app/ops/OpsSupportTicket.dc.html"), "utf8");

describe("dashboard support is read-only @security F2", () => {
  it("loads no PDF viewer", () => {
    expect(ticket).not.toMatch(/pdfjs|pdf\.min\.js|getDocument\(/i);
    expect(existsSync(join(repoRoot, "assets/pdfjs"))).toBe(false);
  });

  it("opens no attachment in the dashboard: file names only", () => {
    expect(ticket).not.toMatch(/\/files\//);
    expect(ticket).not.toMatch(/openPreview|previewOpen|createObjectURL/);
    expect(ticket).toContain('data-file-name="1"');
  });

  it("sends no reply from the dashboard; the answer button opens this ticket's own link", () => {
    expect(ticket).not.toMatch(/\{\s*reply:\s*body/);
    expect(ticket).not.toMatch(/sendReply|resend|\/send\b|\/reply['"`]/i);
    // The only Textarea is the reply box; it feeds the mail link, never a request that sends.
    expect((ticket.match(/Textarea/g) ?? []).length).toBe(1);
    expect(ticket).toMatch(/Textarea" label="\{\{ tReplyLabel \}\}"[^>]*data-reply-text="1"/);
    // ANSWER BY E-MAIL keeps answerOff for tickets with no recipient.
    expect(ticket).toMatch(/icon="\{\{ answerIcon \}\}" disabled="\{\{ answerOff \}\}"[^>]*onClick="\{\{ answerByMail \}\}"[^>]*>\{\{ answerLabel \}\}/);
    expect(ticket).toMatch(/answerOff: !\(open && open\.reply && \(open\.reply\.mailto \|\| open\.reply\.gmail\)\)/);
    // The links come from the server for the open ticket only; the page never builds one from another row.
    expect(ticket).toContain("const open = this.openNow();");
    expect(ticket).toContain("openNow() { return this.state.tickets.find((t) => t.id === this.state.openId) || null; }");
    expect(ticket).toContain("reply: replyOf(t.reply),");
    expect(ticket).toContain("x.mailto.indexOf('mailto:') === 0");
    expect(ticket).toContain("x.gmail.indexOf('https://mail.google.com/') === 0");
    // The page only appends &body= to the server-built link.
    expect(ticket).toContain("'body=' + encodeURIComponent(body)");
  });

  it("makes no network call but GET tickets, PATCH status / note, and POST reply-translate", () => {
    const urlRe = /api\.request\(\s*'([A-Z]+)',\s*('[^']*'(?:\s*\+\s*(?:encodeURIComponent\([^)]*\)|'[^']*'))*)/g;
    const calls = [...ticket.matchAll(urlRe)].map((m) => `${m[1]} ${m[2]?.trim()}`);
    expect(calls.sort()).toEqual([
      "GET '/api/staff/tickets?lang=' + encodeURIComponent(lang)",
      "PATCH '/api/staff/tickets/' + encodeURIComponent(id)",
      "POST '/api/staff/tickets/' + encodeURIComponent(open.id) + '/reply-translate'",
    ]);
    expect(ticket).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon/);
    // No PATCH carries a reply.
    expect(ticket).not.toMatch(/persistTicket\([^)]*reply/);
  });

  it("the admin chooses the mail app; the choice is kept on the device", () => {
    expect(ticket).toMatch(/name="BrandSelect" icon="settings" value="\{\{ mailApp \}\}" options="\{\{ mailAppOptions \}\}" onSelect="\{\{ setMailApp \}\}"/);
    expect(ticket).toContain("const MAIL_APP_KEY = 'vamosOpsMailApp';");
    for (const key of ["mailApp:'", "mailAuto:'", "mailGmail:'"]) {
      expect((ticket.split(key).length - 1), key).toBe(4);
    }
  });

  it("the ticket file route only ever downloads, sandboxed and nosniff", () => {
    const route = readFileSync(
      join(repoRoot, "apps/web/app/[locale]/(ops)/api/staff/tickets/[id]/files/[fileId]/route.ts"),
      "utf8",
    );
    expect(route).not.toMatch(/"inline"/);
    expect(route).toContain('return `attachment; filename="${safe}"`;');
    expect(route).toContain('"X-Content-Type-Options": "nosniff"');
    expect(route).toContain(`"Content-Security-Policy": "sandbox; default-src 'none'"`);
  });

  it("has the new strings in en, de, fr and ar", () => {
    expect((ticket.match(/answer:'/g) ?? []).length).toBe(4);
    expect(ticket).not.toContain("mailHint");
    expect((ticket.match(/replyLabel:"/g) ?? []).length).toBe(4);
  });
});

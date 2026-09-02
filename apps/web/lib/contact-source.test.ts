import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const contactSource = readFileSync(join(repoRoot, "app/pages/contact.dc.html"), "utf8");
const localeSource = readFileSync(join(repoRoot, "app/vamos-locale.js"), "utf8");
const middlewareSource = readFileSync(join(repoRoot, "apps/web/middleware.ts"), "utf8");
const legalAssets = [
  "app/pages/privacy.dc.html",
  "app/pages/imprint.dc.html",
  "apps/web/public/app/pages/privacy.dc.html",
  "apps/web/public/app/pages/privacy.html",
  "apps/web/public/app/pages/imprint.dc.html",
  "apps/web/public/app/pages/imprint.html",
] as const;

describe("DC contact source", () => {
  it("waits a bounded time for an explicit Turnstile script, executes only after valid input, retries provider failures, and clears the stale widget before another message", () => {
    expect(contactSource).toContain("turnstileReadyTimer = null;");
    expect(contactSource).toContain("turnstileReadyAttempts = 0;");
    expect(contactSource).toContain("TURNSTILE_READY_MAX_ATTEMPTS = 40;");
    expect(contactSource).toContain("waitForTurnstile = () => {");
    expect(contactSource).toContain("if (this.turnstileReadyAttempts >= this.TURNSTILE_READY_MAX_ATTEMPTS) return;");
    expect(contactSource).toContain("this.turnstileReadyTimer = window.setTimeout(this.waitForTurnstile, 50);");
    expect(contactSource).toContain("if (this.turnstileWidget !== null) return;");
    expect(contactSource).toContain("document.querySelector('#ct-turnstile')");
    expect(contactSource).toContain("clearTurnstile = () => {");
    expect(contactSource).toContain("window.turnstile.remove(widget);");
    expect(contactSource).toContain("appearance: 'interaction-only', execution: 'execute'");
    expect(contactSource).toContain("window.turnstile.execute('#ct-turnstile')");
    expect(contactSource).not.toContain("window.turnstile.execute(this.turnstileWidget)");
    expect(contactSource).toContain("turnstileGeneration = 0");
    expect(contactSource).toContain("bumpTurnstileGeneration = () => {");
    expect(contactSource).toContain("if (this.turnstileWidget !== widgetId) return;");
    expect(contactSource).toContain("if (this.turnstileSubmitting || this.state.phase === 'sending') return;");
    expect(contactSource).toContain("beginContactSubmit = (token) => {");
    expect(contactSource).toContain("if (!this.turnstileSubmitting || !token || !generation || generation !== this.turnstileGeneration) return;");
    expect(contactSource).not.toContain("this.setState({ token: token || '' })");
    expect(contactSource).toContain("this.turnstileSubmitting = true;");
    expect(contactSource).toContain("'error-callback': () => {");
    expect(contactSource).toContain("this.turnstileInFlightGeneration = 0;\n        this.setState({ phase: 'failed', token: '' }, this.retryTurnstile);");
    expect(contactSource).toContain("window.turnstile.reset(this.turnstileWidget);");
    expect(contactSource).toContain("this.clearTurnstile();\n    this.setState({ phase: 'default'");
    expect(contactSource).toContain("this.turnstileReadyTimer = window.setTimeout(() => {");
    expect(contactSource).toContain("this.renderTurnstile();\n        if (this.turnstileWidget === null) this.waitForTurnstile();");
    expect(contactSource).toContain("idempotencyKey: this.state.idempotencyKey");
    expect(contactSource).not.toContain(
      "phase: 'failed', token: '', idempotencyKey: crypto.randomUUID()",
    );
  });

  it("keeps the message field fixed-size without removing its invalid styling", () => {
    expect(contactSource).toContain(
      "[data-fld] textarea{min-height:132px;padding:15px 20px;border-radius:var(--vt-radius-lg);resize:none;line-height:var(--vt-body-leading)}",
    );
    expect(contactSource).toContain("[data-fld][data-bad] input,[data-fld][data-bad] textarea{border-color:var(--vt-danger);border-width:2px}");
  });

  it("shows the accepted state only for an explicit HTTP 200 contact acceptance", () => {
    expect(contactSource).toContain("response.status === 200 && result && result.ok === true");
  });

  it("posts the selected public locale through VamosLocale.lang, including Arabic RTL", () => {
    expect(contactSource).toContain("locale: window.VamosLocale.lang()");
    expect(contactSource).not.toContain("VamosLocale?.current");
    expect(localeSource).toContain("var LANGS = ['en', 'de', 'fr', 'ar'];");
    expect(localeSource).toContain("var RTL = { ar: true };");
    expect(localeSource).toContain("lang: function () { return state.lang; }");
    expect(localeSource).toContain("h.setAttribute('dir', RTL[state.lang] ? 'rtl' : 'ltr');");
  });

  it("drops stale representation metadata before serving an injected contact response", () => {
    const serveDcHtml = middlewareSource.slice(
      middlewareSource.indexOf("async function serveDcHtml"),
      middlewareSource.indexOf("async function serveOpsDc"),
    );
    for (const header of [
      "content-length",
      "content-encoding",
      "etag",
      "last-modified",
      "accept-ranges",
      "content-range",
    ]) {
      expect(serveDcHtml).toContain(`\"${header}\"`);
    }
    expect(serveDcHtml).toContain("headers.delete(header)");
    expect(serveDcHtml).toContain('headers.set("content-type", "text/html; charset=utf-8")');
  });

  it("keeps the public legal mailboxes aligned in canonical and generated artifacts", () => {
    for (const path of legalAssets) {
      const source = readFileSync(join(repoRoot, path), "utf8");
      expect(source).toContain("mailto:info@vamostaxi.site");
      expect(source).toContain("info@vamostaxi.site");
      expect(source).not.toContain("info@vamostaxi.eu");
    }
  });

  it("does not expose an unverified response-time placeholder", () => {
    expect(contactSource).not.toContain("Response time");
    expect(contactSource).not.toContain("data-tok");
  });

  it("contains only confirmed direct-contact destinations and no simulated contact content", () => {
    expect(contactSource).toContain('href="mailto:info@vamostaxi.site"');
    expect(contactSource).toContain(">info@vamostaxi.site<");
    expect(contactSource).toContain('href="tel:+41796267082"');
    expect(contactSource).toContain('href="https://wa.me/41796267082"');
    expect(contactSource).toContain("We reply within 12–24 hours.");
    expect(contactSource).toContain("Available 24/7 on WhatsApp.");
    expect(contactSource).toContain(
      "We can help in any language, primarily English, Swiss German, French and Arabic.",
    );
    expect(contactSource).toContain('variant="light" href="faq.dc.html"');

    for (const forbidden of [
      "Bleicherstrasse 16",
      "8953 Dietikon ZH",
      "Registered office",
      "Live chat",
      "Chat hours",
      "Start a chat",
      "Support email",
      "Support hours",
      "Support languages",
      "Response time",
      "Chat hours",
      "A copy is on its way",
      "facebookUrl",
      "instagramUrl",
      "youtubeUrl",
      "trustpilotUrl",
      "hFacebook",
      "hInstagram",
      "hYoutube",
      "hTrustpilot",
      "|| '#'",
      "Ben Othman",
      "ben@example.com",
      "ben@example",
      "VT-0000",
      "Review switcher",
      "setDefault = () => this.go('default')",
    ]) {
      expect(contactSource).not.toContain(forbidden);
    }
  });
});

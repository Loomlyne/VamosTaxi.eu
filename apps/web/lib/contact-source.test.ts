import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const contactSource = readFileSync(join(repoRoot, "app/pages/contact.dc.html"), "utf8");

describe("DC contact source", () => {
  it("refreshes the challenge after delivery failure without replacing the idempotency key", () => {
    expect(contactSource).toContain("retryTurnstile = () => {");
    expect(contactSource).toContain("window.turnstile.reset(this.turnstileWidget)");
    expect(contactSource).toContain("this.renderTurnstile();");
    expect(contactSource).toContain(
      "this.setState({ phase: 'failed', token: '' }, this.retryTurnstile);",
    );
    expect(contactSource).toContain("idempotencyKey: this.state.idempotencyKey");
    expect(contactSource).not.toContain(
      "phase: 'failed', token: '', idempotencyKey: crypto.randomUUID()",
    );
  });

  it("contains only confirmed direct-contact destinations and no simulated contact content", () => {
    expect(contactSource).toContain('href="mailto:info@vamostaxi.eu"');
    expect(contactSource).toContain(">info@vamostaxi.eu<");
    expect(contactSource).toContain('href="tel:+41796267082"');
    expect(contactSource).toContain('href="https://wa.me/41796267082"');

    for (const forbidden of [
      "Bleicherstrasse 16",
      "8953 Dietikon ZH",
      "Registered office",
      "Live chat",
      "Chat hours",
      "Start a chat",
      "Support email",
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

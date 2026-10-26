// Google Consent Mode v2 advanced (owner 2026-10-26): default denied before GTM and gtag, then the saved choice and
// every `vamos:consent` event. Google only: Meta keeps counting every visit (2026-10-19).
import { describe, expect, it } from "vitest";
import { CONSENT, SiteTagsHead } from "@/components/tags/SiteTags";
// @ts-expect-error plain .mjs build script, no types
import { CONSENT_HEAD, TAGS_HEAD } from "../../../../../scripts/dc-page-base.mjs";

type El = { props: { dangerouslySetInnerHTML?: { __html: string }; src?: string } };

describe("Google consent default", () => {
  it("is the first head script on Next pages, before GTM and gtag.js", () => {
    const kids = (SiteTagsHead() as { props: { children: El[] } }).props.children;
    expect(kids[0]!.props.dangerouslySetInnerHTML!.__html).toBe(CONSENT);
    expect(kids[1]!.props.dangerouslySetInnerHTML!.__html).toContain("GTM-KPKGT4VH");
  });

  it("denies every Google storage by default and maps Analytics and Marketing on update", () => {
    expect(CONSENT).toMatch(
      /gtag\('consent','default',\{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied'/,
    );
    expect(CONSENT).toContain("analytics_storage:a?'granted':'denied'");
    for (const k of ["ad_storage", "ad_user_data", "ad_personalization"]) {
      expect(CONSENT).toContain(`${k}:m?'granted':'denied'`);
    }
    expect(CONSENT).toContain("addEventListener('vamos:consent'");
    expect(CONSENT).toContain("/api/consent/state");
    // the server record wins: no saved choice for this policy version puts Google back to denied
    expect(CONSENT).toContain("apply(j.chosen===true?j.choice:{analytics:false,marketing:false})");
    expect(CONSENT.indexOf("vamosCookieConsent")).toBeLessThan(CONSENT.indexOf("/api/consent/state"));
  });

  it("leaves Meta alone", () => {
    expect(CONSENT).not.toMatch(/fbq/);
  });

  it("mock pages carry the same script first", () => {
    expect(CONSENT_HEAD).toBe(`<script>${CONSENT}</script>\n`);
    expect(TAGS_HEAD.startsWith(CONSENT_HEAD)).toBe(true);
    expect(TAGS_HEAD.indexOf("GTM-KPKGT4VH")).toBeGreaterThan(CONSENT_HEAD.length - 1);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToString } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { AccountChoice, type AccountChoiceProps } from "./AccountChoice";
import { CheckoutSignIn, type CheckoutSignInProps } from "./CheckoutSignIn";
import {
  emailProblem,
  linkBody,
  requestCodeSignIn,
  requestSignInLink,
  type FetchLike,
} from "./account-sign-in-api";

const LOCALES = ["en", "de", "fr", "ar"] as const;
type L = (typeof LOCALES)[number];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(resolve(__dirname, `../../i18n/messages/${l}.json`), "utf8"))]),
) as Record<L, Record<string, unknown>>;

// The owner-approved texts, read from the decision file, never retyped.
const decision = readFileSync(resolve(__dirname, "../../../../.planning/decisions/2026-09-29-checkout-account-notice.md"), "utf8");
function cell(title: string, l: string) {
  const row = decision.split(`## ${title}`)[1]!.split("\n").find((r) => r.startsWith(`| ${l} |`))!;
  return row.split("|")[2]!.trim();
}

function render(el: ReactElement, locale: L = "en") {
  return renderToString(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      {el}
    </NextIntlClientProvider>,
  );
}
const decode = (s: string) =>
  s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const text = (html: string) => decode(html.replace(/<[^>]*>/g, ""));

const base: AccountChoiceProps = {
  value: "guest",
  onChange: () => {},
  guestAccountsOn: true,
  createAvailable: true,
  createConsent: false,
  onCreateConsent: () => {},
  createConsentError: null,
  error: null,
  disabled: false,
};
const radios = (html: string) => html.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];
const boxes = (html: string) => html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];

describe("AccountChoice", () => {
  it("radiogroup labelled by the kicker, three native radios, guest checked", () => {
    const html = render(<AccountChoice {...base} />);
    expect(html).toContain('role="radiogroup"');
    expect(html).toMatch(/aria-labelledby="([^"]+)-kicker"/);
    expect(text(html)).toContain("Choose how to continue");
    const r = radios(html);
    expect(r).toHaveLength(3);
    expect(r.filter((x) => /checked/.test(x))).toHaveLength(1);
    expect(r[0]).toMatch(/value="guest"/);
    expect(r[0]).toMatch(/checked/);
    expect(html).toContain('data-selected="true"');
  });

  it("guest never has a tick box; Text 2 shows verbatim when the switch is on (all languages)", () => {
    for (const l of LOCALES) {
      const html = render(<AccountChoice {...base} />, l);
      expect(boxes(html)).toHaveLength(0);
      expect(text(html)).toContain(cell("Text 2", l));
    }
  });

  it("switch off: no Text 2 and no box (D-09)", () => {
    const html = render(<AccountChoice {...base} guestAccountsOn={false} />);
    expect(text(html)).not.toContain(cell("Text 2", "en"));
    expect(html).not.toContain('data-acct-note="guest"');
    expect(boxes(html)).toHaveLength(0);
  });

  it("createAvailable=false: two radios, and an incoming create is treated as guest", () => {
    const html = render(<AccountChoice {...base} createAvailable={false} value="create" />);
    const r = radios(html);
    expect(r).toHaveLength(2);
    expect(html).not.toContain('value="create"');
    expect(r[0]).toMatch(/checked/);
    expect(boxes(html)).toHaveLength(0);
  });

  it("create: info line, exactly one unticked box, label equals Text 1, links to terms and privacy (all languages)", () => {
    for (const l of LOCALES) {
      const html = render(<AccountChoice {...base} value="create" />, l);
      const b = boxes(html);
      expect(b).toHaveLength(1);
      expect(b[0]).not.toMatch(/checked/);
      expect(html).toContain('data-acct-note="create"');
      const consent = html.slice(html.indexOf('data-acct-consent'));
      const label = consent.match(/<span class="vt-check__text"><span>([\s\S]*?)<\/span><\/span><\/label>/)![1];
      expect(text(label!)).toBe(cell("Text 1", l));
      // 26.2 audit U06-16: English has no /en prefix (it answers 308); de/fr/ar keep theirs.
      const pre = l === "en" ? "" : `/${l}`;
      expect(html).toContain(`href="${pre}/terms"`);
      expect(html).toContain(`href="${pre}/privacy"`);
    }
  });

  it("create: the box never disables the radios or the option", () => {
    const html = render(<AccountChoice {...base} value="create" createConsent={false} />);
    expect(radios(html).some((x) => /disabled/.test(x))).toBe(false);
    expect(boxes(html)[0]!).not.toMatch(/disabled/);
  });

  it("create ticked renders checked", () => {
    const html = render(<AccountChoice {...base} value="create" createConsent />);
    expect(boxes(html)[0]!).toMatch(/checked/);
  });

  it("consent error: aria-invalid, aria-describedby pointing at a red line with circle-alert", () => {
    const html = render(<AccountChoice {...base} value="create" createConsentError="Tick the box to accept the Terms and confirm the Privacy notice." />);
    const b = boxes(html)[0]!;
    expect(b).toMatch(/aria-invalid="true"/);
    const id = b.match(/aria-describedby="([^"]+)"/)![1];
    expect(html).toContain(`id="${id}"`);
    expect(html).toContain("circle-alert");
    expect(text(html)).toContain("Tick the box to accept the Terms");
  });

  it("group error: line with circle-alert, group describedby it", () => {
    const html = render(<AccountChoice {...base} error="Sign in first, or continue as a guest." />);
    const id = html.match(/role="radiogroup"[^>]*aria-describedby="([^"]+)"/)![1];
    expect(html).toContain(`id="${id}"`);
    expect(html).toContain("circle-alert");
  });

  it("disabled: every radio disabled", () => {
    const html = render(<AccountChoice {...base} disabled />);
    expect(radios(html).every((x) => /disabled/.test(x))).toBe(true);
    expect(html).toContain('data-disabled="true"');
  });

  it("sign in: children are the expansion", () => {
    const html = render(
      <AccountChoice {...base} value="signin">
        <p>EXPANSION</p>
      </AccountChoice>,
    );
    expect(html).toContain("EXPANSION");
    expect(render(<AccountChoice {...base}><p>EXPANSION</p></AccountChoice>)).not.toContain("EXPANSION");
  });

  it("no data-tok and no password field in any state", () => {
    for (const v of ["guest", "signin", "create"] as const) {
      const html = render(<AccountChoice {...base} value={v} />);
      expect(html).not.toContain("data-tok");
      expect(html).not.toContain('type="password"');
    }
  });
});

const si: CheckoutSignInProps = {
  email: "guest@example.com",
  onEmail: () => {},
  locale: "en",
  returnTo: "/checkout?class=economy",
  turnstileSiteKey: "site-key",
  stage: "form",
  onStage: () => {},
  onSignedIn: () => {},
  payBlockError: null,
  disabled: false,
};

describe("CheckoutSignIn render", () => {
  it("form stage: email field, hint, send button, more-ways link, no password field", () => {
    const html = render(<CheckoutSignIn {...si} />);
    expect(html).toContain('data-acct-signin="form"');
    expect(html).toContain('type="email"');
    expect(html).not.toContain('type="password"');
    const t = text(html);
    expect(t).toContain("Use the email on your account");
    expect(t).toContain("Email me a sign-in link");
    expect(html).toContain(`href="/sign-in?returnTo=${encodeURIComponent(si.returnTo)}"`);
  });

  it("sending: label changes, aria-busy, disabled", () => {
    const html = render(<CheckoutSignIn {...si} previewState="sending" />);
    expect(text(html)).toContain("Sending link");
    expect(html).toMatch(/<button[^>]*aria-busy="true"[^>]*>|<button[^>]*disabled[^>]*aria-busy/);
  });

  it("sent stage: heading in a polite live region, email echo keeps LTR, code field, hint", () => {
    const html = render(<CheckoutSignIn {...si} stage="sent" />);
    expect(html).toMatch(/role="status"[^>]*aria-live="polite"|aria-live="polite"[^>]*role="status"/);
    const t = text(html);
    expect(t).toContain("Check your inbox — we sent a sign-in link");
    expect(t).toContain("Sent to guest@example.com");
    expect(html).toContain('class="vt-dir-keep">guest@example.com');
    expect(html).toContain('inputMode="numeric"');
    expect(html).toContain('autoComplete="one-time-code"');
    expect(t).toContain("Nothing there? Check spam, send another link, or continue as a guest.");
    expect(t).toContain("Use a different email");
    expect(html).not.toContain('type="password"');
  });

  it("sent stage: SEND ANOTHER LINK is disabled until the sent-stage widget has produced a token", () => {
    const html = render(<CheckoutSignIn {...si} stage="sent" />);
    const btn = html.match(/<button[^>]*>(?:(?!<\/button>)[\s\S])*Send another link/)![0];
    expect(btn).toMatch(/disabled/);
  });

  it("sent stage: payBlockError under the heading", () => {
    const html = render(<CheckoutSignIn {...si} stage="sent" payBlockError="Open the sign-in link we sent, then pay." />);
    expect(html.indexOf("Check your inbox")).toBeLessThan(html.indexOf("Open the sign-in link we sent"));
  });

  it("sent stage is identical for any email the server might know (no branch on it)", () => {
    const a = render(<CheckoutSignIn {...si} stage="sent" email="known@example.com" />).replaceAll("known@example.com", "X");
    const b = render(<CheckoutSignIn {...si} stage="sent" email="unknown@example.org" />).replaceAll("unknown@example.org", "X");
    expect(a).toBe(b);
  });

  it("states: resent, rate limited, send failed, code error", () => {
    expect(text(render(<CheckoutSignIn {...si} stage="sent" previewState="resent" />))).toContain("Sent again just now.");
    expect(text(render(<CheckoutSignIn {...si} stage="sent" previewState="rate-limited" />))).toContain("Too many tries. Wait a minute and try again.");
    expect(text(render(<CheckoutSignIn {...si} previewState="rate-limited" />))).toContain("Too many tries. Wait a minute and try again.");
    expect(text(render(<CheckoutSignIn {...si} previewState="send-failed" />))).toContain("The link did not send. Try again.");
    expect(text(render(<CheckoutSignIn {...si} stage="sent" previewState="code-error" />))).toContain("Check the code. It is 6 digits and works for one hour.");
  });

  it("all four languages render the sent stage without falling back to keys", () => {
    for (const l of LOCALES) {
      const html = render(<CheckoutSignIn {...si} locale={l} stage="sent" />, l);
      expect(html).not.toMatch(/acct[A-Z]/);
    }
  });
});

function fakeFetch(status: number, body: unknown, log?: { body: Record<string, unknown>; init?: RequestInit }[]): FetchLike {
  return async (_url, init) => {
    log?.push({ body: JSON.parse(String(init?.body)), init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
}
const req = { locale: "en", returnTo: "/checkout", email: "a@b.co", turnstileToken: "t1" };

describe("checkout sign-in requests", () => {
  it("link body is exactly the contract and never carries createUser", () => {
    expect(linkBody(req)).toEqual({
      locale: "en",
      returnTo: "/checkout",
      method: "magic",
      mode: "signin",
      email: "a@b.co",
      origin: "checkout",
      turnstileToken: "t1",
    });
    expect(JSON.stringify(linkBody(req))).not.toContain("createUser");
  });

  it("posts same-origin JSON to /api/auth; 200 sent -> sent", async () => {
    const log: { body: Record<string, unknown>; init?: RequestInit }[] = [];
    expect(await requestSignInLink(fakeFetch(200, { stage: "sent" }, log), req)).toBe("sent");
    expect(log[0]!.init?.method).toBe("POST");
    expect(log[0]!.init?.credentials).toBe("same-origin");
  });

  it("429 -> rate_limited; 400/403 send_failed and network error -> failed", async () => {
    expect(await requestSignInLink(fakeFetch(429, { ok: false, reason: "rate-limited" }), req)).toBe("rate_limited");
    expect(await requestSignInLink(fakeFetch(400, { stage: "form", banner: "send_failed" }), req)).toBe("failed");
    expect(await requestSignInLink(fakeFetch(403, { stage: "form", banner: "send_failed" }), req)).toBe("failed");
    expect(await requestSignInLink(async () => { throw new Error("net"); }, req)).toBe("failed");
  });

  it("resend carries the fresh token it is given, not the first one", async () => {
    const log: { body: Record<string, unknown> }[] = [];
    const f = fakeFetch(200, { stage: "sent" }, log);
    await requestSignInLink(f, req);
    await requestSignInLink(f, { ...req, turnstileToken: "t2" });
    expect(log[0]!.body.turnstileToken).toBe("t1");
    expect(log[1]!.body.turnstileToken).toBe("t2");
    expect(log[1]!.body.turnstileToken).not.toBe(log[0]!.body.turnstileToken);
  });

  it("code sign-in posts verify-code; ok / code-invalid / 429", async () => {
    const log: { body: Record<string, unknown> }[] = [];
    const c = { locale: "en", email: "a@b.co", code: "123456" };
    expect(await requestCodeSignIn(fakeFetch(200, { ok: true }, log), c)).toBe("ok");
    expect(log[0]!.body).toEqual({ locale: "en", mode: "verify-code", email: "a@b.co", code: "123456" });
    expect(await requestCodeSignIn(fakeFetch(400, { ok: false, reason: "code-invalid" }), c)).toBe("invalid");
    expect(await requestCodeSignIn(fakeFetch(429, { ok: false, reason: "rate-limited" }), c)).toBe("rate_limited");
    expect(await requestCodeSignIn(async () => { throw new Error("net"); }, c)).toBe("failed");
  });

  it("email checks", () => {
    expect(emailProblem("")).toBe("empty");
    expect(emailProblem("  ")).toBe("empty");
    expect(emailProblem("nope")).toBe("shape");
    expect(emailProblem("a@b.co")).toBeNull();
  });
});

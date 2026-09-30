// apps/web/lib/checkout/phase-26-5-laws.test.ts
//
// Plan 26.5-06 Task 3: source guards for the account choice on /checkout.
// Reads files as text. Laws that need the wiring in CheckoutForm / ContactSection /
// checkout.css (plan 06 Task 2, held while 26.4.2 owns those files) are `it.todo` with the
// exact assertion in a comment; turn each into a real `it` when the wiring lands.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..", "..");
const WEB = join(REPO, "apps", "web");
const CHECKOUT_APP = join(WEB, "app", "[locale]", "checkout");
const CHECKOUT_COMPONENTS = join(WEB, "components", "checkout");
const DECISION = join(REPO, ".planning", "decisions", "2026-09-29-checkout-account-notice.md");

const LOCALES = ["en", "de", "fr", "ar"] as const;
type Msgs = { checkout: Record<string, string> };
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(join(WEB, "i18n", "messages", `${l}.json`), "utf8")) as Msgs]),
) as Record<(typeof LOCALES)[number], Msgs>;

const read = (p: string) => readFileSync(p, "utf8");

/** Drops block and line comments so prose that names a banned thing does not trip a rule. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .map((l) => l.replace(/(^|[^:"'`\\])\/\/[^\n]*$/, "$1"))
    .join("\n");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".next")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(full);
  }
  return out;
}

const PANEL_FILES = [
  join(CHECKOUT_COMPONENTS, "AccountChoice.tsx"),
  join(CHECKOUT_COMPONENTS, "CheckoutSignIn.tsx"),
  join(CHECKOUT_APP, "sections", "ContactSection.tsx"),
];

describe("26.5 laws: no password field (D-03)", () => {
  it("no type=\"password\" in the panel components or section 2", () => {
    for (const f of PANEL_FILES) expect(stripComments(read(f)), relative(REPO, f)).not.toMatch(/type=["']password["']/);
  });
  it("no type=\"password\" anywhere under app/[locale]/checkout or components/checkout", () => {
    for (const f of [...walk(CHECKOUT_APP), ...walk(CHECKOUT_COMPONENTS)]) {
      expect(stripComments(read(f)), relative(REPO, f)).not.toMatch(/type=["']password["']/);
    }
  });
});

describe("26.5 laws: no glow, no tint, no yellow, tokens only", () => {
  const BANNED: [string, RegExp][] = [
    ["tinted yellow", /yellow-(50|100|200|300|600|700)\b/],
    ["accent shadow", /shadow-accent/],
    ["gradient", /gradient\s*\(/],
    ["raw hex", /#[0-9a-fA-F]{3,8}\b/],
    ["yellow token", /--vt-(accent|yellow)/],
  ];

  it("account-choice.css is clean", () => {
    const css = stripComments(read(join(CHECKOUT_COMPONENTS, "account-choice.css")));
    for (const [name, re] of BANNED) expect(css, name).not.toMatch(re);
  });

  it("the account rules in checkout.css (selectors naming data-co-account) are clean", () => {
    const css = stripComments(read(join(CHECKOUT_APP, "checkout.css")));
    const blocks = css.match(/[^{}]*data-co-account[^{}]*\{[^}]*\}/g) ?? [];
    for (const block of blocks) for (const [name, re] of BANNED) expect(block, name).not.toMatch(re);
  });

  it("panel TSX has no tone=\"accent\" / tone=\"warning\" and no inline colour", () => {
    for (const f of PANEL_FILES) {
      const src = stripComments(read(f));
      expect(src, relative(REPO, f)).not.toMatch(/tone=["'](accent|warning)["']/);
      expect(src, relative(REPO, f)).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    }
  });

  it.todo(
    "checkout.css account rules use logical properties only: within the blocks selecting [data-co-account*], " +
      "expect(block).not.toMatch(/(^|[;{\\s])(margin|padding)-(left|right)\\b|(^|[;{\\s])(left|right)\\s*:|text-align\\s*:\\s*(left|right)/)",
  );
  it.todo(
    "checkout.css has at least one [data-co-account] rule once wired: expect(css).toMatch(/\\[data-co-account/)",
  );
});

describe("26.5 laws: no data-tok pill in the panel (D-11)", () => {
  it("AccountChoice and ContactSection carry no data-tok", () => {
    for (const f of [join(CHECKOUT_COMPONENTS, "AccountChoice.tsx"), join(CHECKOUT_APP, "sections", "ContactSection.tsx")]) {
      expect(stripComments(read(f)), relative(REPO, f)).not.toMatch(/data-tok/);
    }
  });
});

describe("26.5 laws: owner texts verbatim (D-11)", () => {
  const decision = read(DECISION);
  const cell = (title: string, l: string) => {
    const row = decision
      .split(`## ${title}`)[1]!
      .split("\n")
      .find((r) => r.startsWith(`| ${l} |`))!;
    return row.split("|")[2]!.trim();
  };
  const stripTags = (s: string) => s.replace(/<[^>]+>/g, "");

  for (const l of LOCALES) {
    it(`Text 1 (${l}) equals the decision file once rich tags are stripped`, () => {
      expect(stripTags(messages[l].checkout.acctCreateNotice!)).toBe(cell("Text 1", l));
    });
    it(`Text 2 (${l}) equals the decision file`, () => {
      expect(messages[l].checkout.acctGuestNotice).toBe(cell("Text 2", l));
    });
  }

  it("the notice version is the approval date", () => {
    expect(read(join(WEB, "lib", "checkout", "account-notice.ts"))).toMatch(
      /ACCOUNT_NOTICE_VERSION\s*=\s*"2026-09-29"/,
    );
  });
});

describe("26.5 laws: every checkout.acct* key in four languages", () => {
  const keys = Object.keys(messages.en.checkout).filter((k) => k.startsWith("acct"));
  it("there are keys", () => expect(keys.length).toBeGreaterThanOrEqual(32));
  for (const l of LOCALES) {
    it(`${l}: every key exists, is non-empty${l === "de" ? ", has no ß" : ""}`, () => {
      for (const k of keys) {
        const v = messages[l].checkout[k];
        expect(typeof v, `${l}.${k}`).toBe("string");
        expect((v as string).trim(), `${l}.${k}`).not.toBe("");
        if (l === "de") expect(v as string, `de.${k}`).not.toMatch(/ß/);
      }
    });
  }
  it("the D-20 and PAY-failure messages exist in four languages", () => {
    for (const l of LOCALES) {
      for (const k of ["payLimit", "payRateLimited", "payStartFailed"]) {
        expect(messages[l].checkout[k]?.trim(), `${l}.${k}`).toBeTruthy();
      }
    }
  });
});

describe("26.5 laws: server-only boundaries (D-14)", () => {
  it("provision-account.ts never writes a signup_consent string", () => {
    expect(stripComments(read(join(WEB, "lib", "checkout", "provision-account.ts")))).not.toMatch(/signup_consent/);
  });

  it("the checkout sign-in never creates a user from the client path", () => {
    expect(read(join(WEB, "lib", "auth", "checkout-sign-in.ts"))).toMatch(/createUser:\s*false/);
  });

  it("no \"use client\" file under the checkout route or components imports account-notice, provision-account or lib/supabase", () => {
    const FORBIDDEN = /from\s+["'][^"']*(account-notice|provision-account|lib\/supabase|\.\.\/supabase\/)[^"']*["']/;
    for (const f of [...walk(CHECKOUT_APP), ...walk(CHECKOUT_COMPONENTS)]) {
      const src = read(f);
      if (!/^\s*["']use client["']/.test(src)) continue;
      expect(stripComments(src), relative(REPO, f)).not.toMatch(FORBIDDEN);
    }
  });

  it("account-pay.ts (imported by the client form) imports none of them either", () => {
    expect(stripComments(read(join(WEB, "lib", "checkout", "account-pay.ts")))).not.toMatch(
      /from\s+["'][^"']*(account-notice|provision-account|supabase)[^"']*["']/,
    );
  });
});

describe("26.5 laws: needs the plan 06 wiring (held while 26.4.2 owns the checkout files)", () => {
  it.todo(
    "ContactSection mounts the panel: expect(read(ContactSection.tsx)).toMatch(/<AccountChoice/) and /<CheckoutSignIn/, " +
      "and the AccountChoice element appears before the first contact <Input in the file",
  );
  it.todo(
    "the header sign-in link is dropped while the panel shows: in ContactSection.tsx the signInLink anchor is only " +
      "rendered inside a branch guarded by the signed-in / no-panel condition (assert signInLink is not passed to SectionCard headerEnd when signedInEmail is null)",
  );
  it.todo(
    "CheckoutSettings carries both switches as booleans: expect(read(CheckoutSettings.tsx)).toMatch(/guestAccountsOn:\\s*boolean/) " +
      "and /accountCreateAvailable:\\s*boolean/",
  );
  it.todo(
    "CheckoutPage fills them from the server helpers and never imports lib/supabase: " +
      "expect(src).toMatch(/guestAccountsOn\\(/) and /accountCreateAvailable\\(/) and expect(src).not.toMatch(/lib\\/supabase/)",
  );
  it.todo(
    "PAY builds the account block through the tested helper: expect(read(CheckoutForm.tsx)).toMatch(/accountIntentBlock\\(/) " +
      "and /mapAccountCode\\(/ and /firstSectionError\\(/ (called with an `account:` state)",
  );
  it.todo(
    "FIELD_SELECTOR names the three new fields: expect(src).toMatch(/\\[data-co-account\\]/), /\\[data-co-account-sent\\]/, /\\[data-co-account-consent\\]/",
  );
  it.todo(
    "PAY is never disabled by the tick: in ContactSection/CheckoutForm no `disabled={...createConsent...}` on the PAY button " +
      "(expect(src).not.toMatch(/disabled=\\{[^}]*createConsent/))",
  );
  it.todo(
    "return_to comes from this page: expect(read(CheckoutForm.tsx)).toMatch(/location\\.pathname\\s*\\+\\s*location\\.search|returnTo:/)",
  );
  it.todo(
    "changing the e-mail resets the Create tick: setContact({ email }) path calls setCreateConsent(false) " +
      "(expect(src).toMatch(/setCreateConsent\\(false\\)/) at least twice: e-mail change and Use a different email)",
  );
  it.todo(
    "signed-in state is re-read on window focus: expect(src).toMatch(/addEventListener\\(\\s*[\"']focus[\"']/) near /api/checkout/me",
  );
  it.todo(
    "D-20 messages are shown: expect(src).toMatch(/payLimit/) and /payRateLimited/ (via mapAccountCode's payError key)",
  );
});

describe("26.5 laws: fixture sanity", () => {
  it("the decision file exists", () => expect(existsSync(DECISION)).toBe(true));
});

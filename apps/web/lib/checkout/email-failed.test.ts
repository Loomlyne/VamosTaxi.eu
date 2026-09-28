import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const SENTENCES = {
  en: "The pay link was not sent. The booking is saved. Send the link again.",
  de: "Der Zahllink wurde nicht gesendet. Die Buchung ist gespeichert. Senden Sie den Link erneut.",
  fr: "Le lien de paiement n'a pas été envoyé. La réservation est enregistrée. Renvoyez le lien.",
  ar: "لم يُرسل رابط الدفع. الحجز موجود. أعد إرسال الرابط.",
} as const;

// sendPayLink no longer falls back to payCouldNotStart: an unknown code sets no
// refusal (b2af7ce). The lookup itself is what must still resolve email_failed.
const NOT_OK_LINE = 'REFUSAL_KEYS[json.code ?? json.error ?? ""];';
const NOT_OK_GUARD = 'if (key && key !== "payCouldNotStart") setRefusal(key);';

function checkout(locale: keyof typeof SENTENCES): Record<string, string> {
  const raw = readFileSync(join(here, `../../i18n/messages/${locale}.json`), "utf8");
  return JSON.parse(raw).checkout as Record<string, string>;
}

function refusalMap(src: string): Record<string, string> {
  const start = src.indexOf("const REFUSAL_KEYS");
  const end = src.indexOf("};", start);
  const block = src.slice(start, end);
  const map: Record<string, string> = {};
  for (const match of block.matchAll(/([a-z_]+):\s*"([A-Za-z]+)"/g)) {
    map[match[1]!] = match[2]!;
  }
  return map;
}

function sendPayLinkNotOkLine(src: string): string {
  const fnStart = src.indexOf("async function sendPayLink()");
  const fnEnd = src.indexOf("async function onPay()", fnStart);
  const fn = src.slice(fnStart, fnEnd);
  const notOk = fn.indexOf("if (!res.ok)");
  const branchEnd = fn.indexOf("if (json.reference)", notOk);
  const branch = fn.slice(notOk, branchEnd);
  const line = branch.split("\n").find((row) => row.includes(NOT_OK_LINE));
  if (!line) throw new Error("sendPayLink not-ok lookup line missing");
  return line;
}

describe("checkout.emailFailed", () => {
  for (const locale of ["en", "de", "fr", "ar"] as const) {
    it(`${locale} is the email-failed sentence, not payCouldNotStart`, () => {
      const copy = checkout(locale);
      expect(copy.emailFailed).toBe(SENTENCES[locale]);
      expect(copy.emailFailed).not.toBe(copy.payCouldNotStart);
      expect(copy.emailFailed).not.toContain("CHF");
    });
  }

  it("German has no ß", () => {
    expect(checkout("de").emailFailed).not.toContain("ß");
  });
});

describe("email_failed does not select payCouldNotStart", () => {
  const client = readFileSync(join(here, "../../app/[locale]/checkout/CheckoutClient.tsx"), "utf8");

  it("REFUSAL_KEYS maps email_failed to emailFailed", () => {
    const map = refusalMap(client);
    expect(map.email_failed).toBe("emailFailed");
    expect(map.email_failed).not.toBe("payCouldNotStart");
    const start = client.indexOf("const REFUSAL_KEYS");
    const block = client.slice(start, client.indexOf("};", start));
    expect(block).toContain('email_failed: "emailFailed"');
    expect(block).not.toContain('email_failed: "payCouldNotStart"');
  });

  it("sendPayLink not-ok line resolves email_failed to emailFailed", () => {
    const line = sendPayLinkNotOkLine(client);
    expect(line).toContain(NOT_OK_LINE);
    const fnStart = client.indexOf("async function sendPayLink()");
    const fn = client.slice(fnStart, client.indexOf("async function onPay()", fnStart));
    expect(fn).toContain(NOT_OK_GUARD);
    const map = refusalMap(client);
    const json = { code: "email_failed", error: "email_failed" };
    const key = map[json.code ?? json.error ?? ""];
    expect(key).toBe("emailFailed");
    expect(key).not.toBe("payCouldNotStart");
    expect(map["not_a_code"]).toBeUndefined();
  });

  it("pay-link route still returns 502 email_failed", () => {
    const src = readFileSync(join(here, "../../app/api/checkout/pay-link/route.ts"), "utf8");
    const line = src.split("\n").find((row) => row.includes("email_failed"));
    expect(line).toBeDefined();
    expect(line).toMatch(/error:\s*"email_failed"/);
    expect(line).toMatch(/code:\s*"email_failed"/);
    expect(line).toMatch(/status:\s*502/);
  });
});

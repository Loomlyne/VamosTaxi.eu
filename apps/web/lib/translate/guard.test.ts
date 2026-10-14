import { describe, expect, it } from "vitest";
import { guardOutput, type GuardRejectReason } from "./guard";
import { mask } from "./mask";

function run(lang: string, source: string, output: string) {
  const { masked, tokens } = mask(source);
  return guardOutput({ lang, source, masked, tokens, output });
}

function expectReject(lang: string, source: string, output: string, reason: GuardRejectReason) {
  const r = run(lang, source, output);
  expect(r).toEqual({ ok: false, reason });
}

const DRIVER = "Your driver VT-26-0753 waits at ZRH for flight LX 318";

describe("guardOutput accepts", () => {
  it("a clean German answer and restores every token", () => {
    expect(run("de", DRIVER, "Ihr Fahrer ⟦0⟧ wartet in ⟦1⟧ auf Flug ⟦2⟧")).toEqual({
      ok: true,
      text: "Ihr Fahrer VT-26-0753 wartet in ZRH auf Flug LX 318",
    });
  });

  it("an Arabic answer, with Arabic-Indic digits turned Western", () => {
    expect(run("ar", "Waiting time 60 minutes", "وقت الانتظار ٦٠ دقيقة")).toEqual({
      ok: true,
      text: "وقت الانتظار 60 دقيقة",
    });
  });

  it("a German answer with ß, turned into ss", () => {
    expect(run("de", "Main street entrance", "Eingang Hauptstraße")).toEqual({ ok: true, text: "Eingang Hauptstrasse" });
  });

  it("a short source equal to the output (loanword) and skips the ratio for 3 chars or fewer", () => {
    expect(run("fr", "Taxi", "Taxi")).toEqual({ ok: true, text: "Taxi" });
    expect(run("de", "OK", "In Ordnung, alles klar")).toEqual({ ok: true, text: "In Ordnung, alles klar" });
  });

  it("an ICU message with the same arguments", () => {
    const source = "{count, plural, one {# trip} other {# trips}}";
    const { masked } = mask(source);
    const out = masked.replace(" trips", " Fahrten").replace(" trip", " Fahrt");
    expect(run("de", source, out)).toEqual({ ok: true, text: "{count, plural, one {# Fahrt} other {# Fahrten}}" });
  });

  it("a URL that was in the source", () => {
    expect(run("de", "See https://vamostaxi.site for details", "Details unter ⟦0⟧")).toEqual({
      ok: true,
      text: "Details unter https://vamostaxi.site",
    });
  });
});

describe("guardOutput rejects", () => {
  it("a lost token", () => expectReject("de", DRIVER, "Ihr Fahrer ⟦0⟧ wartet in ⟦1⟧ auf Ihren Flug", "tokens"));
  it("a duplicated token", () => expectReject("de", DRIVER, "Ihr Fahrer ⟦0⟧ ⟦0⟧ wartet in ⟦1⟧ auf Flug ⟦2⟧", "tokens"));
  it("an unknown token", () => expectReject("de", DRIVER, "Ihr Fahrer ⟦0⟧ wartet in ⟦1⟧ auf Flug ⟦2⟧ ⟦3⟧", "tokens"));

  it("a changed digit outside the tokens", () =>
    expectReject("de", "Waiting time 60 minutes included", "Wartezeit 90 Minuten inbegriffen", "digits"));

  it("a length ratio outside the bounds", () => {
    expectReject("de", "Your driver is waiting at the meeting point", "Fahrer", "length");
    expectReject("fr", "Your driver", "Votre chauffeur vous attend au point de rendez-vous avec un panneau", "length");
    expectReject("ar", "Your driver is waiting at the meeting point now", "سائق", "length");
  });

  it("Arabic output with no Arabic letter", () =>
    expectReject("ar", "Your driver is waiting", "Your driver is waiting here", "script"));

  it("German or French output equal to a source longer than 2 words", () => {
    expectReject("de", "Your driver is waiting", "Your driver is waiting", "untranslated");
    expectReject("fr", "Your driver is waiting", "Your driver is waiting", "untranslated");
  });

  it.each([
    "Sure, here it is: Ihr Fahrer wartet",
    "Here is the translation: Ihr Fahrer wartet",
    "Voici : Votre chauffeur attend",
    "Hier ist die Übersetzung: Ihr Fahrer wartet",
    "Certainly! Ihr Fahrer wartet",
    "```Ihr Fahrer wartet```",
    "I can't translate this text",
  ])("a preamble, fence or refusal: %s", (out) => expectReject("de", "Your driver is waiting for you", out, "preamble"));

  it("an ICU signature that differs", () => {
    const source = "{count, plural, one {# trip} other {# trips}}";
    const { masked } = mask(source);
    expectReject("de", source, masked.replace(" trips", " Fahrten {extra}").replace(" trip", " Fahrt"), "icu");
  });

  it("ß that survives inside a restored span", () =>
    expectReject("de", "Bring the <span data-tok>Maß</span> with you", "Bringen Sie ⟦0⟧ mit", "eszett"));

  it("a URL or e-mail address the source did not have", () => {
    expectReject("de", "Your driver is waiting for you", "Ihr Fahrer wartet, siehe https://evil.example", "link");
    expectReject("fr", "Your driver is waiting for you", "Votre chauffeur attend: ecrire a x@evil.example", "link");
  });
});

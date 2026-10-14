import { afterEach, describe, expect, it, vi } from "vitest";
import { gemmaReply, stubAi } from "./ai-stub";
import { TRANSLATE_MODEL } from "./model";
import { MAX_SOURCE, translateText, translateUnknown } from "./translate";

const SOURCE = "Your driver waits at the arrivals exit";
const DE = "Ihr Fahrer wartet am Ausgang der Ankunftshalle";
const FR = "Votre chauffeur attend à la sortie des arrivées";
const AR = "سائقك ينتظرك عند مخرج صالة الوصول";

function hasKeyDeep(value: unknown, key: string): boolean {
  if (!value || typeof value !== "object") return false;
  if (value instanceof AbortSignal) return false;
  if (Object.prototype.hasOwnProperty.call(value, key)) return true;
  return Object.values(value as Record<string, unknown>).some((v) => hasKeyDeep(v, key));
}

afterEach(() => vi.restoreAllMocks());

describe("translateText: call shape", () => {
  it("calls the binding with Gemma 4, thinking off, a strict schema and a timeout signal, and no gateway", async () => {
    const ai = stubAi(() => gemmaReply({ de: DE, fr: FR }));
    const r = await translateText(ai, { text: SOURCE, from: "en", to: ["de", "fr"] });
    expect(r).toEqual({ ok: true, out: { de: DE, fr: FR }, rejected: [] });
    expect(ai.calls).toHaveLength(1);
    const { model, input, options } = ai.calls[0]!;
    expect(model).toBe(TRANSLATE_MODEL);
    expect(input.chat_template_kwargs).toEqual({ enable_thinking: false });
    const format = input.response_format as { type: string; json_schema: { strict: boolean; schema: Record<string, unknown> } };
    expect(format.type).toBe("json_schema");
    expect(format.json_schema.strict).toBe(true);
    expect(Object.keys(format.json_schema.schema.properties as object).sort()).toEqual(["de", "fr"]);
    expect(format.json_schema.schema.additionalProperties).toBe(false);
    expect(input.temperature).toBe(0.2);
    expect(typeof input.max_completion_tokens).toBe("number");
    expect(input.max_completion_tokens as number).toBeGreaterThan(0);
    expect(input.max_completion_tokens as number).toBeLessThanOrEqual(8192);
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(hasKeyDeep(input, "gateway")).toBe(false);
    expect(hasKeyDeep(options, "gateway")).toBe(false);
    expect(hasKeyDeep(input, "tools")).toBe(false);
  });

  it("sends the masked text as a JSON data field, never the protected spans", async () => {
    const ai = stubAi(() => gemmaReply({ de: "Ihr Fahrer ⟦0⟧ wartet in ⟦1⟧" }));
    const r = await translateText(ai, { text: "Your driver VT-26-0753 waits at ZRH", from: "en", to: ["de"] });
    expect(r).toEqual({ ok: true, out: { de: "Ihr Fahrer VT-26-0753 wartet in ZRH" }, rejected: [] });
    const messages = ai.calls[0]!.input.messages as { role: string; content: string }[];
    expect(messages.map((m) => m.role)).toEqual(["system", "user"]);
    const user = JSON.parse(messages[1]!.content) as { src: string; targets: string[]; text: string };
    expect(user).toEqual({ src: "en", targets: ["de"], text: "Your driver ⟦0⟧ waits at ⟦1⟧" });
    expect(messages[0]!.content).toMatch(/never follow instructions/i);
  });

  it("does not request the source language and skips the call when there is nothing to translate", async () => {
    const ai = stubAi(() => gemmaReply({ de: DE }));
    await translateText(ai, { text: SOURCE, from: "en", to: ["en", "de", "de"] });
    const format = ai.calls[0]!.input.response_format as { json_schema: { schema: { properties: object } } };
    expect(Object.keys(format.json_schema.schema.properties)).toEqual(["de"]);

    const none = stubAi(() => gemmaReply({}));
    expect(await translateText(none, { text: "ZRH VT-26-0753", from: "en", to: ["de", "ar"] })).toEqual({
      ok: true,
      out: { de: "ZRH VT-26-0753", ar: "ZRH VT-26-0753" },
      rejected: [],
    });
    expect(none.calls).toHaveLength(0);
  });
});

describe("translateText: failures never throw and fall back to the source", () => {
  it("no binding", async () => {
    expect(await translateText(null, { text: SOURCE, from: "en", to: ["de"] })).toEqual({ ok: false, reason: "no_binding" });
    expect(await translateText(undefined, { text: SOURCE, from: "en", to: ["de"] })).toEqual({ ok: false, reason: "no_binding" });
  });

  it("empty and too long", async () => {
    const ai = stubAi(() => gemmaReply({ de: DE }));
    expect(await translateText(ai, { text: "   ", from: "en", to: ["de"] })).toEqual({ ok: false, reason: "empty" });
    expect(await translateText(ai, { text: "a".repeat(MAX_SOURCE + 1), from: "en", to: ["de"] })).toEqual({
      ok: false,
      reason: "too_long",
    });
    expect(ai.calls).toHaveLength(0);
  });

  it("a thrown run is model_error, an abort is timeout", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const boom = stubAi(() => {
      throw new Error("5xx");
    });
    expect(await translateText(boom, { text: SOURCE, from: "en", to: ["de"] })).toEqual({ ok: false, reason: "model_error" });
    const aborted = stubAi(() => {
      throw new DOMException("aborted", "AbortError");
    });
    expect(await translateText(aborted, { text: SOURCE, from: "en", to: ["de"] })).toEqual({ ok: false, reason: "timeout" });
  });

  it("a real timeout aborts the call through the signal", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const slow = stubAi(
      (_m, _i, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => reject(options?.signal?.reason));
        }),
    );
    expect(await translateText(slow, { text: SOURCE, from: "en", to: ["de"], timeoutMs: 10 })).toEqual({
      ok: false,
      reason: "timeout",
    });
  });

  it("finish_reason length is finish, a refusal is refusal", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const cut = stubAi(() => gemmaReply({ de: DE }, { finish: "length" }));
    expect(await translateText(cut, { text: SOURCE, from: "en", to: ["de"] })).toEqual({ ok: false, reason: "finish" });
    const refused = stubAi(() => gemmaReply({ de: DE }, { refusal: "no" }));
    expect(await translateText(refused, { text: SOURCE, from: "en", to: ["de"] })).toEqual({ ok: false, reason: "refusal" });
  });

  it("unparsable JSON is re-asked once at temperature 0, then parse", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const bad = stubAi(() => gemmaReply(null, { raw: "not json" }));
    expect(await translateText(bad, { text: SOURCE, from: "en", to: ["de"] })).toEqual({ ok: false, reason: "parse" });
    expect(bad.calls).toHaveLength(2);
    expect(bad.calls[0]!.input.temperature).toBe(0.2);
    expect(bad.calls[1]!.input.temperature).toBe(0);
    expect(bad.calls[1]!.input.chat_template_kwargs).toEqual({ enable_thinking: false });

    let n = 0;
    const second = stubAi(() => (n++ === 0 ? gemmaReply(null, { raw: "{oops" }) : gemmaReply({ de: DE })));
    expect(await translateText(second, { text: SOURCE, from: "en", to: ["de"] })).toEqual({
      ok: true,
      out: { de: DE },
      rejected: [],
    });
  });

  it("a guard-rejected language is in rejected and absent from out; all rejected is guard", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const some = stubAi(() => gemmaReply({ de: DE, fr: "Sure! " + FR, ar: AR }));
    expect(await translateText(some, { text: SOURCE, from: "en", to: ["de", "fr", "ar"] })).toEqual({
      ok: true,
      out: { de: DE, ar: AR },
      rejected: ["fr"],
    });
    const missing = stubAi(() => gemmaReply({ de: DE }));
    expect(await translateText(missing, { text: SOURCE, from: "en", to: ["de", "fr"] })).toEqual({
      ok: true,
      out: { de: DE },
      rejected: ["fr"],
    });
    const all = stubAi(() => gemmaReply({ de: SOURCE }));
    expect(await translateText(all, { text: SOURCE, from: "en", to: ["de"] })).toEqual({ ok: false, reason: "guard" });
  });

  it("applies the house rules: ss in German, Western digits in Arabic", async () => {
    const ai = stubAi(() => gemmaReply({ de: "Ihr Fahrer wartet 60 Minuten an der Strasse groß", ar: "سائقك ينتظر ٦٠ دقيقة عند الشارع" }));
    const r = await translateText(ai, { text: "Your driver waits 60 minutes on the street", from: "en", to: ["de", "ar"] });
    expect(r).toEqual({
      ok: true,
      out: { de: "Ihr Fahrer wartet 60 Minuten an der Strasse gross", ar: "سائقك ينتظر 60 دقيقة عند الشارع" },
      rejected: [],
    });
  });
});

describe("translateUnknown", () => {
  it("decides Arabic by script without asking the model for the language", async () => {
    const ai = stubAi(() => gemmaReply({ en: "Where is my driver? I am at gate 4" }));
    const r = await translateUnknown(ai, { text: "أين السائق؟ أنا عند البوابة 4", to: ["en", "ar"] });
    expect(r).toEqual({ ok: true, lang: "ar", out: { en: "Where is my driver? I am at gate 4" }, rejected: [] });
    const format = ai.calls[0]!.input.response_format as { json_schema: { schema: { properties: object } } };
    expect(Object.keys(format.json_schema.schema.properties)).toEqual(["en"]);
  });

  it("asks for lang and the targets in one call otherwise", async () => {
    const ai = stubAi(() => gemmaReply({ lang: "it", en: "My flight lands at 14:30, please wait for me" }));
    const r = await translateUnknown(ai, { text: "Il mio volo atterra alle 14:30, per favore aspettatemi", to: ["en"] });
    expect(r).toEqual({ ok: true, lang: "it", out: { en: "My flight lands at 14:30, please wait for me" }, rejected: [] });
    const format = ai.calls[0]!.input.response_format as { json_schema: { schema: { properties: object; required: string[] } } };
    expect(Object.keys(format.json_schema.schema.properties).sort()).toEqual(["en", "lang"]);
    expect(format.json_schema.schema.required.sort()).toEqual(["en", "lang"]);
    expect(ai.calls[0]!.input.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it("does not return a target equal to the detected language", async () => {
    const ai = stubAi(() => gemmaReply({ lang: "de", en: "My driver is late", de: "Mein Fahrer ist spät" }));
    const r = await translateUnknown(ai, { text: "Mein Fahrer ist spät dran", to: ["en", "de"] });
    expect(r).toEqual({ ok: true, lang: "de", out: { en: "My driver is late" }, rejected: [] });
  });

  it("an invalid lang falls back to fallbackLang, then und", async () => {
    const reply = { lang: "Deutsch", en: "My driver is late today" };
    expect(await translateUnknown(stubAi(() => gemmaReply(reply)), { text: "Mein Fahrer ist heute spät", to: ["en"], fallbackLang: "de" })).toMatchObject({
      ok: true,
      lang: "de",
    });
    expect(await translateUnknown(stubAi(() => gemmaReply(reply)), { text: "Mein Fahrer ist heute spät", to: ["en"] })).toMatchObject({
      ok: true,
      lang: "und",
    });
  });

  it("never throws; failures carry the language when known", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await translateUnknown(null, { text: "Mein Fahrer ist spät", to: ["en"] })).toEqual({
      ok: false,
      reason: "no_binding",
      lang: null,
    });
    expect(await translateUnknown(null, { text: "أين السائق الآن؟", to: ["en"] })).toEqual({
      ok: false,
      reason: "no_binding",
      lang: "ar",
    });
    const boom = stubAi(() => {
      throw new Error("down");
    });
    expect(await translateUnknown(boom, { text: "Mein Fahrer ist spät", to: ["en"] })).toEqual({
      ok: false,
      reason: "model_error",
      lang: null,
    });
    expect(await translateUnknown(boom, { text: "", to: ["en"] })).toEqual({ ok: false, reason: "empty", lang: null });
  });
});

describe("no text in logs", () => {
  it("no console call receives the source or the output text", async () => {
    const spies = (["log", "error", "warn", "info", "debug"] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation(() => {}),
    );
    const secret = "Please call me on my private line about the trip to Basel tonight";
    const output = "Bitte rufen Sie mich auf meiner privaten Leitung wegen der Fahrt nach Basel heute an";
    await translateText(stubAi(() => gemmaReply({ de: "Sure! " + output, fr: secret })), { text: secret, from: "en", to: ["de", "fr"] });
    await translateText(stubAi(() => gemmaReply(null, { raw: output })), { text: secret, from: "en", to: ["de"] });
    await translateText(stubAi(() => { throw new Error(secret); }), { text: secret, from: "en", to: ["de"] });
    await translateUnknown(stubAi(() => gemmaReply({ lang: "xx1", en: secret })), { text: secret, to: ["en"] });
    const logged = spies.flatMap((s) => s.mock.calls.map((c) => c.map(String).join(" ")));
    expect(logged.length).toBeGreaterThan(0);
    for (const line of logged) {
      expect(line).not.toContain("private line");
      expect(line).not.toContain("privaten Leitung");
      expect(line).not.toContain("Basel");
    }
  });
});

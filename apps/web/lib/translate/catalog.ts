// apps/web/lib/translate/catalog.ts
//
// Phase 32 (plan 09): pure logic of the authoring-time catalog filler (`pnpm i18n:fill`). It finds the
// de/fr/ar gaps in the three repo catalogs (the site dictionary, the Next messages, the e-mail
// messages), decides which gaps may be sent to the model, and writes accepted translations back without
// touching anything else.
//
// F-05: a value that exists (non-empty string, even one equal to English) is never overwritten; the
// appliers only add missing leaves. F-01: legal wording, owner-approved and decision-cited lines,
// non-translatable and pending-value keys, data-tok copy and dictionary patterns are never gaps that
// reach the model. F-06: catalog text ships in git; nothing here runs at page load or e-mail render.
//
// Runtime note: loaded by plain Node with type stripping (scripts/i18n-fill.mjs), so only erasable
// TypeScript, relative imports only, no path alias.

export type FillLang = "de" | "fr" | "ar";
export const FILL_LANGS: readonly FillLang[] = ["de", "fr", "ar"];

export type CatalogSource = "dict" | "messages" | "emails";

export type DictEntry = { de?: string; fr?: string; ar?: string };
type LangTrees = Record<"en" | "de" | "fr" | "ar", object>;

export type Catalogs = {
  /** Site dictionary: English source text -> translations. */
  dict: Record<string, DictEntry>;
  /** Next.js messages, one parsed JSON tree per language (en carries `$meta`). */
  messages: LangTrees;
  /** E-mail messages, one parsed JSON tree per language. */
  emails: LangTrees;
  /** Dictionary patterns (regexes). An English key one of them matches is never filled. */
  dictPatterns?: RegExp[];
};

export type Gap = { source: CatalogSource; key: string; en: string; langs: FillLang[] };

/** Never-translate list: dotted keys, key prefixes and exact English texts. */
export type Deny = { keys: string[]; prefixes: string[]; texts: string[] };

/** Collapses whitespace so a text compares equal across line breaks in markup. */
export function normText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function present(v: unknown): boolean {
  return typeof v === "string" && v.length > 0;
}

/** Flattens a message tree to dotted leaf keys, skipping `$`-prefixed top-level metadata. */
export function flattenLeaves(tree: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isPlainObject(tree)) return out;
  const walk = (prefix: string, value: unknown): void => {
    if (isPlainObject(value)) {
      for (const k of Object.keys(value)) walk(`${prefix}.${k}`, value[k]);
    } else if (typeof value === "string") {
      out[prefix] = value;
    }
  };
  for (const top of Object.keys(tree)) {
    if (top.startsWith("$")) continue;
    walk(top, (tree as Record<string, unknown>)[top]);
  }
  return out;
}

/**
 * Keys the `$meta` block of the Next messages marks as never machine-translated: pending values,
 * non-translatable names, and no-param keys whose reason cites an owner decision.
 */
export function metaDeniedKeys(en: object): string[] {
  const meta = isPlainObject(en) ? (en as Record<string, unknown>)["$meta"] : undefined;
  if (!isPlainObject(meta)) return [];
  const out: string[] = [];
  for (const list of [meta["pendingValueKeys"], meta["nonTranslatableKeys"]]) {
    if (Array.isArray(list)) for (const k of list) if (typeof k === "string") out.push(k);
  }
  const noParam = meta["noParamKeys"];
  if (isPlainObject(noParam)) {
    for (const k of Object.keys(noParam)) {
      const reason = noParam[k];
      if (typeof reason === "string" && /decision/i.test(reason)) out.push(k);
    }
  }
  return out;
}

/**
 * True when the gap must not be sent to the model. Keys and prefixes apply to the message catalogs,
 * exact texts apply everywhere (a dictionary entry repeating an approved line is as protected as the
 * message key that holds it).
 */
export function isDenied(gap: Gap, deny: Deny): boolean {
  if (gap.source !== "dict") {
    if (deny.keys.includes(gap.key)) return true;
    for (const p of deny.prefixes) if (gap.key.startsWith(p)) return true;
  }
  const text = normText(gap.en);
  for (const t of deny.texts) if (normText(t) === text) return true;
  return false;
}

function gapsForTrees(source: "messages" | "emails", trees: LangTrees): Gap[] {
  const en = flattenLeaves(trees.en);
  const flat: Record<FillLang, Record<string, string>> = {
    de: flattenLeaves(trees.de),
    fr: flattenLeaves(trees.fr),
    ar: flattenLeaves(trees.ar),
  };
  const gaps: Gap[] = [];
  for (const key of Object.keys(en)) {
    const text = en[key];
    if (!text) continue;
    const langs = FILL_LANGS.filter((l) => !present(flat[l][key]));
    if (langs.length > 0) gaps.push({ source, key, en: text, langs });
  }
  return gaps;
}

/**
 * Lists every de/fr/ar gap that may be machine-filled. A language counts as present when its value is
 * a non-empty string, even if equal to English. Denied gaps are left out entirely.
 */
export function findGaps(catalogs: Catalogs, deny: Deny): Gap[] {
  // The English wording of a `$meta`-protected key is protected wherever it is repeated (a dictionary
  // entry, an e-mail line), so its text joins the denied texts.
  const metaKeys = metaDeniedKeys(catalogs.messages.en);
  const enFlat = flattenLeaves(catalogs.messages.en);
  const effective: Deny = {
    keys: [...deny.keys, ...metaKeys],
    prefixes: deny.prefixes,
    texts: [...deny.texts, ...metaKeys.map((k) => enFlat[k]).filter((t): t is string => typeof t === "string")],
  };
  const all: Gap[] = [];
  for (const en of Object.keys(catalogs.dict)) {
    if (!en.trim()) continue;
    const entry = catalogs.dict[en] ?? {};
    const langs = FILL_LANGS.filter((l) => !present(entry[l]));
    if (langs.length === 0) continue;
    if ((catalogs.dictPatterns ?? []).some((re) => re.test(en))) continue;
    all.push({ source: "dict", key: en, en, langs });
  }
  all.push(...gapsForTrees("messages", catalogs.messages));
  all.push(...gapsForTrees("emails", catalogs.emails));
  return all.filter((g) => !isDenied(g, effective));
}

/**
 * True when a model output may be written for `lang`: a non-empty string, and for German never the
 * letter ß (the house rule is Swiss "ss"; the engine post-processes, this is the writer's own check).
 */
export function acceptFill(lang: FillLang, text: unknown): text is string {
  if (typeof text !== "string" || text.trim().length === 0) return false;
  if (lang === "de" && text.includes("ß")) return false;
  return true;
}

function applyTree(jsonText: string, lang: FillLang, fills: Record<string, string>): string {
  const root = JSON.parse(jsonText) as unknown;
  if (!isPlainObject(root)) return jsonText;
  let changed = false;
  for (const key of Object.keys(fills)) {
    const text = fills[key];
    if (!acceptFill(lang, text)) continue;
    const parts = key.split(".");
    let node: Record<string, unknown> = root;
    let ok = true;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i] as string;
      const next = node[part];
      if (next === undefined) {
        const created: Record<string, unknown> = {};
        node[part] = created;
        node = created;
      } else if (isPlainObject(next)) {
        node = next;
      } else {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const leaf = parts[parts.length - 1] as string;
    const current = node[leaf];
    if (current === undefined || current === "") {
      node[leaf] = text;
      changed = true;
    }
  }
  if (!changed) return jsonText;
  return `${JSON.stringify(root, null, 2)}\n`;
}

/**
 * Adds the missing leaves of `fills` (dotted key -> text) to a messages JSON file for `lang`. Existing
 * values are never overwritten; key order, the 2-space format and the trailing newline are kept.
 */
export function applyMessages(jsonText: string, lang: FillLang, fills: Record<string, string>): string {
  return applyTree(jsonText, lang, fills);
}

/** Same as `applyMessages`, for `packages/emails/src/messages/<lang>.json`. */
export function applyEmails(jsonText: string, lang: FillLang, fills: Record<string, string>): string {
  return applyTree(jsonText, lang, fills);
}

export const DICT_FILL_HEADER = "/* ── Filled automatically (i18n:fill) */";

/**
 * Appends `S["<en>"] = Object.assign({}, S["<en>"], { <lang>: "<text>" });` lines inside the last
 * `var S = DICT.strings` block of the dictionary source, under one header line. The caller passes only
 * languages that are missing, so the merge adds a language and never replaces an existing one.
 */
export function applyDict(sourceText: string, fills: Record<string, Partial<Record<FillLang, string>>>): string {
  const lines: string[] = [];
  for (const en of Object.keys(fills)) {
    const parts: string[] = [];
    for (const lang of FILL_LANGS) {
      const text = fills[en]?.[lang];
      if (acceptFill(lang, text)) parts.push(`${lang}: ${JSON.stringify(text)}`);
    }
    if (parts.length === 0) continue;
    const k = JSON.stringify(en);
    lines.push(`    S[${k}] = Object.assign({}, S[${k}], { ${parts.join(", ")} });`);
  }
  if (lines.length === 0) return sourceText;

  const start = sourceText.lastIndexOf("var S = DICT.strings");
  if (start < 0) throw new Error("dictionary has no `var S = DICT.strings` block");
  const closeAt = sourceText.indexOf("\n  })();", start);
  if (closeAt < 0) throw new Error("the last `var S = DICT.strings` block has no closing `})();`");
  const hasHeader = sourceText.slice(start, closeAt).includes("Filled automatically (i18n:fill)");
  const block = (hasHeader ? "" : `\n    ${DICT_FILL_HEADER}`) + `\n${lines.join("\n")}`;
  return sourceText.slice(0, closeAt) + block + sourceText.slice(closeAt);
}

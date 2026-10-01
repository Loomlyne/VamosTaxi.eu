// apps/web/lib/ops/place-search-dc.test.ts
//
// 26.2 P6: the dashboard's one address search (app/ops/PlaceSearch.dc.html). The whole script block
// runs here against a stub DCLogic (as ops-dc-bp.test.ts does), so each state is reached the way the
// owner reaches it — by typing, waiting, picking — and the gallery's frozen states are pinned too.
// No DOM, no network: fetch is a stub. Place names are made up.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const src = readFileSync(join(repoRoot, "app/ops/PlaceSearch.dc.html"), "utf8");
const gallery = readFileSync(join(repoRoot, "app/ops/PlaceSearchStates.dc.html"), "utf8");
const detail = readFileSync(join(repoRoot, "app/ops/OpsDetail.dc.html"), "utf8");

function script(html: string): string {
  const m = html.match(/<script type="text\/x-dc" data-dc-script[^>]*>\n([\s\S]*?)\n<\/script>/);
  if (!m?.[1]) throw new Error("missing script block");
  return m[1];
}

type Json = Record<string, unknown>;
type Vals = Record<string, unknown> & {
  onInput: (e: unknown) => void;
  onKey: (e: unknown) => void;
  onBlur: () => void;
  retry: () => void;
  rows: { name: string; sub: string; sel: string; pick: () => void }[];
};

class StubLogic {
  props: Record<string, unknown> = {};
  state: Record<string, unknown> = {};
  setState(patch: Json | ((s: Json) => Json), done?: () => void) {
    const next = typeof patch === "function" ? patch(this.state) : patch;
    this.state = { ...this.state, ...next };
    if (done) done();
  }
  forceUpdate() {}
}

type Comp = { props: Json; state: Json; renderVals(): Vals; componentDidMount(): void };

function harness(answer: (url: string) => Promise<unknown> | unknown, props: Json = {}) {
  const urls: string[] = [];
  const fetchStub = (url: string) => {
    urls.push(url);
    return Promise.resolve(answer(url)).then((json) => {
      if (json instanceof Error) throw json;
      return { ok: true, json: () => Promise.resolve(json) };
    });
  };
  const win = { VamosLocale: { lang: () => "en", onChange: () => () => undefined } };
  const store = { getItem: () => "11111111-2222-4333-8444-555555555555", setItem: () => undefined };
  const Component = new Function("DCLogic", "window", "fetch", "sessionStorage", `${script(src)}\nreturn Component;`)(
    StubLogic, win, fetchStub, store,
  ) as new () => Comp;
  const comp = new Component();
  comp.props = { label: "Pickup", value: "", ...props };
  comp.componentDidMount();
  return { comp, urls, vals: () => comp.renderVals() };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

const HITS = { ok: true, suggestions: [
  { name: "Zug station", address: "Bahnhofplatz, 6300 Zug", mapbox_id: "mb-zug-station" },
  { name: "Zug", context: "Canton of Zug, Switzerland", mapbox_id: "mb-zug" },
] };

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("PlaceSearch states, reached by using the field", () => {
  it("empty: no list, the search icon, the placeholder", () => {
    const { vals } = harness(() => HITS);
    const v = vals();
    expect(v.open).toBe(false);
    expect(v.icon).toBe("search");
    expect(v.phText).toBe("Street, town or airport");
    expect(v.stateAttr).toBe("empty");
  });

  it("typing one letter asks nothing and says to type two", () => {
    const { vals, urls } = harness(() => HITS);
    vals().onInput({ target: { value: "Z" } });
    vi.advanceTimersByTime(500);
    expect(urls).toEqual([]);
    expect(vals().showTyping).toBe(true);
  });

  it("loading while the search is asked, 160 ms after the last key; then the hits", async () => {
    const { vals, urls } = harness(() => HITS);
    vals().onInput({ target: { value: "Zu" } });
    vals().onInput({ target: { value: "Zug" } });
    expect(vals().showLoading).toBe(true);
    vi.advanceTimersByTime(159);
    expect(urls).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/^\/api\/geo\/suggest\?q=Zug&session_token=/);
    await settle();
    const v = vals();
    expect(v.showLoading).toBe(false);
    expect(v.rows.map((r) => [r.name, r.sub])).toEqual([["Zug station", "Bahnhofplatz, 6300 Zug"], ["Zug", "Canton of Zug, Switzerland"]]);
    expect(v.rows[0]?.sel).toBe("true");
  });

  it("none found: an empty answer", async () => {
    const { vals } = harness(() => ({ ok: true, suggestions: [] }));
    vals().onInput({ target: { value: "Zzqx" } });
    vi.advanceTimersByTime(200);
    await settle();
    expect(vals().showNone).toBe(true);
  });

  it("error: the search failed or answered degraded — and Try again asks again", async () => {
    let fail = true;
    const { vals, urls } = harness(() => (fail ? new Error("down") : HITS));
    vals().onInput({ target: { value: "Zug" } });
    vi.advanceTimersByTime(200);
    await settle();
    expect(vals().showError).toBe(true);
    fail = false;
    vals().retry();
    vi.advanceTimersByTime(200);
    await settle();
    expect(urls).toHaveLength(2);
    expect(vals().rows).toHaveLength(2);

    const degraded = harness(() => ({ ok: true, suggestions: [], degraded: true }));
    degraded.vals().onInput({ target: { value: "Zug" } });
    vi.advanceTimersByTime(200);
    await settle();
    expect(degraded.vals().showError).toBe(true);
  });

  it("picked: the host gets the text, the Mapbox id and the session token; the list closes", async () => {
    const onPick = vi.fn();
    const { vals, comp } = harness(() => HITS, { onPick });
    vals().onInput({ target: { value: "Zug" } });
    vi.advanceTimersByTime(200);
    await settle();
    vals().rows[0]?.pick();
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({
      text: "Zug station, Bahnhofplatz, 6300 Zug", mapbox_id: "mb-zug-station", session_token: "11111111-2222-4333-8444-555555555555",
    }));
    comp.props = { ...comp.props, value: "Zug station, Bahnhofplatz, 6300 Zug", picked: true };
    const v = vals();
    expect(v.open).toBe(false);
    expect(v.icon).toBe("map-pin");
    expect(v.text).toBe("Zug station, Bahnhofplatz, 6300 Zug");
  });

  it("keyboard: arrow down moves, Enter picks the active hit, Escape closes", async () => {
    const onPick = vi.fn();
    const { vals } = harness(() => HITS, { onPick });
    vals().onInput({ target: { value: "Zug" } });
    vi.advanceTimersByTime(200);
    await settle();
    const key = (k: string) => vals().onKey({ key: k, preventDefault: () => undefined });
    key("ArrowDown");
    expect(vals().rows[1]?.sel).toBe("true");
    key("Enter");
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ mapbox_id: "mb-zug" }));
    vals().onInput({ target: { value: "Zug" } });
    vi.advanceTimersByTime(200);
    await settle();
    key("Escape");
    expect(vals().open).toBe(false);
  });

  it("typed text that was not picked asks for a pick; the host's refusal shows under the field", () => {
    const { vals, comp } = harness(() => HITS);
    vals().onInput({ target: { value: "Zug" } });
    vals().onBlur();
    expect(vals().hintText).toBe("Pick the place from the list.");
    comp.props = { ...comp.props, error: "The site cannot book this place. Nothing has changed." };
    expect(vals().errorText).toBe("The site cannot book this place. Nothing has changed.");
    expect(vals().stateAttr).toBe("refused");
  });

  it("disabled: typing does nothing", () => {
    const { vals, urls } = harness(() => HITS, { disabled: true, value: "Zurich Oerlikon station", picked: true });
    vals().onInput({ target: { value: "Zug" } });
    vi.advanceTimersByTime(500);
    expect(urls).toEqual([]);
    expect(vals().off).toBe(true);
    expect(vals().stateAttr).toBe("disabled");
  });
});

describe("PlaceSearch is a real Design Component", () => {
  it("declares every prop in data-props, the preview enum names every state", () => {
    const raw = src.match(/data-props="([^"]+)"/)?.[1] ?? "";
    const props = JSON.parse(raw.replace(/&quot;/g, '"').replace(/&gt;/g, ">")) as Record<string, { options?: string[] }>;
    for (const key of ["label", "value", "picked", "placeholder", "hint", "error", "disabled", "required", "locale", "resolveAirport", "preview", "onText", "onPick"]) {
      expect(props, key).toHaveProperty(key);
    }
    expect(props.preview?.options).toEqual(["live", "empty", "typing", "loading", "hits", "none", "error", "picked", "refused", "disabled"]);
  });

  it("the gallery shows all nine states and is English on purpose", () => {
    for (const st of ["empty", "typing", "loading", "hits", "none", "error", "picked", "refused", "disabled"]) {
      expect(gallery).toContain(`['${st}', `);
    }
    expect(gallery).toMatch(/dc-import name="PlaceSearch"[^>]*preview="\{\{ c\.state \}\}"/);
  });

  it("its copy exists in en, de, fr and ar; Swiss German spells ss", () => {
    const table = src.slice(src.indexOf("const PS_T = {"), src.indexOf("const PS_DEMO_HITS"));
    const keys = (lang: string) => [...(table.match(new RegExp(`\\n  ${lang}: \\{([^\\n]*)\\}`))?.[1] ?? "").matchAll(/(\w+):'/g)].map((m) => m[1]);
    const en = keys("en");
    expect(en.length).toBeGreaterThanOrEqual(7);
    for (const lang of ["de", "fr", "ar"]) expect(keys(lang), lang).toEqual(en);
    expect(table).not.toContain("ß");
  });

  it("laws: no glow, the shadow is the neutral token, logical properties only", () => {
    const css = src.slice(src.indexOf("<style>"), src.indexOf("</style>")).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).toContain("--vt-shadow-accent:none");
    expect(css).toContain(".vt-input--focus{box-shadow:none}");
    expect(css).not.toMatch(/yellow|glow|\bleft:|\bright:/);
    for (const m of css.matchAll(/box-shadow:([^;}]+)/g)) expect(m[1]).toMatch(/^(none|var\(--vt-shadow-lg\)|var\(--vt-ring\))$/);
  });

  it("the dashboard Edit uses it for pickup and destination (no free-text place field left)", () => {
    expect(detail.match(/<dc-import name="PlaceSearch"/g)).toHaveLength(2);
    expect(detail).toMatch(/dc-import name="PlaceSearch" label="\{\{ tPickup \}\}"[^>]*onPick="\{\{ pickPickup \}\}"/);
    expect(detail).toMatch(/dc-import name="PlaceSearch" label="\{\{ tDropoff \}\}"[^>]*onPick="\{\{ pickDropoff \}\}"/);
    expect(detail).not.toMatch(/Input" size="md" label="\{\{ tPickup \}\}"/);
  });
});

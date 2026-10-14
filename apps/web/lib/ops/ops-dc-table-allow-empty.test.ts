// apps/web/lib/ops/ops-dc-table-allow-empty.test.ts
//
// 30-06 (decision 6, sheet-11a): an OpsTable number field with allowEmpty stays empty
// (shown as a dash) until the first + press, then starts at the field's minimum. A field
// without allowEmpty behaves as before. Runs the component script against a stubbed DCLogic.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const table = readFileSync(join(here, "../../../../app/ops/OpsTable.dc.html"), "utf8");

const noop = () => undefined;
class StubLogic {
  props: Record<string, unknown> = {};
  state: Record<string, unknown> = {};
  setState(patch: unknown) {
    const next = typeof patch === "function" ? (patch as (s: unknown) => object)(this.state) : (patch as object);
    this.state = { ...this.state, ...next };
  }
  forceUpdate() {}
}
type Comp = { props: Record<string, any>; state: Record<string, any>; renderVals(): Record<string, any> };

function comp(field: Record<string, unknown>, draft: Record<string, unknown>): Comp {
  const m = table.match(/<script type="text\/x-dc" data-dc-script[^>]*>\n([\s\S]*?)\n<\/script>/);
  if (!m?.[1]) throw new Error("no script block");
  const win = { addEventListener: noop, removeEventListener: noop, VamosTaxiDesignSystem_245af1: {} };
  const Component = new Function(
    "DCLogic", "window", "document", "React", "localStorage",
    `${m[1]}\nreturn Component;`,
  )(StubLogic, win, { addEventListener: noop, removeEventListener: noop, body: { style: {} } }, { createElement: noop }, { getItem: () => "en" }) as new () => Comp;
  const c = new Component();
  c.props = { rows: [], columns: [], fields: [field] };
  c.state = { ...c.state, draft, isNew: true };
  return c;
}

const stepper = (c: Comp) => c.renderVals().formFields[0];

describe("OpsTable number field allowEmpty (decision 6)", () => {
  const field = { key: "maxPax", label: "Seats", editor: "number", min: 1, allowEmpty: true };

  it("an empty value reads as a dash; the first + gives the minimum; - does nothing while empty", () => {
    const c = comp(field, { maxPax: "" });
    expect(stepper(c).stepValue).toBe("—");
    stepper(c).dec();
    expect(c.state.draft.maxPax).toBe("");
    stepper(c).inc();
    expect(c.state.draft.maxPax).toBe(1);
  });

  it("null counts as empty too", () => {
    const c = comp(field, { maxPax: null });
    expect(stepper(c).stepValue).toBe("—");
  });

  it("with a value it steps as usual", () => {
    const c = comp(field, { maxPax: 3 });
    expect(stepper(c).stepValue).toBe("3");
    stepper(c).inc();
    expect(c.state.draft.maxPax).toBe(4);
    const d = comp(field, { maxPax: 3 });
    stepper(d).dec();
    expect(d.state.draft.maxPax).toBe(2);
  });

  it("without allowEmpty an empty value keeps today's behaviour", () => {
    const plain = { key: "maxPax", label: "Seats", editor: "number", min: 1 };
    const c = comp(plain, { maxPax: "" });
    expect(stepper(c).stepValue).toBe("");
    stepper(c).inc();
    expect(c.state.draft.maxPax).toBe(2);
  });

  it("the template shows f.stepValue inside the value span", () => {
    expect(table).toMatch(/<span data-vt-step-val="1">\{\{ f\.stepValue \}\}<\/span>/);
  });
});

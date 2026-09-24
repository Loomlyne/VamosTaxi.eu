// apps/web/lib/ops/ops-chauffeur-desk.test.ts
//
// Wave 0 (17-01): OpsFleet import, no duty select, Morning/Night seats,
// overlay verbs, empty live/past (D-01 D-07 D-10 D-14). Dual-DC. May stay
// red until 17-04.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "../..");

const OPS = join(repoRoot, "app/ops/ops.dc.html");
const FLEET = join(repoRoot, "app/ops/OpsFleet.dc.html");
const PUBLIC_OPS = join(webRoot, "public/app/ops/ops.dc.html");
const PUBLIC_FLEET = join(webRoot, "public/app/ops/OpsFleet.dc.html");
const WRITE = join(here, "chauffeurs-write.ts");

function read(path: string): string {
  expect(existsSync(path), path).toBe(true);
  return readFileSync(path, "utf8");
}

describe("Ops chauffeur desk Wave 0 (D-01 D-07 D-10 D-14)", () => {
  it("ops.dc.html dc-imports OpsFleet, not OpsFleetBoard", () => {
    const html = read(OPS);
    expect(html).toContain('dc-import name="OpsFleet"');
    expect(html).not.toContain('dc-import name="OpsFleetBoard"');
  });

  it("OpsFleet has no chauffeur status select as a duty switch", () => {
    const html = read(FLEET);
    const start = html.indexOf("const chauffeurFields");
    const block = start >= 0 ? html.slice(start, start + 1800) : html;
    expect(block).not.toMatch(/key:\s*'status'/);
    expect(html).not.toContain("cStatusOptions");
  });

  it("has no chauffeurIds multi-select and names Morning and Night seats", () => {
    const html = read(FLEET);
    expect(html).not.toContain("key:'chauffeurIds'");
    expect(html).not.toContain('key:"chauffeurIds"');
    expect(html).toMatch(/Morning/);
    expect(html).toMatch(/Night/);
  });

  it("overlay verb is Save chauffeur; dismiss is Keep editing; shift and leave cards are gone", () => {
    const html = read(FLEET);
    expect(html).toContain("Save chauffeur");
    expect(html).toContain("Keep editing");
    expect(html).not.toContain("Save shift");
    expect(html).not.toContain("Save leave");
    expect(html).not.toContain("saveShift");
    expect(html).not.toContain("saveLeave");
  });

  it("empty live/past copy has a next step and no sample VT- on the desk empty path", () => {
    const html = read(FLEET);
    expect(html).toContain("No live trips");
    expect(html).toContain("Assigned trips that are not finished show here.");
    expect(html).toContain("No past bookings");
    expect(html).toContain("Finished assigned trips show here. Open a booking to see it on the board.");
    const emptySlice = html.includes("No live trips")
      ? html.slice(html.indexOf("No live trips"), html.indexOf("No live trips") + 800)
      : html;
    expect(emptySlice).not.toMatch(/VT-/);
  });

  it("On shift KPI follows computed status, not a duty select (D-13)", () => {
    const fleet = read(FLEET);
    expect(fleet).toMatch(/c\.status === ['"]shift['"]/);
    const dash = join(repoRoot, "app/ops/OpsDash.dc.html");
    expect(read(dash)).toMatch(/c\.status === ['"]shift['"]/);
  });

  it("canonical and public OpsFleet copies exist", () => {
    expect(existsSync(FLEET)).toBe(true);
    expect(existsSync(PUBLIC_FLEET)).toBe(true);
    expect(existsSync(PUBLIC_OPS)).toBe(true);
  });
});

describe("insertChauffeur idempotency (D-04)", () => {
  it("INSERT uses ON CONFLICT (id) when a client UUID is posted", () => {
    const src = read(WRITE);
    expect(src).toMatch(/ON CONFLICT \(id\)/);
  });
});

describe("dedicated chauffeur desk (D-15 D-16 D-17 D-18)", () => {
  it("omits Vehicles/Chauffeurs tags — the page is chauffeurs only (D-15)", () => {
    const html = read(FLEET);
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(header).not.toMatch(/sc-for list="\{\{ tabs \}\}"/);
    expect(header).not.toMatch(/>Vehicles</);
    expect(html).not.toContain("No vehicles yet");
    expect(html).toContain("No chauffeurs yet");
  });

  it("desk back is a Button All chauffeurs, not a muted link (D-16)", () => {
    const html = read(FLEET);
    expect(html).toMatch(/tBack/);
    expect(html).toMatch(/goBack|All chauffeurs/);
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(header).toContain("Button");
    expect(header).toMatch(/goBack/);
    expect(header).not.toMatch(/<a href="\/fleet\/chauffeurs"/);
  });

  it("detail page has no shift-days or leave editor; overlay still carries weekdays (D-17)", () => {
    const html = read(FLEET);
    expect(html).not.toMatch(/saveShift/);
    expect(html).not.toMatch(/saveLeave/);
    expect(html).not.toMatch(/deskDays/);
    expect(html).not.toMatch(/tShiftDays|tLeaveFrom|onDeskLeave/);
    expect(html).toMatch(/key:'weekdays'/);
    expect(html).toMatch(/shiftWeekdays/);
    expect(html).toMatch(/c\.status === ['"]shift['"]/);
  });

  it("chauffeur profile is a person header with duty badge and fact grid", () => {
    const html = read(FLEET);
    expect(html).toContain('data-ch-profile="1"');
    expect(html).toMatch(/inline-size:64px/);
    expect(html).toMatch(/dutyTone/);
    expect(html).toMatch(/dutyLabel/);
    expect(html).toMatch(/profileFacts/);
    expect(html).toContain("shield-check");
    expect(html).toContain("fVehicle");
    expect(html).not.toContain("profileRows");
    expect(html).toContain("Live trips");
    expect(html).toContain("Past bookings");
  });

  it("Keep editing is not a desk header control (D-18)", () => {
    const html = read(FLEET);
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(header).not.toMatch(/tKeepEditing|keepEditing/);
  });

  it("desk header has duty Badge and Edit chauffeur (D-17)", () => {
    const html = read(FLEET);
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(header).toMatch(/Badge/);
    expect(header).toMatch(/dutyTone/);
    expect(header).toMatch(/dutyLabel/);
    expect(header).toMatch(/tEditC/);
    expect(header).toMatch(/openDeskEdit/);
    expect(header).not.toMatch(/variant=\"accent\"/);
  });

  it("desk Edit chauffeur opens the OpsTable overlay without the list table", () => {
    const html = read(FLEET);
    expect(html).toMatch(/embedded=\"\{\{ isDetail \}\}\"/);
    expect(html).toMatch(/edit-id=\"\{\{ deskEditId \}\}\"/);
    expect(html).toMatch(/edit-tick=\"\{\{ deskEditTick \}\}\"/);
    expect(html).toMatch(/openDeskEdit/);
  });

  it("cleanChauffeur keeps shift and leave so the desk can persist them", () => {
    const src = read(join(repoRoot, "app/vamos-ops-data.js"));
    const start = src.indexOf("function cleanChauffeur");
    const block = src.slice(start, start + 1600);
    expect(block).toMatch(/shiftWeekdays/);
    expect(block).toMatch(/leaveRanges/);
  });
});

import { start, open, goPricing, signIn, S, db, goLiveInfo, gl } from "./lib.mjs";
await start({ evidenceDir: process.argv[2] });
const s = await open({ viewport: 1440, name: "s1440" });
await signIn(s);
await goPricing(s);
await S("S2b", "after photo + seats (re-read of state)", async () => {
  await s.page.locator("[data-draft-btn]").first().click(); await s.page.waitForTimeout(800);
  const b = await goLiveInfo(s.page);
  await s.shot("S2b-after-seats-reread");
  const dbr = db("select passenger_capacity, luggage_capacity, active, photo_path is not null from public.vehicle_classes where name = 'Lab Draft Class'");
  const ok = b.items[0].startsWith("Photo=done") && b.items[1].startsWith("Seats=done") && b.why === "Add the bags first" && /go live:disabled/i.test(b.btns.join());
  return { s, ok, evidence: `PARTIAL: the first half (state right after the photo only) was not captured as text because my script crashed on a wrong table name in its select after the second save (screenshot S2b-after-photo.png was taken, not read); the photo save and the seats save both succeeded. State now (photo + seats 3): ${gl(b)}; db seats/bags/active/photo ${dbr}` };
}, { s });
process.exit(0);

// Lab only: makes the seeded draft price book publishable so lab-lock-field.mjs can prove Publish keeps the hours.
// Refuses any database without the throwaway marker role. Classes get a stand-in photo path; draft class rates get
// stand-in integer rappen (100 / 10) only where empty; incomplete draft surcharges, fixed routes and coupons are
// switched OFF (never priced). Synthetic lab data, never a price. Run from apps/web: LAB_PORT=<db port> node --input-type=module < <this> (module paths resolve from apps/web).
import postgres from "postgres";
const port = Number(process.env.LAB_PORT);
if (!(port > 45000 && port < 46000)) { console.log("refusing: not a lab db port"); process.exit(1); }
const sql = postgres(`postgres://postgres:postgres@127.0.0.1:${port}/postgres`, { max: 1 });
const marker = await sql`select 1 from pg_roles where rolname = 'vamos_throwaway_test_stack'`;
if (!marker.length) { console.log("refusing: not a throwaway stack"); await sql.end(); process.exit(1); }
const draft = sql`select id from public.rate_versions where status = 'draft'`;
const out = {};
out.photos = (await sql`update public.vehicle_classes set photo_path = 'lab/stand-in.jpg' where nullif(btrim(photo_path), '') is null`).count;
out.rates = (await sql`update public.distance_rates set base_fare_rappen = coalesce(base_fare_rappen, 100), per_km_rappen = coalesce(per_km_rappen, 10) where rate_version_id in (${draft}) and (base_fare_rappen is null or per_km_rappen is null)`).count;
out.surchargesOff = (await sql`update public.surcharges s set active = false where s.rate_version_id in (${draft}) and s.active and ((s.kind <> 'included' and coalesce(s.amount_rappen, (s.percent * 100)::integer) is null) or s.predicate = '{}'::jsonb)`).count;
out.routesOff = (await sql`update public.fixed_routes set live = false where rate_version_id in (${draft}) and live and price_rappen is null`).count;
out.couponsOff = (await sql`update public.coupons c set active = false where c.rate_version_id in (${draft}) and c.active and (nullif(btrim(c.code), '') is null or (c.kind = 'percent' and c.percent is null) or (c.kind = 'amount' and c.amount_rappen is null))`).count;
console.log("lab prep", JSON.stringify(out));
await sql.end();

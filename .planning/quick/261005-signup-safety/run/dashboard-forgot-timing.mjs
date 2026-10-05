const DASH = process.env.LAB_DASH;
let n = 1;
const ip = () => `10.57.${n++ % 250}.${Math.floor(Math.random() * 250)}`;
async function ask(email) {
  const t0 = Date.now();
  const res = await fetch(DASH + "/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json", origin: DASH, "cf-connecting-ip": ip() },
    body: JSON.stringify({ mode: "forgot", email }),
  });
  await res.text();
  return Date.now() - t0;
}
const sets = {
  staff: "lab-admin@vamos.local",
  customer: process.env.CUSTOMER,
  unknown: "never-existed-" + Date.now() + "@example.test",
};
for (const round of [1, 2, 3, 4]) {
  const row = {};
  for (const [k, v] of Object.entries(sets)) row[k] = await ask(k === "unknown" ? "never-existed-" + Date.now() + round + "@example.test" : v);
  console.log("round", round, JSON.stringify(row));
}

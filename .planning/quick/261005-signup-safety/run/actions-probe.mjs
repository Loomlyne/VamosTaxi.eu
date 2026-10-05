import { readFileSync } from "node:fs";
const BASE = process.env.LAB_BASE;
const m = JSON.parse(readFileSync(process.env.WEB_DIR + "/.next/server/server-reference-manifest.json", "utf8")).node;
const idOf = (name) => Object.keys(m).find((k) => m[k].exportedName === name);
const stamp = Date.now();
const ip = () => "10.78." + (Math.floor(Math.random() * 200) + 1) + "." + (Math.floor(Math.random() * 200) + 1);
async function call(name, args, label) {
  const r = await fetch(BASE + "/checkout", {
    method: "POST",
    headers: { "content-type": "text/plain;charset=UTF-8", accept: "text/x-component", "next-action": idOf(name), origin: BASE, "cf-connecting-ip": ip() },
    body: JSON.stringify(args),
    redirect: "manual",
  });
  const t = await r.text();
  console.log(label, r.status, "stage-in-answer:", /"stage"/.test(t));
}
const su = (email) => ({ mode: "signup", method: "password", email, password: "correct-horse-9", firstName: "Probe", lastName: "Action", consent: true });
await call("signUpAction", [su(`actprobe-notoken-${stamp}@example.test`), "en"], "signUp no token");
await call("signUpAction", [su(`actprobe-fail-${stamp}@example.test`), "en", "fail"], "signUp refused token");
await call("signUpAction", [su(`actprobe-ok-${stamp}@example.test`), "en", "good-token"], "signUp good token");
console.log("STAMP", stamp);

// Server actions posted straight at a Next route (Next-Action header), on a test lab. Prints, for each call, the HTTP
// status and whether a mail was written for the typed address (the lab Worker logs "To: <address>" in public.log).
//   eval "$(scripts/test-lab/lab.sh env <name>)" ; node actions-probe.mjs
import { readFileSync } from "node:fs";
const BASE = process.env.LAB_BASE;
const m = JSON.parse(readFileSync(process.env.WEB_DIR + "/.next/server/server-reference-manifest.json", "utf8")).node;
const idOf = (name) => Object.keys(m).find((k) => m[k].exportedName === name);
const stamp = Date.now();
const ip = () => "10.78." + (Math.floor(Math.random() * 200) + 1) + "." + (Math.floor(Math.random() * 200) + 1);
const mailed = (email) => {
  const log = readFileSync(process.env.LAB_STATE + "/logs/public.log", "utf8").replace(/\x1b\[[0-9;]*m/g, "");
  return log.includes(`To: ${email}`);
};
async function call(name, args, label, email) {
  const r = await fetch(BASE + "/checkout", {
    method: "POST",
    headers: { "content-type": "text/plain;charset=UTF-8", accept: "text/x-component", "next-action": idOf(name), origin: BASE, "cf-connecting-ip": ip() },
    body: JSON.stringify(args),
    redirect: "manual",
  });
  const t = await r.text();
  await new Promise((res) => setTimeout(res, 2500));
  console.log(label.padEnd(44), r.status, "stage-in-answer:", /"stage"/.test(t), "mail written:", mailed(email));
}
const su = (email) => ({ mode: "signup", method: "password", email, password: "correct-horse-9", firstName: "Probe", lastName: "Action", consent: true });
const link = (email) => ({ mode: "signup", method: "magic", email, firstName: "Probe", lastName: "Action", consent: true });
const signin = (email) => ({ mode: "signin", method: "magic", email });
const e = (tag) => `actprobe-${tag}-${stamp}@example.test`;

await call("signUpAction", [su(e("pw-none")), "en"], "signUpAction, no token", e("pw-none"));
await call("signUpAction", [su(e("pw-fail")), "en", "fail"], "signUpAction, refused token", e("pw-fail"));
await call("signUpAction", [su(e("pw-ok")), "en", "good-token"], "signUpAction, good token", e("pw-ok"));
await call("requestOtpAction", [link(e("link-none")), "en"], "requestOtpAction (link sign-up), no token", e("link-none"));
await call("requestOtpAction", [link(e("link-fail")), "en", "fail"], "requestOtpAction (link sign-up), refused token", e("link-fail"));
await call("requestOtpAction", [link(e("link-ok")), "en", "good-token"], "requestOtpAction (link sign-up), good token", e("link-ok"));
await call("requestOtpAction", [signin(e("signin-new")), "en"], "requestOtpAction (link sign-IN), new address", e("signin-new"));
console.log("STAMP", stamp);

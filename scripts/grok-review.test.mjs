import assert from "node:assert/strict";
import { test } from "node:test";
import { MARKER, commentBody, reviewWithGrok, trimDiff } from "./grok-review.mjs";

test("a short diff passes whole; a long one is cut with a note", () => {
  assert.deepEqual(trimDiff("abc", 10), { text: "abc", truncated: false });
  const long = trimDiff("x".repeat(25), 10);
  assert.equal(long.truncated, true);
  assert.ok(long.text.startsWith("xxxxxxxxxx\n\n[diff truncated: 15 more characters]"));
});

test("the comment starts with the marker so a later run replaces it, and names the model and commit", () => {
  const body = commentBody({ model: "grok-4", sha: "abcdef0123456789", findings: "No findings.", truncated: true });
  assert.ok(body.startsWith(MARKER));
  assert.ok(body.includes("Grok review (grok-4, `abcdef0`)"));
  assert.ok(body.includes("No findings."));
  assert.ok(body.includes("truncated"));
});

test("the xAI call sends the diff with the key in the header only, and reads the first choice", async () => {
  let seen;
  const fetchFn = async (url, init) => {
    seen = { url, init };
    return new Response(JSON.stringify({ choices: [{ message: { content: "- lib/a.ts:3 off by one" } }] }), { status: 200 });
  };
  const text = await reviewWithGrok({ diff: "+ a", model: "grok-4", apiKey: "k", apiBase: "https://api.x.ai/v1", fetchFn });
  assert.equal(text, "- lib/a.ts:3 off by one");
  assert.equal(seen.url, "https://api.x.ai/v1/chat/completions");
  assert.equal(seen.init.headers.authorization, "Bearer k");
  const sent = JSON.parse(seen.init.body);
  assert.equal(sent.model, "grok-4");
  assert.ok(sent.messages[1].content.includes("+ a"));
  assert.ok(!seen.init.body.includes('"k"'));
});

test("a refusal or an empty answer is an error, never an empty comment", async () => {
  const bad = async () => new Response("nope", { status: 401 });
  await assert.rejects(reviewWithGrok({ diff: "+", model: "m", apiKey: "k", apiBase: "https://x", fetchFn: bad }), /401/);
  const empty = async () => new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), { status: 200 });
  await assert.rejects(reviewWithGrok({ diff: "+", model: "m", apiKey: "k", apiBase: "https://x", fetchFn: empty }), /without text/);
});

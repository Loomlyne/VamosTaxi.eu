#!/usr/bin/env node
/**
 * Recover every completed agent result from a Workflow run, including runs that
 * died part-way (session limit, kill, crash). Workflow results live only in the
 * run's journal.jsonl until the script's own return value is produced — if the
 * run never reaches its return, that work is invisible unless harvested.
 *
 * Usage:
 *   node .planning/tools/harvest-workflow.mjs <runDir|runId> <outDir>
 *
 * <runDir> is the workflow transcript dir printed by the Workflow tool, e.g.
 *   ~/.claude/projects/<slug>/<session>/subagents/workflows/wf_xxxxxxx
 * <runId>  is just the wf_xxxxxxx part; the script will search for it.
 *
 * Writes one file per completed agent into <outDir>, named after the agent's
 * lane where detectable, otherwise after the result's first heading, otherwise
 * the agent id. Prints a manifest. Never overwrites a file that is newer than
 * the journal entry it came from.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const [, , runArg, outArg] = process.argv
if (!runArg || !outArg) {
  console.error('usage: harvest-workflow.mjs <runDir|runId> <outDir>')
  process.exit(2)
}

function resolveRunDir(arg) {
  if (fs.existsSync(path.join(arg, 'journal.jsonl'))) return arg
  const root = path.join(os.homedir(), '.claude', 'projects')
  const hits = []
  const walk = (dir, depth) => {
    if (depth > 6) return
    let entries = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (!e.isDirectory()) continue
      const p = path.join(dir, e.name)
      if (e.name === arg && fs.existsSync(path.join(p, 'journal.jsonl'))) hits.push(p)
      else walk(p, depth + 1)
    }
  }
  walk(root, 0)
  if (hits.length === 1) return hits[0]
  if (hits.length > 1) { console.error('ambiguous runId, matches:\n' + hits.join('\n')); process.exit(2) }
  console.error(`no workflow run dir found for "${arg}"`); process.exit(2)
}

const RUN = resolveRunDir(runArg)
const OUT = outArg
fs.mkdirSync(OUT, { recursive: true })

// --- 1. journal: agentId -> result -------------------------------------------
const results = new Map()
let started = 0
for (const line of fs.readFileSync(path.join(RUN, 'journal.jsonl'), 'utf8').trim().split('\n')) {
  let o
  try { o = JSON.parse(line) } catch { continue }
  if (o.type === 'started') started++
  if (o.type === 'result') results.set(o.agentId, o.result)
}

// --- 2. name each result ------------------------------------------------------
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

// Patterns tried in order against the agent's own transcript. Add more as the
// workflow prompt vocabulary grows — an unmatched agent still gets harvested,
// it just keeps its agent id as a filename.
// NOTE: transcripts are JSON-escaped, so a quote in the prompt appears as \" —
// the leading/trailing matcher must allow only quote/backslash chars, never a
// wildcard, or it eats the first letters of the lane name.
const Q = '["\'\\\\]{0,3}'
const LANE_PATTERNS = [
  new RegExp(`YOU ARE THE\\s*${Q}([a-z0-9][a-z0-9-]{2,39})${Q}\\s*RESEARCH LANE`, 'i'),
  new RegExp(`YOU ARE THE\\s*${Q}([a-z0-9][a-z0-9-]{2,39})${Q}\\s*LANE`, 'i'),
  /\bLANE:\s*([a-z0-9][a-z0-9-]{2,39})/i,
]

function labelFor(agentId, result) {
  const tPath = path.join(RUN, `agent-${agentId}.jsonl`)
  if (fs.existsSync(tPath)) {
    const raw = fs.readFileSync(tPath, 'utf8')
    for (const re of LANE_PATTERNS) {
      const m = raw.match(re)
      if (m && m[1] && !/^[0-9-]+$/.test(m[1])) return slug(m[1])
    }
    // task-shaped agents (synthesiser, verifier, hardener) — name by their job
    if (/you are the synthesiser/i.test(raw)) return 'synthesise'
    if (/adversarial review/i.test(raw)) {
      const lens = raw.match(/([A-Z][A-Z \-]{4,30})\s*LENS\./)
      return lens ? 'verify-' + slug(lens[1]) : 'verify'
    }
    if (/fold the review into the documents/i.test(raw)) return 'harden'
  }
  if (typeof result === 'string') {
    const h = result.match(/^#{1,3}\s+(.{4,70})$/m)
    if (h) return slug(h[1])
  }
  return 'agent-' + agentId
}

// --- 3. write -----------------------------------------------------------------
const manifest = []
const taken = new Set()
for (const [agentId, result] of results) {
  let name = labelFor(agentId, result)
  while (taken.has(name)) name = `${name}-${agentId.slice(0, 6)}`
  taken.add(name)
  const isText = typeof result === 'string'
  const body = isText ? result : JSON.stringify(result, null, 2)
  const file = path.join(OUT, `${name}.${isText ? 'md' : 'json'}`)
  fs.writeFileSync(file, body)
  manifest.push({ agentId, name, bytes: body.length, file })
}

manifest.sort((a, b) => b.bytes - a.bytes)
const lost = started - results.size
console.log(`run dir : ${RUN}`)
console.log(`agents  : ${started} started, ${results.size} completed, ${lost} without a result`)
console.log(`written : ${OUT}\n`)
for (const m of manifest) console.log(`  ${String(m.bytes).padStart(7)}  ${m.name}`)
if (lost > 0) console.log(`\n${lost} agent(s) started but never returned — they are the ones to re-run.`)
fs.writeFileSync(path.join(OUT, '_manifest.json'), JSON.stringify({ run: RUN, started, completed: results.size, manifest }, null, 2))

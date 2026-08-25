#!/usr/bin/env node
/**
 * build.mjs — regenerate `skills/` from an upstream checkout of
 * obra/superpowers.
 *
 * Superpowers ships skills in Claude Code's `SKILL.md` layout
 * (`skills/<name>/SKILL.md` + `references/`, `scripts/`, `assets/`, …), which
 * is byte-for-byte the layout DeepSeek Harness' filesystem skill provider
 * discovers (`<root>/<name>/SKILL.md`, one level deep). The only conversion
 * needed is the namespace: Claude Code addresses a plugin skill as
 * `superpowers:<name>`, while DSH addresses skills by their bare kebab-case
 * `name`. This script copies the tree verbatim and rewrites every
 * `superpowers:<skill-name>` cross-reference to the bare `<skill-name>` so the
 * references stay actionable through DSH's `skill` tool.
 *
 * Usage:
 *   node build.mjs [path/to/superpowers]
 *   SUPERWERPOWERS_SRC=/path/to/superpowers node build.mjs
 *
 * Defaults to `./.superpowers-src` (a shallow clone). To update the skills,
 * clone upstream first:
 *   git clone --depth 1 https://github.com/obra/superpowers.git .superpowers-src
 */
import { cp, readdir, readFile, writeFile, rm, mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { SUPERPOWERS_SKILLS } from './skill-names.mjs'

const SRC = resolve(process.argv[2] ?? process.env.SUPERWERPOWERS_SRC ?? '.superpowers-src')
const SRC_SKILLS = join(SRC, 'skills')
const OUT = fileURLToPath(new URL('./skills/', import.meta.url))

/** Skill names from upstream; used to rewrite exactly the plugin namespace. */
/** Text file extensions (and extensionless scripts) whose bytes we rewrite. */
const TEXT_EXT = new Set(['.md', '.dot', '.ts', '.js', '.cjs', '.mjs', '.html', '.sh', '.json', '.yml', '.yaml'])

if (!existsSync(SRC_SKILLS)) {
  console.error(`error: upstream skills not found at ${SRC_SKILLS}`)
  console.error('       clone upstream first: git clone --depth 1 https://github.com/obra/superpowers.git .superpowers-src')
  process.exit(1)
}

await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })

const entries = await readdir(SRC_SKILLS)
const copied = []
for (const name of entries) {
  const srcDir = join(SRC_SKILLS, name)
  const info = await stat(srcDir)
  if (!info.isDirectory()) continue
  if (!(await existsSync(join(srcDir, 'SKILL.md')))) {
    console.warn(`warn: skipping ${name}: no SKILL.md`)
    continue
  }
  await cp(srcDir, join(OUT, name), { recursive: true })
  copied.push(name)
}

// ── local overlays ──────────────────────────────────────────────────────────
// DSH-specific additions that upstream does not ship (the DSH tool mapping
// reference) live in `./overlays/`, merged into the copied tree after the
// upstream copy. Overlays may only ADD files: an overlay that would overwrite
// an upstream file is a drift bug and fails the build, so the checked-in
// skill tree can never silently diverge from upstream.

const OVERLAYS = fileURLToPath(new URL('./overlays/', import.meta.url))

async function mergeOverlayEntry(src, dest, rel) {
  const info = await stat(src)
  if (info.isDirectory()) {
    for (const entry of await readdir(src, { withFileTypes: true })) {
      await mergeOverlayEntry(join(src, entry.name), join(dest, entry.name), `${rel}/${entry.name}`)
    }
    return
  }
  if (existsSync(dest)) {
    console.error(`error: overlay ${rel} already exists in the built tree; overlays may only add new files (never replace an upstream skill file)`)
    process.exit(1)
  }
  await mkdir(dirname(dest), { recursive: true })
  await cp(src, dest)
}

async function mergeOverlays() {
  if (!existsSync(OVERLAYS)) return
  for (const entry of await readdir(OVERLAYS, { withFileTypes: true })) {
    if (!(await existsSync(join(OUT, entry.name, 'SKILL.md')))) {
      console.warn(`warn: skipping overlay ${entry.name}: no such skill in the built tree`)
      continue
    }
    await mergeOverlayEntry(join(OVERLAYS, entry.name), join(OUT, entry.name), entry.name)
  }
}
await mergeOverlays()

// ── DSH platform pointer ────────────────────────────────────────────────────
// The one edit a port may make to a SKILL.md (upstream's porting guide
// sanctions exactly this): add the DSH line to using-superpowers' Platform
// Adaptation pointer list. Idempotent; warns if upstream moved the anchor so
// the pointer is never silently dropped.

const PLATFORM_POINTER = '- DeepSeek Harness: `references/dsh-tools.md`'
const PLATFORM_ANCHOR = /^- Hermes Agent: `references\/hermes-tools\.md`$/

async function patchPlatformPointer() {
  const file = join(OUT, 'using-superpowers', 'SKILL.md')
  if (!existsSync(file)) return
  const original = await readFile(file, 'utf8')
  if (original.includes(PLATFORM_POINTER)) return
  const lines = original.split('\n')
  const idx = lines.findIndex((line) => PLATFORM_ANCHOR.test(line))
  if (idx === -1) {
    console.warn('warn: Platform Adaptation anchor (Hermes Agent line) not found; DSH pointer not inserted')
    return
  }
  lines.splice(idx + 1, 0, PLATFORM_POINTER)
  await writeFile(file, lines.join('\n'))
}
await patchPlatformPointer()

/** Rewrite `superpowers:<name>` -> `<name>` across one file's text. */
async function rewrite(file) {
  const ext = (() => {
    const b = basename(file)
    if (!b.includes('.')) return ''
    return b.slice(b.lastIndexOf('.'))
  })()
  if (!TEXT_EXT.has(ext) && ext !== '') return
  const original = await readFile(file, 'utf8')
  let text = original
  for (const name of SUPERPOWERS_SKILLS) {
    text = text.split(`superpowers:${name}`).join(name)
  }
  if (text !== original) await writeFile(file, text, 'utf8')
}

/** Recursively walk the copied tree and rewrite text files. */
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) await walk(path)
    else if (entry.isFile()) await rewrite(path)
  }
}
await walk(OUT)

console.log(`copied ${copied.length} skills from ${SRC_SKILLS}`)
for (const name of copied.sort()) console.log(`  - ${name}`)
console.log(`wrote ${OUT}`)

// ── skills/manifest.json ─────────────────────────────────────────────────────
// The host plugin reads this manifest at boot: it maps each skill's metadata
// (parsed here with js-yaml) to a byte offset of the body inside SKILL.md, so
// the runtime needs no YAML parser. Generated LAST, after every rewrite, so the
// offset refers to the file exactly as shipped.

const manifest = []
for (const name of copied.sort()) {
  const file = join(OUT, name, 'SKILL.md')
  const buffer = await readFile(file)
  const text = buffer.toString('utf8')
  if (!text.startsWith('---\n')) throw new Error(`build: ${file} has no frontmatter`)
  // `\n---\n` is the 5-byte closing delimiter: newline, `---`, newline. Its
  // byte offset + 5 is the exact body start. (end + 4 would point at the
  // trailing newline and every body would carry a leading blank line.)
  const end = buffer.indexOf(Buffer.from('\n---\n'), 4)
  if (end === -1) throw new Error(`build: ${file} frontmatter is not closed`)
  const fm = yaml.load(text.slice(4, end + 1))
  if (typeof fm?.name !== 'string' || typeof fm?.description !== 'string') {
    throw new Error(`build: ${file} frontmatter needs name + description`)
  }
  if (fm.name !== name) throw new Error(`build: ${file} frontmatter name "${fm.name}" != directory name`)
  const entry = {
    name: fm.name,
    description: fm.description,
    file: `${name}/SKILL.md`,
    contentOffset: end + 5,
  }
  if (typeof fm.whenToUse === 'string') entry.whenToUse = fm.whenToUse
  const invocation = {
    modelInvocable: fm['disable-model-invocation'] !== true,
    userInvocable: fm['user-invocable'] !== false,
  }
  if (!(invocation.modelInvocable && invocation.userInvocable)) entry.invocation = invocation
  manifest.push(entry)
}
await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`wrote ${join(OUT, 'manifest.json')} (${manifest.length} skills)`)
